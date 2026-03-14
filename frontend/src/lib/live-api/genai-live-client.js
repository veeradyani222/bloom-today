import { GoogleGenAI } from '@google/genai';
import EventEmitter from 'eventemitter3';
import { base64ToArrayBuffer } from './utils';

/* ── Verbose Logger ── */
const LOG_PREFIX = '%c[LiveClient]';
const STYLES = {
  info:    'color: #60a5fa; font-weight: bold',  // blue
  success: 'color: #34d399; font-weight: bold',  // green
  warn:    'color: #fbbf24; font-weight: bold',  // yellow
  error:   'color: #f87171; font-weight: bold',  // red
  event:   'color: #c084fc; font-weight: bold',  // purple
  audio:   'color: #6b7280; font-weight: normal', // gray (high frequency)
};

function log() {}

function logWarn() {}

function logError() {}

/* ── Audio helpers ── */
function emitAudioParts(parts, emitAudio) {
  if (!Array.isArray(parts)) return [];

  const nonAudioParts = [];
  parts.forEach((part) => {
    const isAudio = part?.inlineData?.mimeType?.startsWith('audio/pcm');
    if (isAudio && part.inlineData?.data) {
      emitAudio(base64ToArrayBuffer(part.inlineData.data));
      return;
    }
    nonAudioParts.push(part);
  });

  return nonAudioParts;
}

/* ── Timing helper ── */
let sessionStartTime = 0;
function elapsed() {
  if (!sessionStartTime) return '0.0s';
  return ((Date.now() - sessionStartTime) / 1000).toFixed(1) + 's';
}

export class GenAILiveClient extends EventEmitter {
  constructor(options) {
    super();
    this.client = new GoogleGenAI(options);
    this.session = null;
    this.status = 'disconnected';
    this.model = null;
    this.config = null;
    this._resumptionHandle = null;
    this._autoReconnecting = false;
    this._intentionalClose = false;
    this._audioChunkCount = 0;

    log('info', 'Client created');
  }

  async connect(model, config) {
    if (this.status === 'connecting' || this.status === 'connected') {
      logWarn('Connect called while already', this.status);
      return false;
    }

    this.status = 'connecting';
    this.model = model;
    this.config = config;
    this._audioChunkCount = 0;
    sessionStartTime = Date.now();

    log('info', `Connecting to model: ${model}`);
    log('info', 'Config:', JSON.stringify({
      responseModalities: config.responseModalities,
      voiceName: config.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName,
      startSensitivity: config.realtimeInputConfig?.automaticActivityDetection?.startOfSpeechSensitivity,
      endSensitivity: config.realtimeInputConfig?.automaticActivityDetection?.endOfSpeechSensitivity,
      silenceDurationMs: config.realtimeInputConfig?.automaticActivityDetection?.silenceDurationMs,
    }, null, 2));

    try {
      const fullConfig = {
        ...config,
        // Disable thinking to minimize response latency for voice
        thinkingConfig: {
          thinkingBudget: 0,
        },
        // Aggressive compression to prevent latency growth in long calls.
        // Audio accrues ~25 tokens/sec. Trigger at 8k (~2.5 min of audio),
        // compress down to 3k to keep response times consistently fast.
        contextWindowCompression: {
          slidingWindow: { targetTokens: 6000 },
          triggerTokens: 15000,
        },
        sessionResumption: {
          handle: this._resumptionHandle || undefined,
        },
        // Enable speech-to-text transcription for analytics & context summarization
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      };

      if (this._resumptionHandle) {
        log('info', 'Resuming session with handle:', this._resumptionHandle.slice(0, 20) + '...');
      }

      this.session = await this.client.live.connect({
        model,
        config: fullConfig,
        callbacks: {
          onopen: () => {
            this.status = 'connected';
            log('success', `✅ WebSocket OPEN (${elapsed()})`);
            this.emit('open');
          },
          onclose: (event) => {
            log('warn', `❌ WebSocket CLOSED (${elapsed()})`, event?.reason || '');
            this.status = 'disconnected';
            this.session = null;

            if (this._resumptionHandle && !this._intentionalClose) {
              log('info', '♻️ Has resumption handle — will auto-reconnect');
              this._autoReconnect();
              return;
            }

            this.emit('close', event);
          },
          onerror: (event) => {
            logError(`⚠️ WebSocket ERROR (${elapsed()})`, event?.message || event);
            this.emit('error', event);
          },
          onmessage: (message) => {
            this.handleMessage(message);
          },
        },
      });

      this._intentionalClose = false;
      log('success', `Connection initiated (${elapsed()})`);
      return true;
    } catch (error) {
      this.status = 'disconnected';
      logError(`Connection FAILED (${elapsed()})`, error?.message || error);
      throw error;
    }
  }

  async _autoReconnect() {
    if (this._autoReconnecting) return;
    this._autoReconnecting = true;

    try {
      log('info', '♻️ Auto-reconnecting in 500ms...');
      this.emit('reconnecting');
      await new Promise((r) => setTimeout(r, 500));

      this.status = 'disconnected';
      await this.connect(this.model, this.config);
      this._autoReconnecting = false;
      log('success', '♻️ Auto-reconnect SUCCESS');
      this.emit('reconnected');
    } catch (err) {
      this._autoReconnecting = false;
      logError('♻️ Auto-reconnect FAILED', err?.message);
      this.emit('close', { reason: 'Reconnection failed: ' + (err?.message || 'Unknown error') });
    }
  }

  disconnect() {
    log('info', `Disconnect called (intentional) (${elapsed()})`);
    this._intentionalClose = true;
    this._resumptionHandle = null;
    if (!this.session) {
      this.status = 'disconnected';
      return;
    }
    try {
      this.session.close();
    } catch (_) {}
    this.session = null;
    this.status = 'disconnected';
  }

  handleMessage(message) {
    // Session resumption
    if (message?.sessionResumptionUpdate) {
      const update = message.sessionResumptionUpdate;
      if (update.resumable && update.newHandle) {
        this._resumptionHandle = update.newHandle;
        log('info', `📌 Session resumption handle updated (resumable: ${update.resumable})`);
      }
    }

    // GoAway
    if (message?.goAway) {
      logWarn(`⏰ GoAway received (${elapsed()}) — timeLeft:`, message.goAway.timeLeft);
      this.emit('goaway', message.goAway);
    }

    if (message?.setupComplete) {
      log('success', `🎯 Setup complete (${elapsed()})`);
      this.emit('setupcomplete');
      return;
    }

    // Usage metadata
    if (message?.usageMetadata) {
      const m = message.usageMetadata;
      log('info', `📊 Tokens — prompt: ${m.promptTokenCount || 0}, response: ${m.responseTokenCount || 0}, total: ${m.totalTokenCount || 0}`);
    }

    const serverContent = message?.serverContent;
    if (!serverContent) return;

    // Interrupted
    if (serverContent.interrupted) {
      log('event', `🛑 INTERRUPTED by server (${elapsed()}) — audio chunks received before interrupt: ${this._audioChunkCount}`);
      this._audioChunkCount = 0;
      this.emit('interrupted');
    }

    // Generation complete
    if (serverContent.generationComplete) {
      log('event', `📝 Generation complete (${elapsed()})`);
      this.emit('generationcomplete');
    }

    // Turn complete
    if (serverContent.turnComplete) {
      log('event', `✅ Turn complete (${elapsed()}) — total audio chunks this turn: ${this._audioChunkCount}`);
      this._audioChunkCount = 0;
      this.emit('turncomplete');
    }

    // Transcription events (used for analytics and context summarization)
    if (serverContent.inputTranscription?.text) {
      this.emit('inputtranscript', serverContent.inputTranscription.text);
    }
    if (serverContent.outputTranscription?.text) {
      this.emit('outputtranscript', serverContent.outputTranscription.text);
    }

    // Audio and content (skip if interrupted)
    if (!serverContent.interrupted) {
      const modelTurnParts = serverContent.modelTurn?.parts || [];
      const nonAudioParts = emitAudioParts(modelTurnParts, (audioData) => {
        this._audioChunkCount++;
        // Log every 10th chunk to avoid console spam
        if (this._audioChunkCount % 10 === 1) {
          log('audio', `🔊 Audio chunk #${this._audioChunkCount} (${(audioData.byteLength / 1024).toFixed(1)}KB) (${elapsed()})`);
        }
        this.emit('audio', audioData);
      });

      if (nonAudioParts.length > 0) {
        log('event', `📄 Non-audio content received (${elapsed()})`, nonAudioParts);
        this.emit('content', { modelTurn: { parts: nonAudioParts } });
      }
    }
  }

  sendRealtimeInput(chunks) {
    if (!this.session || this.status !== 'connected') return;
    try {
      chunks.forEach((chunk) => {
        this.session.sendRealtimeInput({
          audio: {
            data: chunk.data,
            mimeType: chunk.mimeType,
          },
        });
      });
    } catch (error) {
      logError('sendRealtimeInput FAILED', error?.message);
      this.emit('error', error);
    }
  }

  /**
   * Send a video frame (JPEG) alongside ongoing audio.
   * @param {string} base64Data Base64-encoded JPEG image data
   * @param {string} [mimeType='image/jpeg'] MIME type
   */
  sendVideoFrame(base64Data, mimeType = 'image/jpeg') {
    if (!this.session || this.status !== 'connected') return;
    try {
      this.session.sendRealtimeInput({
        video: {
          data: base64Data,
          mimeType,
        },
      });
    } catch (error) {
      logError('sendVideoFrame FAILED', error?.message);
    }
  }

  send(parts, turnComplete = true) {
    if (!this.session || this.status !== 'connected') return;
    const turns = Array.isArray(parts) ? parts : [parts];
    log('info', `📤 sendClientContent (turnComplete: ${turnComplete})`, turns);
    try {
      this.session.sendClientContent({ turns, turnComplete });
    } catch (error) {
      logError('sendClientContent FAILED', error?.message);
      this.emit('error', error);
    }
  }
}

import { GoogleGenAI } from '@google/genai';
import EventEmitter from 'eventemitter3';
import { callDebug } from './call-debug.js';
import { buildLiveConnectConfig } from './live-config.js';
import { base64ToArrayBuffer } from './utils.js';

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

let sessionStartTime = 0;
function elapsed() {
  if (!sessionStartTime) return '0.0s';
  return `${((Date.now() - sessionStartTime) / 1000).toFixed(1)}s`;
}

function log(level, event, details = {}) {
  callDebug('live-client', event, { level, ...details });
}

function isClosedWebSocketError(error) {
  return /websocket is already in closing or closed state/i.test(error?.message || String(error || ''));
}

function normalizeClientContentTurn(turn) {
  if (typeof turn === 'string') {
    return { role: 'user', parts: [{ text: turn }] };
  }

  if (turn?.text && !turn.parts && !turn.role) {
    return { role: 'user', parts: [{ text: turn.text }] };
  }

  return turn;
}

export class GenAILiveClient extends EventEmitter {
  constructor(options) {
    super();
    callDebug('live-client', 'constructor', {
      hasApiKey: Boolean(options?.apiKey),
      apiKeyLength: options?.apiKey?.length || 0,
    });
    this.client = new GoogleGenAI(options);
    this.session = null;
    this.status = 'disconnected';
    this.model = null;
    this.config = null;
    this._resumptionHandle = null;
    this._autoReconnecting = false;
    this._intentionalClose = false;
    this._audioChunkCount = 0;
  }

  async connect(model, config) {
    if (this.status === 'connecting' || this.status === 'connected') {
      log('warn', 'connect-skipped-already-active', { status: this.status });
      return false;
    }

    this.status = 'connecting';
    this.model = model;
    this.config = config;
    this._audioChunkCount = 0;
    sessionStartTime = Date.now();

    log('info', 'connect-start', {
      model,
      responseModalities: config.responseModalities,
      voiceName: config.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName,
      startSensitivity: config.realtimeInputConfig?.automaticActivityDetection?.startOfSpeechSensitivity,
      endSensitivity: config.realtimeInputConfig?.automaticActivityDetection?.endOfSpeechSensitivity,
      silenceDurationMs: config.realtimeInputConfig?.automaticActivityDetection?.silenceDurationMs,
      prefixPaddingMs: config.realtimeInputConfig?.automaticActivityDetection?.prefixPaddingMs,
      activityHandling: config.realtimeInputConfig?.activityHandling,
      systemInstructionChars: config.systemInstruction?.parts?.[0]?.text?.length || 0,
      hasResumptionHandle: Boolean(this._resumptionHandle),
    });

    try {
      const fullConfig = buildLiveConnectConfig(config, {
        resumptionHandle: this._resumptionHandle,
      });

      this.session = await this.client.live.connect({
        model,
        config: fullConfig,
        callbacks: {
          onopen: () => {
            this.status = 'connected';
            log('success', 'websocket-open', { elapsed: elapsed() });
            this.emit('open');
          },
          onclose: (event) => {
            log('warn', 'websocket-closed', {
              elapsed: elapsed(),
              reason: event?.reason || '',
              code: event?.code,
              wasClean: event?.wasClean,
              hasResumptionHandle: Boolean(this._resumptionHandle),
              intentionalClose: this._intentionalClose,
            });
            this.status = 'disconnected';
            this.session = null;

            if (this._resumptionHandle && !this._intentionalClose) {
              this._autoReconnect();
              return;
            }

            this.emit('close', event);
          },
          onerror: (event) => {
            log('error', 'websocket-error', {
              elapsed: elapsed(),
              message: event?.message || String(event),
            });
            this.emit('error', event);
          },
          onmessage: (message) => {
            callDebug('live-client', 'message-received', {
              hasSetupComplete: Boolean(message?.setupComplete),
              hasGoAway: Boolean(message?.goAway),
              hasUsage: Boolean(message?.usageMetadata),
              hasServerContent: Boolean(message?.serverContent),
              hasModelTurn: Boolean(message?.serverContent?.modelTurn),
              partCount: message?.serverContent?.modelTurn?.parts?.length || 0,
              interrupted: Boolean(message?.serverContent?.interrupted),
              generationComplete: Boolean(message?.serverContent?.generationComplete),
              turnComplete: Boolean(message?.serverContent?.turnComplete),
              inputTranscriptChars: message?.serverContent?.inputTranscription?.text?.length || 0,
              outputTranscriptChars: message?.serverContent?.outputTranscription?.text?.length || 0,
            });
            this.handleMessage(message);
          },
        },
      });

      this._intentionalClose = false;
      log('success', 'connect-returned', { elapsed: elapsed(), status: this.status });
      return true;
    } catch (error) {
      this.status = 'disconnected';
      log('error', 'connect-failed', { elapsed: elapsed(), error });
      throw error;
    }
  }

  async _autoReconnect() {
    if (this._autoReconnecting) return;
    this._autoReconnecting = true;

    try {
      log('info', 'auto-reconnect-start');
      this.emit('reconnecting');
      await new Promise((resolve) => setTimeout(resolve, 500));

      this.status = 'disconnected';
      await this.connect(this.model, this.config);
      this._autoReconnecting = false;
      log('success', 'auto-reconnect-ok');
      this.emit('reconnected');
    } catch (error) {
      this._autoReconnecting = false;
      log('error', 'auto-reconnect-failed', { error });
      this.emit('close', { reason: `Reconnection failed: ${error?.message || 'Unknown error'}` });
    }
  }

  disconnect() {
    log('info', 'disconnect-called', {
      elapsed: elapsed(),
      hasSession: Boolean(this.session),
      status: this.status,
    });
    this._intentionalClose = true;
    this._resumptionHandle = null;
    if (!this.session) {
      this.status = 'disconnected';
      return;
    }
    try {
      this.session.close();
    } catch (error) {
      log('warn', 'disconnect-close-failed', { error });
    }
    this.session = null;
    this.status = 'disconnected';
  }

  handleMessage(message) {
    if (message?.sessionResumptionUpdate) {
      const update = message.sessionResumptionUpdate;
      if (update.resumable && update.newHandle) {
        this._resumptionHandle = update.newHandle;
        log('info', 'session-resumption-update', {
          resumable: update.resumable,
          hasHandle: Boolean(update.newHandle),
        });
      }
    }

    if (message?.goAway) {
      log('warn', 'go-away', { elapsed: elapsed(), timeLeft: message.goAway.timeLeft });
      this.emit('goaway', message.goAway);
    }

    if (message?.setupComplete) {
      log('success', 'setup-complete', { elapsed: elapsed() });
      this.emit('setupcomplete');
      return;
    }

    if (message?.usageMetadata) {
      const metadata = message.usageMetadata;
      log('info', 'usage-metadata', {
        promptTokenCount: metadata.promptTokenCount || 0,
        responseTokenCount: metadata.responseTokenCount || 0,
        totalTokenCount: metadata.totalTokenCount || 0,
      });
    }

    const serverContent = message?.serverContent;
    if (!serverContent) return;

    if (serverContent.interrupted) {
      log('event', 'server-interrupted', {
        elapsed: elapsed(),
        audioChunkCount: this._audioChunkCount,
      });
      this._audioChunkCount = 0;
      this.emit('interrupted');
    }

    if (serverContent.generationComplete) {
      log('event', 'generation-complete', { elapsed: elapsed() });
      this.emit('generationcomplete');
    }

    if (serverContent.inputTranscription?.text) {
      log('event', 'input-transcript', { chars: serverContent.inputTranscription.text.length });
      this.emit('inputtranscript', serverContent.inputTranscription.text);
    }
    if (serverContent.outputTranscription?.text) {
      log('event', 'output-transcript', { chars: serverContent.outputTranscription.text.length });
      this.emit('outputtranscript', serverContent.outputTranscription.text);
    }

    if (serverContent.turnComplete) {
      log('event', 'turn-complete', {
        elapsed: elapsed(),
        audioChunkCount: this._audioChunkCount,
      });
      this._audioChunkCount = 0;
      this.emit('turncomplete');
    }

    if (!serverContent.interrupted) {
      const modelTurnParts = serverContent.modelTurn?.parts || [];
      const nonAudioParts = emitAudioParts(modelTurnParts, (audioData) => {
        this._audioChunkCount += 1;
        if (this._audioChunkCount <= 5 || this._audioChunkCount % 10 === 1) {
          log('audio', 'audio-chunk', {
            audioChunkCount: this._audioChunkCount,
            kb: Number((audioData.byteLength / 1024).toFixed(1)),
            elapsed: elapsed(),
          });
        }
        this.emit('audio', audioData);
      });

      if (nonAudioParts.length > 0) {
        log('event', 'non-audio-content', {
          elapsed: elapsed(),
          partCount: nonAudioParts.length,
          partKeys: nonAudioParts.map((part) => Object.keys(part || {})),
        });
        this.emit('content', { modelTurn: { parts: nonAudioParts } });
      }
    }
  }

  sendRealtimeInput(chunks) {
    if (!this.session || this.status !== 'connected') {
      callDebug('live-client', 'send-realtime-input-skipped', {
        hasSession: Boolean(this.session),
        status: this.status,
        chunkCount: chunks?.length || 0,
      });
      return;
    }
    try {
      chunks.forEach((chunk) => {
        callDebug('live-client', 'send-realtime-input', {
          mimeType: chunk.mimeType,
          payloadChars: chunk.data?.length || 0,
          status: this.status,
        });
        this.session.sendRealtimeInput({
          audio: {
            data: chunk.data,
            mimeType: chunk.mimeType,
          },
        });
      });
    } catch (error) {
      if (isClosedWebSocketError(error)) {
        this.status = 'disconnected';
        this.session = null;
        log('warn', 'send-realtime-input-closed-socket', { error });
        this.emit('close', {
          reason: 'WebSocket closed before audio could be sent.',
          code: 1006,
          wasClean: false,
        });
        return;
      }
      log('error', 'send-realtime-input-failed', { error });
      this.emit('error', error);
    }
  }

  sendVideoFrame(base64Data, mimeType = 'image/jpeg') {
    if (!this.session || this.status !== 'connected') {
      callDebug('live-client', 'send-video-frame-skipped', {
        hasSession: Boolean(this.session),
        status: this.status,
        payloadChars: base64Data?.length || 0,
      });
      return;
    }
    try {
      callDebug('live-client', 'send-video-frame', {
        mimeType,
        payloadChars: base64Data?.length || 0,
        status: this.status,
      });
      this.session.sendRealtimeInput({
        video: {
          data: base64Data,
          mimeType,
        },
      });
    } catch (error) {
      log('error', 'send-video-frame-failed', { error });
    }
  }

  send(parts, turnComplete = true) {
    if (!this.session || this.status !== 'connected') {
      callDebug('live-client', 'send-client-content-skipped', {
        hasSession: Boolean(this.session),
        status: this.status,
        turnComplete,
      });
      return;
    }
    const turns = (Array.isArray(parts) ? parts : [parts]).map(normalizeClientContentTurn);
    log('info', 'send-client-content', {
      turnComplete,
      turnCount: turns.length,
      turnKeys: turns.map((turn) => Object.keys(turn || {})),
    });
    try {
      this.session.sendClientContent({ turns, turnComplete });
    } catch (error) {
      log('error', 'send-client-content-failed', { error });
      this.emit('error', error);
    }
  }
}

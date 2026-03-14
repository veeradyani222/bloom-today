import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityHandling,
  EndSensitivity,
  Modality,
  StartSensitivity,
} from '@google/genai';
import { AudioRecorder } from '../lib/live-api/audio-recorder';
import { AudioStreamer } from '../lib/live-api/audio-streamer';
import { GenAILiveClient } from '../lib/live-api/genai-live-client';
import { audioContext } from '../lib/live-api/utils';
import { apiRequest } from '../lib/api';
import { requestMediaPermissions } from '../lib/mediaPermissions';

const DEFAULT_MODEL = 'gemini-2.5-flash-native-audio-latest';

/* ── Verbose Logger ── */
const LOG_PREFIX = '%c[VoiceCall]';
const S = {
  info: 'color: #60a5fa; font-weight: bold',
  ok: 'color: #34d399; font-weight: bold',
  warn: 'color: #fbbf24; font-weight: bold',
  err: 'color: #f87171; font-weight: bold',
  event: 'color: #c084fc; font-weight: bold',
};
function vcLog() {}
function vcWarn() {}
function vcErr() {}

/* ── Tuning constants ── */
const SPEECH_END_TIMEOUT_MS = 500;  // gap before we consider AI done speaking per-chunk
const VOLUME_DECAY_RATE = 0.85;     // smooth remote volume falloff per frame
const BARGE_IN_VOLUME = 0.18;       // mic threshold for client-side cutoff

function clampVolume(value) {
  return Math.max(0, Math.min(1, value));
}

function normalizeModelName(modelName) {
  if (!modelName) return DEFAULT_MODEL;
  return modelName.replace(/^models\//, '');
}

function estimatePcmVolume(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const sampleCount = view.byteLength / 2;
  if (!sampleCount) return 0;
  let sum = 0;
  for (let i = 0; i < sampleCount; i += 1) {
    const sample = view.getInt16(i * 2, true) / 32768;
    sum += sample * sample;
  }
  return clampVolume(Math.sqrt(sum / sampleCount) * 1.6);
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function useCompanionCall({
  userName = 'Mom',
  companionName = 'Companion',
  companionVoiceName = 'Aoede',
  companionInstructions = '',
  userMemories = [],
  token = '',
}) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  const liveModel = normalizeModelName(import.meta.env.VITE_GEMINI_LIVE_MODEL || DEFAULT_MODEL);

  /* ── Core state ── */
  const [callState, setCallState] = useState('idle');
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(false);
  const [localVolume, setLocalVolume] = useState(0);
  const [remoteVolume, setRemoteVolume] = useState(0);
  const [callDuration, setCallDuration] = useState(0);
  const [turnState, setTurnState] = useState('idle');
  const [clientVersion, setClientVersion] = useState(0);

  /* ── Refs ── */
  const clientRef = useRef(null);
  const recorderRef = useRef(null);
  const streamerRef = useRef(null);
  const micPreflightStreamRef = useRef(null);
  const shouldSendGreetingRef = useRef(false);
  const greetingSentRef = useRef(false);
  const intentionalHangupRef = useRef(false);
  const isAssistantSpeakingRef = useRef(false);
  const assistantSpeechTimeoutRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const remoteVolumeDecayRef = useRef(null);
  const lastRemoteVolumeRef = useRef(0);

  // ── Model turn tracking ──
  // TRUE while the model is actively generating (from first audio chunk until turnComplete).
  // This distinguishes "model is generating + streamer playing" from "model done but
  // streamer still draining old audio". Without this, barge-in on stale playback
  // sets ignoreAudioRef=true with no turnComplete to ever clear it → all future audio dropped.
  const modelTurnActiveRef = useRef(false);

  // ── Flag-based barge-in ignore ──
  // When true, discard ALL incoming AI audio.
  // Set on: barge-in WHILE model turn is active.
  // Cleared on: turnComplete.
  const ignoreAudioRef = useRef(false);

  // ── Transcript & analytics ──
  const callIdRef = useRef(null);           // DB call session id
  const transcriptRef = useRef([]);         // [{role, content}] for the whole call
  const currentUserTextRef = useRef('');    // Accumulates user speech this turn
  const currentAITextRef = useRef('');      // Accumulates AI speech this turn
  const turnCountRef = useRef(0);           // How many full turns completed
  const savedMsgCountRef = useRef(0);       // How many transcript msgs already sent to DB

  /* ── Callback ref for AI transcript (used by gesture mapper) ── */
  const onAITranscriptRef = useRef(null);

  /* ── Derived ── */
  const isConnected = callState === 'connected';
  const isConnecting = callState === 'connecting';
  const hasApiKey = Boolean(apiKey);

  const callLabel = useMemo(() => {
    if (callState === 'connecting') return 'Connecting…';
    if (callState === 'connected') return 'On call';
    if (callState === 'error') return 'Call failed';
    return 'Not connected';
  }, [callState]);

  const formattedDuration = useMemo(() => formatDuration(callDuration), [callDuration]);

  /* ── Timer ── */
  const startTimer = useCallback(() => {
    setCallDuration(0);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setCallDuration(0);
  }, []);

  /* ── Smooth remote volume decay ── */
  const decayRemoteVolume = useCallback(() => {
    if (remoteVolumeDecayRef.current) cancelAnimationFrame(remoteVolumeDecayRef.current);
    const tick = () => {
      lastRemoteVolumeRef.current *= VOLUME_DECAY_RATE;
      if (lastRemoteVolumeRef.current < 0.01) {
        lastRemoteVolumeRef.current = 0;
        setRemoteVolume(0);
        return;
      }
      setRemoteVolume(lastRemoteVolumeRef.current);
      remoteVolumeDecayRef.current = requestAnimationFrame(tick);
    };
    remoteVolumeDecayRef.current = requestAnimationFrame(tick);
  }, []);

  const buildSystemInstruction = useCallback(
    () =>
      [
        `You are ${companionName}, a warm and caring postpartum support companion for ${userName}.`,
        'This is a live phone call. Speak naturally, warmly, and conversationally — like a close friend who truly cares.',
        'When the call begins, immediately open with a warm, brief greeting by name — do not wait for the user to speak first.',
        'Keep responses at 2 to 4 sentences. Be warm and substantive but never monologue.',
        'If the topic is deep or emotional, give a meaningful reply with genuine care.',
        'If the user interrupts you, stop immediately. Only respond to the LATEST thing they said. Do NOT resume or reference what you were saying before.',
        'CRITICAL: After interruption, produce ONLY ONE short response. Do not produce multiple responses.',
        'Use brief natural cues like "mm-hmm", "I hear you", "absolutely" to stay human.',
        companionInstructions ? `THERAPIST & CLINICAL GUIDANCE (follow this carefully — it reflects professional insight about ${userName}): ${companionInstructions}` : '',
        userMemories.length > 0
          ? `PERSONAL MEMORY (things you have learned about ${userName} from past conversations — hold onto these and bring them up naturally and subtly when the moment fits, never robotically list them): ${userMemories.join(' | ')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
    [companionName, companionInstructions, userMemories, userName],
  );

  /* ── Perform barge-in cleanup ── */
  const performBargeIn = useCallback((source = 'unknown') => {
    vcLog('event', `🛑 BARGE-IN triggered (source: ${source}) | ignoreAudio was: ${ignoreAudioRef.current} | modelTurnActive: ${modelTurnActiveRef.current} | streamer.isPlaying: ${streamerRef.current?.isPlaying} | isAssistantSpeaking: ${isAssistantSpeakingRef.current}`);

    // 1. Kill all playing and queued AI audio immediately
    streamerRef.current?.stop();
    lastRemoteVolumeRef.current = 0;
    setRemoteVolume(0);

    // 2. Reset AI speaking state
    isAssistantSpeakingRef.current = false;
    if (assistantSpeechTimeoutRef.current) {
      clearTimeout(assistantSpeechTimeoutRef.current);
      assistantSpeechTimeoutRef.current = null;
    }

    // 3. CRITICAL FIX: Only set ignoreAudioRef if the model turn is still active.
    //    If the model turn already completed (turnComplete received) but the streamer
    //    was still draining buffered audio, do NOT set the flag — there will be no
    //    future turnComplete to clear it, which would permanently silence all audio.
    if (modelTurnActiveRef.current) {
      ignoreAudioRef.current = true;
      vcLog('event', `🔇 Ignoring future audio until next turnComplete (model still generating)`);
    } else {
      vcLog('info', `ℹ️ Streamer stopped but model turn was already complete — NOT setting ignoreAudio`);
    }

    // 4. Visual state
    setTurnState('user-speaking');
  }, []);

  /* ── Recorder management ── */
  const stopRecorder = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setLocalVolume(0);
  }, []);

  const startRecorder = useCallback(async () => {
    const client = clientRef.current;
    if (!client || !isConnected || muted) return;

    if (recorderRef.current) {
      try {
        recorderRef.current.stop();
      } catch {
        // Ignore stop errors while restarting the recorder.
      }
    }
    vcLog('info', `🎤 Starting recorder (muted: ${muted})`);
    recorderRef.current = new AudioRecorder(16000);

    const recorder = recorderRef.current;
    recorder.removeAllListeners();

    recorder.on('data', (base64Audio) => {
      client.sendRealtimeInput([
        { mimeType: 'audio/pcm;rate=16000', data: base64Audio },
      ]);
    });

    recorder.on('volume', (value) => {
      const normalised = clampVolume(value * 2.2);
      setLocalVolume(normalised);

      // UI-only turn state tracking — NO client-side barge-in.
      // We rely entirely on the server's VAD to detect real interruptions
      // (via the 'interrupted' event). Client-side mic detection can't
      // distinguish user speech from speaker echo, causing false cutoffs.
      if (normalised > BARGE_IN_VOLUME) {
        setTurnState('user-speaking');
      } else {
        setTurnState((prev) => (prev === 'user-speaking' ? 'idle' : prev));
      }
    });

    const preflightMicStream = micPreflightStreamRef.current;
    micPreflightStreamRef.current = null;
    await recorder.start(preflightMicStream ? { stream: preflightMicStream } : undefined);
  }, [isConnected, muted]);

  /* ── Cleanup ── */
  const cleanupCall = useCallback((intentional = false) => {
    intentionalHangupRef.current = intentional;
    if (assistantSpeechTimeoutRef.current) {
      clearTimeout(assistantSpeechTimeoutRef.current);
      assistantSpeechTimeoutRef.current = null;
    }
    if (remoteVolumeDecayRef.current) {
      cancelAnimationFrame(remoteVolumeDecayRef.current);
      remoteVolumeDecayRef.current = null;
    }
    isAssistantSpeakingRef.current = false;
    modelTurnActiveRef.current = false;
    ignoreAudioRef.current = false;
    if (micPreflightStreamRef.current) {
      micPreflightStreamRef.current.getTracks().forEach((track) => track.stop());
      micPreflightStreamRef.current = null;
    }
    stopRecorder();
    streamerRef.current?.stop();
    clientRef.current?.disconnect();
    shouldSendGreetingRef.current = false;
    greetingSentRef.current = false;
    setRemoteVolume(0);
    setTurnState('idle');
    stopTimer();

    // Persist any unsaved transcript messages and close the DB session
    if (callIdRef.current && token) {
      const finalCallId = callIdRef.current;
      const unsaved = transcriptRef.current.slice(savedMsgCountRef.current);
      void (async () => {
        try {
          if (unsaved.length > 0) {
            await apiRequest(`/api/calls/${finalCallId}/messages`, {
              method: 'POST',
              token,
              body: { messages: unsaved },
            });
          }
        } catch {
          // Non-blocking: still attempt to close the session record.
        } finally {
          apiRequest(`/api/calls/${finalCallId}/end`, {
            method: 'PUT',
            token,
            body: {},
          }).catch(() => {});
        }
      })();
    }
    callIdRef.current = null;
    savedMsgCountRef.current = 0;
    transcriptRef.current = [];
    currentUserTextRef.current = '';
    currentAITextRef.current = '';
    turnCountRef.current = 0;
  }, [stopRecorder, stopTimer, token]);

  const endCall = useCallback(() => {
    cleanupCall(true);
    setError('');
    setCallState('idle');
  }, [cleanupCall]);

  /* ── Start call ── */
  const startCall = useCallback(async () => {
    if (!hasApiKey) {
      setCallState('error');
      setError('Missing `VITE_GEMINI_API_KEY` in frontend .env');
      return;
    }
    if (isConnecting || isConnected) return;

    vcLog('ok', '📞 Starting call...');
    setError('');
    setCallState('connecting');
    intentionalHangupRef.current = false;
    shouldSendGreetingRef.current = true;
    greetingSentRef.current = false;
    ignoreAudioRef.current = false;
    modelTurnActiveRef.current = false;

    // Reset transcript buffers for this call
    transcriptRef.current = [];
    currentUserTextRef.current = '';
    currentAITextRef.current = '';
    turnCountRef.current = 0;
    savedMsgCountRef.current = 0;

    if (token) {
      // Create a DB session record (fire-and-forget)
      apiRequest('/api/calls/start', { method: 'POST', token, body: { callType: 'voice' } })
        .then((data) => { callIdRef.current = data.callId; })
        .catch(() => {});
    }

    try {
      const permissionStream = await requestMediaPermissions({ audio: true });
      const [primaryAudioTrack, ...extraAudioTracks] = permissionStream.getAudioTracks();
      if (!primaryAudioTrack) {
        throw new Error('Microphone permission was granted, but no microphone track is available.');
      }
      extraAudioTracks.forEach((track) => track.stop());
      permissionStream.getVideoTracks().forEach((track) => track.stop());
      micPreflightStreamRef.current = new MediaStream([primaryAudioTrack]);

      if (!streamerRef.current) {
        const audioCtx = await audioContext({ id: 'companion-audio-out' });
        streamerRef.current = new AudioStreamer(audioCtx);
      }
      await streamerRef.current.resume();

      clientRef.current = new GenAILiveClient({ apiKey });

      // Register greeting handler BEFORE connect, so setupcomplete is never missed
      clientRef.current.once('setupcomplete', () => {
        vcLog('ok', '🎯 Setup complete (greeting handler)');
        if (shouldSendGreetingRef.current && !greetingSentRef.current) {
          vcLog('info', '👋 Sending greeting message');
          greetingSentRef.current = true;
          shouldSendGreetingRef.current = false;
          clientRef.current?.send({
            text: `Greet ${userName} now — warm and brief.`,
          });
        }
      });

      setClientVersion((v) => v + 1);

      const baseConfig = {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: companionVoiceName,
            },
          },
        },
        realtimeInputConfig: {
          activityHandling: ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
          automaticActivityDetection: {
            disabled: false,
            startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
            endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
            prefixPaddingMs: 50,
            silenceDurationMs: 300,
          },
        },
        systemInstruction: {
          parts: [{ text: buildSystemInstruction() }],
        },
      };

      try {
        await clientRef.current.connect(liveModel, baseConfig);
      } catch (primaryError) {
        if (liveModel === DEFAULT_MODEL) throw primaryError;
        await clientRef.current.connect(DEFAULT_MODEL, baseConfig);
      }
    } catch (connectError) {
      cleanupCall(false);
      setCallState('error');
      vcErr('📞 Call FAILED to start', connectError?.message || connectError);
      setError(connectError?.message || 'Could not start voice call.');
    }
  }, [
    apiKey,
    buildSystemInstruction,
    cleanupCall,
    companionVoiceName,
    hasApiKey,
    isConnected,
    isConnecting,
    liveModel,
    token,
    userName,
  ]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => !prev);
  }, []);

  /* ── Event listeners ── */
  useEffect(() => {
    const client = clientRef.current;
    if (!client) return undefined;

    const onOpen = () => {
      vcLog('ok', '📞 Call CONNECTED, starting timer');
      setCallState('connected');
      startTimer();
    };

    const onClose = (event) => {
      vcWarn('📞 WebSocket CLOSED', event?.reason || '');
      stopRecorder();
      setRemoteVolume(0);
      stopTimer();
      if (intentionalHangupRef.current) {
        intentionalHangupRef.current = false;
        setCallState('idle');
        return;
      }
      setCallState('error');
      setError(event?.reason || 'Call connection dropped. Please try again.');
    };

    // ── Audio handler with flag-based ignore ──
    const onAudio = (audioData) => {
      // If we're in the ignore window (between interrupted → turnComplete),
      // discard this audio — it's stale data from the old response.
      if (ignoreAudioRef.current) {
        return; // Silently drop stale audio
      }

      // Mark that the model turn is actively generating
      modelTurnActiveRef.current = true;
      isAssistantSpeakingRef.current = true;
      setTurnState('ai-speaking');

      if (assistantSpeechTimeoutRef.current) {
        clearTimeout(assistantSpeechTimeoutRef.current);
      }
      assistantSpeechTimeoutRef.current = window.setTimeout(() => {
        isAssistantSpeakingRef.current = false;
        setTurnState('idle');
        decayRemoteVolume();
      }, SPEECH_END_TIMEOUT_MS);

      const chunk = new Uint8Array(audioData);
      streamerRef.current?.addPCM16(chunk);

      const vol = estimatePcmVolume(audioData);
      lastRemoteVolumeRef.current = vol;
      setRemoteVolume(vol);
    };

    // ── Server-side barge-in ──
    const onInterrupted = () => {
      performBargeIn('server-interrupted');
      // Discard partial AI transcript for cancelled turn
      currentAITextRef.current = '';
    };

    // ── Turn complete ──
    const onTurnComplete = () => {
      const wasIgnoring = ignoreAudioRef.current;
      const wasTurnActive = modelTurnActiveRef.current;

      // Clear both flags — turn is fully done
      ignoreAudioRef.current = false;
      modelTurnActiveRef.current = false;

      vcLog('event', `✅ Turn complete — ignoreAudio was: ${wasIgnoring}, modelTurnActive was: ${wasTurnActive}, both now: false`);

      isAssistantSpeakingRef.current = false;
      decayRemoteVolume();
      setTimeout(() => {
        setTurnState((current) => (current === 'ai-speaking' ? 'idle' : current));
      }, 200);

      // ── Flush transcript for this turn ──
      const userText = currentUserTextRef.current.trim();
      const aiText = currentAITextRef.current.trim();
      if (userText) {
        transcriptRef.current.push({ role: 'user', content: userText });
        currentUserTextRef.current = '';
      }
      if (aiText) {
        transcriptRef.current.push({ role: 'assistant', content: aiText });
        currentAITextRef.current = '';
      }
      turnCountRef.current += 1;

      // Save new messages to DB every turn
      if (callIdRef.current && token) {
        const newMessages = transcriptRef.current.slice(savedMsgCountRef.current);
        if (newMessages.length > 0) {
          savedMsgCountRef.current = transcriptRef.current.length;
          apiRequest(`/api/calls/${callIdRef.current}/messages`, {
            method: 'POST', token, body: { messages: newMessages },
          }).catch(() => {});
        }
      }
    };

    const onSetupComplete = () => {
      vcLog('ok', '🎯 Setup complete (effect listener)');
      // Greeting is handled by the once() listener registered in startCall
    };

    const onError = (event) => {
      vcErr('⚠️ ERROR event', event?.message || event);
      setCallState('error');
      setError(event?.message || 'Voice call encountered an error.');
      stopRecorder();
      stopTimer();
    };

    const onReconnecting = () => {
      vcLog('warn', '♻️ Reconnecting...');
      setCallState('connecting');
      setError('');
    };

    const onReconnected = () => {
      vcLog('ok', '♻️ Reconnected!');
      setCallState('connected');
    };

    const onGoAway = (info) => {
    };

    // ── Transcript: accumulate user speech transcription ──
    const onInputTranscript = (text) => {
      if (text) currentUserTextRef.current += text + ' ';
    };

    // ── Transcript: accumulate AI speech transcription ──
    const onOutputTranscript = (text) => {
      if (text) {
        currentAITextRef.current += text + ' ';
        // Forward to gesture mapper callback
        if (onAITranscriptRef.current) onAITranscriptRef.current(text);
      }
    };

    client.on('open', onOpen);
    client.on('close', onClose);
    client.on('audio', onAudio);
    client.on('interrupted', onInterrupted);
    client.on('setupcomplete', onSetupComplete);
    client.on('turncomplete', onTurnComplete);
    client.on('error', onError);
    client.on('reconnecting', onReconnecting);
    client.on('reconnected', onReconnected);
    client.on('goaway', onGoAway);
    client.on('inputtranscript', onInputTranscript);
    client.on('outputtranscript', onOutputTranscript);

    return () => {
      if (assistantSpeechTimeoutRef.current) {
        clearTimeout(assistantSpeechTimeoutRef.current);
      }
      client.off('open', onOpen);
      client.off('close', onClose);
      client.off('audio', onAudio);
      client.off('interrupted', onInterrupted);
      client.off('setupcomplete', onSetupComplete);
      client.off('turncomplete', onTurnComplete);
      client.off('error', onError);
      client.off('reconnecting', onReconnecting);
      client.off('reconnected', onReconnected);
      client.off('goaway', onGoAway);
      client.off('inputtranscript', onInputTranscript);
      client.off('outputtranscript', onOutputTranscript);
    };
  }, [stopRecorder, stopTimer, startTimer, userName, decayRemoteVolume, clientVersion, performBargeIn, token]);

  /* ── Mic control effect ── */
  useEffect(() => {
    if (isConnected && !muted) {
      startRecorder().catch((recorderError) => {
        setError(recorderError?.message || 'Microphone permission was denied.');
        setCallState('error');
      });
      return;
    }
    stopRecorder();
  }, [isConnected, muted, startRecorder, stopRecorder]);

  /* ── Tab visibility: resume AudioContext when user returns ── */
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && streamerRef.current) {
        streamerRef.current.resume().catch(() => { });
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  /* ── Unmount cleanup ── */
  useEffect(
    () => () => {
      cleanupCall(false);
      // Clean up streamer's visibility listener
      streamerRef.current?.destroy?.();
    },
    [cleanupCall],
  );

  return {
    callState,
    callLabel,
    error,
    muted,
    localVolume,
    remoteVolume,
    isConnecting,
    isConnected,
    hasApiKey,
    callDuration,
    formattedDuration,
    turnState,
    startCall,
    endCall,
    toggleMute,
    onAITranscriptRef,
  };
}

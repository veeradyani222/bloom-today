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
import { registerLiveClientListeners } from '../lib/live-api/client-listeners';
import { callDebug, startCallDebugSession } from '../lib/live-api/call-debug.js';
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
function vcLog(level, message, details) {
  callDebug('voice-call', String(message), { level, details });
}
function vcWarn(message, details) {
  callDebug('voice-call', String(message), { level: 'warn', details });
}
function vcErr(message, details) {
  callDebug('voice-call', String(message), { level: 'error', details });
}

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
  const detachClientListenersRef = useRef(null);

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
  const callStartPromiseRef = useRef(null); // Pending DB session creation
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
    if (!client || !isConnected || muted) {
      callDebug('voice-call', 'start-recorder-skipped', {
        hasClient: Boolean(client),
        isConnected,
        muted,
      });
      return;
    }

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
    callDebug('voice-call', 'recorder-start-before', { hasPreflightStream: Boolean(preflightMicStream) });
    await recorder.start(preflightMicStream ? { stream: preflightMicStream } : undefined);
    callDebug('voice-call', 'recorder-start-after');
  }, [isConnected, muted]);

  /* ── Cleanup ── */
  const cleanupCall = useCallback((intentional = false) => {
    intentionalHangupRef.current = intentional;
    if (detachClientListenersRef.current) {
      detachClientListenersRef.current();
      detachClientListenersRef.current = null;
    }
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
    const finalMessages = [...transcriptRef.current];
    const userText = currentUserTextRef.current.trim();
    const aiText = currentAITextRef.current.trim();
    if (userText) finalMessages.push({ role: 'user', content: userText });
    if (aiText) finalMessages.push({ role: 'assistant', content: aiText });
    const unsaved = finalMessages.slice(savedMsgCountRef.current);
    const pendingCallId = callIdRef.current;
    const pendingCallStart = callStartPromiseRef.current;

    callIdRef.current = null;
    callStartPromiseRef.current = null;
    savedMsgCountRef.current = 0;
    transcriptRef.current = [];
    currentUserTextRef.current = '';
    currentAITextRef.current = '';
    turnCountRef.current = 0;

    const finalizePromise = token
      ? (async () => {
          try {
            let finalCallId = pendingCallId;
            if (!finalCallId && pendingCallStart) {
              finalCallId = await pendingCallStart;
            }

            if (!finalCallId) return null;

            try {
              if (unsaved.length > 0) {
                await apiRequest(`/api/calls/${finalCallId}/messages`, {
                  method: 'POST',
                  token,
                  keepalive: true,
                  body: { messages: unsaved },
                });
              }
            } finally {
              await apiRequest(`/api/calls/${finalCallId}/end`, {
                method: 'PUT',
                token,
                keepalive: true,
                body: {},
              });
            }

            return finalCallId;
          } catch {
            // Dashboard can still recover on the next completed call.
            return null;
          }
        })()
      : Promise.resolve(null);
    return finalizePromise;
  }, [stopRecorder, stopTimer, token]);

  const endCall = useCallback(() => {
    const finalizePromise = cleanupCall(true);
    setError('');
    setCallState('idle');
    return finalizePromise;
  }, [cleanupCall]);

  const registerClientListeners = useCallback((client) => {
    if (!client) return;
    if (detachClientListenersRef.current) {
      detachClientListenersRef.current();
      detachClientListenersRef.current = null;
    }

    const onOpen = () => {
      callDebug('voice-call', 'client-open');
      vcLog('ok', 'Call CONNECTED, starting timer');
      setCallState('connected');
      startTimer();
    };

    const onClose = (event) => {
      callDebug('voice-call', 'client-close', {
        reason: event?.reason || '',
        code: event?.code,
        wasClean: event?.wasClean,
        intentional: intentionalHangupRef.current,
      });
      vcWarn('WebSocket CLOSED', event?.reason || '');
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

    const onAudio = (audioData) => {
      if (ignoreAudioRef.current) {
        callDebug('voice-call', 'remote-audio-ignored', { bytes: audioData.byteLength });
        return;
      }
      callDebug('voice-call', 'remote-audio', {
        bytes: audioData.byteLength,
        streamerReady: Boolean(streamerRef.current),
      });

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

    const onInterrupted = () => {
      callDebug('voice-call', 'client-interrupted');
      performBargeIn('server-interrupted');
      currentAITextRef.current = '';
    };

    const onTurnComplete = () => {
      const wasIgnoring = ignoreAudioRef.current;
      const wasTurnActive = modelTurnActiveRef.current;
      callDebug('voice-call', 'turn-complete', {
        wasIgnoring,
        wasTurnActive,
        currentUserTextChars: currentUserTextRef.current.length,
        currentAITextChars: currentAITextRef.current.length,
      });

      ignoreAudioRef.current = false;
      modelTurnActiveRef.current = false;

      vcLog('event', `Turn complete - ignoreAudio was: ${wasIgnoring}, modelTurnActive was: ${wasTurnActive}, both now: false`);

      isAssistantSpeakingRef.current = false;
      decayRemoteVolume();
      setTimeout(() => {
        setTurnState((current) => (current === 'ai-speaking' ? 'idle' : current));
      }, 200);

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

    const onError = (event) => {
      callDebug('voice-call', 'client-error', {
        message: event?.message || String(event),
      });
      vcErr('ERROR event', event?.message || event);
      setCallState('error');
      setError(event?.message || 'Voice call encountered an error.');
      stopRecorder();
      stopTimer();
    };

    const onInputTranscript = (text) => {
      callDebug('voice-call', 'input-transcript', { chars: text?.length || 0 });
      if (text) currentUserTextRef.current += text + ' ';
    };

    const onOutputTranscript = (text) => {
      callDebug('voice-call', 'output-transcript', { chars: text?.length || 0 });
      if (text) {
        currentAITextRef.current += text + ' ';
        if (onAITranscriptRef.current) onAITranscriptRef.current(text);
      }
    };

    const detach = registerLiveClientListeners(client, {
      open: onOpen,
      close: onClose,
      audio: onAudio,
      interrupted: onInterrupted,
      setupcomplete: () => vcLog('ok', 'Setup complete (registered listener)'),
      turncomplete: onTurnComplete,
      error: onError,
      reconnecting: () => {
        vcLog('warn', 'Reconnecting...');
        setCallState('connecting');
        setError('');
      },
      reconnected: () => {
        vcLog('ok', 'Reconnected!');
        setCallState('connected');
      },
      goaway: () => {},
      inputtranscript: onInputTranscript,
      outputtranscript: onOutputTranscript,
    });

    detachClientListenersRef.current = () => {
      if (assistantSpeechTimeoutRef.current) {
        clearTimeout(assistantSpeechTimeoutRef.current);
      }
      detach();
    };
  }, [decayRemoteVolume, performBargeIn, startTimer, stopRecorder, stopTimer, token]);

  /* ── Start call ── */
  const startCall = useCallback(async () => {
    if (!hasApiKey) {
      callDebug('voice-call', 'start-blocked-missing-api-key');
      setCallState('error');
      setError('Missing `VITE_GEMINI_API_KEY` in frontend .env');
      return;
    }
    if (isConnecting || isConnected) {
      callDebug('voice-call', 'start-skipped-active', { isConnecting, isConnected });
      return;
    }

    startCallDebugSession('voice-call', {
      liveModel,
      companionVoiceName,
      hasToken: Boolean(token),
    });
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
    callStartPromiseRef.current = null;

    if (token) {
      callDebug('voice-call', 'db-call-start-before');
      callStartPromiseRef.current = apiRequest('/api/calls/start', { method: 'POST', token, body: { callType: 'voice' } })
        .then((data) => {
          callDebug('voice-call', 'db-call-start-after', { callId: data.callId });
          callIdRef.current = data.callId;
          return data.callId;
        })
        .catch((error) => {
          callDebug('voice-call', 'db-call-start-failed', { error });
          return null;
        });
    }

    try {
      callDebug('voice-call', 'permission-before');
      const permissionStream = await requestMediaPermissions({ audio: true });
      callDebug('voice-call', 'permission-after', {
        audioTracks: permissionStream.getAudioTracks().length,
        videoTracks: permissionStream.getVideoTracks().length,
      });
      const [primaryAudioTrack, ...extraAudioTracks] = permissionStream.getAudioTracks();
      if (!primaryAudioTrack) {
        throw new Error('Microphone permission was granted, but no microphone track is available.');
      }
      extraAudioTracks.forEach((track) => track.stop());
      permissionStream.getVideoTracks().forEach((track) => track.stop());
      micPreflightStreamRef.current = new MediaStream([primaryAudioTrack]);
      callDebug('voice-call', 'mic-preflight-ready', {
        id: primaryAudioTrack.id,
        readyState: primaryAudioTrack.readyState,
        enabled: primaryAudioTrack.enabled,
        muted: primaryAudioTrack.muted,
        settings: typeof primaryAudioTrack.getSettings === 'function' ? primaryAudioTrack.getSettings() : {},
      });

      if (!streamerRef.current) {
        callDebug('voice-call', 'audio-output-before');
        const audioCtx = await audioContext({ id: 'companion-audio-out' });
        streamerRef.current = new AudioStreamer(audioCtx);
        callDebug('voice-call', 'audio-output-after', {
          state: audioCtx.state,
          sampleRate: audioCtx.sampleRate,
        });
      }
      callDebug('voice-call', 'streamer-resume-before');
      await streamerRef.current.resume();
      callDebug('voice-call', 'streamer-resume-after');

      clientRef.current = new GenAILiveClient({ apiKey });
      registerClientListeners(clientRef.current);
      callDebug('voice-call', 'client-ready');

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
        callDebug('voice-call', 'connect-primary-before', { liveModel });
        await clientRef.current.connect(liveModel, baseConfig);
        callDebug('voice-call', 'connect-primary-after', { liveModel });
      } catch (primaryError) {
        if (liveModel === DEFAULT_MODEL) throw primaryError;
        callDebug('voice-call', 'connect-primary-failed', { liveModel, error: primaryError });
        await clientRef.current.connect(DEFAULT_MODEL, baseConfig);
        callDebug('voice-call', 'connect-fallback-after', { fallbackModel: DEFAULT_MODEL });
      }
    } catch (connectError) {
      callDebug('voice-call', 'start-failed', { error: connectError });
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
    registerClientListeners,
    token,
    userName,
  ]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => !prev);
  }, []);


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

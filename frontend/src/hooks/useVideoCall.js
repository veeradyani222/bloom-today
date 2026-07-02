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
import { LOW_LATENCY_REPLY_INSTRUCTION } from '../lib/live-api/live-config.js';
import { callDebug, startCallDebugSession } from '../lib/live-api/call-debug.js';
import { audioContext } from '../lib/live-api/utils';
import { apiRequest } from '../lib/api';
import { requestMediaPermissions } from '../lib/mediaPermissions';

const DEFAULT_MODEL = 'gemini-2.5-flash-native-audio-latest';

/* ── Logger ── */
const LOG_PREFIX = '%c[VideoCall]';
const S = {
  info:  'color: #60a5fa; font-weight: bold',
  ok:    'color: #34d399; font-weight: bold',
  warn:  'color: #fbbf24; font-weight: bold',
  err:   'color: #f87171; font-weight: bold',
  event: 'color: #c084fc; font-weight: bold',
};
function vcLog(level, message, details) {
  callDebug('video-call', String(message), { level, details });
}
function vcWarn(message, details) {
  callDebug('video-call', String(message), { level: 'warn', details });
}
function vcErr(message, details) {
  callDebug('video-call', String(message), { level: 'error', details });
}

/* ── Constants ── */
const SPEECH_END_TIMEOUT_MS = 1200;
const VOLUME_DECAY_RATE = 0.85;
const BARGE_IN_VOLUME = 0.18;
const FRAME_CAPTURE_INTERVAL_MS = 4000; // Send a webcam frame every 4 seconds (keeps token burn low)
const CAPTURE_WIDTH = 320;
const CAPTURE_HEIGHT = 240;

function clampVolume(value) { return Math.max(0, Math.min(1, value)); }
function normalizeModelName(m) { return m ? m.replace(/^models\//, '') : DEFAULT_MODEL; }

function formatCameraStartupError(err) {
  if (!err) return 'Could not access your camera.';
  if (err.name === 'NotAllowedError') {
    return 'Camera permission was denied. Please allow camera access in your browser settings and retry.';
  }
  if (err.name === 'NotFoundError') {
    return 'No camera device was found on this phone.';
  }
  if (err.name === 'NotReadableError') {
    return 'Your camera is busy in another app. Close other camera apps and retry.';
  }
  if (err.name === 'OverconstrainedError') {
    return 'Camera could not start with the selected settings. Retrying with basic settings may help.';
  }
  return err.message || 'Could not access your camera.';
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

export function useVideoCall({
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
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [localVolume, setLocalVolume] = useState(0);
  const [remoteVolume, setRemoteVolume] = useState(0);
  const [callDuration, setCallDuration] = useState(0);
  const [turnState, setTurnState] = useState('idle');
  const [modelTurnActive, setModelTurnActive] = useState(false);

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
  const modelTurnActiveRef = useRef(false);
  const ignoreAudioRef = useRef(false);
  const detachClientListenersRef = useRef(null);

  /* ── Video specific refs ── */
  const videoStreamRef = useRef(null);
  const videoElRef = useRef(null); // Will be set by the page component
  const frameCaptureIntervalRef = useRef(null);
  const captureCanvasRef = useRef(null);

  // ── Transcript & analytics ──
  const callIdRef = useRef(null);
  const callStartPromiseRef = useRef(null);
  const transcriptRef = useRef([]);
  const currentUserTextRef = useRef('');
  const currentAITextRef = useRef('');
  const turnCountRef = useRef(0);
  const savedMsgCountRef = useRef(0);

  /* ── Callback ref for AI transcript (used by gesture mapper) ── */
  const onAITranscriptRef = useRef(null);

  /* ── AnalyserNode for lip-sync (state so it triggers re-render) ── */
  const [analyserNode, setAnalyserNode] = useState(null);

  /* ── Audio chunk callback for TalkingHead lip-sync ── */
  const onAudioChunkRef = useRef(null);

  /* ── Derived ── */
  const isConnected = callState === 'connected';
  const isConnecting = callState === 'connecting';
  const hasApiKey = Boolean(apiKey);
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

  /* ── Volume decay ── */
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

  /* ── System instruction (different for video!) ── */
  const buildSystemInstruction = useCallback(
    () =>
      [
        `You are ${companionName}, a caring postpartum companion for ${userName} on a live video call.`,
        'When the call begins, immediately open with a warm, brief greeting by name — do not wait for the user to speak first.',
        `Speak warmly like a close friend. ${LOW_LATENCY_REPLY_INSTRUCTION}`,
        'You can see the user through their camera. Actively notice and naturally weave in what you observe — their setting, what they are holding or doing, their expressions, their surroundings — to show you are truly present with them. Keep it conversational and warm, not clinical.',
        'On interruption: stop immediately and give ONE short reply to their latest words only — never resume what you were saying.',
        'Use cues like "mm-hmm" and "I hear you" to stay human.',
        companionInstructions ? `THERAPIST & CLINICAL GUIDANCE (follow this carefully — it reflects professional insight about ${userName}): ${companionInstructions}` : '',
        userMemories.length > 0
          ? `PERSONAL MEMORY (things you have learned about ${userName} from past conversations — hold onto these and bring them up naturally and subtly when the moment fits, never robotically list them): ${userMemories.join(' | ')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
    [companionName, companionInstructions, userMemories, userName],
  );

  /* ── Barge-in ── */
  const performBargeIn = useCallback((source = 'unknown') => {
    vcLog('event', `🛑 BARGE-IN (source: ${source})`);
    streamerRef.current?.stop();
    lastRemoteVolumeRef.current = 0;
    setRemoteVolume(0);
    isAssistantSpeakingRef.current = false;
    if (assistantSpeechTimeoutRef.current) {
      clearTimeout(assistantSpeechTimeoutRef.current);
      assistantSpeechTimeoutRef.current = null;
    }
    if (modelTurnActiveRef.current) {
      ignoreAudioRef.current = true;
    }
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
      callDebug('video-call', 'start-recorder-skipped', {
        hasClient: Boolean(client),
        isConnected,
        muted,
      });
      return;
    }
    if (recorderRef.current) {
      try { recorderRef.current.stop(); } catch { /* ignore */ }
    }
    vcLog('info', '🎤 Starting recorder');
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
      if (normalised > BARGE_IN_VOLUME) {
        setTurnState('user-speaking');
      } else {
        setTurnState((prev) => (prev === 'user-speaking' ? 'idle' : prev));
      }
    });

    const preflightMicStream = micPreflightStreamRef.current;
    micPreflightStreamRef.current = null;
    callDebug('video-call', 'recorder-start-before', { hasPreflightStream: Boolean(preflightMicStream) });
    await recorder.start(preflightMicStream ? { stream: preflightMicStream } : undefined);
    callDebug('video-call', 'recorder-start-after');
  }, [isConnected, muted]);

  /* ── Webcam management ── */
  const stopWebcam = useCallback(() => {
    if (frameCaptureIntervalRef.current) {
      clearInterval(frameCaptureIntervalRef.current);
      frameCaptureIntervalRef.current = null;
    }
    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach((t) => t.stop());
      videoStreamRef.current = null;
    }
  }, []);

  const attachStreamToVideo = useCallback(async (stream, attempt = 0) => {
    const videoEl = videoElRef.current;
    if (!videoEl) {
      callDebug('video-call', 'attach-video-waiting-for-element', { attempt });
      if (attempt < 10) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return attachStreamToVideo(stream, attempt + 1);
      }
      return;
    }

    callDebug('video-call', 'attach-video-before', {
      attempt,
      streamVideoTracks: stream?.getVideoTracks?.().length || 0,
      readyState: videoEl.readyState,
    });
    videoEl.srcObject = stream;
    videoEl.muted = true;
    videoEl.autoplay = true;
    videoEl.playsInline = true;
    videoEl.setAttribute('playsinline', 'true');
    videoEl.setAttribute('webkit-playsinline', 'true');

    try {
      await videoEl.play();
    } catch (err) {
      vcWarn('📹 Video element play() blocked:', err?.message || err);
    }
  }, []);

  const useExistingWebcamStream = useCallback(async (stream) => {
    const videoTracks = stream?.getVideoTracks() || [];
    callDebug('video-call', 'use-existing-webcam-stream', {
      videoTrackCount: videoTracks.length,
      tracks: videoTracks.map((track) => ({
        id: track.id,
        label: track.label,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState,
        settings: typeof track.getSettings === 'function' ? track.getSettings() : {},
      })),
    });
    if (!videoTracks.length) {
      throw new Error('Camera permission was granted, but no camera track is available.');
    }

    if (videoStreamRef.current && videoStreamRef.current !== stream) {
      videoStreamRef.current.getTracks().forEach((track) => track.stop());
    }

    videoTracks.forEach((track) => { track.enabled = videoEnabled; });
    videoStreamRef.current = stream;
    await attachStreamToVideo(stream);
    vcLog('ok', 'Camera started from preflight stream');
  }, [attachStreamToVideo, videoEnabled]);

  const startWebcam = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera is unavailable in this browser. Open the app on HTTPS (or localhost) and retry.');
    }

    const cameraConstraints = [
      {
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: { ideal: 'user' } },
        audio: false,
      },
      {
        video: { facingMode: { ideal: 'user' } },
        audio: false,
      },
      { video: true, audio: false },
    ];

    let lastError = null;
    for (const constraints of cameraConstraints) {
      try {
        callDebug('video-call', 'webcam-attempt-before', { constraints });
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        videoStreamRef.current = stream;
        await attachStreamToVideo(stream);
        callDebug('video-call', 'webcam-attempt-after', {
          videoTracks: stream.getVideoTracks().length,
        });
        vcLog('ok', '📹 Webcam started');
        return;
      } catch (err) {
        lastError = err;
        callDebug('video-call', 'webcam-attempt-failed', { constraints, error: err });
        vcWarn('📹 Webcam attempt failed:', err?.name || 'UnknownError', err?.message || err);
      }
    }

    if (!window.isSecureContext) {
      throw new Error('Camera requires a secure connection. Open this app over HTTPS on your phone.');
    }
    throw new Error(formatCameraStartupError(lastError));
  }, [attachStreamToVideo]);

  /* ── Frame capture → send to Gemini ── */
  const startFrameCapture = useCallback(() => {
    if (frameCaptureIntervalRef.current) clearInterval(frameCaptureIntervalRef.current);
    let skippedNotReadyCount = 0;
    let skippedModelActiveCount = 0;

    // Create a hidden canvas for capturing
    if (!captureCanvasRef.current) {
      captureCanvasRef.current = document.createElement('canvas');
      captureCanvasRef.current.width = CAPTURE_WIDTH;
      captureCanvasRef.current.height = CAPTURE_HEIGHT;
    }

    frameCaptureIntervalRef.current = setInterval(() => {
      const client = clientRef.current;
      const video = videoElRef.current;
      const canvas = captureCanvasRef.current;
      if (!client || !video || !canvas || video.readyState < 2) {
        skippedNotReadyCount += 1;
        if (skippedNotReadyCount <= 3 || skippedNotReadyCount % 10 === 0) {
          callDebug('video-call', 'frame-capture-skipped-not-ready', {
            count: skippedNotReadyCount,
            hasClient: Boolean(client),
            hasVideo: Boolean(video),
            hasCanvas: Boolean(canvas),
            readyState: video?.readyState,
          });
        }
        return;
      }
      if (!videoEnabled) {
        callDebug('video-call', 'frame-capture-skipped-video-disabled');
        return;
      }
      if (modelTurnActiveRef.current) return; // Skip frames while AI responds — saves ~60% of video tokens

      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, CAPTURE_WIDTH, CAPTURE_HEIGHT);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
      const base64 = dataUrl.split(',')[1];
      if (base64) {
        callDebug('video-call', 'frame-capture-send', {
          payloadChars: base64.length,
          readyState: video.readyState,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
        });
        client.sendVideoFrame(base64, 'image/jpeg');
      }
    }, FRAME_CAPTURE_INTERVAL_MS);
  }, [videoEnabled]);

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
    stopWebcam();
    streamerRef.current?.stop();
    clientRef.current?.disconnect();
    shouldSendGreetingRef.current = false;
    greetingSentRef.current = false;
    setRemoteVolume(0);
    setTurnState('idle');
    stopTimer();

    // Persist unsaved transcript messages and close the DB session
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
  }, [stopRecorder, stopTimer, stopWebcam, token]);

  const registerClientListeners = useCallback((client) => {
    if (!client) return;
    if (detachClientListenersRef.current) {
      detachClientListenersRef.current();
      detachClientListenersRef.current = null;
    }

    const onOpen = () => {
      vcLog('ok', 'ðŸ“¹ Video call CONNECTED');
      callDebug('video-call', 'client-open');
      setCallState('connected');
      startTimer();
      startFrameCapture();
    };

    const onClose = (event) => {
      vcWarn('ðŸ“¹ WebSocket CLOSED', event?.reason || '');
      callDebug('video-call', 'client-close', {
        reason: event?.reason || '',
        code: event?.code,
        wasClean: event?.wasClean,
        intentional: intentionalHangupRef.current,
      });
      stopRecorder();
      setRemoteVolume(0);
      stopTimer();
      if (intentionalHangupRef.current) {
        intentionalHangupRef.current = false;
        setCallState('idle');
        return;
      }
      setCallState('error');
      setError(event?.reason || 'Call connection dropped.');
    };

    const onAudio = (audioData) => {
      if (ignoreAudioRef.current) {
        callDebug('video-call', 'remote-audio-ignored', { bytes: audioData.byteLength });
        return;
      }
      callDebug('video-call', 'remote-audio', {
        bytes: audioData.byteLength,
        streamerReady: Boolean(streamerRef.current),
        lipSyncCallback: Boolean(onAudioChunkRef.current),
      });
      modelTurnActiveRef.current = true;
      isAssistantSpeakingRef.current = true;
      setTurnState('ai-speaking');
      setModelTurnActive((prev) => prev || true);
      if (assistantSpeechTimeoutRef.current) clearTimeout(assistantSpeechTimeoutRef.current);
      assistantSpeechTimeoutRef.current = window.setTimeout(() => {
        isAssistantSpeakingRef.current = false;
        setTurnState('idle');
        decayRemoteVolume();
      }, SPEECH_END_TIMEOUT_MS);
      const chunk = new Uint8Array(audioData);

      // AudioStreamer ALWAYS handles playback (guarantees audio works)
      streamerRef.current?.addPCM16(chunk);

      // Estimate volume BEFORE lip-sync callback (streamAudio detaches the ArrayBuffer)
      const vol = estimatePcmVolume(audioData);
      lastRemoteVolumeRef.current = vol;
      setRemoteVolume(vol);

      // Forward a COPY to lip-sync callback (streamAudio transfers/detaches the buffer)
      if (onAudioChunkRef.current) {
        try {
          const copy = audioData.slice(0);
          onAudioChunkRef.current(copy);
        } catch { /* lip-sync failure shouldn't break audio */ }
      }
    };

    const onInterrupted = () => {
      callDebug('video-call', 'client-interrupted');
      performBargeIn('server-interrupted');
      currentAITextRef.current = ''; // Discard partial AI transcript
    };

    const onTurnComplete = () => {
      callDebug('video-call', 'turn-complete', {
        currentUserTextChars: currentUserTextRef.current.length,
        currentAITextChars: currentAITextRef.current.length,
        ignoreAudio: ignoreAudioRef.current,
        modelTurnActive: modelTurnActiveRef.current,
      });
      ignoreAudioRef.current = false;
      modelTurnActiveRef.current = false;
      isAssistantSpeakingRef.current = false;
      decayRemoteVolume();
      setModelTurnActive(false);
      setTimeout(() => {
        setTurnState((cur) => (cur === 'ai-speaking' ? 'idle' : cur));
      }, 200);

      // Flush transcript for this turn
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

    const onInputTranscript = (text) => {
      callDebug('video-call', 'input-transcript', { chars: text?.length || 0 });
      if (text) currentUserTextRef.current += text + ' ';
    };

    const onOutputTranscript = (text) => {
      callDebug('video-call', 'output-transcript', { chars: text?.length || 0 });
      if (text) {
        currentAITextRef.current += text + ' ';
        // Forward to gesture mapper callback
        vcLog('event', `📝 outputtranscript: "${text}" | onAITranscriptRef set: ${!!onAITranscriptRef.current}`);
        if (onAITranscriptRef.current) onAITranscriptRef.current(text);
      }
    };

    const onSetupComplete = () => {
      vcLog('ok', 'ðŸŽ¯ Setup complete (effect listener)');
    };

    const onError = (event) => {
      vcErr('âš ï¸ ERROR', event?.message || event);
      setCallState('error');
      setError(event?.message || 'Video call error.');
      stopRecorder();
      stopTimer();
    };

    client.on('open', onOpen);
    client.on('close', onClose);
    client.on('audio', onAudio);
    client.on('interrupted', onInterrupted);
    client.on('setupcomplete', onSetupComplete);
    client.on('turncomplete', onTurnComplete);
    client.on('error', onError);
    client.on('inputtranscript', onInputTranscript);
    client.on('outputtranscript', onOutputTranscript);

    detachClientListenersRef.current = () => {
      if (assistantSpeechTimeoutRef.current) clearTimeout(assistantSpeechTimeoutRef.current);
      client.off('open', onOpen);
      client.off('close', onClose);
      client.off('audio', onAudio);
      client.off('interrupted', onInterrupted);
      client.off('setupcomplete', onSetupComplete);
      client.off('turncomplete', onTurnComplete);
      client.off('error', onError);
      client.off('inputtranscript', onInputTranscript);
      client.off('outputtranscript', onOutputTranscript);
    };
  }, [decayRemoteVolume, performBargeIn, startFrameCapture, startTimer, stopRecorder, stopTimer, token]);

  const endCall = useCallback(() => {
    const finalizePromise = cleanupCall(true);
    setError('');
    setCallState('idle');
    return finalizePromise;
  }, [cleanupCall]);

  /* ── Start call ── */
  const startCall = useCallback(async () => {
    if (!hasApiKey) {
      callDebug('video-call', 'start-blocked-missing-api-key');
      setCallState('error');
      setError('Missing `VITE_GEMINI_API_KEY` in frontend .env');
      return;
    }
    if (isConnecting || isConnected) {
      callDebug('video-call', 'start-skipped-active', { isConnecting, isConnected });
      return;
    }

    vcLog('ok', '📹 Starting video call...');
    startCallDebugSession('video-call', {
      liveModel,
      companionVoiceName,
      hasToken: Boolean(token),
    });
    setError('');
    setCallState('connecting');
    intentionalHangupRef.current = false;
    shouldSendGreetingRef.current = true;
    greetingSentRef.current = false;
    ignoreAudioRef.current = false;
    modelTurnActiveRef.current = false;

    // Reset transcript state for this call
    transcriptRef.current = [];
    currentUserTextRef.current = '';
    currentAITextRef.current = '';
    turnCountRef.current = 0;
    savedMsgCountRef.current = 0;
    callStartPromiseRef.current = null;

    if (token) {
      callDebug('video-call', 'db-call-start-before');
      callStartPromiseRef.current = apiRequest('/api/calls/start', { method: 'POST', token, body: { callType: 'video' } })
        .then((data) => {
          callDebug('video-call', 'db-call-start-after', { callId: data.callId });
          callIdRef.current = data.callId;
          return data.callId;
        })
        .catch((error) => {
          callDebug('video-call', 'db-call-start-failed', { error });
          return null;
        });
    }

    try {
      callDebug('video-call', 'permission-before');
      const permissionStream = await requestMediaPermissions({ audio: true, video: true });
      callDebug('video-call', 'permission-after', {
        audioTracks: permissionStream.getAudioTracks().length,
        videoTracks: permissionStream.getVideoTracks().length,
      });
      const [primaryVideoTrack, ...extraVideoTracks] = permissionStream.getVideoTracks();
      const [primaryAudioTrack, ...extraAudioTracks] = permissionStream.getAudioTracks();

      if (!primaryVideoTrack) {
        throw new Error('Camera permission was granted, but no camera track is available.');
      }
      if (!primaryAudioTrack) {
        throw new Error('Microphone permission was granted, but no microphone track is available.');
      }

      extraVideoTracks.forEach((track) => track.stop());
      extraAudioTracks.forEach((track) => track.stop());

      const cameraStream = new MediaStream([primaryVideoTrack]);
      await useExistingWebcamStream(cameraStream);
      micPreflightStreamRef.current = new MediaStream([primaryAudioTrack]);
      callDebug('video-call', 'media-preflight-ready', {
        audioTrack: {
          id: primaryAudioTrack.id,
          readyState: primaryAudioTrack.readyState,
          enabled: primaryAudioTrack.enabled,
          muted: primaryAudioTrack.muted,
          settings: typeof primaryAudioTrack.getSettings === 'function' ? primaryAudioTrack.getSettings() : {},
        },
        videoTrack: {
          id: primaryVideoTrack.id,
          readyState: primaryVideoTrack.readyState,
          enabled: primaryVideoTrack.enabled,
          muted: primaryVideoTrack.muted,
          settings: typeof primaryVideoTrack.getSettings === 'function' ? primaryVideoTrack.getSettings() : {},
        },
      });

      // Audio output setup
      if (!streamerRef.current) {
        callDebug('video-call', 'audio-output-before');
        const audioCtx = await audioContext({ id: 'companion-audio-out' });
        streamerRef.current = new AudioStreamer(audioCtx);
        callDebug('video-call', 'audio-output-after', {
          state: audioCtx.state,
          sampleRate: audioCtx.sampleRate,
        });

        // Create an AnalyserNode for TalkingHead lip-sync
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.3;
        streamerRef.current.gainNode.connect(analyser);
        setAnalyserNode(analyser);
      }
      callDebug('video-call', 'streamer-resume-before');
      await streamerRef.current.resume();
      callDebug('video-call', 'streamer-resume-after');

      clientRef.current = new GenAILiveClient({ apiKey });
      registerClientListeners(clientRef.current);
      callDebug('video-call', 'client-ready');

      // Register greeting handler BEFORE connect
      clientRef.current.once('setupcomplete', () => {
        vcLog('ok', '🎯 Setup complete (greeting handler)');
        if (shouldSendGreetingRef.current && !greetingSentRef.current) {
          vcLog('info', '👋 Sending greeting');
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
            prebuiltVoiceConfig: { voiceName: companionVoiceName },
          },
        },
        realtimeInputConfig: {
          activityHandling: ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
          automaticActivityDetection: {
            disabled: false,
            startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
            endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
            prefixPaddingMs: 120,
            silenceDurationMs: 800,
          },
        },
        systemInstruction: {
          parts: [{ text: buildSystemInstruction() }],
        },
      };

      try {
        callDebug('video-call', 'connect-primary-before', { liveModel });
        await clientRef.current.connect(liveModel, baseConfig);
        callDebug('video-call', 'connect-primary-after', { liveModel });
      } catch (primaryError) {
        if (liveModel === DEFAULT_MODEL) throw primaryError;
        callDebug('video-call', 'connect-primary-failed', { liveModel, error: primaryError });
        await clientRef.current.connect(DEFAULT_MODEL, baseConfig);
        callDebug('video-call', 'connect-fallback-after', { fallbackModel: DEFAULT_MODEL });
      }
    } catch (connectError) {
      callDebug('video-call', 'start-failed', { error: connectError });
      cleanupCall(false);
      setCallState('error');
      vcErr('📹 Video call FAILED', connectError?.message || connectError);
      setError(connectError?.message || 'Could not start video call.');
    }
  }, [
    apiKey, buildSystemInstruction, cleanupCall, companionVoiceName,
    hasApiKey, isConnected, isConnecting, liveModel, registerClientListeners, useExistingWebcamStream, userName, token,
  ]);

  const toggleMute = useCallback(() => setMuted((prev) => !prev), []);

  const toggleVideo = useCallback(async () => {
    setVideoEnabled((prev) => {
      const next = !prev;
      if (videoStreamRef.current) {
        videoStreamRef.current.getVideoTracks().forEach((t) => { t.enabled = next; });
      }
      return next;
    });

    if (!videoStreamRef.current) {
      try {
        await startWebcam();
        setError('');
      } catch (err) {
        setError(err?.message || 'Could not start camera.');
      }
    }
  }, [startWebcam]);


  /* ── Mic control ── */
  useEffect(() => {
    if (isConnected && !muted) {
      startRecorder().catch((err) => {
        setError(err?.message || 'Mic permission denied.');
        setCallState('error');
      });
      return;
    }
    stopRecorder();
  }, [isConnected, muted, startRecorder, stopRecorder]);

  /* ── Tab visibility ── */
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible' && streamerRef.current) {
        streamerRef.current.resume().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  /* ── Unmount cleanup ── */
  useEffect(
    () => () => {
      cleanupCall(false);
      streamerRef.current?.destroy?.();
    },
    [cleanupCall],
  );

  return {
    callState,
    error,
    muted,
    videoEnabled,
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
    toggleVideo,
    videoElRef,
    analyserNode,
    modelTurnActive,
    onAudioChunkRef,
    onAITranscriptRef,
  };
}

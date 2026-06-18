import React, { useEffect, useRef, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PhoneOff, Mic, MicOff, ChevronLeft, Video, ArrowLeft } from 'lucide-react';
import { useCompanionCall } from '../hooks/useCompanionCall';
import { isLikelySafariBrowser } from '../lib/mediaPermissions';
import { TalkingHead } from '../lib/talkinghead/modules/talkinghead.mjs';
import { talkingHeadAvatarPresets } from '../lib/talkinghead/avatarPresets';
import { createGestureMapper } from '../lib/gestureMapper';
import './VoiceCallPage.css';

/* ── Simple audio visualiser bars ── */
function AudioVisualiser({ volume, barCount = 5 }) {
  const bars = useMemo(() => {
    const result = [];
    for (let i = 0; i < barCount; i++) {
      // Create bars of varying heights based on volume
      const offset = Math.sin((i / barCount) * Math.PI);
      const height = Math.max(3, volume * 28 * offset);
      result.push(height);
    }
    return result;
  }, [volume, barCount]);

  return (
    <div className="call-visualiser">
      {bars.map((h, i) => (
        <div key={i} className="call-vis-bar" style={{ height: `${h}px` }} />
      ))}
    </div>
  );
}

export function VoiceCallPage({ token, session }) {
  const navigate = useNavigate();
  const hasStartedRef = useRef(false);
  const [requiresTapToStart] = useState(() => isLikelySafariBrowser());

  const userName = session?.user?.full_name || 'there';
  const firstName = userName.split(' ')[0];
  const companionName = session?.user?.companion_name || session?.user?.companionName || 'Luna';
  const companionVoiceName = session?.user?.companion_voice_name || session?.user?.companionVoiceName || 'Aoede';
  const therapistInstruction = session?.user?.companion?.therapist_instructions || '';
  const companionInstructions = [
    session?.user?.companion_instructions || session?.user?.companionInstructions || '',
    therapistInstruction ? `Therapist guidance: ${therapistInstruction}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const userMemories = session?.user?.memories || [];
  const companionAvatarId = session?.user?.companion_avatar_id || session?.user?.companionAvatarId || 'brunette';

  /* ── Avatar Rendering ── */
  const avatarContainerRef = useRef(null);
  const headRef = useRef(null);
  const [avatarLoaded, setAvatarLoaded] = useState(false);

  useEffect(() => {
    if (!avatarContainerRef.current) return undefined;

    const isAvatarSDK = companionAvatarId === 'avatarsdk';

    const head = new TalkingHead(avatarContainerRef.current, {
      cameraView: 'upper',
      cameraDistance: 0,
      cameraX: 0,
      cameraY: isAvatarSDK ? 0.3 : 0,
      modelPixelRatio: 1.5,
      avatarMood: 'neutral',
      lipsyncLang: 'en',
      lipsyncModules: ['en'], // Even if unused, required by init
    });

    headRef.current = head;

    return () => {
      headRef.current?.dispose();
      headRef.current = null;
    };
  }, [companionAvatarId]);

  useEffect(() => {
    const head = headRef.current;
    const avatar = talkingHeadAvatarPresets[companionAvatarId];
    if (!head || !avatar) return;

    let cancelled = false;

    async function load() {
      try {
        setAvatarLoaded(false);
        await head.showAvatar({ ...avatar, lipsyncLang: 'en' });
        if (!cancelled) {
          head.setMood('happy');
          setAvatarLoaded(true);
        }
      } catch {
        /* silently fail */
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [companionAvatarId]);

  const {
    callState,
    error: callError,
    muted,
    localVolume,
    remoteVolume,
    isConnecting,
    isConnected,
    hasApiKey,
    formattedDuration,
    turnState,
    startCall,
    endCall,
    toggleMute,
    onAITranscriptRef,
  } = useCompanionCall({
    userName: firstName,
    companionName,
    companionVoiceName,
    companionInstructions,
    userMemories,
    token,
  });

  // ── Gesture mapper: process AI transcript and trigger avatar gestures ──
  const gestureMapperRef = useRef(null);
  useEffect(() => {
    gestureMapperRef.current = createGestureMapper(headRef);
    onAITranscriptRef.current = (text) => {
      gestureMapperRef.current?.processText(text);
    };
    return () => {
      onAITranscriptRef.current = null;
      gestureMapperRef.current?.reset();
    };
  }, [onAITranscriptRef]);

  // Auto-start the call on mount
  useEffect(() => {
    if (requiresTapToStart) return;
    if (!hasStartedRef.current && hasApiKey) {
      hasStartedRef.current = true;
      startCall();
    }
  }, [hasApiKey, requiresTapToStart, startCall]);

  // Navigate on call error/drop — only when not intentionally ending
  const prevCallState = useRef(callState);
  useEffect(() => {
    // Only navigate on unexpected disconnects (error → idle transitions handled by error UI)
    if (
      prevCallState.current === 'connected' &&
      callState === 'error'
    ) {
      // Stay on page to show error/retry
    }
    prevCallState.current = callState;
  }, [callState, navigate]);

  function handleEndCall() {
    endCall();
    navigate('/dashboard', { replace: true });
  }

  function handleSwitchToVideo() {
    endCall();
    navigate('/video-call', { replace: true, state: { autostartVideo: true } });
  }

  function handleRetry() {
    hasStartedRef.current = false;
    startCall();
  }

  function handleStartCallTap() {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    startCall();
  }

  function handleGoBack() {
    endCall();
    navigate('/dashboard', { replace: true });
  }

  // Determine status text
  const statusText = isConnecting
    ? `Waiting for ${companionName} to join the call`
    : isConnected
      ? formattedDuration
      : callState === 'error'
        ? callError || 'Call disconnected'
        : '';

  // AI speaking state
  const isSpeaking = turnState === 'ai-speaking';

  // No API key screen
  if (!hasApiKey) {
    return (
      <div className="call-page">
        <div className="call-no-key">
          <PhoneOff size={40} style={{ opacity: 0.5 }} />
          <p>
            Voice calls require a <strong>VITE_GEMINI_API_KEY</strong> in your frontend <code>.env</code> file.
          </p>
          <button className="call-back-btn" onClick={handleGoBack}>
            <ArrowLeft size={16} style={{ marginRight: 6 }} />
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="call-page">
      {/* Top Header */}
      <div className="call-header">
        <button className="call-back-button" onClick={handleGoBack} aria-label="Go back">
          <ChevronLeft size={28} />
        </button>
        <div className="call-header-info">
          <h2 className="call-companion-name">{companionName}</h2>
          <p className="call-status-text">{statusText}</p>
        </div>
      </div>

      {/* Center content */}
      <div className="call-center">
        {/* Avatar container with always-on subtle shine, waves with volume */}
        <div 
          className="call-avatar-container"
          style={{
            boxShadow: `0 0 ${18 + remoteVolume * 40}px ${6 + remoteVolume * 18}px rgba(255, 255, 255, ${0.08 + remoteVolume * 0.25}), 0 0 ${40 + remoteVolume * 80}px ${12 + remoteVolume * 30}px rgba(255, 255, 255, ${0.04 + remoteVolume * 0.12})`,
            transition: 'box-shadow 0.15s ease-out'
          }}
        >
          {/* Loading spinner (only when connecting or avatar loading) */}
          {(isConnecting || !avatarLoaded) && <div className="call-spinner-ring" />}
          {/* Avatar view */}
          <div className="call-avatar-view" ref={avatarContainerRef} />
        </div>
        
        {/* Retry button for error states */}
        {callState === 'error' && (
          <button className="call-error-retry" onClick={handleRetry} style={{ marginTop: '20px' }}>
            Retry Call
          </button>
        )}

        {requiresTapToStart && !hasStartedRef.current && callState === 'idle' && (
          <button className="call-error-retry" onClick={handleStartCallTap} style={{ marginTop: '20px' }}>
            Tap to Start Call
          </button>
        )}
      </div>

      {/* Bottom controls */}
      <div className="call-controls-wrapper">
        <div className="call-controls-grid">
          {/* Video — switch to video call */}
          <button className="call-control-btn active" onClick={handleSwitchToVideo} aria-label="Switch to Video Call">
            <Video size={24} color="#1a1a1a" fill="#1a1a1a" />
          </button>

          {/* Mic Toggle */}
          <button
            className={`call-control-btn ${muted ? 'muted' : 'active'}`}
            onClick={toggleMute}
            disabled={!isConnected}
            aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {muted ? <MicOff size={24} color="#fff" /> : <Mic size={24} color="#1a1a1a" fill="#1a1a1a" />}
          </button>
        </div>

        {/* End call (Centered below) */}
        <button
          className="call-control-btn end-call"
          onClick={handleEndCall}
          aria-label="End call"
        >
          <PhoneOff size={24} color="#fff" />
        </button>
      </div>
    </div>
  );
}

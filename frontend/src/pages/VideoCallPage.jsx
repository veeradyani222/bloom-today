import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PhoneOff, Mic, MicOff, ChevronLeft, Video, VideoOff } from 'lucide-react';
import { useVideoCall } from '../hooks/useVideoCall';
import { isLikelySafariBrowser } from '../lib/mediaPermissions';
import { TalkingHead } from '../lib/talkinghead/modules/talkinghead.mjs';
import { talkingHeadAvatarPresets } from '../lib/talkinghead/avatarPresets';
import { createGestureMapper } from '../lib/gestureMapper';
import companionBg from '../assets/companion_bg.png';
import './VideoCallPage.css';

export function VideoCallPage({ token, session }) {
  const navigate = useNavigate();
  const location = useLocation();
  const autoStartRequested = Boolean(location.state?.autostartVideo);
  const [requiresTapToStart] = useState(() => isLikelySafariBrowser());

  const companionName = session?.user?.companion_name || session?.user?.companionName || 'Companion';
  const companionVoiceName = session?.user?.companion_voice || session?.user?.companionVoice || 'Aoede';
  const therapistInstruction = session?.user?.companion?.therapist_instructions || '';
  const companionInstructions = [
    session?.user?.companion_instructions || session?.user?.companionInstructions || '',
    therapistInstruction ? `Therapist guidance: ${therapistInstruction}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const userMemories = session?.user?.memories || [];
  const companionAvatarId = session?.user?.companion_avatar_id || session?.user?.companionAvatarId || 'brunette';
  const userName = session?.user?.full_name?.split(' ')[0] || session?.user?.name || 'there';

  /* ── Hook ── */
  const {
    callState, error: callError, muted, videoEnabled,
    remoteVolume, isConnecting, isConnected,
    hasApiKey, formattedDuration, turnState, modelTurnActive,
    startCall, endCall, toggleMute, toggleVideo,
    videoElRef,
    onAITranscriptRef,
  } = useVideoCall({
    userName,
    companionName,
    companionVoiceName,
    companionInstructions,
    userMemories,
    token,
  });

  /* ── 3D Avatar ── */
  const avatarContainerRef = useRef(null);
  const headRef = useRef(null);
  const [avatarLoaded, setAvatarLoaded] = useState(false);
  const lipSyncStartedRef = useRef(false);

  // Create TalkingHead instance
  useEffect(() => {
    if (!avatarContainerRef.current) return undefined;
    const isAvatarSDK = companionAvatarId === 'avatarsdk';
    const isMobileViewport = window.matchMedia('(max-width: 767px)').matches;
    const head = new TalkingHead(avatarContainerRef.current, {
      cameraView: 'upper',
      // Keep companion less zoomed so more of the character is visible.
      cameraDistance: isMobileViewport ? 0.55 : 0.12,
      cameraX: 0,
      cameraY: isAvatarSDK
        ? (isMobileViewport ? 0.34 : 0.24)
        : (isMobileViewport ? 0.06 : -0.02),
      modelPixelRatio: 1.5,
      avatarMood: 'neutral',
      lipsyncLang: 'en',
      lipsyncModules: ['en'],
    });
    headRef.current = head;
    return () => {
      headRef.current?.dispose();
      headRef.current = null;
      lipSyncStartedRef.current = false;
    };
  }, [companionAvatarId]);

  // Load avatar
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
      } catch (e) {
      }
    }
    load();
    return () => { cancelled = true; };
  }, [companionAvatarId]);

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

  const isSpeaking = turnState === 'ai-speaking';

  // Procedural lip-sync: directly push viseme animations into TalkingHead's animQueue.
  // Use modelTurnActive (true from first chunk until turncomplete) instead of
  // isSpeaking (which dies when chunks stop arriving, before audio finishes playing).
  const isLipSyncing = modelTurnActive;
  const proceduralSpeakingRef = useRef(false);
  const proceduralIntervalRef = useRef(null);
  const stopDebounceRef = useRef(null);

  useEffect(() => {
    const head = headRef.current;
    if (!head || !avatarLoaded) return;

    const visemes = ['aa', 'O', 'E', 'I', 'U', 'PP', 'FF', 'TH', 'DD', 'kk', 'CH', 'SS', 'nn', 'RR'];

    const pushVisemes = () => {
      const h = headRef.current;
      if (!h || !h.animQueue) return;

      // Clear old visemes before pushing new ones to prevent queue flooding
      h.animQueue = h.animQueue.filter(x => x.template?.name !== 'viseme');

      // Push ~1 second worth of viseme animations starting from now
      const now = h.animClock || 0;
      for (let i = 0; i < 5; i++) {
        const v = visemes[Math.floor(Math.random() * visemes.length)];
        const t = now + i * 200;
        const d = 180;
        h.animQueue.push({
          template: { name: 'viseme' },
          ts: [t - d / 3, t + d / 2, t + d + d / 2],
          vs: {
            ['viseme_' + v]: [null, 0.5 + Math.random() * 0.25, 0]
          }
        });
      }
    };

    if (isLipSyncing) {
      // Cancel pending stop
      if (stopDebounceRef.current) {
        clearTimeout(stopDebounceRef.current);
        stopDebounceRef.current = null;
      }

      if (!proceduralSpeakingRef.current) {
        proceduralSpeakingRef.current = true;
        pushVisemes(); // Start immediately
        proceduralIntervalRef.current = setInterval(pushVisemes, 1800); // Refresh every 1.8s
      }
    } else if (!isLipSyncing && proceduralSpeakingRef.current) {
      // Debounce stop by 1s
      if (!stopDebounceRef.current) {
        stopDebounceRef.current = setTimeout(() => {
          stopDebounceRef.current = null;
          proceduralSpeakingRef.current = false;
          if (proceduralIntervalRef.current) {
            clearInterval(proceduralIntervalRef.current);
            proceduralIntervalRef.current = null;
          }
          // Clear any remaining viseme animations
          if (headRef.current?.animQueue) {
            headRef.current.animQueue = headRef.current.animQueue.filter(
              x => x.template.name !== 'viseme'
            );
          }
          try { headRef.current?.resetLips?.(); } catch { /* ignore */ }
          // Fire deferred gestures now that lip sync is done
          gestureMapperRef.current?.flushAfterSpeaking();
        }, 1000);
      }
    }

    return () => {
      if (stopDebounceRef.current) {
        clearTimeout(stopDebounceRef.current);
        stopDebounceRef.current = null;
      }
    };
  }, [isLipSyncing, avatarLoaded]);

  /* ── Auto-start call ── */
  const startedRef = useRef(false);
  useEffect(() => {
    if (requiresTapToStart) return;
    if (!startedRef.current && hasApiKey && (autoStartRequested || !requiresTapToStart)) {
      startedRef.current = true;
      startCall();
    }
  }, [autoStartRequested, hasApiKey, requiresTapToStart, startCall]);


  const statusText = isConnecting
    ? 'Waiting for you to join the call'
    : isConnected
      ? formattedDuration
      : callState === 'error'
        ? callError || 'Call disconnected'
        : '';

  function handleEndCall() {
    endCall();
    navigate('/dashboard', { replace: true });
  }

  function handleGoBack() {
    endCall();
    navigate('/dashboard', { replace: true });
  }

  function handleRetry() {
    startedRef.current = false;
    startCall();
  }

  function handleStartCallTap() {
    if (startedRef.current) return;
    startedRef.current = true;
    startCall();
  }

  /* ── No API key state ── */
  if (!hasApiKey) {
    return (
      <div className="vcall-page">
        <div className="vcall-no-key">
          <p>Please add your Gemini API key to the <code>.env</code> file to enable video calls.</p>
          <button className="vcall-back-btn" onClick={() => navigate('/dashboard', { replace: true })}>
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="vcall-page">
      {/* Top Header */}
      <div className="vcall-header">
        <button className="vcall-back-button" onClick={handleGoBack} aria-label="Go back">
          <ChevronLeft size={28} />
        </button>
        <div className="vcall-header-info">
          <h2 className="vcall-companion-name">{companionName}</h2>
          <p className="vcall-status-text">{statusText}</p>
        </div>
      </div>

      {/* Main content — side-by-side on desktop, stacked on mobile */}
      <div className="vcall-main-content">
        {/* Companion panel (left on desktop / top on mobile) */}
        <div className="vcall-companion-panel" style={{ backgroundImage: `url(${companionBg})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
          <div
            className="vcall-avatar-container"
            style={{
              boxShadow: `0 0 ${18 + remoteVolume * 40}px ${6 + remoteVolume * 18}px rgba(255, 255, 255, ${0.08 + remoteVolume * 0.25}), 0 0 ${40 + remoteVolume * 80}px ${12 + remoteVolume * 30}px rgba(255, 255, 255, ${0.04 + remoteVolume * 0.12})`,
              transition: 'box-shadow 0.15s ease-out'
            }}
          >
            <div className="vcall-avatar-view" ref={avatarContainerRef} />
          </div>
          {callState === 'error' && (
            <button className="vcall-error-retry" onClick={handleRetry} style={{ marginTop: '16px' }}>
              Retry Call
            </button>
          )}
          {requiresTapToStart && !startedRef.current && callState === 'idle' && (
            <button className="vcall-start-cta" onClick={handleStartCallTap}>
              Start Video Call
            </button>
          )}
        </div>

        {/* User camera panel (right on desktop / bottom on mobile) */}
        <div className={`vcall-user-panel ${videoEnabled ? '' : 'video-off'}`}>
          <video
            ref={videoElRef}
            autoPlay
            playsInline
            muted
            className="vcall-user-video"
          />
          {!videoEnabled && (
            <div className="vcall-user-off">
              <VideoOff size={36} color="rgba(255,255,255,0.4)" />
              <span>Camera off</span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom controls — 3-button row: [Video] [EndCall] [Mic] */}
      <div className="vcall-controls-wrapper">
        <div className="vcall-controls-row">
          {/* Video toggle */}
          <button
            className={`vcall-control-btn ${videoEnabled ? 'active' : ''}`}
            onClick={toggleVideo}
            aria-label={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
          >
            {videoEnabled
              ? <Video size={24} color="#1a1a1a" />
              : <VideoOff size={24} color="#1a1a1a" />
            }
          </button>

          {/* End call */}
          <button
            className="vcall-control-btn end-call"
            onClick={handleEndCall}
            aria-label="End call"
          >
            <PhoneOff size={24} color="#fff" />
          </button>

          {/* Mic toggle */}
          <button
            className={`vcall-control-btn ${muted ? 'muted' : 'active'}`}
            onClick={toggleMute}
            disabled={!isConnected}
            aria-label={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <MicOff size={24} color="#fff" /> : <Mic size={24} color="#1a1a1a" fill="#1a1a1a" />}
          </button>
        </div>
      </div>
    </div>
  );
}

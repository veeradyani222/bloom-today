import { useEffect, useRef, useState } from 'react';
import { TalkingHead } from '../lib/talkinghead/modules/talkinghead.mjs';
import { talkingHeadAvatarPresets } from '../lib/talkinghead/avatarPresets';
import { API_BASE_URL } from '../lib/api';

function splitTextIntoWordTimings(text, durationMs) {
  const words = text
    .trim()
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

  if (!words.length) {
    return { words: [], wtimes: [], wdurations: [] };
  }

  const totalChars = words.reduce((sum, word) => sum + word.length, 0);
  let currentTime = 0;

  const wtimes = [];
  const wdurations = [];

  words.forEach((word) => {
    const ratio = totalChars ? word.length / totalChars : 1 / words.length;
    const duration = Math.max(120, Math.round(durationMs * ratio));
    wtimes.push(currentTime);
    wdurations.push(duration);
    currentTime += duration;
  });

  return { words, wtimes, wdurations };
}

export function TalkingHeadPreview({
  token,
  selectedAvatarId,
  selectedVoiceName,
  previewText,
  previewNonce,
  onAvatarLoaded,
  onPreviewStart,
  onPreviewEnd,
  onBusyChange,
}) {
  const containerRef = useRef(null);
  const headRef = useRef(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    const isAvatarSDK = selectedAvatarId === 'avatarsdk';

    const head = new TalkingHead(containerRef.current, {
      cameraView: 'upper',
      cameraDistance: 0,
      cameraX: 0,
      cameraY: isAvatarSDK ? 0.3 : 0,
      modelPixelRatio: 1,
      avatarMood: 'neutral',
      lipsyncLang: 'en',
      lipsyncModules: ['en'],
    });

    headRef.current = head;

    return () => {
      headRef.current?.dispose();
      headRef.current = null;
    };
  }, [selectedAvatarId]);

  useEffect(() => {
    const head = headRef.current;
    const avatar = talkingHeadAvatarPresets[selectedAvatarId];

    if (!head || !avatar) {
      return;
    }

    let cancelled = false;

    async function loadAvatar() {
      try {
        await head.showAvatar({
          ...avatar,
          lipsyncLang: 'en',
        });
        if (cancelled) {
          return;
        }
        head.setMood('happy');
        onAvatarLoaded?.(avatar);
      } catch {
        /* silently fail */
      }
    }

    loadAvatar();

    return () => {
      cancelled = true;
    };
  }, [selectedAvatarId, onAvatarLoaded]);

  useEffect(() => {
    const head = headRef.current;
    if (!head || !previewNonce || !selectedVoiceName || !previewText) {
      return;
    }

    let cancelled = false;

    async function runPreview() {
      try {
        setIsBusy(true);
        onBusyChange?.(true);
        onPreviewStart?.();

        head.stopAnimation();
        head.stopGesture();
        head.stopSpeaking?.();
        head.setMood('happy');
        head.playGesture('handup', 2.6);

        const response = await fetch(`${API_BASE_URL}/api/gemini/voice-preview`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            text: previewText,
            voiceName: selectedVoiceName,
          }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || 'Voice preview failed.');
        }

        const wavBuffer = await response.arrayBuffer();
        if (cancelled) {
          return;
        }

        const decoded = await head.audioCtx.decodeAudioData(wavBuffer.slice(0));
        if (cancelled) {
          return;
        }

        const timing = splitTextIntoWordTimings(previewText, decoded.duration * 1000);
        await head.speakAudio(
          {
            audio: decoded,
            words: timing.words,
            wtimes: timing.wtimes,
            wdurations: timing.wdurations,
          },
          { lipsyncLang: 'en' },
        );

      } catch {
        /* silently fail */
      } finally {
        if (!cancelled) {
          setIsBusy(false);
          onBusyChange?.(false);
          onPreviewEnd?.();
        }
      }
    }

    runPreview();

    return () => {
      cancelled = true;
    };
  }, [previewNonce, previewText, selectedVoiceName, token, onPreviewStart, onPreviewEnd, onBusyChange]);

  return (
    <div className="onb-avatar-preview-shell">
      <div ref={containerRef} className="onb-avatar-preview-stage" />
    </div>
  );
}

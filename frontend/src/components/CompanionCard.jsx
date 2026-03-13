import { useEffect, useRef, useState } from 'react';
import { TalkingHead } from '../lib/talkinghead/modules/talkinghead.mjs';
import { talkingHeadAvatarPresets } from '../lib/talkinghead/avatarPresets';

export function CompanionCard({ avatarId, selected, onSelect }) {
  const containerRef = useRef(null);
  const headRef = useRef(null);
  const [loaded, setLoaded] = useState(false);

  /* ── Create TalkingHead instance ── */
  useEffect(() => {
    if (!containerRef.current) return undefined;

    const isAvatarSDK = avatarId === 'avatarsdk';

    const head = new TalkingHead(containerRef.current, {
      cameraView: 'upper',
      cameraDistance: 0,
      cameraX: 0,
      cameraY: isAvatarSDK ? 0.3 : 0,
      modelPixelRatio: 1.5,
      avatarMood: 'neutral',
      lipsyncLang: 'en',
      lipsyncModules: ['en'],
    });

    headRef.current = head;

    return () => {
      headRef.current?.dispose();
      headRef.current = null;
    };
  }, [avatarId]);

  /* ── Load avatar model ── */
  useEffect(() => {
    const head = headRef.current;
    const avatar = talkingHeadAvatarPresets[avatarId];
    if (!head || !avatar) return;

    let cancelled = false;

    async function load() {
      try {
        setLoaded(false);
        await head.showAvatar({ ...avatar, lipsyncLang: 'en' });
        if (!cancelled) {
          head.setMood('happy');
          setLoaded(true);
        }
      } catch {
        /* silently fail */
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [avatarId]);

  return (
    <div
      className={`companion-card ${selected ? 'companion-card--selected' : ''}`}
      onClick={() => onSelect(avatarId)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect(avatarId);
      }}
    >
      {selected && <div className="companion-card__check">✓</div>}

      <div ref={containerRef} className="companion-card__canvas">
        {!loaded && (
          <div className="companion-card__loader">
            <div className="companion-card__spinner" />
          </div>
        )}
      </div>
    </div>
  );
}

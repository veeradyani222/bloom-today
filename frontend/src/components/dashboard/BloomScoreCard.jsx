import React, { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { computeBloomScoreReason } from '../../pages/DashboardPage';

export function BloomScoreCard({ score, scores, activity, daySeries }) {
  const [displayScore, setDisplayScore] = useState(0);
  const [showDetails, setShowDetails] = useState(false);
  const percentage = Math.max(0, Math.min(100, score));
  const circumference = 2 * Math.PI * 52;
  const strokeOffset = circumference - (percentage / 100) * circumference;
  const reason = computeBloomScoreReason(scores, activity, daySeries);

  useEffect(() => {
    let frameId = 0;
    const startedAt = performance.now();
    const duration = 2200;

    const tick = (timestamp) => {
      const progress = Math.min((timestamp - startedAt) / duration, 1);
      setDisplayScore(Math.round(progress * score));
      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick);
      }
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [score]);

  return (
    <>
      <button type="button" className="overview-bloom-card" onClick={() => setShowDetails(true)}>
        <div className="overview-bloom-head">
          <span className="overview-bloom-kicker"><Sparkles size={14} /> Bloom score</span>
          <p>Tap to see what this score means.</p>
        </div>
        <div className="overview-bloom-meter">
          <svg width="136" height="136" viewBox="0 0 136 136" className="overview-bloom-ring">
            <circle cx="68" cy="68" r="52" className="overview-bloom-track" />
            <circle
              cx="68"
              cy="68"
              r="52"
              className="overview-bloom-progress"
              style={{ strokeDasharray: circumference, strokeDashoffset: strokeOffset }}
            />
          </svg>
          <div className="overview-bloom-value">
            <strong>{displayScore}</strong>
          </div>
          <div className="overview-bloom-shine" />
        </div>
      </button>
      {showDetails ? (
        <div className="dash-popup-overlay" onClick={() => setShowDetails(false)}>
          <div className="dash-popup-card" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="dash-popup-close" onClick={() => setShowDetails(false)}>x</button>
            <Sparkles size={36} className="dash-popup-hero-icon" />
            <h2>Your Bloom Score</h2>
            <div className="dash-bloom-score-big"><strong>{score}</strong></div>
            <p>This score reflects how consistently you show up, ask for help, and lean into support.</p>
            <div style={{ marginTop: '16px', background: 'var(--pink-light)', padding: '12px', borderRadius: '12px', textAlign: 'left' }}>
              <strong style={{ display: 'block', fontSize: '0.85rem', color: 'var(--pink)', marginBottom: '4px' }}>What this score means</strong>
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--ink)' }}>{reason}</p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

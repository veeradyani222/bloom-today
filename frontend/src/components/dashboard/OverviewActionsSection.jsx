import React, { useState } from 'react';
import { Phone, Target, Video, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

function CallChoiceModal({ companionName, onClose, onSelect }) {
  return (
    <div className="dash-popup-overlay" onClick={onClose}>
      <div className="dash-popup-card sec-call-modal" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="dash-popup-close" onClick={onClose} aria-label="Close call options">
          <X size={20} />
        </button>
        <Phone size={36} className="dash-popup-hero-icon" />
        <h2>{companionName} is waiting for you</h2>
        <p>Your companion is ready right now. Choose how you want to connect.</p>
        <div className="sec-call-modal-actions">
          <button type="button" className="sec-call-modal-btn primary" onClick={() => onSelect('/video-call')}>
            <Video size={20} />
            <span>Video Call</span>
          </button>
          <button type="button" className="sec-call-modal-btn secondary" onClick={() => onSelect('/call')}>
            <Phone size={20} />
            <span>Voice Call</span>
          </button>
        </div>
      </div>
    </div>
  );
}

const ACTIONS = [
  {
    label: 'Talk Now',
    caption: 'Start a voice or video session with your companion.',
    icon: Phone,
    className: 'is-talk',
  },
  {
    label: 'See Trends',
    caption: 'Open your charts, patterns, and weekly signal shifts.',
    icon: Target,
    className: 'is-trends',
    path: '/browse/trends',
  },
];

export function OverviewActionsSection({ companionName = 'Sage', illustration }) {
  const navigate = useNavigate();
  const [showCallMenu, setShowCallMenu] = useState(false);

  function handleCardClick(path) {
    if (path) {
      navigate(path);
      return;
    }

    setShowCallMenu(true);
  }

  function handleCallSelect(path) {
    setShowCallMenu(false);
    if (path === '/video-call') {
      navigate(path, { state: { autostartVideo: true } });
      return;
    }
    navigate(path);
  }

  return (
    <>
      <section className="sec-actions">
        <div className="sec-actions-head">
          <h3>Jump Back In</h3>
          {illustration ? <img src={illustration} alt="" className="sec-actions-illustration" /> : null}
        </div>
        <div className="sec-actions-grid">
          {ACTIONS.map(({ label, caption, icon: Icon, className, path }) => (
            <button
              key={label}
              type="button"
              className={`sec-action-card ${className}`}
              onClick={() => handleCardClick(path)}
            >
              <div className="sec-action-icon"><Icon size={28} /></div>
              <strong>{label}</strong>
              <span>{caption}</span>
            </button>
          ))}
        </div>
      </section>

      {showCallMenu ? (
        <CallChoiceModal
          companionName={companionName}
          onClose={() => setShowCallMenu(false)}
          onSelect={handleCallSelect}
        />
      ) : null}
    </>
  );
}

import React from 'react';
import { ChevronRight, Sparkles, User, Users } from 'lucide-react';

function YouLinkCard({ icon: Icon, title, description, onClick }) {
  return (
    <button type="button" className="you-link-card" onClick={onClick}>
      <div className="you-link-main">
        <div className="you-link-icon"><Icon size={18} /></div>
        <div>
          <strong>{title}</strong>
          <p>{description}</p>
        </div>
      </div>
      <ChevronRight size={18} />
    </button>
  );
}

export function YouHeroSection({ userName, email }) {
  return (
    <section className="you-hero">
      <div className="you-avatar">{userName.slice(0, 1)}</div>
      <div>
        <h1>{userName}</h1>
        <p>{email}</p>
      </div>
    </section>
  );
}

export function YouSummarySection({ companionName, role, profileName, profileEmail }) {
  if (role !== 'mom') {
    return (
      <section className="you-summary">
        <div className="you-summary-card">
          <span>{role === 'therapist' ? 'Therapist' : 'Trusted person'}</span>
          <strong>{profileName || 'Name not set'}</strong>
        </div>
        <div className="you-summary-card">
          <span>Email</span>
          <strong>{profileEmail || 'No email available'}</strong>
        </div>
        <div className="you-summary-card">
          <span>Role</span>
          <strong>{role}</strong>
        </div>
      </section>
    );
  }

  return (
    <section className="you-summary">
      <div className="you-summary-card">
        <span>Companion</span>
        <strong>{companionName}</strong>
      </div>
      <div className="you-summary-card">
        <span>Role</span>
        <strong>{role}</strong>
      </div>
    </section>
  );
}

export function YouLinksSection({ navigate, onSupportRoles, role }) {
  return (
    <section className="you-links">
      {role === 'mom' ? <YouLinkCard icon={User} title="Profile" description="View your account details and basic info." onClick={() => navigate('/profile')} /> : null}
      {role === 'mom' ? <YouLinkCard icon={Sparkles} title="Companion setup" description="Update how your companion looks, sounds, and supports you." onClick={() => navigate('/you/companion')} /> : null}
      <YouLinkCard icon={Users} title={role === 'mom' ? 'Support roles' : 'Switch account'} description={role === 'mom' ? 'Switch account mode or review support access.' : 'Log out and sign in as another linked support role.'} onClick={onSupportRoles} />
    </section>
  );
}

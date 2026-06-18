import React, { useEffect, useState } from 'react';
import welcomeIllustration from '../../assets/welcomelittleone.svg';
import settingUpIllustration from '../../assets/settingthingsup.svg';
import thankYouIllustration from '../../assets/thankuforsharing.svg';

const LOADING_ILLUSTRATIONS = [
  welcomeIllustration,
  settingUpIllustration,
  thankYouIllustration,
];

export function CenteredDashboardLoader() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % LOADING_ILLUSTRATIONS.length);
    }, 950);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <section className="dash-screen-loader" aria-label="Loading content" aria-live="polite">
      <div className="dash-screen-loader-stage">
        {LOADING_ILLUSTRATIONS.map((illustration, index) => (
          <img
            key={illustration}
            src={illustration}
            alt=""
            aria-hidden="true"
            className={`dash-screen-loader-illustration ${index === activeIndex ? 'is-active' : ''}`}
          />
        ))}
      </div>
    </section>
  );
}

export function OverviewEmptyState({ illustration }) {
  return (
    <section className="dash-empty-state">
      <img src={illustration} alt="" className="dash-empty-illustration" />
      <h2>No reflections yet</h2>
      <p>Finish your first voice or video call and Bloom will start painting the shape of your day.</p>
    </section>
  );
}

export function OverviewPendingAnalysisState({ illustration, activity }) {
  const totalCalls = activity?.totalCalls || 0;
  const callsToday = activity?.callsToday || 0;
  const callsThisWeek = activity?.callsThisWeek || 0;

  return (
    <section className="dash-empty-state">
      <img src={illustration} alt="" className="dash-empty-illustration" />
      <h2>{totalCalls === 1 ? 'Your first call is saved' : 'Your calls are saved'}</h2>
      <p>Bloom is still preparing reflections from your conversation. Your activity is already counted.</p>
      <div className="sec-stats-grid">
        <div className="sec-stat-card peach">
          <span>Today</span>
          <strong>{callsToday}</strong>
          <p>calls so far</p>
        </div>
        <div className="sec-stat-card sage">
          <span>This week</span>
          <strong>{callsThisWeek}</strong>
          <p>calls joined</p>
        </div>
        <div className="sec-stat-card mist">
          <span>Total</span>
          <strong>{totalCalls}</strong>
          <p>moments shared</p>
        </div>
      </div>
    </section>
  );
}

export function OverviewLoading() {
  return <CenteredDashboardLoader />;
}

export function OverviewError({ error }) {
  return (
    <section className="dash-empty-state">
      <h2>We couldn't load the dashboard yet</h2>
      <p>{error}</p>
    </section>
  );
}

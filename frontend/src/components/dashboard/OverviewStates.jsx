import React, { useEffect, useState } from 'react';
import { DASHBOARD_LOADING_STEPS } from './dashboardLoadingSteps';

export function CenteredDashboardLoader() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % DASHBOARD_LOADING_STEPS.length);
    }, 950);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <section className="dash-screen-loader" aria-label="Loading content" aria-live="polite">
      <div className="dash-screen-loader-stage">
        {DASHBOARD_LOADING_STEPS.map((step, index) => (
          <img
            key={step.illustration}
            src={step.illustration}
            alt=""
            aria-hidden="true"
            className={`dash-screen-loader-illustration ${index === activeIndex ? 'is-active' : ''}`}
          />
        ))}
      </div>
      <p className="dash-screen-loader-text">{DASHBOARD_LOADING_STEPS[activeIndex]?.text}</p>
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

export function OverviewLoading() {
  return <CenteredDashboardLoader />;
}

export function OverviewProcessingState({ illustration }) {
  return (
    <section className="dash-empty-state">
      <img src={illustration} alt="" className="dash-empty-illustration" />
      <h2>Your reflection is still settling in</h2>
      <p>We saved your call, but the dashboard needs another moment. Try refreshing in a bit, or start another check-in when you are ready.</p>
    </section>
  );
}

export function OverviewError({ error }) {
  return (
    <section className="dash-empty-state">
      <h2>We couldn't load the dashboard yet</h2>
      <p>{error}</p>
    </section>
  );
}

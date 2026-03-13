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

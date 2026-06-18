import React from 'react';
import { toMomVoice } from '../../pages/DashboardPage';

export function OverviewHeroSection({ data, firstName, illustration }) {
  return (
    <section className="sec-hero">
      <div className="sec-hero-text">
        <h1>Hi {firstName}, here's how today feels.</h1>
        <p>{toMomVoice(data?.narratives?.day?.summary || data?.current?.conversationSummary, firstName)}</p>
      </div>
      <div className="sec-hero-art"><img src={illustration} alt="" /></div>
    </section>
  );
}

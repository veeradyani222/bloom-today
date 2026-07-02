import React from 'react';
import { toMomVoice } from '../../pages/DashboardPage';
import { SkeletonLines } from './OverviewStates';

export function OverviewHeroSection({ data, firstName, illustration, pending = false }) {
  return (
    <section className="sec-hero">
      <div className="sec-hero-text">
        <h1>Hi {firstName}, here's how today feels.</h1>
        {pending ? (
          <SkeletonLines lines={2} className="dash-skeleton-lines-on-dark" />
        ) : (
          <p>{toMomVoice(data?.narratives?.day?.summary || data?.current?.conversationSummary, firstName)}</p>
        )}
      </div>
      <div className="sec-hero-art"><img src={illustration} alt="" /></div>
    </section>
  );
}

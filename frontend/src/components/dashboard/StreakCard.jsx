import React from 'react';

export function StreakCard({ streak }) {
  return (
    <article className="overview-streak-card">
      <div className="overview-streak-fire" aria-hidden="true">{'\uD83D\uDD25'}</div>
      <strong>{streak}</strong>
      <span>day streak</span>
    </article>
  );
}

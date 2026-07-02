import React, { useState } from 'react';
import { MoodRingsRow, StatsStrip, TodayChart } from '../../pages/DashboardPage';
import { OverviewSkeletonCard } from './OverviewStates';

export function OverviewMoodSection({ current, daySeries, insights, pending = false }) {
  const [selectedMetric, setSelectedMetric] = useState('mood');

  return (
    <>
      {pending ? (
        <OverviewSkeletonCard title="See your scores" lines={4} className="dash-skeleton-rings-card" />
      ) : (
        <MoodRingsRow
          scores={current?.signalScores}
          reflections={current?.signalReflections || current?.momReflection}
          daySeries={daySeries}
        />
      )}
      <TodayChart series={daySeries} selectedMetric={selectedMetric} onSelect={setSelectedMetric} />
      <StatsStrip insights={insights} />
    </>
  );
}

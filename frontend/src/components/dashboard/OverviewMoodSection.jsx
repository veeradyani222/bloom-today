import React, { useState } from 'react';
import { MoodRingsRow, StatsStrip, TodayChart } from '../../pages/DashboardPage';

export function OverviewMoodSection({ current, daySeries, insights }) {
  const [selectedMetric, setSelectedMetric] = useState('mood');

  return (
    <>
      <MoodRingsRow
        scores={current?.signalScores}
        reflections={current?.signalReflections || current?.momReflection}
        daySeries={daySeries}
      />
      <TodayChart series={daySeries} selectedMetric={selectedMetric} onSelect={setSelectedMetric} />
      <StatsStrip insights={insights} />
    </>
  );
}

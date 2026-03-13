import React, { useState } from 'react';
import { MoodRingsRow, QuickTips, StatsStrip, TodayChart } from '../../pages/DashboardPage';

export function OverviewMoodSection({ current, daySeries, insights, quickTips }) {
  const [selectedMetric, setSelectedMetric] = useState('mood');

  return (
    <>
      <MoodRingsRow
        scores={current?.signalScores}
        reflections={current?.signalReflections || current?.momReflection}
        daySeries={daySeries}
      />
      <TodayChart series={daySeries} selectedMetric={selectedMetric} onSelect={setSelectedMetric} />
      <QuickTips scores={current?.signalScores} tips={quickTips?.tips} summary={quickTips?.summary} />
      <StatsStrip insights={insights} />
    </>
  );
}

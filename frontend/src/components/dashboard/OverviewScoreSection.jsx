import React from 'react';
import { computeBloomScore, computeStreak } from '../../pages/DashboardPage';
import { BloomScoreCard } from './BloomScoreCard';
import { StreakCard } from './StreakCard';

export function OverviewScoreSection({ week, current, daySeries, activity }) {
  const bloomScore = computeBloomScore(week?.averages || current?.signalScores, activity, daySeries);
  const streak = computeStreak(daySeries);

  return (
    <section className="overview-score-row">
      <BloomScoreCard
        score={bloomScore}
        scores={current?.signalScores}
        activity={activity}
        daySeries={daySeries}
      />
      <StreakCard streak={streak} />
    </section>
  );
}

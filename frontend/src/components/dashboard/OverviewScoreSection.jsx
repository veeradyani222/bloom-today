import React from 'react';
import { Sparkles } from 'lucide-react';
import { computeBloomScore, computeStreak } from '../../pages/DashboardPage';
import { BloomScoreCard } from './BloomScoreCard';
import { StreakCard } from './StreakCard';
import { SkeletonLines } from './OverviewStates';

function BloomScoreSkeleton() {
  return (
    <div className="overview-bloom-card dash-skeleton-bloom-card" aria-hidden="true">
      <div className="overview-bloom-head">
        <span className="overview-bloom-kicker"><Sparkles size={14} /> Bloom score</span>
        <SkeletonLines lines={1} className="dash-skeleton-lines-compact" />
      </div>
      <div className="overview-bloom-meter dash-skeleton-bloom-meter">
        <span className="dash-skeleton-ring" />
      </div>
    </div>
  );
}

export function OverviewScoreSection({ week, current, daySeries, activity, pending = false }) {
  const bloomScore = computeBloomScore(week?.averages || current?.signalScores, activity, daySeries);
  const streak = computeStreak(daySeries, activity);

  return (
    <section className="overview-score-row">
      {pending ? (
        <BloomScoreSkeleton />
      ) : (
        <BloomScoreCard
          score={bloomScore}
          scores={current?.signalScores}
          activity={activity}
          daySeries={daySeries}
        />
      )}
      <StreakCard streak={streak} />
    </section>
  );
}

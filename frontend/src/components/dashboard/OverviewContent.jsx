import React from 'react';
import { QuickTips, TherapistDashboard, TrustedDashboard } from '../../pages/DashboardPage';
import { OverviewActionsSection } from './OverviewActionsSection';
import { OverviewBloomNoteSection } from './OverviewBloomNoteSection';
import { OverviewCommunitySection } from './OverviewCommunitySection';
import { OverviewHeroSection } from './OverviewHeroSection';
import { OverviewMoodSection } from './OverviewMoodSection';
import { OverviewResourcesSection } from './OverviewResourcesSection';
import { OverviewScoreSection } from './OverviewScoreSection';
import { OverviewEmptyState, OverviewProcessingState, OverviewSkeletonCard } from './OverviewStates';
import { getMomOverviewState } from './overviewStateLogic';

function MomOverviewContent({
  data,
  firstName,
  companionName,
  daySeries,
  insights,
  momTips,
  quickTips,
  welcomeIllustration,
  thankYouIllustration,
  jumpBackIllustration,
  reflectionTimedOut = false,
}) {
  const week = data?.week;
  const current = data?.current;
  const overviewState = getMomOverviewState(data, insights, { reflectionTimedOut });

  if (overviewState === 'empty') {
    return <OverviewEmptyState illustration={welcomeIllustration} />;
  }

  if (overviewState === 'processing') {
    return <OverviewProcessingState illustration={thankYouIllustration} />;
  }

  const isProgressive = overviewState === 'progressive';

  return (
    <>
      <OverviewHeroSection
        data={data}
        firstName={firstName}
        illustration={thankYouIllustration}
        pending={isProgressive}
      />
      <OverviewScoreSection
        week={week}
        current={current}
        daySeries={daySeries}
        activity={insights?.activity}
        pending={isProgressive}
      />
      <OverviewActionsSection companionName={companionName} illustration={jumpBackIllustration} />
      {isProgressive ? (
        <OverviewSkeletonCard title="Quick tips for you" lines={3} className="dash-skeleton-tips-card" />
      ) : (
        <QuickTips scores={current?.signalScores} tips={quickTips?.tips} summary={quickTips?.summary} />
      )}
      {isProgressive ? (
        <OverviewSkeletonCard title="Resources for you" lines={2} className="dash-skeleton-resources-card" />
      ) : (
        <OverviewResourcesSection resources={data?.resources} />
      )}
      <OverviewMoodSection
        current={current}
        daySeries={daySeries}
        insights={insights}
        pending={isProgressive}
      />
      <OverviewCommunitySection momTips={momTips} />
      <OverviewBloomNoteSection
        data={data}
        current={current}
        firstName={firstName}
        pending={isProgressive}
      />
    </>
  );
}

export function OverviewContent({
  role,
  token,
  insights,
  daySeries,
  momTips,
  quickTips,
  firstName,
  companionName,
  welcomeIllustration,
  thankYouIllustration,
  jumpBackIllustration,
  reflectionTimedOut = false,
}) {
  if (role === 'therapist') return <TherapistDashboard data={insights?.therapist} token={token} daySeries={daySeries} firstName={firstName} activity={insights?.activity} />;
  if (role === 'trusted') return <TrustedDashboard data={insights?.trusted} token={token} daySeries={daySeries} firstName={firstName} activity={insights?.activity} />;

  return (
    <MomOverviewContent
      data={insights?.mom}
      firstName={firstName}
      companionName={companionName}
      daySeries={daySeries}
      insights={insights}
      momTips={momTips}
      quickTips={quickTips}
      welcomeIllustration={welcomeIllustration}
      thankYouIllustration={thankYouIllustration}
      jumpBackIllustration={jumpBackIllustration}
      reflectionTimedOut={reflectionTimedOut}
    />
  );
}

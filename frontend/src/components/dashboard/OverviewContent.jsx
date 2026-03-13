import React from 'react';
import { TherapistDashboard, TrustedDashboard } from '../../pages/DashboardPage';
import { OverviewActionsSection } from './OverviewActionsSection';
import { OverviewBloomNoteSection } from './OverviewBloomNoteSection';
import { OverviewCommunitySection } from './OverviewCommunitySection';
import { OverviewHeroSection } from './OverviewHeroSection';
import { OverviewMoodSection } from './OverviewMoodSection';
import { OverviewScoreSection } from './OverviewScoreSection';
import { OverviewEmptyState } from './OverviewStates';

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
}) {
  const week = data?.week;
  const current = data?.current;

  if (!current) {
    return <OverviewEmptyState illustration={welcomeIllustration} />;
  }

  return (
    <>
      <OverviewHeroSection data={data} firstName={firstName} illustration={thankYouIllustration} />
      <OverviewScoreSection
        week={week}
        current={current}
        daySeries={daySeries}
        activity={insights?.activity}
      />
      <OverviewActionsSection companionName={companionName} illustration={jumpBackIllustration} />
      <OverviewMoodSection current={current} daySeries={daySeries} insights={insights} quickTips={quickTips} />
      <OverviewCommunitySection momTips={momTips} />
      <OverviewBloomNoteSection data={data} current={current} firstName={firstName} />
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
    />
  );
}

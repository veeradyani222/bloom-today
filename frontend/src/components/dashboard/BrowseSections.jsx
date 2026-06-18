import React, { useState } from 'react';
import { ArrowLeft, Shield } from 'lucide-react';
import {
  BadgeShelf,
  computeStreak,
  ConversationTimeline,
  EncouragementCard,
  JournalPromptCard,
  MilestoneTracker,
  MomTipCard,
  MonthChart,
  QuickTips,
  SignalTiles,
  StatsStrip,
  TherapistDashboard,
  TodayChart,
  TrustedDashboard,
  WeeklyComparison,
  WinsSection,
  MoodCalendar,
  toMomVoice,
} from '../../pages/DashboardPage';
import { CenteredDashboardLoader } from './OverviewStates';

export function BrowseLoading() {
  return <CenteredDashboardLoader />;
}

export function BrowseError({ error }) {
  return (
    <section className="dash-empty-state">
      <Shield size={28} />
      <h2>We couldn't load Browse yet</h2>
      <p>{error}</p>
    </section>
  );
}

export function BrowseIntro() {
  return (
    <section className="dash-section-intro">
      <h1>Browse</h1>
      <p>Open the deeper parts of Bloom when you want more than the daily overview.</p>
    </section>
  );
}

export function BrowseGridSection({ items, onOpen }) {
  return (
    <section className="browse-grid">
      {items.map(({ slug, title, description, icon: Icon }) => (
        <button key={slug} type="button" className="browse-card" onClick={() => onOpen(slug)}>
          <div className="browse-card-icon"><Icon size={20} /></div>
          <strong>{title}</strong>
          <p>{description}</p>
        </button>
      ))}
    </section>
  );
}

export function BrowseDetailHeader({ title, description, onBack }) {
  void title;
  void description;
  return (
    <section className="detail-header">
      <button type="button" className="detail-back" onClick={onBack}><ArrowLeft size={16} /> Back to Browse</button>
    </section>
  );
}

export function TrendsSection({ daySeries, insights, momData }) {
  const [todaySelectedMetric, setTodaySelectedMetric] = useState('mood');
  const [monthSelectedMetric, setMonthSelectedMetric] = useState('mood');

  return (
    <>
      <MoodCalendar monthPoints={daySeries?.month?.points} />
      <TodayChart series={daySeries} selectedMetric={todaySelectedMetric} onSelect={setTodaySelectedMetric} compactTabs />
      <MonthChart series={daySeries} selectedMetric={monthSelectedMetric} onSelect={setMonthSelectedMetric} compactTabs />
      <WeeklyComparison week={momData?.week} month={momData?.month} />
      <SignalTiles week={momData?.week} />
    </>
  );
}

export function StorySection({ momData, firstName }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <ConversationTimeline week={momData?.week} firstName={firstName} />
      <WinsSection week={momData?.week} firstName={firstName} />
      <EncouragementCard data={momData} firstName={firstName} onClick={() => setExpanded((value) => !value)} />
      {expanded ? (
        <section className="sec-card">
          <h3>Full reflection</h3>
          <p>{toMomVoice(momData?.narratives?.week?.summary || momData?.current?.momReflection?.encouragement, firstName)}</p>
        </section>
      ) : null}
    </>
  );
}

export function CommunitySection({ momTips, token }) {
  return (
    <>
      <MomTipCard tips={momTips} />
      <JournalPromptCard token={token} />
    </>
  );
}

export function BondingSection({ momData, quickTips }) {
  return (
    <>
      <QuickTips scores={momData?.current?.signalScores} tips={quickTips?.tips} summary={quickTips?.summary} />
    </>
  );
}

export function MilestonesSection({ insights, daySeries }) {
  return (
    <>
      <BadgeShelf totalCalls={insights?.activity?.totalCalls || 0} streak={computeStreak(daySeries)} />
      <MilestoneTracker totalCalls={insights?.activity?.totalCalls || 0} />
    </>
  );
}

export function SupportSection({ role, data, firstName, quickTips }) {
  if (role === 'therapist') return <TherapistDashboard data={data?.therapist} />;
  if (role === 'trusted') return <TrustedDashboard data={data?.trusted} />;

  return (
    <>
      <section className="sec-card">
        <h3>Care circle</h3>
        <p>{toMomVoice(data?.mom?.narratives?.week?.nextStep || data?.mom?.current?.momReflection?.nextStep || 'Bloom will keep surfacing the next small step you can take today.', firstName)}</p>
      </section>
      <QuickTips scores={data?.mom?.current?.signalScores} tips={quickTips?.tips} summary={quickTips?.summary} />
    </>
  );
}

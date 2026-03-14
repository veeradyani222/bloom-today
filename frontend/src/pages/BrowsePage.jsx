import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MessageCircle, Sparkles, Target, Trophy } from 'lucide-react';
import { Navbar } from './DashboardPage';
import { useDashboardData } from './useDashboardData';
import {
  BrowseDetailHeader,
  BrowseError,
  BrowseGridSection,
  BrowseLoading,
  CommunitySection,
  MilestonesSection,
  StorySection,
  TrendsSection,
} from '../components/dashboard/BrowseSections';
import './DashboardPage.css';

const BROWSE_ITEMS = [
  { slug: 'trends', title: 'Trends', description: 'Charts, mood maps, weekly comparisons, and signal tiles.', icon: Target },
  { slug: 'story', title: 'Your story', description: 'Key moments, wins, and Bloom reflections from your recent week.', icon: Sparkles },
  { slug: 'community', title: 'Community', description: 'Read from other moms and share something helpful back.', icon: MessageCircle },
  { slug: 'milestones', title: 'Milestones', description: 'Track streaks, badges, and your progress across calls.', icon: Trophy },
];

export function BrowsePage({ token, session }) {
  const navigate = useNavigate();
  const companionName = session?.user?.companion_name || session?.user?.companionName || 'Sage';

  return (
    <div className="dash">
      <Navbar companionName={companionName} />
      <main className="dash-main">
        <BrowseGridSection items={BROWSE_ITEMS} onOpen={(slug) => navigate(`/browse/${slug}`)} />
      </main>
    </div>
  );
}

export function BrowseDetailPage({ token, session }) {
  const navigate = useNavigate();
  const { slug } = useParams();
  const companionName = session?.user?.companion_name || session?.user?.companionName || 'Sage';
  const userName = session?.user?.full_name || 'there';
  const firstName = userName.split(' ')[0];
  const { insights, daySeries, momTips, loading, error } = useDashboardData(token);
  const item = BROWSE_ITEMS.find((entry) => entry.slug === slug);
  const momData = insights?.mom;

  if (!item) {
    return (
      <div className="dash">
        <Navbar companionName={companionName} />
        <main className="dash-main">
          <BrowseError error="That browse page does not exist." />
        </main>
      </div>
    );
  }

  return (
    <div className="dash">
      <Navbar companionName={companionName} />
      <main className="dash-main">
        <BrowseDetailHeader title={item.title} description={item.description} onBack={() => navigate('/browse')} />
        {loading ? <BrowseLoading /> : null}
        {!loading && error ? <BrowseError error={error} /> : null}
        {!loading && !error && slug === 'trends' ? <TrendsSection daySeries={daySeries} insights={insights} momData={momData} /> : null}
        {!loading && !error && slug === 'story' ? <StorySection momData={momData} firstName={firstName} /> : null}
        {!loading && !error && slug === 'community' ? <CommunitySection momTips={momTips} token={token} /> : null}
        {!loading && !error && slug === 'milestones' ? <MilestonesSection insights={insights} daySeries={daySeries} /> : null}
      </main>
    </div>
  );
}

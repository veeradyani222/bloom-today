import React from 'react';
import { MomTipCard } from '../../pages/DashboardPage';

export function OverviewCommunitySection({ momTips }) {
  return <MomTipCard tips={momTips} />;
}

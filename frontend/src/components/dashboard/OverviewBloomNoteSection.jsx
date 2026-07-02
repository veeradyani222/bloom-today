import React, { useState } from 'react';
import { Star } from 'lucide-react';
import nameCompanionIllustration from '../../assets/namecompanion.svg';
import { EncouragementCard, toMomVoice } from '../../pages/DashboardPage';
import { SkeletonLines } from './OverviewStates';

function EncouragementSkeleton() {
  return (
    <section className="sec-encourage dash-skeleton-encourage" aria-hidden="true">
      <div className="sec-encourage-content">
        <Star size={20} />
        <h3>A note from Bloom</h3>
        <SkeletonLines lines={3} />
      </div>
      <img src={nameCompanionIllustration} alt="" className="sec-encourage-art" />
    </section>
  );
}

export function OverviewBloomNoteSection({ data, current, firstName, pending = false }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      {pending ? (
        <EncouragementSkeleton />
      ) : (
        <EncouragementCard data={data} firstName={firstName} onClick={() => setExpanded((value) => !value)} />
      )}
      {expanded ? (
        <section className="sec-card">
          <h3>Bloom's full note</h3>
          <p>{toMomVoice(data?.narratives?.week?.summary || current?.momReflection?.encouragement, firstName)}</p>
          <p>{toMomVoice(data?.narratives?.week?.nextStep || current?.momReflection?.nextStep, firstName)}</p>
        </section>
      ) : null}
    </>
  );
}

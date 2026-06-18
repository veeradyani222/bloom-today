import React, { useState } from 'react';
import { EncouragementCard, toMomVoice } from '../../pages/DashboardPage';

export function OverviewBloomNoteSection({ data, current, firstName }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <EncouragementCard data={data} firstName={firstName} onClick={() => setExpanded((value) => !value)} />
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

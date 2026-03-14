import React from 'react';
import { PlayCircle } from 'lucide-react';

function ResourceCard({ item }) {
  function openVideo() {
    const url = String(item?.youtubeUrl || '').trim();
    if (!url) {
      console.warn('[RESOURCES_UI] missing_youtube_url', item);
      return;
    }

    console.log('[RESOURCES_UI] open_video', { title: item?.title, url });
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) {
      window.location.href = url;
    }
  }

  return (
    <article className="sec-resource-card">
      <div className="sec-resource-video-wrap">
        <iframe
          className="sec-resource-video"
          src={item.embedUrl}
          title={item.title || 'Recommended resource'}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
      <div className="sec-resource-copy">
        <h4>{item.title || 'Recommended resource'}</h4>
        <p>{item.reason || 'Picked for your recent check-in themes.'}</p>
        <button type="button" className="sec-resource-link" onClick={openVideo}>
          <PlayCircle size={16} />
          <span>Watch on YouTube</span>
        </button>
      </div>
    </article>
  );
}

export function OverviewResourcesSection({ resources }) {
  const list = resources?.resources || [];

  if (!list.length) {
    return null;
  }

  return (
    <section className="sec-resources">
      <div className="sec-resources-head">
        <h3>Resources for you</h3>
        <p>{resources?.summary || 'Picked from your recent conversations with Bloom.'}</p>
      </div>
      <div className="sec-resources-grid">
        {list.map((item, index) => (
          <ResourceCard
            key={item.videoId || item.youtubeUrl || `resource-${index}`}
            item={item}
          />
        ))}
      </div>
    </section>
  );
}
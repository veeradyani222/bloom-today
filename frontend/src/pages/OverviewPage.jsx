import React, { useEffect, useState } from 'react';
import connectTrustedPersonIllustration from '../assets/connecttrustedperson.svg';
import frameIllustration from '../assets/Frame.svg';
import frameAltIllustration from '../assets/Frame (1).svg';
import thankYouIllustration from '../assets/thankuforsharing.svg';
import welcomeIllustration from '../assets/welcomelittleone.svg';
import { Navbar, todayKey } from './DashboardPage';
import { useDashboardData } from './useDashboardData';
import { OverviewContent } from '../components/dashboard/OverviewContent';
import { OverviewError, OverviewLoading } from '../components/dashboard/OverviewStates';

function MoodCheckInPopup({ onClose, onSelect }) {
  const options = ['great', 'good', 'okay', 'low', 'tough'];
  const [selected, setSelected] = useState(null);

  const handleSelect = (mood) => {
    setSelected(mood);
    onSelect(mood);
  };

  return (
    <div className="dash-popup-overlay" onClick={onClose}>
      <div className="dash-popup-card" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="dash-popup-close" onClick={onClose}>x</button>
        {!selected ? (
          <>
            <h2>How are you feeling today?</h2>
            <p>A quick check-in to start your day.</p>
            <div className="dash-mood-picker">
              {options.map((option) => (
                <button key={option} type="button" className="dash-mood-option" onClick={() => handleSelect(option)}>
                  <span>{option}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="dash-popup-thanks">
            <h2>Thanks for sharing</h2>
            <p>Select Done when you're ready.</p>
            <button type="button" className="dash-popup-done-btn" onClick={onClose}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}

export function OverviewPage({ token, session }) {
  const userName = session?.user?.full_name || 'there';
  const firstName = userName.split(' ')[0];
  const roleFromSession = session?.user?.auth_role || 'mom';
  const companionName = roleFromSession === 'mom'
    ? (session?.user?.companion_name || session?.user?.companionName || 'Sage')
    : firstName;
  const [showMoodPopup, setShowMoodPopup] = useState(false);
  const { insights, daySeries, momTips, quickTips, loading, error } = useDashboardData(token, roleFromSession);
  const role = insights?.role || roleFromSession;
  const therapistMessage = session?.user?.latest_therapist_message;
  const trustedMessage = session?.user?.latest_trusted_message;

  useEffect(() => {
    if (role === 'mom' && !loading && !error && insights?.hasData) {
      const key = `bloom_mood_${todayKey()}`;
      if (!localStorage.getItem(key)) setShowMoodPopup(true);
    } else if (role !== 'mom') {
      setShowMoodPopup(false);
    }
  }, [role, loading, error, insights]);

  return (
    <div className="dash">
      <Navbar companionName={companionName} role={role} />
      {role === 'mom' && showMoodPopup ? (
        <MoodCheckInPopup
          onClose={() => setShowMoodPopup(false)}
          onSelect={(mood) => {
            localStorage.setItem(`bloom_mood_${todayKey()}`, mood);
            setShowMoodPopup(false);
          }}
        />
      ) : null}
      <main className="dash-main">
        {role === 'mom' && therapistMessage?.text ? (
          <section className="support-note-banner support-note-banner-therapist">
            <img src={frameIllustration} alt="" className="support-note-art" />
            <div className="support-note-content">
              <h3>A note from your therapist</h3>
              <p>{therapistMessage.text}</p>
            </div>
          </section>
        ) : null}
        {role === 'mom' && trustedMessage?.text ? (
          <section className="support-note-banner support-note-banner-trusted">
            <div className="support-note-content">
              <h3>A note from your trusted person</h3>
              <p>{trustedMessage.text}</p>
            </div>
            <img src={frameAltIllustration} alt="" className="support-note-art" />
          </section>
        ) : null}
        {loading ? <OverviewLoading /> : null}
        {!loading && error ? <OverviewError error={error} /> : null}
        {!loading && !error ? (
          <OverviewContent
            role={role}
            token={token}
            insights={insights}
            daySeries={daySeries}
            momTips={momTips}
            quickTips={quickTips}
            firstName={firstName}
            companionName={companionName}
            welcomeIllustration={welcomeIllustration}
            thankYouIllustration={thankYouIllustration}
            jumpBackIllustration={connectTrustedPersonIllustration}
          />
        ) : null}
      </main>
    </div>
  );
}

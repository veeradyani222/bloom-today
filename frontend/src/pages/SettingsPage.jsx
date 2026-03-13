import React from 'react';
import { Bell, Lock, Mic, Phone, Shield, Video } from 'lucide-react';
import { Navbar } from './DashboardPage';
import './DashboardPage.css';

function SettingBlock({ icon: Icon, title, description }) {
  return (
    <article className="sec-card setting-block">
      <div className="setting-icon"><Icon size={18} /></div>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </article>
  );
}

export function SettingsPage({ session }) {
  const companionName = session?.user?.companion_name || session?.user?.companionName || 'Sage';

  return (
    <div className="dash">
      <Navbar companionName={companionName} />
      <main className="dash-main">
        <section className="dash-section-intro">
          <h1>Settings</h1>
          <p>Organized around the controls people usually look for after landing in the app.</p>
        </section>
        <section className="settings-grid">
          <SettingBlock icon={Phone} title="Voice calls" description="Coming soon: choose call defaults, speaker behavior, and quick-start options." />
          <SettingBlock icon={Video} title="Video calls" description="Coming soon: camera preferences, avatar behavior, and visual setup." />
          <SettingBlock icon={Mic} title="Microphone" description="Coming soon: tune input behavior and reconnect permissions if needed." />
          <SettingBlock icon={Bell} title="Notifications" description="Coming soon: reminders for check-ins, streak nudges, and support follow-ups." />
          <SettingBlock icon={Lock} title="Privacy" description="Coming soon: manage what Bloom stores and what can be shared outward." />
          <SettingBlock icon={Shield} title="Safety" description="Coming soon: support contacts, trusted access, and escalation preferences." />
        </section>
      </main>
    </div>
  );
}

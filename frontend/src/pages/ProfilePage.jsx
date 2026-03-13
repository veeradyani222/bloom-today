import React, { useState } from 'react';
import { Mail, Sparkles, User } from 'lucide-react';
import { Navbar } from './DashboardPage';
import { apiRequest } from '../lib/api';
import './DashboardPage.css';

export function ProfilePage({ token, session, setSession, saveSession }) {
  const role = session?.user?.auth_role || session?.user?.preferred_dashboard_role || 'mom';
  const isSupportRole = role !== 'mom';
  const supportName = session?.user?.support_user_name || '';
  const supportEmail = session?.user?.support_user_email || '';
  const userName = isSupportRole ? (supportName || 'Add your name') : (session?.user?.full_name || 'Your profile');
  const email = isSupportRole ? (supportEmail || session?.user?.email || 'No email saved') : (session?.user?.email || 'No email saved');
  const companionName = session?.user?.companion_name || session?.user?.companionName || 'Sage';
  const [nameInput, setNameInput] = useState(supportName);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  async function saveSupportName() {
    if (!nameInput.trim()) {
      setStatus('Please enter your name.');
      return;
    }

    setSaving(true);
    setStatus('');
    try {
      const data = await apiRequest('/api/me/profile', {
        method: 'PUT',
        token,
        body: { fullName: nameInput.trim() },
      });

      const updatedSession = {
        ...session,
        user: {
          ...session.user,
          support_user_name: data.fullName,
        },
      };
      setSession(updatedSession);
      saveSession(updatedSession);
      setStatus('Name saved.');
    } catch (error) {
      setStatus(error.message || 'Could not save your name.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dash">
      <Navbar companionName={isSupportRole ? (session?.user?.full_name || 'Patient') : companionName} role={role} />
      <main className="dash-main">
        <section className="dash-section-intro">
          <h1>Profile</h1>
          <p>{isSupportRole ? 'Your support account details.' : 'Your basic account details and Bloom setup.'}</p>
        </section>
        <section className="sec-card profile-card">
          <div className="profile-row"><User size={18} /><div><strong>{userName}</strong><span>{isSupportRole ? 'Support name' : 'Name'}</span></div></div>
          <div className="profile-row"><Mail size={18} /><div><strong>{email}</strong><span>Email</span></div></div>
          {!isSupportRole ? <div className="profile-row"><Sparkles size={18} /><div><strong>{companionName}</strong><span>Companion</span></div></div> : null}
          <div className="profile-row"><User size={18} /><div><strong>{role}</strong><span>Active role</span></div></div>
        </section>
        {isSupportRole && !supportName.trim() ? (
          <section className="sec-card you-support-name-card">
            <h3>Add your name</h3>
            <p>This name is shown for your support profile.</p>
            <input
              type="text"
              value={nameInput}
              onChange={(event) => setNameInput(event.target.value)}
              placeholder={role === 'therapist' ? 'Enter therapist name' : 'Enter trusted person name'}
            />
            <div className="sec-therapist-compose-row">
              <button type="button" onClick={saveSupportName} disabled={saving}>
                {saving ? 'Saving...' : 'Save name'}
              </button>
              {status ? <span>{status}</span> : null}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}

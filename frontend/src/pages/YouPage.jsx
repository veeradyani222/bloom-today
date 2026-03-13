import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from './DashboardPage';
import { apiRequest } from '../lib/api';
import { AVATAR_IDS } from '../constants/index';
import { CompanionCard } from '../components/CompanionCard';
import { TalkingHeadPreview } from '../components/TalkingHeadPreview';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { YouHeroSection, YouLinksSection, YouSummarySection } from '../components/dashboard/YouSections';
import './DashboardPage.css';
import './OnboardingPage.css';

const DEFAULT_GEMINI_VOICE = 'Aoede';

function getCompanionConfig(session) {
  return {
    avatarId: session?.user?.companion?.avatar_id || session?.user?.companion_avatar_id || 'brunette',
    voiceName: session?.user?.companion?.voice_name || session?.user?.companion_voice_name || DEFAULT_GEMINI_VOICE,
    name: session?.user?.companion?.name || session?.user?.companion_name || 'Sage',
    instructions: session?.user?.companion?.user_instructions || '',
  };
}

function SupportKeyCard({ title, description, keyValue, onRotate, rotating }) {
  return (
    <article className="you-key-card">
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
        <code>{keyValue || 'Unavailable'}</code>
      </div>
      <button type="button" className="you-key-rotate" onClick={onRotate} disabled={rotating}>
        {rotating ? 'Rotating...' : 'Rotate key'}
      </button>
    </article>
  );
}

export function YouPage({ token, session, setSession, saveSession }) {
  const navigate = useNavigate();
  const role = session?.user?.auth_role || session?.user?.preferred_dashboard_role || 'mom';
  const isSupportRole = role !== 'mom';
  const patientName = session?.user?.full_name || 'Patient';
  const supportName = session?.user?.support_user_name || '';
  const supportEmail = session?.user?.support_user_email || '';
  const companionName = isSupportRole
    ? patientName.split(' ')[0]
    : (session?.user?.companion_name || session?.user?.companionName || 'Sage');
  const userName = isSupportRole
    ? (supportName || 'Add your name')
    : (session?.user?.full_name || 'Your profile');
  const email = isSupportRole
    ? (supportEmail || session?.user?.email || 'No email saved')
    : (session?.user?.email || 'No email saved');
  const [keys, setKeys] = useState({
    therapistKey: session?.user?.therapist_share_key || '',
    trustedKey: session?.user?.trusted_share_key || '',
  });
  const [rotatingType, setRotatingType] = useState('');
  const [keyError, setKeyError] = useState('');
  const [supportNameInput, setSupportNameInput] = useState(supportName);
  const [savingSupportName, setSavingSupportName] = useState(false);
  const [supportNameStatus, setSupportNameStatus] = useState('');

  useEffect(() => {
    setSupportNameInput(supportName);
  }, [supportName]);

  useEffect(() => {
    let cancelled = false;
    async function loadKeys() {
      try {
        const data = await apiRequest('/api/me/support-keys', { token });
        if (!cancelled) {
          setKeys({ therapistKey: data.therapistKey || '', trustedKey: data.trustedKey || '' });
        }
      } catch {
        if (!cancelled) {
          setKeyError('Could not load support keys right now.');
        }
      }
    }
    if (token && !isSupportRole) loadKeys();
    return () => {
      cancelled = true;
    };
  }, [token, isSupportRole]);

  async function rotateKey(type) {
    const roleLabel = type === 'therapist' ? 'therapist' : 'trusted person';
    const ok = window.confirm(
      `Rotate ${roleLabel} key? Anyone using the old key will be logged out and must sign in again using the new key.`,
    );
    if (!ok) return;

    setRotatingType(type);
    setKeyError('');
    try {
      const data = await apiRequest('/api/me/support-keys/rotate', {
        method: 'POST',
        token,
        body: { type },
      });

      const nextKeys = {
        therapistKey: type === 'therapist' ? data.key : keys.therapistKey,
        trustedKey: type === 'trusted' ? data.key : keys.trustedKey,
      };
      setKeys(nextKeys);

      const updatedSession = {
        ...session,
        user: {
          ...session.user,
          therapist_share_key: nextKeys.therapistKey,
          trusted_share_key: nextKeys.trustedKey,
        },
      };
      setSession(updatedSession);
      saveSession(updatedSession);
    } catch (error) {
      setKeyError(error.message || 'Could not rotate key.');
    } finally {
      setRotatingType('');
    }
  }

  function openSupportRoleSwitch() {
    const ok = window.confirm('Switching support role will log you out of this session. Continue?');
    if (!ok) return;
    setSession(null);
    saveSession(null);
    navigate('/role-login');
  }

  async function saveSupportName() {
    if (!supportNameInput.trim()) {
      setSupportNameStatus('Please enter your name.');
      return;
    }

    setSavingSupportName(true);
    setSupportNameStatus('');
    try {
      const data = await apiRequest('/api/me/profile', {
        method: 'PUT',
        token,
        body: { fullName: supportNameInput.trim() },
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
      setSupportNameStatus('Name updated.');
    } catch (error) {
      setSupportNameStatus(error.message || 'Could not save your name.');
    } finally {
      setSavingSupportName(false);
    }
  }

  return (
    <div className="dash">
      <Navbar companionName={companionName} role={role} />
      <main className="dash-main">
        <YouHeroSection userName={userName} email={email} />
        <YouSummarySection companionName={companionName} role={role} profileName={userName} profileEmail={email} />
        {isSupportRole && !supportName.trim() ? (
          <section className="sec-card you-support-name-card">
            <h3>Add your name</h3>
            <p>This is shown as your support profile name.</p>
            <input
              type="text"
              value={supportNameInput}
              onChange={(event) => setSupportNameInput(event.target.value)}
              placeholder={role === 'therapist' ? 'Enter therapist name' : 'Enter trusted person name'}
            />
            <div className="sec-therapist-compose-row">
              <button type="button" onClick={saveSupportName} disabled={savingSupportName}>
                {savingSupportName ? 'Saving...' : 'Save name'}
              </button>
              {supportNameStatus ? <span>{supportNameStatus}</span> : null}
            </div>
          </section>
        ) : null}
        {!isSupportRole ? (
          <section className="you-keys-grid">
            <SupportKeyCard
              title="Therapist key"
              description="Share this with your therapist so they can securely access your support view."
              keyValue={keys.therapistKey}
              onRotate={() => rotateKey('therapist')}
              rotating={rotatingType === 'therapist'}
            />
            <SupportKeyCard
              title="Trusted person key"
              description="Share this with your trusted person to let them support you in their own view."
              keyValue={keys.trustedKey}
              onRotate={() => rotateKey('trusted')}
              rotating={rotatingType === 'trusted'}
            />
            {keyError ? <p className="you-key-error">{keyError}</p> : null}
          </section>
        ) : null}
        <YouLinksSection navigate={navigate} onSupportRoles={openSupportRoleSwitch} role={role} />
      </main>
    </div>
  );
}

export function CompanionSetupPage({ token, session, setSession, saveSession }) {
  const navigate = useNavigate();
  const companionName = session?.user?.companion_name || session?.user?.companionName || 'Sage';
  const initial = getCompanionConfig(session);
  const [form, setForm] = useState(initial);
  const [voiceOptions, setVoiceOptions] = useState([]);
  const [voiceOptionsLoading, setVoiceOptionsLoading] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setForm(getCompanionConfig(session));
  }, [session]);

  useEffect(() => {
    let cancelled = false;

    async function loadVoices() {
      try {
        setVoiceOptionsLoading(true);
        const data = await apiRequest('/api/gemini/voices', { token });
        if (cancelled) return;
        const voices = data.voices || [];
        setVoiceOptions(voices);
        if (voices.length && !voices.some((voice) => voice.id === form.voiceName)) {
          setForm((prev) => ({ ...prev, voiceName: voices[0].id }));
        }
      } catch {
        if (!cancelled) {
          setVoiceOptions([]);
        }
      } finally {
        if (!cancelled) {
          setVoiceOptionsLoading(false);
        }
      }
    }

    loadVoices();
    return () => {
      cancelled = true;
    };
  }, [token]);

  function setValue(key, value) {
    setSaved(false);
    setError('');
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const isDirty =
    form.avatarId !== initial.avatarId ||
    form.voiceName !== initial.voiceName ||
    form.name !== initial.name ||
    form.instructions !== initial.instructions;

  async function handleSave() {
    if (!form.name.trim()) {
      setError('Please give your companion a name.');
      return;
    }

    try {
      setSaving(true);
      setError('');
      const data = await apiRequest('/api/me/companion', {
        method: 'PUT',
        token,
        body: {
          companionAvatarId: form.avatarId,
          companionVoiceName: form.voiceName,
          companionName: form.name.trim(),
          companionInstructions: form.instructions.trim(),
        },
      });

      const updated = { ...session, user: data.user };
      setSession(updated);
      saveSession(updated);
      setSaved(true);
    } catch (saveError) {
      setError(saveError.message || 'Could not update your companion.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dash">
      <Navbar companionName={companionName} />
      <main className="dash-main">
        <section className="you-companion-shell">
          <div className="you-companion-topbar">
            <button type="button" className="you-companion-back" onClick={() => navigate('/you')}>
              <ArrowLeft size={16} />
              Back to You
            </button>
          </div>

          <section className="you-companion-hero">
            <div>
              <h1>Shape the companion who shows up for you</h1>
              <p>Update their look, their name, their voice, and the way they support you.</p>
            </div>
          </section>

          <section className="you-companion-grid">
            <article className="you-companion-card">
              <div className="you-companion-section-head">
                <h2>Choose how your companion looks</h2>
                <p>The highlighted one is the companion you are currently using.</p>
              </div>
              <div className="companion-grid you-companion-avatar-grid">
                {AVATAR_IDS.map((avatarId) => (
                  <div key={avatarId} className="you-companion-avatar-item">
                    <CompanionCard
                      avatarId={avatarId}
                      selected={form.avatarId === avatarId}
                      onSelect={(nextAvatarId) => setValue('avatarId', nextAvatarId)}
                    />
                    {form.avatarId === avatarId ? (
                      <p className="you-companion-avatar-note">This is your current companion. This is how your current companion looks.</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </article>

            <article className="you-companion-card">
              <div className="you-companion-section-head">
                <h2>Preview your current companion</h2>
                <p>Hear the selected voice with the selected look before you save.</p>
              </div>
              <div className="voice-pick-step you-companion-preview-layout">
                <div className="voice-pick-preview">
                  <TalkingHeadPreview
                    token={token}
                    selectedAvatarId={form.avatarId}
                    selectedVoiceName={form.voiceName}
                    previewText={`Hi, I am ${form.name.trim() || 'your companion'}. I am here with you, gently and without judgment.`}
                    previewNonce={previewNonce}
                    onBusyChange={setVoiceBusy}
                  />
                </div>
                <div className="voice-pick-controls">
                  <label className="voice-pick-label">Voice name</label>
                  <Select
                    value={form.voiceName}
                    onValueChange={(value) => setValue('voiceName', value)}
                    disabled={voiceOptionsLoading}
                  >
                    <SelectTrigger className="voice-pick-trigger">
                      <SelectValue placeholder={voiceOptionsLoading ? 'Loading voices...' : 'Choose a voice'} />
                    </SelectTrigger>
                    <SelectContent>
                      {voiceOptions.map((voice) => (
                        <SelectItem key={voice.id} value={voice.id}>
                          {voice.label} - {voice.blurb}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <button
                    type="button"
                    className={`voice-pick-play-btn ${voiceBusy ? 'voice-pick-play-btn--busy' : ''}`}
                    onClick={() => setPreviewNonce((value) => value + 1)}
                    disabled={!form.voiceName || voiceBusy}
                  >
                    {voiceBusy ? <span className="voice-pick-spinner" /> : null}
                    {voiceBusy ? 'Generating...' : 'Play preview'}
                  </button>
                </div>
              </div>
            </article>

            <article className="you-companion-card">
              <div className="you-companion-section-head">
                <h2>Name your companion</h2>
                <p>This is the name that appears across calls and your dashboard.</p>
              </div>
              <label className="you-companion-label" htmlFor="companion-name">Companion name</label>
              <input
                id="companion-name"
                className="you-companion-input"
                value={form.name}
                onChange={(event) => setValue('name', event.target.value)}
                placeholder="e.g. Sage"
              />
            </article>

            <article className="you-companion-card">
              <div className="you-companion-section-head">
                <h2>Set companion instructions</h2>
                <p>Tell Bloom how you want your companion to sound, what to focus on, or what to avoid.</p>
              </div>
              <label className="you-companion-label" htmlFor="companion-instructions">Instructions</label>
              <textarea
                id="companion-instructions"
                className="you-companion-textarea"
                rows={5}
                value={form.instructions}
                onChange={(event) => setValue('instructions', event.target.value)}
                placeholder='Be extra gentle, check in on my sleep, and keep reminders practical.'
              />
            </article>
          </section>

          <section className="you-companion-savebar">
            <div className="you-companion-savecopy">
              <strong>Save companion changes</strong>
              <p>Your avatar, voice, name, and instructions will update together.</p>
              {saved ? (
                <span className="you-companion-success"><CheckCircle2 size={16} /> Companion updated.</span>
              ) : null}
              {error ? <span className="you-companion-error">{error}</span> : null}
            </div>
            <button
              type="button"
              className="you-companion-savebtn"
              onClick={handleSave}
              disabled={saving || !isDirty}
            >
              {saving ? 'Saving...' : 'Save companion'}
            </button>
          </section>
        </section>
      </main>
    </div>
  );
}

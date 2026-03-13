import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiRequest } from '../../lib/api';
import { DASHBOARD_ROLES, ROLE_COPY, getPostLoginRoute } from '../../constants/index';
import { GoogleButton } from '../../components/GoogleButton';
import './RoleSelectionPage.css';

/* ── Illustration imports ── */
import illustMom from '../../assets/askingname.svg';
import illustTherapist from '../../assets/connectatherapist.svg';
import illustTrusted from '../../assets/connecttrustedperson.svg';

const ROLE_ILLUSTRATIONS = {
  mom: illustMom,
  therapist: illustTherapist,
  trusted: illustTrusted,
};

export function RoleSelectionPage({
  token,
  session,
  setSession,
  saveSession,
  authMode = false,
  loading = false,
  error: externalError = '',
  onRoleGoogleSignIn,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const roleFromQuery = new URLSearchParams(location.search).get('role');
  const initialRole = DASHBOARD_ROLES.includes(roleFromQuery)
    ? roleFromQuery
    : (session?.user?.preferred_dashboard_role || 'mom');
  const [selectedRole, setSelectedRole] = useState(initialRole);
  const [supportKey, setSupportKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const needsSupportKey = selectedRole !== 'mom';

  useEffect(() => {
    if (DASHBOARD_ROLES.includes(roleFromQuery)) {
      setSelectedRole(roleFromQuery);
      setError('');
    }
  }, [roleFromQuery]);

  async function handleContinue(event) {
    event.preventDefault();
    if (authMode) return;

    if (selectedRole !== 'mom') {
      if (!supportKey.trim()) {
        setError(`Enter your ${selectedRole} key to continue.`);
        return;
      }

      setSaving(true);
      setError('');
      try {
        const data = await apiRequest('/api/auth/switch-support-role', {
          method: 'POST',
          token,
          body: {
            role: selectedRole,
            supportKey: supportKey.trim(),
          },
        });

        const nextSession = {
          accessToken: data.accessToken,
          user: data.user,
        };

        setSession(nextSession);
        saveSession(nextSession);
        navigate('/dashboard', { replace: true });
      } catch (submitError) {
        setError(submitError.message || 'Could not switch role right now.');
      } finally {
        setSaving(false);
      }
      return;
    }

    setSaving(true);
    setError('');
    try {
      const data = await apiRequest('/api/me/default-dashboard', {
        method: 'PUT',
        token,
        body: { role: selectedRole },
      });
      const updated = { ...session, user: data.user };
      setSession(updated);
      saveSession(updated);
      navigate(getPostLoginRoute(data.user));
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSaving(false);
    }
  }

  const [showNameEntry, setShowNameEntry] = useState(false);
  const [nameInput, setNameInput] = useState('');

  async function handleRoleCredential(credential) {
    if (!onRoleGoogleSignIn) return;
    if (needsSupportKey && !supportKey.trim()) {
      setError(`Enter your ${selectedRole} key to continue.`);
      return;
    }
    setError('');
    const user = await onRoleGoogleSignIn({
      credential,
      role: selectedRole,
      supportKey: supportKey.trim(),
    });

    if (user) {
      if (selectedRole !== 'mom' && !user.full_name) {
        setShowNameEntry(true);
      } else {
        navigate(getPostLoginRoute(user));
      }
    }
  }

  async function submitNameEntry(event) {
    event.preventDefault();
    if (!nameInput.trim()) return;

    setSaving(true);
    setError('');

    try {
      const resp = await apiRequest('/api/me/profile', {
        method: 'PUT',
        token,
        body: { fullName: nameInput.trim() },
      });

      const updatedUser = { ...session.user, full_name: resp.fullName };
      const updatedSession = { ...session, user: updatedUser };
      setSession(updatedSession);
      saveSession(updatedSession);
      navigate(getPostLoginRoute(updatedUser));
    } catch (saveError) {
      setError(saveError.message || 'Could not save your name.');
    } finally {
      setSaving(false);
    }
  }

  const helperTitle = authMode ? 'Choose how you want to sign in' : 'How do you want to use CalmNest?';
  const helperSubtitle = authMode
    ? 'Pick your role, enter your key if needed, then continue with Google.'
    : 'Choose your role. If you pick therapist or trusted, enter the support key and continue.';

  return (
    <main className="rsp">
      <div className="rsp-card">
        {/* Title */}
        <h1 className="rsp-title">{helperTitle}</h1>
        <p className="rsp-subtitle">{helperSubtitle}</p>

        {/* Role Cards */}
        {showNameEntry ? (
          <form onSubmit={submitNameEntry}>
            <div className="rsp-key-wrap">
              <label htmlFor="name-entry-input" className="rsp-key-label">What's your name?</label>
              <input
                id="name-entry-input"
                className="rsp-key-input"
                value={nameInput}
                onChange={(event) => setNameInput(event.target.value)}
                placeholder="Enter your full name"
                autoComplete="off"
                autoFocus
              />
              <p className="rsp-key-hint">This name will be shown to the mom you are supporting.</p>
            </div>
            {error || externalError ? <p className="rsp-error">{error || externalError}</p> : null}
            <div className="rsp-actions">
              <button
                type="submit"
                className="rsp-continue-btn"
                disabled={saving || !nameInput.trim()}
              >
                {saving ? 'Saving...' : 'Finish setup'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleContinue}>
            <div className="rsp-roles">
              {DASHBOARD_ROLES.map((role, index) => {
                const info = ROLE_COPY[role];
                const isSelected = selectedRole === role;
                const isReversed = index === 1; // Middle card has reversed layout

                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setSelectedRole(role)}
                    className={`rsp-role-card ${isSelected ? 'selected' : ''} ${isReversed ? 'reverse' : ''}`}
                  >
                    {/* Illustration */}
                    <div className="rsp-role-illust">
                      <div className="rsp-role-illust-blob" />
                      <img src={ROLE_ILLUSTRATIONS[role]} alt="" />
                    </div>

                    {/* Text */}
                    <div className="rsp-role-text">
                      <span className="rsp-role-name">{info.title}</span>
                      <span className="rsp-role-desc">{info.subtitle}</span>
                    </div>

                    {/* Selection indicator */}
                    <span className="rsp-role-check">
                      <svg viewBox="0 0 24 24">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                  </button>
                );
              })}
            </div>

            {needsSupportKey ? (
              <div className="rsp-key-wrap">
                <label htmlFor="support-role-key" className="rsp-key-label">
                  {selectedRole === 'therapist' ? 'Therapist key' : 'Trusted person key'}
                </label>
                <input
                  id="support-role-key"
                  className="rsp-key-input"
                  value={supportKey}
                  onChange={(event) => setSupportKey(event.target.value.toUpperCase())}
                  placeholder="Enter your key"
                  autoComplete="off"
                />
                <p className="rsp-key-hint">This key is shared by the new mom. After key check, you will directly enter the support dashboard.</p>
              </div>
            ) : null}

            {error || externalError ? <p className="rsp-error">{error || externalError}</p> : null}

            <div className="rsp-actions">
              {!authMode ? (
                <>
                  <button
                    type="submit"
                    className="rsp-continue-btn"
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Continue'}
                  </button>
                  <button
                    type="button"
                    className="rsp-skip-btn"
                    onClick={() => navigate('/dashboard')}
                  >
                    Set up later
                  </button>
                </>
              ) : (
                <div className="rsp-google-wrap">
                  <GoogleButton onCredential={handleRoleCredential} disabled={loading} />
                </div>
              )}
            </div>
          </form>
        )}
      </div>
    </main>
  );
}

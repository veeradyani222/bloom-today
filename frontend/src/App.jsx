import { useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { apiRequest } from './lib/api';
import './index.css';

// Constants
import { SESSION_KEY, getPostLoginRoute } from './constants/index';

// Pages
import { LandingPage } from './pages/LandingPage';
import { RoleSelectionPage } from './pages/RoleSelectionPage/RoleSelectionPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { BrowseDetailPage, BrowsePage } from './pages/BrowsePage';
import { OverviewPage } from './pages/OverviewPage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';
import { CompanionSetupPage, YouPage } from './pages/YouPage';
import { MyClientsPage } from './pages/MyClientsPage';
import { VoiceCallPage } from './pages/VoiceCallPage';
import { VideoCallPage } from './pages/VideoCallPage';

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(session) {
  if (!session) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function ProtectedRoute({ session, children, allowedRoles = ['mom', 'therapist', 'trusted'] }) {
  if (!session?.accessToken) {
    return <Navigate to="/" replace />;
  }
  const role = session?.user?.auth_role || 'mom';
  if (!allowedRoles.includes(role)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

function SessionLandingGate({ session, sessionReady, onGoogleSignIn, loading, error }) {
  if (!session?.accessToken) {
    return <LandingPage onGoogleSignIn={onGoogleSignIn} loading={loading} error={error} />;
  }

  if (!sessionReady) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-[3px] border-rose-200 border-t-rose-500 animate-spin-slow" />
          <p className="text-neutral-500 text-sm">Restoring your session…</p>
        </div>
      </main>
    );
  }

  return <Navigate to={getPostLoginRoute(session.user)} replace />;
}

function App() {
  const navigate = useNavigate();
  const [session, setSession] = useState(() => loadSession());
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [sessionReady, setSessionReady] = useState(false);

  const token = useMemo(() => session?.accessToken || '', [session]);

  useEffect(() => {
    if (!token) {
      setSessionReady(true);
      return;
    }

    setSessionReady(false);
    apiRequest('/api/me', { token })
      .then((data) => {
        setSession((prev) => {
          const updated = { ...prev, user: data.user, actor: data.actor || prev?.actor || null };
          saveSession(updated);
          return updated;
        });
      })
      .catch(() => {
        setSession(null);
        saveSession(null);
        setAuthError('Your session expired. Choose how you want to continue.');
        navigate('/role-login', { replace: true });
      })
      .finally(() => {
        setSessionReady(true);
      });
  }, [token, navigate]);

  async function handleGoogleSignIn(credential) {
    setAuthLoading(true);
    setAuthError('');

    try {
      const data = await apiRequest('/api/auth/google', {
        method: 'POST',
        body: { credential },
      });

      const nextSession = {
        accessToken: data.accessToken,
        user: data.user,
        actor: data.actor || null,
      };
      setSession(nextSession);
      saveSession(nextSession);
      navigate(getPostLoginRoute(data.user));
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleRoleGoogleSignIn({ credential, role, supportKey }) {
    setAuthLoading(true);
    setAuthError('');

    try {
      const data = await apiRequest('/api/auth/google-role', {
        method: 'POST',
        body: {
          credential,
          role,
          supportKey: supportKey || undefined,
        },
      });

      const nextSession = {
        accessToken: data.accessToken,
        user: data.user,
        actor: data.actor || null,
      };
      setSession(nextSession);
      saveSession(nextSession);
      return data.user;
    } catch (error) {
      setAuthError(error.message);
      return null;
    } finally {
      setAuthLoading(false);
    }
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          <SessionLandingGate
            session={session}
            sessionReady={sessionReady}
            onGoogleSignIn={handleGoogleSignIn}
            loading={authLoading}
            error={authError}
          />
        }
      />
      <Route
        path="/choose-role"
        element={
          <ProtectedRoute session={session} allowedRoles={['mom']}>
            <RoleSelectionPage
              token={token}
              session={session}
              setSession={setSession}
              saveSession={saveSession}
            />
          </ProtectedRoute>
        }
      />
      <Route
        path="/role-login"
        element={
          <RoleSelectionPage
            authMode
            loading={authLoading}
            error={authError}
            onRoleGoogleSignIn={handleRoleGoogleSignIn}
          />
        }
      />
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute session={session} allowedRoles={['mom']}>
            <OnboardingPage
              token={token}
              session={session}
              setSession={setSession}
              saveSession={saveSession}
            />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute session={session}>
            <OverviewPage
              token={token}
              session={session}
            />
          </ProtectedRoute>
        }
      />
      <Route
        path="/my-clients"
        element={
          <ProtectedRoute session={session} allowedRoles={['therapist', 'trusted']}>
            <MyClientsPage
              token={token}
              session={session}
              setSession={setSession}
              saveSession={saveSession}
            />
          </ProtectedRoute>
        }
      />
      <Route
        path="/browse"
        element={
          <ProtectedRoute session={session} allowedRoles={['mom']}>
            <BrowsePage
              token={token}
              session={session}
            />
          </ProtectedRoute>
        }
      />
      <Route
        path="/browse/:slug"
        element={
          <ProtectedRoute session={session} allowedRoles={['mom']}>
            <BrowseDetailPage
              token={token}
              session={session}
            />
          </ProtectedRoute>
        }
      />
      <Route
        path="/call"
        element={
          <ProtectedRoute session={session} allowedRoles={['mom']}>
            <VoiceCallPage
              token={token}
              session={session}
            />
          </ProtectedRoute>
        }
      />
      <Route
        path="/video-call"
        element={
          <ProtectedRoute session={session} allowedRoles={['mom']}>
            <VideoCallPage
              token={token}
              session={session}
            />
          </ProtectedRoute>
        }
      />
      <Route
        path="/you"
        element={
          <ProtectedRoute session={session}>
            <YouPage
              token={token}
              session={session}
              setSession={setSession}
              saveSession={saveSession}
            />
          </ProtectedRoute>
        }
      />
      <Route
        path="/you/companion"
        element={
          <ProtectedRoute session={session} allowedRoles={['mom']}>
            <CompanionSetupPage
              token={token}
              session={session}
              setSession={setSession}
              saveSession={saveSession}
            />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute session={session} allowedRoles={['mom', 'therapist', 'trusted']}>
            <ProfilePage
              token={token}
              session={session}
              setSession={setSession}
              saveSession={saveSession}
            />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute session={session} allowedRoles={['mom']}>
            <SettingsPage
              session={session}
              setSession={setSession}
              saveSession={saveSession}
            />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;

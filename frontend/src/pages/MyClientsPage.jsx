import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, User, Clock, Shield, Heart } from 'lucide-react';
import { Navbar } from './DashboardPage';
import { apiRequest } from '../lib/api';
import './MyClientsPage.css';

function formatRelativeTime(dateString) {
  if (!dateString) return 'No activity yet';
  const date = new Date(dateString);
  const now = new Date();
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return `${Math.floor(diffDays / 30)} months ago`;
}

export function MyClientsPage({ token, session, setSession, saveSession }) {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  const role = session?.user?.auth_role;
  const isTherapist = role === 'therapist';

  useEffect(() => {
    let cancelled = false;
    async function fetchClients() {
      try {
        const data = await apiRequest('/api/me/clients', { token });
        if (!cancelled) {
          setClients(data.clients || []);
        }
      } catch (err) {
        if (!cancelled) {
          setError('Could not load your connections right now.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    fetchClients();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSwitchClient(targetUserId) {
    if (targetUserId === session?.user?.id) {
      navigate('/dashboard'); // Already there
      return;
    }

    try {
      const data = await apiRequest('/api/auth/switch-client', {
        method: 'POST',
        token,
        body: { targetUserId },
      });

      const updatedSession = {
        ...session,
        accessToken: data.accessToken,
        user: { ...data.user, auth_role: role },
      };
      
      setSession(updatedSession);
      saveSession(updatedSession);
      navigate('/dashboard');
    } catch (err) {
      alert(err.message || 'Could not switch client.');
    }
  }

  async function handleAddClient(e) {
    e.preventDefault();
    if (!newKey.trim()) return;

    setAdding(true);
    setAddError('');

    try {
      await apiRequest('/api/me/clients/add', {
        method: 'POST',
        token,
        body: { key: newKey.trim().toUpperCase() },
      });
      
      // Reload clients
      const data = await apiRequest('/api/me/clients', { token });
      setClients(data.clients || []);
      setShowAddModal(false);
      setNewKey('');
    } catch (err) {
      setAddError(err.message || 'Could not connect. Check the key and try again.');
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="dash my-clients-page">
      <Navbar role={role} />
      <main className="dash-main">
        <section className="my-clients-header">
          <div>
            <h1>{isTherapist ? 'My Patients' : 'People I Support'}</h1>
            <p>Select someone to view their dashboard and insights.</p>
          </div>
          <button className="my-clients-add-btn" onClick={() => setShowAddModal(true)}>
            <Plus size={18} />
            <span>{isTherapist ? 'Add patient' : 'Add person'}</span>
          </button>
        </section>

        {loading ? (
          <div className="my-clients-loading">Loading connections...</div>
        ) : error ? (
          <div className="my-clients-error">{error}</div>
        ) : clients.length === 0 ? (
          <div className="my-clients-empty">
            {isTherapist ? <Shield size={48} /> : <Heart size={48} />}
            <h2>No connections yet</h2>
            <p>To view someone's dashboard, ask them to share their connection key with you.</p>
            <button onClick={() => setShowAddModal(true)}>Connect using a key</button>
          </div>
        ) : (
          <div className="my-clients-grid">
            {clients.map(client => {
              const isActive = client.id === session?.user?.id;
              return (
                <button 
                  key={client.id} 
                  className={`my-client-card ${isActive ? 'is-active' : ''}`}
                  onClick={() => handleSwitchClient(client.id)}
                >
                  <div className="my-client-card-top">
                    <div className="my-client-avatar">
                      {client.avatar_url ? (
                        <img src={client.avatar_url} alt="" />
                      ) : (
                        <User size={24} />
                      )}
                    </div>
                    {isActive && <span className="my-client-badge">Current</span>}
                  </div>
                  <h3>{client.full_name || 'Anonymous Mom'}</h3>
                  <div className="my-client-meta">
                    <Clock size={14} />
                    <span>Last session: {formatRelativeTime(client.last_activity)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {showAddModal && (
          <div className="my-clients-modal-overlay" onClick={() => setShowAddModal(false)}>
            <div className="my-clients-modal" onClick={e => e.stopPropagation()}>
              <h2>{isTherapist ? 'Connect new patient' : 'Connect new person'}</h2>
              <p>Enter the {isTherapist ? 'therapist' : 'trusted person'} key shared with you by the mom.</p>
              <form onSubmit={handleAddClient}>
                <input
                  type="text"
                  value={newKey}
                  onChange={e => setNewKey(e.target.value.toUpperCase())}
                  placeholder="e.g. ABCD-1234"
                  autoFocus
                  autoComplete="off"
                />
                {addError && <p className="my-clients-modal-error">{addError}</p>}
                <div className="my-clients-modal-actions">
                  <button type="button" className="btn-cancel" onClick={() => setShowAddModal(false)}>Cancel</button>
                  <button type="submit" className="btn-submit" disabled={adding || !newKey.trim()}>
                    {adding ? 'Connecting...' : 'Connect'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

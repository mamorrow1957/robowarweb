import React, { useState, useEffect } from 'react';
import { apiFetch } from '../auth.js';

export default function AdminPanel({ navigate }) {
  const [users, setUsers]         = useState([]);
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(true);
  const [resetPw, setResetPw]     = useState({});
  const [editEmail, setEditEmail] = useState({});
  const [msg, setMsg]             = useState('');
  const [robotsFor, setRobotsFor] = useState(null);
  const [robots, setRobots]       = useState([]);
  const [robotsLoading, setRobotsLoading] = useState(false);
  const [robotsError, setRobotsError]     = useState(null);

  async function loadUsers() {
    setLoading(true);
    try {
      setUsers(await apiFetch('/api/admin/users'));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadUsers(); }, []);

  function flash(m) { setMsg(m); setTimeout(() => setMsg(''), 3000); }

  async function ban(id)    { await apiFetch(`/api/admin/users/${id}/ban`,    { method: 'POST' }); loadUsers(); }
  async function unban(id)  { await apiFetch(`/api/admin/users/${id}/unban`,  { method: 'POST' }); loadUsers(); }
  async function unlock(id) { await apiFetch(`/api/admin/users/${id}/unlock`, { method: 'POST' }); loadUsers(); }
  async function verifyEmail(id) {
    try {
      await apiFetch(`/api/admin/users/${id}/verify-email`, { method: 'POST' });
      flash('Email verified.');
      loadUsers();
    } catch (err) {
      flash(err.message || 'Failed to verify email.');
    }
  }
  async function del(id) {
    if (!confirm('Delete this user and all their robots?')) return;
    await apiFetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    if (robotsFor === id) setRobotsFor(null);
    loadUsers();
  }
  async function resetUserPw(id) {
    const pw = resetPw[id] || '';
    if (pw.length < 6) { flash('Password must be at least 6 characters'); return; }
    await apiFetch(`/api/admin/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ newPassword: pw }),
    });
    setResetPw(p => ({ ...p, [id]: '' }));
    flash('Password reset.');
  }
  async function saveEmail(id) {
    const email = editEmail[id] || '';
    try {
      await apiFetch(`/api/admin/users/${id}/update-email`, {
        method: 'POST',
        body: JSON.stringify({ email: email || null }),
      });
      setEditEmail(e => ({ ...e, [id]: '' }));
      flash('Email updated.');
      loadUsers();
    } catch (err) {
      flash(err.message);
    }
  }

  async function toggleRobots(userId) {
    if (robotsFor === userId) { setRobotsFor(null); setRobotsError(null); return; }
    setRobotsFor(userId);
    setRobotsError(null);
    setRobotsLoading(true);
    try {
      setRobots(await apiFetch(`/api/admin/users/${userId}/robots`));
    } catch (err) {
      setRobots([]);
      setRobotsError(err.message || 'Failed to load robots.');
    } finally {
      setRobotsLoading(false);
    }
  }

  async function deleteRobot(robotId, userId) {
    if (!confirm('Delete this robot?')) return;
    await apiFetch(`/api/admin/robots/${robotId}/user/${userId}`, { method: 'DELETE' });
    setRobots(await apiFetch(`/api/admin/users/${userId}/robots`));
    flash('Robot deleted.');
  }

  return (
    <div className="admin-panel">
      <h2>Admin Panel</h2>
      {error && <div className="auth-error">{error}</div>}
      {msg   && <div className="admin-msg">{msg}</div>}
      {loading ? (
        <p>Loading users…</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Email</th>
              <th>Verified</th>
              <th>Joined</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <React.Fragment key={u.id}>
                <tr className={u.is_locked ? 'admin-row-locked' : u.is_banned ? 'admin-row-banned' : ''}>
                  <td>{u.username}{u.is_admin ? ' 👑' : ''}</td>
                  <td>{u.email || <span style={{opacity:0.4}}>none</span>}</td>
                  <td>
                    {!u.email ? <span style={{opacity:0.4}}>—</span>
                      : u.email_verified ? <span style={{color:'var(--green)'}}>✓</span>
                      : <span style={{color:'var(--red)'}}>✗</span>}
                  </td>
                  <td>{u.created_at?.slice(0, 10)}</td>
                  <td>{u.is_locked ? `Locked (${u.login_attempts} attempts)` : u.is_banned ? 'Banned' : 'Active'}</td>
                  <td className="admin-actions">
                    {!u.is_admin && (
                      <>
                        {u.is_locked && <button onClick={() => unlock(u.id)}>Unlock</button>}
                        {u.is_banned
                          ? <button onClick={() => unban(u.id)}>Unban</button>
                          : <button onClick={() => ban(u.id)}>Ban</button>
                        }
                        {u.email && !u.email_verified && (
                          <button onClick={() => verifyEmail(u.id)}>Verify Email</button>
                        )}
                        <button className="admin-delete" onClick={() => del(u.id)}>Delete</button>
                      </>
                    )}
                    <button onClick={() => toggleRobots(u.id)}>
                      {robotsFor === u.id ? 'Hide Robots' : 'Robots'}
                    </button>
                    <div className="admin-reset-pw">
                      <input
                        type="password"
                        placeholder="New password"
                        value={resetPw[u.id] || ''}
                        onChange={e => setResetPw(p => ({ ...p, [u.id]: e.target.value }))}
                      />
                      <button onClick={() => resetUserPw(u.id)}>Reset PW</button>
                    </div>
                    <div className="admin-reset-pw">
                      <input
                        type="email"
                        placeholder={u.email || 'Set email'}
                        value={editEmail[u.id] || ''}
                        onChange={e => setEditEmail(p => ({ ...p, [u.id]: e.target.value }))}
                      />
                      <button onClick={() => saveEmail(u.id)}>Set Email</button>
                    </div>
                  </td>
                </tr>
                {robotsFor === u.id && (
                  <tr>
                    <td colSpan={6} style={{ padding: '0 0 12px 24px', background: 'var(--surface)' }}>
                      {robotsLoading ? (
                        <p style={{ color: 'var(--text-dim)', margin: '8px 0' }}>Loading robots…</p>
                      ) : robotsError ? (
                        <p style={{ color: 'var(--red)', margin: '8px 0' }}>{robotsError}</p>
                      ) : robots.length === 0 ? (
                        <p style={{ color: 'var(--text-dim)', margin: '8px 0' }}>No robots.</p>
                      ) : (
                        <table className="admin-table" style={{ marginTop: 8 }}>
                          <thead>
                            <tr><th>Name</th><th>Shared</th><th>Actions</th></tr>
                          </thead>
                          <tbody>
                            {robots.map(r => (
                              <tr key={r.id}>
                                <td>{r.name}</td>
                                <td>{r.is_public ? 'Yes' : 'No'}</td>
                                <td><button className="admin-delete" onClick={() => deleteRobot(r.id, u.id)}>Delete</button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}
      <button className="auth-switch" onClick={() => navigate('robots')}>← Back</button>
    </div>
  );
}

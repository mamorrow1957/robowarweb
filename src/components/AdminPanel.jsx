import React, { useState, useEffect } from 'react';
import { apiFetch } from '../auth.js';

export default function AdminPanel({ navigate }) {
  const [users, setUsers]     = useState([]);
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(true);
  const [resetPw, setResetPw] = useState({});
  const [editEmail, setEditEmail] = useState({});
  const [msg, setMsg]         = useState('');

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

  async function ban(id)   { await apiFetch(`/api/admin/users/${id}/ban`,   { method: 'POST' }); loadUsers(); }
  async function unban(id) { await apiFetch(`/api/admin/users/${id}/unban`, { method: 'POST' }); loadUsers(); }
  async function del(id)   {
    if (!confirm('Delete this user and all their robots?')) return;
    await apiFetch(`/api/admin/users/${id}`, { method: 'DELETE' });
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
              <th>Joined</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className={u.is_banned ? 'admin-row-banned' : ''}>
                <td>{u.username}{u.is_admin ? ' 👑' : ''}</td>
                <td>{u.email || <span style={{opacity:0.4}}>none</span>}</td>
                <td>{u.created_at?.slice(0, 10)}</td>
                <td>{u.is_banned ? 'Banned' : 'Active'}</td>
                <td className="admin-actions">
                  {!u.is_admin && (
                    <>
                      {u.is_banned
                        ? <button onClick={() => unban(u.id)}>Unban</button>
                        : <button onClick={() => ban(u.id)}>Ban</button>
                      }
                      <button className="admin-delete" onClick={() => del(u.id)}>Delete</button>
                    </>
                  )}
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
            ))}
          </tbody>
        </table>
      )}
      <button className="auth-switch" onClick={() => navigate('robots')}>← Back</button>
    </div>
  );
}

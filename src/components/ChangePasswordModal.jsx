import React, { useState } from 'react';
import { changePassword, isAdmin } from '../auth.js';

export default function ChangePasswordModal({ onClose, isFirstLogin }) {
  const [current, setCurrent]   = useState('');
  const [next, setNext]         = useState('');
  const [confirm, setConfirm]   = useState('');
  const [error, setError]       = useState('');
  const [done, setDone]         = useState(false);
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (next !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true);
    try {
      await changePassword(current, next);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="auth-overlay">
        <div className="auth-modal">
          <h2>Password Changed</h2>
          <p>Your password has been updated successfully.</p>
          <button className="auth-submit" onClick={onClose}>Continue</button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-overlay">
      <div className="auth-modal">
        <h2>{isFirstLogin ? 'Set Admin Password' : 'Change Password'}</h2>
        {isFirstLogin && (
          <p className="auth-info">Welcome, admin! Please set a password before continuing.</p>
        )}
        <form onSubmit={handleSubmit}>
          {!isFirstLogin && (
            <label>
              Current Password
              <input
                type="password"
                value={current}
                onChange={e => setCurrent(e.target.value)}
                required
                autoFocus
              />
            </label>
          )}
          <label>
            New Password
            <input
              type="password"
              value={next}
              onChange={e => setNext(e.target.value)}
              required
              autoFocus={isFirstLogin}
              minLength={6}
            />
          </label>
          <label>
            Confirm New Password
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
            />
          </label>
          {error && <div className="auth-error">{error}</div>}
          <button type="submit" disabled={loading} className="auth-submit">
            {loading ? 'Saving…' : 'Set Password'}
          </button>
        </form>
        {!isFirstLogin && (
          <button className="auth-switch" onClick={onClose}>Cancel</button>
        )}
      </div>
    </div>
  );
}

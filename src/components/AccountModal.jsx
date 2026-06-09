import React, { useState } from 'react';
import { changePassword, updateEmail, isAdmin, hasEmail } from '../auth.js';

export default function AccountModal({ onClose, isFirstLogin }) {
  const [tab, setTab]           = useState(isFirstLogin ? 'password' : 'email');
  const [email, setEmail]       = useState('');
  const [emailMsg, setEmailMsg] = useState('');
  const [emailErr, setEmailErr] = useState('');
  const [current, setCurrent]   = useState('');
  const [next, setNext]         = useState('');
  const [confirm, setConfirm]   = useState('');
  const [pwMsg, setPwMsg]       = useState('');
  const [pwErr, setPwErr]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleEmailSubmit(e) {
    e.preventDefault();
    setEmailErr(''); setEmailMsg('');
    setLoading(true);
    try {
      await updateEmail(email);
      setEmailMsg('Email updated.');
      setEmail('');
    } catch (err) {
      setEmailErr(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    setPwErr(''); setPwMsg('');
    if (next !== confirm) { setPwErr('Passwords do not match'); return; }
    setLoading(true);
    try {
      await changePassword(current, next);
      setPwMsg('Password changed successfully.');
      setCurrent(''); setNext(''); setConfirm('');
      if (isFirstLogin) { onClose(); return; }
    } catch (err) {
      setPwErr(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-overlay">
      <div className="auth-modal">
        <h2>{isFirstLogin ? 'Set Admin Password' : 'Account Settings'}</h2>
        {isFirstLogin && (
          <p className="auth-info">Welcome, admin! Please set a password before continuing.</p>
        )}

        {!isFirstLogin && (
          <div className="account-tabs">
            <button
              className={`account-tab${tab === 'email' ? ' active' : ''}`}
              onClick={() => setTab('email')}
            >
              Email
            </button>
            <button
              className={`account-tab${tab === 'password' ? ' active' : ''}`}
              onClick={() => setTab('password')}
            >
              Password
            </button>
          </div>
        )}

        {tab === 'email' && !isFirstLogin && (
          <form onSubmit={handleEmailSubmit}>
            {!hasEmail() && (
              <p className="auth-info">
                ⚠ No email set — you won't be able to recover your password if you forget it.
              </p>
            )}
            <label>
              Email Address
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoFocus
                required
              />
            </label>
            {emailErr && <div className="auth-error">{emailErr}</div>}
            {emailMsg && <div className="auth-success">{emailMsg}</div>}
            <button type="submit" disabled={loading} className="auth-submit">
              {loading ? 'Saving…' : 'Save Email'}
            </button>
          </form>
        )}

        {(tab === 'password' || isFirstLogin) && (
          <form onSubmit={handlePasswordSubmit}>
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
            {pwErr && <div className="auth-error">{pwErr}</div>}
            {pwMsg && <div className="auth-success">{pwMsg}</div>}
            <button type="submit" disabled={loading} className="auth-submit">
              {loading ? 'Saving…' : isFirstLogin ? 'Set Password' : 'Change Password'}
            </button>
          </form>
        )}

        {!isFirstLogin && (
          <button className="auth-switch" onClick={onClose}>Close</button>
        )}
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { login, register, resendVerification, saveSession } from '../auth.js';
import { apiFetch } from '../auth.js';

export default function AuthModal({ onSuccess, onForgotPassword, onNeedSetPassword }) {
  const [mode, setMode]             = useState('login');
  const [username, setUsername]     = useState('');
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [privacyAgreed, setPrivacy] = useState(false);
  const [error, setError]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [pending, setPending]       = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');
  const [resent, setResent]         = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (mode === 'register') {
      if (!email || !email.includes('@')) { setError('A valid email address is required'); return; }
      if (!privacyAgreed) { setError('You must agree to the Privacy Policy to create an account'); return; }
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const data = await apiFetch('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username, password }),
        });
        saveSession(data.token, data.username, data.is_admin, data.has_email);
        if (data.password_set === 0) { onNeedSetPassword(); return; }
        onSuccess();
      } else {
        const data = await register(username, password, email);
        if (data.pending) {
          setPendingEmail(email);
          setPending(true);
        } else {
          onSuccess();
        }
      }
    } catch (err) {
      if (err.message.includes('verify your email')) {
        setPendingEmail('');
        setPending(true);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResent(false);
    await resendVerification(pendingEmail).catch(() => {});
    setResent(true);
  }

  if (pending) {
    return (
      <div className="auth-overlay">
        <div className="auth-modal">
          <h2>Check your email</h2>
          <p style={{ color: 'var(--text-dim)', marginBottom: 16 }}>
            We sent a verification link{pendingEmail ? ` to ${pendingEmail}` : ''}. Click it to activate your account.
          </p>
          {resent && <p style={{ color: 'var(--green)', marginBottom: 12 }}>Verification email resent.</p>}
          <button className="btn" onClick={handleResend} style={{ width: '100%', marginBottom: 8 }}>
            Resend verification email
          </button>
          <button
            className="auth-switch"
            onClick={() => { setPending(false); setMode('login'); }}
          >
            Back to Log In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-overlay">
      <div className="auth-modal">
        <h2>{mode === 'login' ? 'Log In' : 'Create Account'}</h2>
        <form onSubmit={handleSubmit} noValidate>
          <label>
            Username
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoFocus
              required
            />
          </label>
          {mode === 'register' && (
            <label>
              Email address
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </label>
          )}
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </label>
          {mode === 'register' && (
            <label className="auth-privacy-label">
              <input
                type="checkbox"
                className="auth-privacy-agree"
                checked={privacyAgreed}
                onChange={e => setPrivacy(e.target.checked)}
              />
              I agree to the{' '}
              <a href="/privacy-policy.html" target="_blank" rel="noopener">Privacy Policy</a>
            </label>
          )}
          {error && <div className="auth-error">{error}</div>}
          <button type="submit" disabled={loading} className="auth-submit">
            {loading ? 'Please wait…' : mode === 'login' ? 'Log In' : 'Create Account'}
          </button>
        </form>
        {mode === 'login' && onForgotPassword && (
          <button className="auth-forgot" onClick={onForgotPassword}>
            Forgot password?
          </button>
        )}
        <button
          className="auth-switch"
          onClick={() => { setMode(m => m === 'login' ? 'register' : 'login'); setError(''); }}
        >
          {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Log In'}
        </button>
      </div>
    </div>
  );
}

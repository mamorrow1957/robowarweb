import React, { useState } from 'react';
import { forgotPassword, resetPassword } from '../auth.js';

export default function ForgotPasswordModal({ resetToken, onClose }) {
  const [email, setEmail]       = useState('');
  const [newPass, setNewPass]   = useState('');
  const [confirm, setConfirm]   = useState('');
  const [error, setError]       = useState('');
  const [done, setDone]         = useState(false);
  const [loading, setLoading]   = useState(false);

  async function handleRequest(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await forgotPassword(email);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e) {
    e.preventDefault();
    setError('');
    if (newPass !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true);
    try {
      await resetPassword(resetToken, newPass);
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
          <h2>{resetToken ? 'Password Reset' : 'Email Sent'}</h2>
          <p>
            {resetToken
              ? 'Your password has been reset. You can now log in.'
              : 'If an account exists for that email, a reset link has been sent.'}
          </p>
          <button className="auth-submit" onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  if (resetToken) {
    return (
      <div className="auth-overlay">
        <div className="auth-modal">
          <h2>Reset Password</h2>
          <form onSubmit={handleReset}>
            <label>
              New Password
              <input
                type="password"
                value={newPass}
                onChange={e => setNewPass(e.target.value)}
                required
                autoFocus
                minLength={6}
              />
            </label>
            <label>
              Confirm Password
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
              />
            </label>
            {error && <div className="auth-error">{error}</div>}
            <button type="submit" disabled={loading} className="auth-submit">
              {loading ? 'Saving…' : 'Reset Password'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-overlay">
      <div className="auth-modal">
        <h2>Forgot Password</h2>
        <p>Enter your email address and we'll send you a reset link.</p>
        <form onSubmit={handleRequest}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
            />
          </label>
          {error && <div className="auth-error">{error}</div>}
          <button type="submit" disabled={loading} className="auth-submit">
            {loading ? 'Sending…' : 'Send Reset Link'}
          </button>
        </form>
        <button className="auth-switch" onClick={onClose}>Back to Login</button>
      </div>
    </div>
  );
}

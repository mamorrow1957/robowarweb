import React, { useState } from 'react';
import { login, register, saveSession } from '../auth.js';
import { apiFetch } from '../auth.js';

export default function AuthModal({ onSuccess, onForgotPassword, onNeedSetPassword }) {
  const [mode, setMode]         = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let data;
      if (mode === 'login') {
        data = await apiFetch('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username, password }),
        });
        saveSession(data.token, data.username, data.is_admin);
        if (data.password_set === 0) {
          onNeedSetPassword();
          return;
        }
      } else {
        data = await register(username, password);
      }
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-overlay">
      <div className="auth-modal">
        <h2>{mode === 'login' ? 'Log In' : 'Create Account'}</h2>
        <form onSubmit={handleSubmit}>
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
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </label>
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

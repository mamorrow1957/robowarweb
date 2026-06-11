import React, { useState, useEffect } from 'react';
import { apiFetch, saveSession } from '../auth.js';

export default function VerifyEmailModal({ token, onSuccess, onClose }) {
  const [status, setStatus] = useState('verifying'); // 'verifying' | 'success' | 'error'
  const [error, setError]   = useState('');

  useEffect(() => {
    apiFetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(data => {
        saveSession(data.token, data.username, data.is_admin, data.has_email);
        setStatus('success');
        setTimeout(onSuccess, 1500);
      })
      .catch(err => {
        setError(err.message);
        setStatus('error');
      });
  }, [token]);

  return (
    <div className="auth-overlay">
      <div className="auth-modal">
        {status === 'verifying' && (
          <>
            <h2>Verifying…</h2>
            <p style={{ color: 'var(--text-dim)' }}>Checking your verification link.</p>
          </>
        )}
        {status === 'success' && (
          <>
            <h2>Email verified!</h2>
            <p style={{ color: 'var(--green)' }}>Your account is active. Logging you in…</p>
          </>
        )}
        {status === 'error' && (
          <>
            <h2>Verification failed</h2>
            <p style={{ color: 'var(--red)', marginBottom: 16 }}>{error}</p>
            <button className="btn" onClick={onClose}>Back to Log In</button>
          </>
        )}
      </div>
    </div>
  );
}

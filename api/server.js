import express from 'express';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const SITE_URL      = process.env.SITE_URL || 'http://localhost:5173';
const ADMIN_EMAIL   = process.env.ADMIN_EMAIL;
const MAX_LOGIN_ATTEMPTS = 5;
const ALLOWED_ORIGINS = [
  'https://robowar.morroweb.com',
  'http://localhost:5173',
  'http://localhost:4173',
];

// ── Email ────────────────────────────────────────────────────
const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  tls: { rejectUnauthorized: false },
});

// ── DB setup ─────────────────────────────────────────────────
const db = new Database(process.env.DATABASE_PATH || path.join(__dirname, 'robowar.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    username        TEXT UNIQUE NOT NULL,
    email           TEXT,
    password_hash   TEXT,
    is_admin        INTEGER DEFAULT 0,
    is_banned       INTEGER DEFAULT 0,
    password_set    INTEGER DEFAULT 1,
    reset_token     TEXT,
    reset_token_expiry TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS robots (
    id         TEXT NOT NULL,
    user_id    INTEGER NOT NULL,
    name       TEXT NOT NULL,
    hardware   TEXT NOT NULL,
    program    TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (id, user_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS revoked_tokens (
    jti        TEXT PRIMARY KEY,
    expires_at TEXT NOT NULL
  );
`);

// Migrate existing DBs
const cols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
if (!cols.includes('is_admin'))           db.exec("ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0");
if (!cols.includes('is_banned'))          db.exec("ALTER TABLE users ADD COLUMN is_banned INTEGER DEFAULT 0");
if (!cols.includes('password_set'))       db.exec("ALTER TABLE users ADD COLUMN password_set INTEGER DEFAULT 1");
if (!cols.includes('email'))              db.exec("ALTER TABLE users ADD COLUMN email TEXT");
if (!cols.includes('reset_token'))        db.exec("ALTER TABLE users ADD COLUMN reset_token TEXT");
if (!cols.includes('reset_token_expiry')) db.exec("ALTER TABLE users ADD COLUMN reset_token_expiry TEXT");
if (!cols.includes('login_attempts'))     db.exec("ALTER TABLE users ADD COLUMN login_attempts INTEGER DEFAULT 0");
if (!cols.includes('is_locked'))          db.exec("ALTER TABLE users ADD COLUMN is_locked INTEGER DEFAULT 0");
if (!cols.includes('privacy_agreed_at'))  db.exec("ALTER TABLE users ADD COLUMN privacy_agreed_at TEXT");
if (!cols.includes('email_verified')) {
  db.exec("ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0");
  db.exec("ALTER TABLE users ADD COLUMN email_verification_token TEXT");
  db.exec("ALTER TABLE users ADD COLUMN email_verification_expiry TEXT");
  // Grandfather all existing users as verified so they aren't blocked on upgrade
  db.exec("UPDATE users SET email_verified = 1");
}

const robotCols = db.prepare("PRAGMA table_info(robots)").all().map(c => c.name);
if (!robotCols.includes('is_public'))     db.exec("ALTER TABLE robots ADD COLUMN is_public INTEGER DEFAULT 0");
if (!robotCols.includes('share_token'))    db.exec('ALTER TABLE robots ADD COLUMN share_token TEXT');

// Unique index on email (only non-null values)
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL`);

// Seed admin
const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!adminExists) {
  db.prepare(`INSERT INTO users (username, is_admin, password_set, password_hash) VALUES ('admin', 1, 0, '')`).run();
  console.log('Admin account created — set password on first login.');
}

// Clean up expired revoked tokens on startup
db.prepare("DELETE FROM revoked_tokens WHERE expires_at < datetime('now')").run();

// ── Middleware ────────────────────────────────────────────────
app.disable('x-powered-by');

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error('CORS: origin not allowed'));
  },
}));

app.use(express.json());

const IS_TEST = process.env.JWT_SECRET === 'ci-test-secret';
const authLimiter = IS_TEST
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 20,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many attempts, please try again later.' },
    });

// Valid username: 2–32 chars, letters/digits/underscore/hyphen only
const USERNAME_RE = /^[a-zA-Z0-9_-]{2,32}$/;
function validateUsername(username) {
  if (!username || !USERNAME_RE.test(username))
    return 'Username must be 2–32 characters and contain only letters, numbers, _ or -';
  return null;
}

// ── Auth middleware ───────────────────────────────────────────
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // Check revocation list
    if (payload.jti) {
      const revoked = db.prepare('SELECT 1 FROM revoked_tokens WHERE jti = ?').get(payload.jti);
      if (revoked) return res.status(401).json({ error: 'Token has been revoked' });
    }
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function adminOnly(req, res, next) {
  if (!req.user?.is_admin) return res.status(403).json({ error: 'Admin only' });
  next();
}

function issueToken(user) {
  const jti = crypto.randomBytes(16).toString('hex');
  return jwt.sign(
    { id: user.id, username: user.username, is_admin: user.is_admin, jti },
    JWT_SECRET, { expiresIn: '30d' }
  );
}

function userResponse(user, token) {
  return {
    token,
    username: user.username,
    is_admin: user.is_admin,
    password_set: user.password_set,
    has_email: !!user.email,
  };
}

// ── Health ────────────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ ok: true }));

// ── Register ──────────────────────────────────────────────────
app.post('/api/auth/register', authLimiter, async (req, res) => {
  const { username, password, email, privacyAgreed } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const usernameErr = validateUsername(username);
  if (usernameErr) return res.status(400).json({ error: usernameErr });
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'A valid email address is required' });
  if (password.length < 6)    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (password.length > 1000) return res.status(400).json({ error: 'Password too long' });
  if (username.toLowerCase() === 'admin') return res.status(409).json({ error: 'Username not available' });
  if (!privacyAgreed) return res.status(400).json({ error: 'You must agree to the Privacy Policy' });

  const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existingEmail) return res.status(409).json({ error: 'An account with that email already exists' });

  const hash = bcrypt.hashSync(password, 10);

  if (IS_TEST) {
    // In CI: auto-verify so existing tests continue to work without email
    try {
      const result = db.prepare(
        'INSERT INTO users (username, email, password_hash, email_verified, privacy_agreed_at) VALUES (?, ?, ?, 1, datetime(\'now\'))'
      ).run(username, email, hash);
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
      return res.json(userResponse(user, issueToken(user)));
    } catch {
      return res.status(409).json({ error: 'Username already taken' });
    }
  }

  const verifyToken = crypto.randomBytes(32).toString('hex');
  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  try {
    db.prepare(
      'INSERT INTO users (username, email, password_hash, email_verified, email_verification_token, email_verification_expiry, privacy_agreed_at) VALUES (?, ?, ?, 0, ?, ?, datetime(\'now\'))'
    ).run(username, email, hash, verifyToken, expiry);
  } catch {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const verifyUrl = `${SITE_URL}/#verify=${verifyToken}`;
  mailer.sendMail({
    from: `"RoboWar" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Verify your RoboWar account',
    html: `<p>Welcome to RoboWar! Click the link below to verify your email address and activate your account:</p>
           <p><a href="${verifyUrl}">${verifyUrl}</a></p>
           <p>This link expires in 24 hours. If you did not create this account, you can ignore this email.</p>`,
  }).catch(err => console.error('Verification email error:', err));

  res.json({ pending: true, message: 'Check your email to verify your account.' });
});

// ── Login ─────────────────────────────────────────────────────
app.post('/api/auth/login', authLimiter, async (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return res.status(401).json({ error: 'Invalid username or password' });
  if (user.is_banned) return res.status(403).json({ error: 'Your account has been banned.' });
  if (!user.is_admin && !user.email_verified) return res.status(403).json({ error: 'Please verify your email address before logging in. Check your inbox for a verification link.', unverified: true });

  // Admin accounts are never locked out (would create an unrecoverable situation)
  if (!user.is_admin) {
    if (user.is_locked) return res.status(403).json({ error: 'Account locked due to too many failed login attempts. Please contact an administrator.' });
  }

  // Admin first-login (no password set yet) — skip attempt tracking
  if (user.is_admin && !user.password_set) {
    return res.json(userResponse(user, issueToken(user)));
  }

  if (!bcrypt.compareSync(password, user.password_hash)) {
    const attempts = (user.login_attempts || 0) + 1;
    db.prepare('UPDATE users SET login_attempts = ? WHERE id = ?').run(attempts, user.id);

    if (user.is_admin) {
      // Admin is never locked, but after threshold send a reset-link alert and reset counter
      if (attempts >= MAX_LOGIN_ATTEMPTS) {
        db.prepare('UPDATE users SET login_attempts = 0 WHERE id = ?').run(user.id);
        const adminEmail = ADMIN_EMAIL || user.email;
        if (adminEmail && !IS_TEST) {
          const token = crypto.randomBytes(32).toString('hex');
          const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
          db.prepare('UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?')
            .run(token, expiry, user.id);
          const resetUrl = `${SITE_URL}/#reset=${token}`;
          mailer.sendMail({
            from: `"RoboWar" <${process.env.SMTP_USER}>`,
            to: adminEmail,
            subject: 'RoboWar — Suspicious Admin Login Activity',
            html: `<p>There have been ${attempts} consecutive failed login attempts on the <strong>admin</strong> account.</p>
                   <p>The account has <strong>not</strong> been locked, but if you've forgotten your password you can reset it:</p>
                   <p><a href="${resetUrl}">${resetUrl}</a></p>
                   <p>This link expires in 1 hour. If you did not attempt to log in, someone may be trying to access your account.</p>`,
          }).catch(err => console.error('Admin alert email error:', err));
        }
      }
    } else {
      // Lock non-admin accounts after threshold
      if (attempts >= MAX_LOGIN_ATTEMPTS) {
        db.prepare('UPDATE users SET is_locked = 1 WHERE id = ?').run(user.id);
        const adminEmail = ADMIN_EMAIL || db.prepare("SELECT email FROM users WHERE is_admin = 1 LIMIT 1").get()?.email;
        if (adminEmail && !IS_TEST) {
          mailer.sendMail({
            from: `"RoboWar" <${process.env.SMTP_USER}>`,
            to: adminEmail,
            subject: 'RoboWar — Account Locked',
            html: `<p>The account <strong>${user.username}</strong> has been locked after ${attempts} failed login attempts.</p>
                   <p>Log in to the admin panel to unlock it: <a href="${SITE_URL}">${SITE_URL}</a></p>`,
          }).catch(err => console.error('Admin notify email error:', err));
        }
        return res.status(403).json({ error: 'Account locked due to too many failed login attempts. Please contact an administrator.' });
      }
    }

    return res.status(401).json({ error: 'Invalid username or password' });
  }

  // Successful login — reset attempt counter
  db.prepare('UPDATE users SET login_attempts = 0 WHERE id = ?').run(user.id);
  res.json(userResponse(user, issueToken(user)));
});

// ── Logout ────────────────────────────────────────────────────
app.post('/api/auth/logout', auth, (req, res) => {
  if (req.user.jti) {
    const expiry = new Date(req.user.exp * 1000).toISOString();
    db.prepare('INSERT OR IGNORE INTO revoked_tokens (jti, expires_at) VALUES (?, ?)').run(req.user.jti, expiry);
    // Clean up expired entries occasionally
    db.prepare("DELETE FROM revoked_tokens WHERE expires_at < datetime('now')").run();
  }
  res.json({ ok: true });
});

// ── Change password ───────────────────────────────────────────
app.post('/api/auth/change-password', auth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6)
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  if (newPassword.length > 1000) return res.status(400).json({ error: 'Password too long' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!(user.is_admin && !user.password_set)) {
    if (!currentPassword || !bcrypt.compareSync(currentPassword, user.password_hash))
      return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ?, password_set = 1 WHERE id = ?').run(hash, user.id);
  res.json({ ok: true });
});

// ── Forgot password ───────────────────────────────────────────
app.post('/api/auth/forgot-password', authLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.json({ ok: true }); // prevent enumeration

  const token = crypto.randomBytes(32).toString('hex');
  const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  db.prepare('UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?').run(token, expiry, user.id);

  // Use hash fragment so token never appears in server logs or referrer headers
  const resetUrl = `${SITE_URL}/#reset=${token}`;
  try {
    await mailer.sendMail({
      from: `"RoboWar" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'RoboWar — Password Reset',
      html: `
        <p>Hi ${user.username},</p>
        <p>Click the link below to reset your password. This link expires in 1 hour.</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>If you didn't request this, ignore this email.</p>
      `,
    });
  } catch (err) {
    console.error('Email error:', err);
  }

  res.json({ ok: true });
});

// ── Reset password via token ──────────────────────────────────
app.post('/api/auth/reset-password', (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password required' });
  if (newPassword.length < 6)    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (newPassword.length > 1000) return res.status(400).json({ error: 'Password too long' });

  const user = db.prepare('SELECT * FROM users WHERE reset_token = ?').get(token);
  if (!user || !user.reset_token_expiry || new Date(user.reset_token_expiry) < new Date())
    return res.status(400).json({ error: 'Reset link is invalid or has expired' });

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ?, password_set = 1, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?')
    .run(hash, user.id);
  res.json({ ok: true });
});

// ── Update email ──────────────────────────────────────────────
app.post('/api/auth/update-email', auth, (req, res) => {
  const { email } = req.body;
  if (email) {
    const existing = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, req.user.id);
    if (existing) return res.status(409).json({ error: 'An account with that email already exists' });
  }
  db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email || null, req.user.id);
  res.json({ ok: true });
});

// ── Email verification ────────────────────────────────────────
app.get('/api/auth/verify-email', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Verification token required' });
  const user = db.prepare('SELECT * FROM users WHERE email_verification_token = ?').get(token);
  if (!user) return res.status(400).json({ error: 'Invalid or already-used verification link' });
  if (new Date(user.email_verification_expiry) < new Date()) {
    return res.status(400).json({ error: 'Verification link has expired. Please request a new one.' });
  }
  db.prepare('UPDATE users SET email_verified = 1, email_verification_token = NULL, email_verification_expiry = NULL WHERE id = ?').run(user.id);
  const freshUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  res.json(userResponse(freshUser, issueToken(freshUser)));
});

app.post('/api/auth/resend-verification', authLimiter, async (req, res) => {
  const { email } = req.body;
  const user = email ? db.prepare('SELECT * FROM users WHERE email = ?').get(email) : null;
  // Always return ok to avoid email enumeration
  if (!user || user.email_verified) return res.json({ ok: true });
  const token = crypto.randomBytes(32).toString('hex');
  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  db.prepare('UPDATE users SET email_verification_token = ?, email_verification_expiry = ? WHERE id = ?').run(token, expiry, user.id);
  if (!IS_TEST) {
    const verifyUrl = `${SITE_URL}/#verify=${token}`;
    mailer.sendMail({
      from: `"RoboWar" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Verify your RoboWar account',
      html: `<p>Click the link below to verify your RoboWar email address:</p>
             <p><a href="${verifyUrl}">${verifyUrl}</a></p>
             <p>This link expires in 24 hours.</p>`,
    }).catch(err => console.error('Resend verification email error:', err));
  }
  res.json({ ok: true });
});

// ── Robots ────────────────────────────────────────────────────
app.get('/api/robots', auth, (req, res) => {
  const robots = db.prepare('SELECT * FROM robots WHERE user_id = ?').all(req.user.id);
  res.json(robots.map(r => ({ ...r, hardware: JSON.parse(r.hardware) })));
});

app.get('/api/robots/shared/:id', auth, (req, res) => {
  const robot = db.prepare(
    'SELECT r.*, u.username AS owner FROM robots r JOIN users u ON r.user_id = u.id WHERE r.id = ? AND r.is_public = 1 LIMIT 1'
  ).get(req.params.id);
  if (!robot) return res.status(404).json({ error: 'Robot not found or not shared' });
  res.json({ ...robot, hardware: JSON.parse(robot.hardware) });
});

app.post('/api/robots/:id/share', auth, (req, res) => {
  const result = db.prepare('UPDATE robots SET is_public = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Robot not found' });
  res.json({ ok: true });
});

app.delete('/api/robots/:id/share', auth, (req, res) => {
  db.prepare('UPDATE robots SET is_public = 0 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

app.put('/api/robots/:id', auth, (req, res) => {
  const { name, hardware, program } = req.body;
  db.prepare(`
    INSERT INTO robots (id, user_id, name, hardware, program, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id, user_id) DO UPDATE SET
      name=excluded.name, hardware=excluded.hardware,
      program=excluded.program, updated_at=excluded.updated_at
  `).run(req.params.id, req.user.id, name, JSON.stringify(hardware), program);
  res.json({ ok: true });
});

app.delete('/api/robots/:id', auth, (req, res) => {
  db.prepare('DELETE FROM robots WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// ── Admin: list users ─────────────────────────────────────────
app.get('/api/admin/users', auth, adminOnly, (req, res) => {
  const users = db.prepare(
    'SELECT id, username, email, email_verified, is_admin, is_banned, is_locked, login_attempts, password_set, created_at FROM users ORDER BY created_at DESC'
  ).all();
  res.json(users);
});

app.post('/api/admin/users/:id/ban', auth, adminOnly, (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.is_admin) return res.status(400).json({ error: 'Cannot ban admin' });
  db.prepare('UPDATE users SET is_banned = 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/admin/users/:id/unban', auth, adminOnly, (req, res) => {
  db.prepare('UPDATE users SET is_banned = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/admin/users/:id/unlock', auth, adminOnly, (req, res) => {
  db.prepare('UPDATE users SET is_locked = 0, login_attempts = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/admin/users/:id/reset-password', auth, adminOnly, (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ?, password_set = 1 WHERE id = ?').run(hash, req.params.id);
  res.json({ ok: true });
});

app.post('/api/admin/users/:id/update-email', auth, adminOnly, (req, res) => {
  const { email } = req.body;
  if (email) {
    const existing = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, req.params.id);
    if (existing) return res.status(409).json({ error: 'An account with that email already exists' });
  }
  db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email || null, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/admin/users/:id', auth, adminOnly, (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.is_admin) return res.status(400).json({ error: 'Cannot delete admin' });
  db.prepare('DELETE FROM robots WHERE user_id = ?').run(req.params.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Admin: verify email ───────────────────────────────────────
app.post('/api/admin/users/:id/verify-email', auth, adminOnly, (req, res) => {
  db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Self-serve account deletion ───────────────────────────────
app.delete('/api/auth/account', auth, async (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.is_admin) return res.status(400).json({ error: 'Admin account cannot be self-deleted' });
  const { password } = req.body;
  if (!password || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'Incorrect password' });
  db.prepare('DELETE FROM robots WHERE user_id = ?').run(user.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  res.json({ ok: true });
});

// ── Admin: robot management ───────────────────────────────────
app.get('/api/admin/users/:id/robots', auth, adminOnly, (req, res) => {
  const robots = db.prepare('SELECT * FROM robots WHERE user_id = ?').all(req.params.id);
  res.json(robots.map(r => {
    let hardware = r.hardware;
    try { hardware = JSON.parse(r.hardware); } catch { /* leave as raw string */ }
    return { ...r, hardware };
  }));
});

app.delete('/api/admin/robots/:robotId/user/:userId', auth, adminOnly, (req, res) => {
  db.prepare('DELETE FROM robots WHERE id = ? AND user_id = ?').run(req.params.robotId, req.params.userId);
  res.json({ ok: true });
});

// ── Test-only cleanup (disabled in production) ────────────────
if (IS_TEST) {
  app.delete('/api/test/cleanup', (req, res) => {
    db.prepare('DELETE FROM robots WHERE user_id IN (SELECT id FROM users WHERE is_admin = 0)').run();
    db.prepare('DELETE FROM users WHERE is_admin = 0').run();
    res.json({ ok: true });
  });
}

// ── Error handler ─────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  const safe = status < 500 ? err.message : 'Internal server error';
  res.status(status).json({ error: safe });
});

app.listen(PORT, () => console.log(`RoboWar API running on port ${PORT}`));


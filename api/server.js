import express from 'express';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const SITE_URL   = process.env.SITE_URL || 'http://localhost:5173';

// ── Email ────────────────────────────────────────────────────
const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  tls: { rejectUnauthorized: false },
});

// ── DB setup ─────────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'robowar.db'));
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
`);

// Migrate existing DBs before any queries that use new columns
const cols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
if (!cols.includes('is_admin'))           db.exec("ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0");
if (!cols.includes('is_banned'))          db.exec("ALTER TABLE users ADD COLUMN is_banned INTEGER DEFAULT 0");
if (!cols.includes('password_set'))       db.exec("ALTER TABLE users ADD COLUMN password_set INTEGER DEFAULT 1");
if (!cols.includes('email'))              db.exec("ALTER TABLE users ADD COLUMN email TEXT");
if (!cols.includes('reset_token'))        db.exec("ALTER TABLE users ADD COLUMN reset_token TEXT");
if (!cols.includes('reset_token_expiry')) db.exec("ALTER TABLE users ADD COLUMN reset_token_expiry TEXT");

// Seed admin account if it doesn't exist
const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!adminExists) {
  db.prepare(`INSERT INTO users (username, is_admin, password_set, password_hash)
              VALUES ('admin', 1, 0, '')`).run();
  console.log('Admin account created — set password on first login.');
}

app.use(cors());
app.use(express.json());

// ── Auth middleware ───────────────────────────────────────────
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
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
  return jwt.sign(
    { id: user.id, username: user.username, is_admin: user.is_admin },
    JWT_SECRET, { expiresIn: '30d' }
  );
}

// ── Health ────────────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ ok: true }));

// ── Register ──────────────────────────────────────────────────
app.post('/api/auth/register', (req, res) => {
  const { username, password, email } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (username === 'admin') return res.status(409).json({ error: 'Username not available' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
    ).run(username, email || null, hash);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.json({ token: issueToken(user), username: user.username, is_admin: 0, password_set: 1 });
  } catch {
    res.status(409).json({ error: 'Username already taken' });
  }
});

// ── Login ─────────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return res.status(401).json({ error: 'Invalid username or password' });
  if (user.is_banned) return res.status(403).json({ error: 'Your account has been banned.' });

  // Admin first login — no password set yet
  if (user.is_admin && !user.password_set) {
    return res.json({
      token: issueToken(user),
      username: user.username,
      is_admin: 1,
      password_set: 0,
    });
  }

  if (!bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  res.json({ token: issueToken(user), username: user.username, is_admin: user.is_admin, password_set: 1 });
});

// ── Change password ───────────────────────────────────────────
app.post('/api/auth/change-password', auth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6)
    return res.status(400).json({ error: 'New password must be at least 6 characters' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

  // Admin setting password for first time skips current password check
  if (!(user.is_admin && !user.password_set)) {
    if (!currentPassword || !bcrypt.compareSync(currentPassword, user.password_hash))
      return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ?, password_set = 1 WHERE id = ?').run(hash, user.id);
  res.json({ ok: true });
});

// ── Forgot password — request reset ──────────────────────────
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  // Always return success to prevent email enumeration
  if (!user) return res.json({ ok: true });

  const token = crypto.randomBytes(32).toString('hex');
  const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
  db.prepare('UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?')
    .run(token, expiry, user.id);

  const resetUrl = `${SITE_URL}?reset=${token}`;
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
  if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const user = db.prepare('SELECT * FROM users WHERE reset_token = ?').get(token);
  if (!user || !user.reset_token_expiry || new Date(user.reset_token_expiry) < new Date())
    return res.status(400).json({ error: 'Reset link is invalid or has expired' });

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ?, password_set = 1, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?')
    .run(hash, user.id);

  res.json({ ok: true });
});

// ── Robots ────────────────────────────────────────────────────
app.get('/api/robots', auth, (req, res) => {
  const robots = db.prepare('SELECT * FROM robots WHERE user_id = ?').all(req.user.id);
  res.json(robots.map(r => ({ ...r, hardware: JSON.parse(r.hardware) })));
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
    'SELECT id, username, email, is_admin, is_banned, password_set, created_at FROM users ORDER BY created_at DESC'
  ).all();
  res.json(users);
});

// ── Admin: ban / unban ────────────────────────────────────────
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

// ── Admin: reset user password ────────────────────────────────
app.post('/api/admin/users/:id/reset-password', auth, adminOnly, (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ?, password_set = 1 WHERE id = ?').run(hash, req.params.id);
  res.json({ ok: true });
});

// ── Admin: delete user ────────────────────────────────────────
app.delete('/api/admin/users/:id', auth, adminOnly, (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.is_admin) return res.status(400).json({ error: 'Cannot delete admin' });
  db.prepare('DELETE FROM robots WHERE user_id = ?').run(req.params.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Update email ──────────────────────────────────────────────
app.post('/api/auth/update-email', auth, (req, res) => {
  const { email } = req.body;
  db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email || null, req.user.id);
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`RoboWar API running on port ${PORT}`));

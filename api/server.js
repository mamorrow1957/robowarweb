import express from 'express';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

// DB setup
const db = new Database(path.join(__dirname, 'robowar.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS robots (
    id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    hardware TEXT NOT NULL,
    program TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (id, user_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

app.use(cors());
app.use(express.json());

// Auth middleware
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Register
app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);
    const token = jwt.sign({ id: result.lastInsertRowid, username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, username });
  } catch {
    res.status(409).json({ error: 'Username already taken' });
  }
});

// Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, username: user.username });
});

// Get all robots for user
app.get('/api/robots', auth, (req, res) => {
  const robots = db.prepare('SELECT * FROM robots WHERE user_id = ?').all(req.user.id);
  res.json(robots.map(r => ({ ...r, hardware: JSON.parse(r.hardware) })));
});

// Save (upsert) a robot
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

// Delete a robot
app.delete('/api/robots/:id', auth, (req, res) => {
  db.prepare('DELETE FROM robots WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

app.get('/api/health', (_, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`RoboWar API running on port ${PORT}`));

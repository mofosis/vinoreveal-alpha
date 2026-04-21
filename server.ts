import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

// SSE clients per session
const sessionClients = new Map<string, Set<Response>>();

function broadcastToSession(sessionId: string, event: string, data: unknown) {
  const clients = sessionClients.get(sessionId);
  if (!clients) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  clients.forEach(res => res.write(payload));
}

// Auth middleware — reads Authelia forward-auth headers
function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const userId = req.headers['remote-user'] as string;
  const userName = req.headers['remote-name'] as string;
  const userEmail = req.headers['remote-email'] as string;

  if (userId) {
    (req as any).user = { uid: userId, displayName: userName || userId, email: userEmail };
    return next();
  }

  // Dev fallback
  if (process.env.NODE_ENV !== 'production' && process.env.DEV_USER_ID) {
    (req as any).user = {
      uid: process.env.DEV_USER_ID,
      displayName: process.env.DEV_USER_NAME || 'Dev User',
      email: process.env.DEV_USER_EMAIL || 'dev@example.com',
    };
    return next();
  }

  res.status(401).json({ error: 'Unauthorized' });
}

// GET /api/me
app.get('/api/me', authMiddleware, (req: Request, res: Response) => {
  res.json((req as any).user);
});

// GET /api/events/:sessionId — SSE stream
app.get('/api/events/:sessionId', authMiddleware, (req: Request, res: Response) => {
  const { sessionId } = req.params;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  if (!sessionClients.has(sessionId)) sessionClients.set(sessionId, new Set());
  sessionClients.get(sessionId)!.add(res);

  res.write('event: connected\ndata: {}\n\n');

  const keepAlive = setInterval(() => res.write(': ping\n\n'), 20000);

  req.on('close', () => {
    clearInterval(keepAlive);
    sessionClients.get(sessionId)?.delete(res);
    if (sessionClients.get(sessionId)?.size === 0) sessionClients.delete(sessionId);
  });
});

// GET /api/sessions
app.get('/api/sessions', authMiddleware, async (req: Request, res: Response) => {
  const user = (req as any).user;
  try {
    const result = await pool.query(
      `SELECT s.* FROM sessions s
       JOIN session_participants sp ON sp.session_id = s.id
       WHERE sp.user_id = $1 AND s.status != 'terminated'
       ORDER BY s.created_at DESC LIMIT 10`,
      [user.uid]
    );
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

// GET /api/sessions/:id
app.get('/api/sessions/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM sessions WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

// POST /api/sessions
app.post('/api/sessions', authMiddleware, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });

  const shortId = Math.floor(Math.random() * 100).toString().padStart(2, '0');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO sessions (name, short_id, created_by, status)
       VALUES ($1, $2, $3, 'active') RETURNING *`,
      [name, shortId, user.uid]
    );
    const session = result.rows[0];
    await client.query(
      `INSERT INTO session_participants (session_id, user_id, display_name) VALUES ($1, $2, $3)`,
      [session.id, user.uid, user.displayName]
    );
    await client.query('COMMIT');
    res.status(201).json(session);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  } finally {
    client.release();
  }
});

// POST /api/sessions/join
app.post('/api/sessions/join', authMiddleware, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { shortId } = req.body;
  if (!shortId) return res.status(400).json({ error: 'shortId required' });

  try {
    const result = await pool.query(
      `SELECT * FROM sessions WHERE short_id = $1 AND status = 'active'`,
      [shortId.trim()]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Session not found' });
    const session = result.rows[0];

    await pool.query(
      `INSERT INTO session_participants (session_id, user_id, display_name)
       VALUES ($1, $2, $3) ON CONFLICT (session_id, user_id) DO NOTHING`,
      [session.id, user.uid, user.displayName]
    );

    broadcastToSession(session.id, 'session_updated', session);
    res.json(session);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

// PATCH /api/sessions/:id
app.patch('/api/sessions/:id', authMiddleware, async (req: Request, res: Response) => {
  const { status, summary } = req.body;
  try {
    const fields: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;
    if (status !== undefined) { fields.push(`status = $${idx++}`); vals.push(status); }
    if (summary !== undefined) { fields.push(`summary = $${idx++}`); vals.push(summary); }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
    vals.push(req.params.id);
    const result = await pool.query(
      `UPDATE sessions SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      vals
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    broadcastToSession(req.params.id, 'session_updated', result.rows[0]);
    res.json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

// GET /api/sessions/:id/wines
app.get('/api/sessions/:id/wines', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM wines WHERE session_id = $1 ORDER BY "order" ASC',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

// POST /api/sessions/:id/wines
app.post('/api/sessions/:id/wines', authMiddleware, async (req: Request, res: Response) => {
  const { name, grapeVariety, price, vintage, region, label, order } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO wines (session_id, name, grape_variety, price, vintage, region, label, "order", revealed)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false) RETURNING *`,
      [req.params.id, name, grapeVariety || null, price || null, vintage || null, region || null, label, order]
    );
    broadcastToSession(req.params.id, 'wines_updated', result.rows[0]);
    res.status(201).json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

// PATCH /api/sessions/:id/wines/:wineId
app.patch('/api/sessions/:id/wines/:wineId', authMiddleware, async (req: Request, res: Response) => {
  const { revealed, analysis, research } = req.body;
  try {
    const fields: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;
    if (revealed !== undefined) { fields.push(`revealed = $${idx++}`); vals.push(revealed); }
    if (analysis !== undefined) { fields.push(`analysis = $${idx++}`); vals.push(analysis); }
    if (research !== undefined) { fields.push(`research = $${idx++}`); vals.push(research); }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
    vals.push(req.params.wineId);
    const result = await pool.query(
      `UPDATE wines SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      vals
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    broadcastToSession(req.params.id, 'wines_updated', result.rows[0]);
    res.json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

// GET /api/sessions/:id/ratings
app.get('/api/sessions/:id/ratings', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT r.*, sp.display_name as user_name
       FROM ratings r
       JOIN session_participants sp ON sp.session_id = r.session_id AND sp.user_id = r.user_id
       WHERE r.session_id = $1`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

// PUT /api/sessions/:id/ratings/:wineId
app.put('/api/sessions/:id/ratings/:wineId', authMiddleware, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { score, comment, guessedGrapeVariety, guessedPrice, guessedVintage, guessedRegion } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO ratings (session_id, wine_id, user_id, score, comment, guessed_grape_variety, guessed_price, guessed_vintage, guessed_region)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (session_id, wine_id, user_id)
       DO UPDATE SET score=EXCLUDED.score, comment=EXCLUDED.comment,
         guessed_grape_variety=EXCLUDED.guessed_grape_variety,
         guessed_price=EXCLUDED.guessed_price,
         guessed_vintage=EXCLUDED.guessed_vintage,
         guessed_region=EXCLUDED.guessed_region,
         created_at=NOW()
       RETURNING *`,
      [req.params.id, req.params.wineId, user.uid, score, comment || null,
       guessedGrapeVariety || null, guessedPrice || null, guessedVintage || null, guessedRegion || null]
    );
    broadcastToSession(req.params.id, 'ratings_updated', result.rows[0]);
    res.json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

// GET /api/sessions/:id/messages
app.get('/api/sessions/:id/messages', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM messages WHERE session_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

// POST /api/sessions/:id/messages
app.post('/api/sessions/:id/messages', authMiddleware, async (req: Request, res: Response) => {
  const { text, anonymousName } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });
  try {
    const result = await pool.query(
      `INSERT INTO messages (session_id, text, anonymous_name) VALUES ($1,$2,$3) RETURNING *`,
      [req.params.id, text, anonymousName || 'Anonym']
    );
    broadcastToSession(req.params.id, 'messages_updated', result.rows[0]);
    res.status(201).json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => console.log(`VinoReveal server on port ${PORT}`));

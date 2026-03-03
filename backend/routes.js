import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import Anthropic from '@anthropic-ai/sdk';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';
import pdfParse from 'pdf-parse';
import {
  ANTHROPIC_API_KEY,
  ANTHROPIC_MODEL,
  JWT_SECRET,
  TOKEN_LIMIT,
  UPLOAD_DIR,
  MAX_ATTACHMENT_SIZE_MB,
  TRASH_RETENTION_DAYS,
} from './config.js';

export const secretKey = JWT_SECRET;
const router = express.Router();
const anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;
const uploadDirectory = path.resolve(process.cwd(), UPLOAD_DIR);
fs.mkdirSync(uploadDirectory, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDirectory),
    filename: (req, file, cb) => {
      const safeName = file.originalname.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`);
    },
  }),
  limits: { fileSize: MAX_ATTACHMENT_SIZE_MB * 1024 * 1024 },
});

const isValidText = (value) => typeof value === 'string' && value.trim().length > 0;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const AUTO_TITLE = 'New chat';
const TRASH_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Missing token' });
  }

  try {
    req.user = jwt.verify(token, secretKey);
    return next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

const mapSession = (row) => ({
  id: row.id,
  title: row.title,
  archived: row.archived,
  deletedAt: row.deleted_at,
  restoreBy: row.deleted_at ? new Date(new Date(row.deleted_at).getTime() + TRASH_MS).toISOString() : null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapMessage = (row) => ({
  id: row.id,
  role: row.role,
  content: row.content,
  createdAt: row.created_at,
  attachments: row.attachments || [],
});

const mapAttachment = (row) => ({
  id: row.id,
  originalName: row.original_name,
  mimeType: row.mime_type,
  isImage: row.mime_type.startsWith('image/'),
  createdAt: row.created_at,
});

const getSession = async (pool, userId, sessionId, options = {}) => {
  const includeDeleted = options.includeDeleted === true;
  const result = await pool.query(
    `SELECT * FROM chat_sessions
     WHERE id = $1 AND user_id = $2
       AND ($3::boolean = TRUE OR deleted_at IS NULL)`,
    [sessionId, userId, includeDeleted],
  );
  return result.rows[0] || null;
};

const maybeSetSessionTitle = async (pool, session, firstText) => {
  if (!session || session.title !== AUTO_TITLE) return session;
  const nextTitle = `${firstText.slice(0, 40)}${firstText.length > 40 ? '...' : ''}`;
  const result = await pool.query(
    'UPDATE chat_sessions SET title = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [nextTitle, session.id],
  );
  return result.rows[0] || session;
};

const getAttachmentsByIds = async (pool, userId, sessionId, attachmentIds) => {
  if (!attachmentIds.length) return [];
  const result = await pool.query(
    `SELECT * FROM chat_attachments
     WHERE user_id = $1 AND session_id = $2 AND id = ANY($3::int[])`,
    [userId, sessionId, attachmentIds],
  );
  return result.rows;
};

const createAnthropicRequestContent = async (text, attachments) => {
  const content = [];
  const extractedNotes = [];

  for (const attachment of attachments) {
    if (attachment.mime_type.startsWith('image/')) {
      const imageBuffer = await fsPromises.readFile(attachment.storage_path);
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: attachment.mime_type,
          data: imageBuffer.toString('base64'),
        },
      });
      extractedNotes.push(`Image attached: ${attachment.original_name}`);
      continue;
    }

    if (attachment.extracted_text) {
      extractedNotes.push(`Attachment "${attachment.original_name}" content:\n${attachment.extracted_text}`);
    }
  }

  const attachmentContext = extractedNotes.length ? `\n\n${extractedNotes.join('\n\n')}` : '';
  content.push({
    type: 'text',
    text: `${text}${attachmentContext}`,
  });

  return content;
};

const generateAssistantResponse = async (text, attachments) => {
  if (!anthropic) {
    const files = attachments.length
      ? ` using attachments: ${attachments.map((item) => item.original_name).join(', ')}`
      : '';
    return {
      text: `Mock response to "${text}"${files}`,
      inputTokens: Math.max(1, Math.ceil(text.split(/\s+/).length)),
      outputTokens: Math.max(1, Math.ceil(text.split(/\s+/).length / 2)),
    };
  }

  const content = await createAnthropicRequestContent(text, attachments);
  const message = await anthropic.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content }],
  });

  const responseText = Array.isArray(message.content)
    ? message.content.map((item) => item.text || '').join(' ').trim()
    : '';

  return {
    text: responseText || 'No response text',
    inputTokens: message.usage?.input_tokens || Math.max(1, text.split(/\s+/).length),
    outputTokens: message.usage?.output_tokens || 0,
  };
};

const writeStreamEvent = (res, payload) => {
  res.write(`${JSON.stringify(payload)}\n`);
};

const parseAttachmentIds = (value) => {
  if (!Array.isArray(value)) return [];
  return value.map((id) => Number.parseInt(id, 10)).filter((id) => Number.isInteger(id) && id > 0);
};

router.post('/register', async (req, res, next) => {
  const { username, password } = req.body;
  const pool = req.pool;

  if (!isValidText(username) || !isValidText(password)) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO users (username, password, tokens) VALUES ($1, $2, $3)', [
      username.trim(),
      hashedPassword,
      TOKEN_LIMIT,
    ]);
    return res.status(201).json({ message: 'User registered' });
  } catch (error) {
    console.error('Error during registration:', error);
    return next(error);
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const pool = req.pool;

  if (!isValidText(username) || !isValidText(password)) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username.trim()]);
    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, secretKey, { expiresIn: '1d' });
    return res.json({ token });
  } catch (error) {
    console.error('Error during login:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.get('/sessions', authenticateToken, async (req, res) => {
  const pool = req.pool;
  const includeArchived = req.query.includeArchived === 'true';
  const includeDeleted = req.query.includeDeleted === 'true';

  const result = await pool.query(
    `SELECT * FROM chat_sessions
     WHERE user_id = $1
       AND ($2::boolean = TRUE OR archived = FALSE)
       AND ($3::boolean = TRUE OR deleted_at IS NULL)
     ORDER BY updated_at DESC`,
    [req.user.id, includeArchived, includeDeleted],
  );
  return res.json({ sessions: result.rows.map(mapSession) });
});

router.get('/sessions/search', authenticateToken, async (req, res) => {
  const pool = req.pool;
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const view = typeof req.query.view === 'string' ? req.query.view : 'active';
  if (!q) return res.json({ sessions: [] });

  let viewPredicate = 's.deleted_at IS NULL AND s.archived = FALSE';
  if (view === 'archived') viewPredicate = 's.deleted_at IS NULL AND s.archived = TRUE';
  if (view === 'trash') viewPredicate = 's.deleted_at IS NOT NULL';

  const result = await pool.query(
    `SELECT DISTINCT s.*
     FROM chat_sessions s
     LEFT JOIN chat_messages m ON m.session_id = s.id
     WHERE s.user_id = $1
       AND (${viewPredicate})
       AND (
         s.title ILIKE $2
         OR COALESCE(m.content, '') ILIKE $2
       )
     ORDER BY s.updated_at DESC
     LIMIT 100`,
    [req.user.id, `%${q}%`],
  );

  return res.json({ sessions: result.rows.map(mapSession) });
});

router.post('/sessions', authenticateToken, async (req, res) => {
  const pool = req.pool;
  const rawTitle = isValidText(req.body?.title) ? req.body.title.trim() : AUTO_TITLE;
  const title = rawTitle.slice(0, 120);

  const result = await pool.query(
    `INSERT INTO chat_sessions (user_id, title)
     VALUES ($1, $2)
     RETURNING *`,
    [req.user.id, title],
  );
  return res.status(201).json({ session: mapSession(result.rows[0]) });
});

router.patch('/sessions/:sessionId', authenticateToken, async (req, res) => {
  const pool = req.pool;
  const sessionId = Number.parseInt(req.params.sessionId, 10);
  const session = await getSession(pool, req.user.id, sessionId, { includeDeleted: true });
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const title = isValidText(req.body?.title) ? req.body.title.trim().slice(0, 120) : session.title;
  const archived = typeof req.body?.archived === 'boolean' ? req.body.archived : session.archived;

  const result = await pool.query(
    `UPDATE chat_sessions
     SET title = $1, archived = $2, updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [title, archived, sessionId],
  );
  return res.json({ session: mapSession(result.rows[0]) });
});

router.delete('/sessions/:sessionId', authenticateToken, async (req, res) => {
  const pool = req.pool;
  const sessionId = Number.parseInt(req.params.sessionId, 10);
  const session = await getSession(pool, req.user.id, sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  await pool.query(
    `UPDATE chat_sessions
     SET deleted_at = NOW(), archived = FALSE, updated_at = NOW()
     WHERE id = $1`,
    [sessionId],
  );
  return res.status(204).end();
});

router.post('/sessions/:sessionId/restore', authenticateToken, async (req, res) => {
  const pool = req.pool;
  const sessionId = Number.parseInt(req.params.sessionId, 10);
  const session = await getSession(pool, req.user.id, sessionId, { includeDeleted: true });
  if (!session || !session.deleted_at) return res.status(404).json({ error: 'Trashed session not found' });

  const deletedAtMs = new Date(session.deleted_at).getTime();
  if (Number.isFinite(deletedAtMs) && Date.now() - deletedAtMs > TRASH_MS) {
    return res.status(410).json({ error: 'Restore window expired. Delete permanently.' });
  }

  const result = await pool.query(
    `UPDATE chat_sessions
     SET deleted_at = NULL, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [sessionId],
  );
  return res.json({ session: mapSession(result.rows[0]) });
});

router.delete('/sessions/:sessionId/permanent', authenticateToken, async (req, res) => {
  const pool = req.pool;
  const sessionId = Number.parseInt(req.params.sessionId, 10);
  const session = await getSession(pool, req.user.id, sessionId, { includeDeleted: true });
  if (!session || !session.deleted_at) return res.status(404).json({ error: 'Trashed session not found' });

  const attachments = await pool.query('SELECT storage_path FROM chat_attachments WHERE session_id = $1', [sessionId]);
  await pool.query('DELETE FROM chat_sessions WHERE id = $1', [sessionId]);
  await Promise.all(
    attachments.rows.map(async (row) => {
      try {
        await fsPromises.unlink(row.storage_path);
      } catch {
        return null;
      }
      return null;
    }),
  );
  return res.status(204).end();
});

router.get('/sessions/:sessionId/messages', authenticateToken, async (req, res) => {
  const pool = req.pool;
  const sessionId = Number.parseInt(req.params.sessionId, 10);
  const session = await getSession(pool, req.user.id, sessionId, { includeDeleted: true });
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const result = await pool.query(
    `SELECT m.id, m.role, m.content, m.created_at,
      COALESCE(
        json_agg(
          json_build_object(
            'id', a.id,
            'originalName', a.original_name,
            'mimeType', a.mime_type
          ) ORDER BY a.created_at
        ) FILTER (WHERE a.id IS NOT NULL),
        '[]'::json
      ) AS attachments
     FROM chat_messages m
     LEFT JOIN message_attachments ma ON ma.message_id = m.id
     LEFT JOIN chat_attachments a ON a.id = ma.attachment_id
     WHERE m.session_id = $1
     GROUP BY m.id
     ORDER BY m.created_at ASC`,
    [sessionId],
  );

  return res.json({ messages: result.rows.map(mapMessage) });
});

router.get('/sessions/:sessionId/attachments', authenticateToken, async (req, res) => {
  const pool = req.pool;
  const sessionId = Number.parseInt(req.params.sessionId, 10);
  const session = await getSession(pool, req.user.id, sessionId, { includeDeleted: true });
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const result = await pool.query(
    'SELECT * FROM chat_attachments WHERE session_id = $1 AND user_id = $2 ORDER BY created_at DESC',
    [sessionId, req.user.id],
  );
  return res.json({ attachments: result.rows.map(mapAttachment) });
});

router.post('/sessions/:sessionId/attachments', authenticateToken, upload.single('file'), async (req, res) => {
  const pool = req.pool;
  const sessionId = Number.parseInt(req.params.sessionId, 10);
  const session = await getSession(pool, req.user.id, sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (session.deleted_at) return res.status(403).json({ error: 'Cannot upload to trashed session' });
  if (!req.file) return res.status(400).json({ error: 'Attachment file is required' });

  const isPdf = req.file.mimetype === 'application/pdf';
  const isImage = req.file.mimetype.startsWith('image/');
  if (!isPdf && !isImage) {
    await fsPromises.unlink(req.file.path).catch(() => null);
    return res.status(400).json({ error: 'Only PDF and image files are supported' });
  }

  let extractedText = null;
  if (isPdf) {
    try {
      const buffer = await fsPromises.readFile(req.file.path);
      const parsed = await pdfParse(buffer);
      extractedText = parsed.text?.slice(0, 120000) || '';
    } catch (error) {
      console.error('PDF parse error:', error);
      extractedText = '';
    }
  }

  const result = await pool.query(
    `INSERT INTO chat_attachments
      (user_id, session_id, original_name, stored_name, mime_type, storage_path, extracted_text)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      req.user.id,
      sessionId,
      req.file.originalname,
      req.file.filename,
      req.file.mimetype,
      req.file.path,
      extractedText,
    ],
  );

  return res.status(201).json({ attachment: mapAttachment(result.rows[0]) });
});

router.delete('/attachments/:attachmentId', authenticateToken, async (req, res) => {
  const pool = req.pool;
  const attachmentId = Number.parseInt(req.params.attachmentId, 10);
  const result = await pool.query(
    'SELECT * FROM chat_attachments WHERE id = $1 AND user_id = $2',
    [attachmentId, req.user.id],
  );
  const attachment = result.rows[0];
  if (!attachment) return res.status(404).json({ error: 'Attachment not found' });

  await pool.query('DELETE FROM chat_attachments WHERE id = $1', [attachmentId]);
  await fsPromises.unlink(attachment.storage_path).catch(() => null);
  return res.status(204).end();
});

router.get('/attachments/:attachmentId/blob', authenticateToken, async (req, res) => {
  const pool = req.pool;
  const attachmentId = Number.parseInt(req.params.attachmentId, 10);
  const result = await pool.query(
    'SELECT * FROM chat_attachments WHERE id = $1 AND user_id = $2',
    [attachmentId, req.user.id],
  );
  const attachment = result.rows[0];
  if (!attachment) return res.status(404).json({ error: 'Attachment not found' });

  return res.sendFile(path.resolve(attachment.storage_path), {
    headers: {
      'Content-Type': attachment.mime_type,
      'Content-Disposition': `inline; filename="${attachment.original_name}"`,
    },
  });
});

router.post('/sessions/:sessionId/messages/stream', authenticateToken, async (req, res) => {
  const pool = req.pool;
  const sessionId = Number.parseInt(req.params.sessionId, 10);

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const { text, attachmentIds } = req.body || {};
    if (!isValidText(text)) {
      writeStreamEvent(res, { type: 'error', error: 'Message text is required' });
      return res.end();
    }

    const session = await getSession(pool, req.user.id, sessionId, { includeDeleted: true });
    if (!session) {
      writeStreamEvent(res, { type: 'error', error: 'Session not found' });
      return res.end();
    }
    if (session.deleted_at) {
      writeStreamEvent(res, { type: 'error', error: 'Cannot send messages to trashed session' });
      return res.end();
    }

    const usageResult = await pool.query('SELECT tokens FROM users WHERE id = $1', [req.user.id]);
    const user = usageResult.rows[0];
    if (!user) {
      writeStreamEvent(res, { type: 'error', error: 'User not found' });
      return res.end();
    }

    const available = Number(user.tokens) || 0;
    if (available <= 0) {
      writeStreamEvent(res, { type: 'error', error: 'Token limit reached' });
      return res.end();
    }

    const userMessageResult = await pool.query(
      `INSERT INTO chat_messages (session_id, role, content)
       VALUES ($1, 'user', $2)
       RETURNING *`,
      [sessionId, text.trim()],
    );
    const userMessage = userMessageResult.rows[0];

    const cleanedAttachmentIds = parseAttachmentIds(attachmentIds);
    const attachments = await getAttachmentsByIds(pool, req.user.id, sessionId, cleanedAttachmentIds);
    for (const attachment of attachments) {
      await pool.query(
        'INSERT INTO message_attachments (message_id, attachment_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [userMessage.id, attachment.id],
      );
    }

    const titledSession = await maybeSetSessionTitle(pool, session, text.trim());

    writeStreamEvent(res, { type: 'session', session: mapSession(titledSession) });
    writeStreamEvent(res, { type: 'user_message', message: mapMessage(userMessage) });

    const assistant = await generateAssistantResponse(text.trim(), attachments);
    const chunks = assistant.text.split(/(\s+)/).filter((part) => part);
    let progressivelyBuilt = '';
    for (const chunk of chunks) {
      progressivelyBuilt += chunk;
      writeStreamEvent(res, { type: 'assistant_delta', delta: chunk });
      await pause(22);
    }

    const outputText = progressivelyBuilt.trim() || assistant.text;
    const assistantMessageResult = await pool.query(
      `INSERT INTO chat_messages (session_id, role, content)
       VALUES ($1, 'assistant', $2)
       RETURNING *`,
      [sessionId, outputText],
    );
    const assistantMessage = assistantMessageResult.rows[0];

    const totalUsed = assistant.inputTokens + assistant.outputTokens;
    const remainingTokens = Math.max(0, available - totalUsed);
    await pool.query('UPDATE users SET tokens = $1 WHERE id = $2', [remainingTokens, req.user.id]);
    await pool.query('UPDATE chat_sessions SET updated_at = NOW() WHERE id = $1', [sessionId]);

    writeStreamEvent(res, {
      type: 'assistant_done',
      message: mapMessage(assistantMessage),
      usage: {
        inputTokens: assistant.inputTokens,
        outputTokens: assistant.outputTokens,
        availableTokens: remainingTokens,
      },
    });

    return res.end();
  } catch (error) {
    console.error('Streaming route error:', error);
    writeStreamEvent(res, { type: 'error', error: 'Failed to process message' });
    return res.end();
  }
});

router.post('/messages', authenticateToken, async (req, res) => {
  try {
    const pool = req.pool;
    const sessionResult = await pool.query(
      'INSERT INTO chat_sessions (user_id, title) VALUES ($1, $2) RETURNING id',
      [req.user.id, AUTO_TITLE],
    );
    const sessionId = sessionResult.rows[0].id;
    const text = req.body?.text;
    if (!isValidText(text)) return res.status(400).json({ error: 'Message text is required' });
    const assistant = await generateAssistantResponse(text.trim(), []);
    await pool.query(
      `INSERT INTO chat_messages (session_id, role, content) VALUES ($1, 'user', $2), ($1, 'assistant', $3)`,
      [sessionId, text.trim(), assistant.text],
    );
    const usageResult = await pool.query('SELECT tokens FROM users WHERE id = $1', [req.user.id]);
    const available = Number(usageResult.rows[0]?.tokens || TOKEN_LIMIT);
    const remainingTokens = Math.max(0, available - (assistant.inputTokens + assistant.outputTokens));
    await pool.query('UPDATE users SET tokens = $1 WHERE id = $2', [remainingTokens, req.user.id]);
    return res.json({
      text: assistant.text,
      usage: {
        inputTokens: assistant.inputTokens,
        outputTokens: assistant.outputTokens,
        availableTokens: remainingTokens,
      },
    });
  } catch (error) {
    console.error('Error processing message:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;

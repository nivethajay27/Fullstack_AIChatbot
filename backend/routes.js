import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY, ANTHROPIC_MODEL, JWT_SECRET, TOKEN_LIMIT } from './config.js';

export const secretKey = JWT_SECRET;
const router = express.Router();
const anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;

const isValidText = (value) => typeof value === 'string' && value.trim().length > 0;

const generateResponse = async (text) => {
  if (!anthropic) {
    return {
      text: `Mock response: ${text}`,
      outputTokens: Math.max(1, Math.ceil(text.split(/\s+/).length / 2)),
    };
  }

  const message = await anthropic.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: text }],
  });

  const responseText = Array.isArray(message.content)
    ? message.content.map((item) => item.text || '').join(' ').trim()
    : '';

  return {
    text: responseText || 'No response text',
    outputTokens: message.usage?.output_tokens || 0,
  };
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

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Missing token' });
  }

  try {
    const user = jwt.verify(token, secretKey);
    req.user = user;
    return next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

router.post('/messages', authenticateToken, async (req, res) => {
  const { text } = req.body;
  const pool = req.pool;

  if (!isValidText(text)) {
    return res.status(400).json({ error: 'Message text is required' });
  }

  try {
    const result = await pool.query('SELECT tokens FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const available = Number(user.tokens) || 0;
    if (available <= 0) {
      return res.status(403).json({ error: 'Token limit reached' });
    }

    const response = await generateResponse(text.trim());
    const inputTokens = text.trim().split(/\s+/).length;
    const totalUsed = inputTokens + response.outputTokens;
    const remainingTokens = Math.max(0, available - totalUsed);

    await pool.query('UPDATE users SET tokens = $1 WHERE id = $2', [remainingTokens, req.user.id]);

    return res.json({
      text: response.text,
      usage: {
        inputTokens,
        outputTokens: response.outputTokens,
        availableTokens: remainingTokens,
      },
    });
  } catch (error) {
    console.error('Error processing message:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;

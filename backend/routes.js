import express from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import Anthropic from '@anthropic-ai/sdk';

export const secretKey = crypto.randomBytes(32).toString('hex');
const app = express();
app.use(express.json());
app.use(cors());
const router = express.Router();
const TOKEN_LIMIT = 1000;

const anthropicApiKey = 'enter your api key'; 
const anthropic = new Anthropic({ apiKey: anthropicApiKey });

router.post('/register', async (req, res, next) => {
  const { username, password } = req.body;
  const pool = req.pool;
  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    await pool.query('INSERT INTO users (username, password, tokens) VALUES ($1, $2, $3)', [username, hashedPassword, TOKEN_LIMIT]);
    res.status(201).send('User registered');
  } catch (error) {
    console.error('Error during registration:', error);
    next(error);
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const pool = req.pool;

  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];

    if (user && await bcrypt.compare(password, user.password)) {
      const token = jwt.sign({ id: user.id, username: user.username }, secretKey, { expiresIn: '1d' });
      res.json({ token });
    } else {
      res.status(401).send('Invalid credentials');
    }
  } catch (error) {
    res.status(500).send('Server error');
  }
});

// Middleware to authenticate token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, secretKey, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

router.post('/messages', authenticateToken, async (req, res) => {
    const { text } = req.body;
    const pool = req.pool;
  
    try {
      const result = await pool.query('SELECT tokens FROM users WHERE id = $1', [req.user.id]);
      let tokens = result.rows[0].tokens;
  
      if (tokens <= 0) {
        return res.status(403).send('Token limit reached');
      }
  
      const message = await anthropic.messages.create({
        model: 'claude-3-opus-20240229',
        max_tokens: 1024,
        messages: [{ role: 'user', content: text }],
      });
  
      const responseText = message.content ? message.content.map(item => item.text).join(' ') : "No response text";
  
      const inputTokens = text.split(' ').length; 
      const outputTokens = message.usage.output_tokens;
      tokens -= inputTokens + outputTokens; // Update the token count
  
      await pool.query('UPDATE users SET tokens = $1 WHERE id = $2', [tokens, req.user.id]);
  
      res.json({
        text: responseText,
        usage: {
          inputTokens,
          outputTokens,
          availableTokens: tokens
        }
      });
    } catch (error) {
      console.error('Server error:', error);
      res.status(500).send('Server error');
    }
  });

export default router;

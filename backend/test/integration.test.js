import request from 'supertest';
import express from 'express';
import bodyParser from 'body-parser';
import pg from 'pg';
import cors from 'cors';
import router, { secretKey } from '../routes';

const { Pool } = pg;
const app = express();

app.use(bodyParser.json());
app.use(cors());

const pool = new Pool({
  user: 'admin',
  host: 'localhost',
  database: 'chatbot_db',
  password: 'ashlyndales',
  port: 5432,
});

app.use((req, res, next) => {
  req.pool = pool;
  next();
});

app.use('/api', router);

describe('Full Integration Test', () => {
  let token;

  beforeAll(async () => {
    // Register a new user
    await request(app)
      .post('/api/register')
      .send({ username: 'testuser', password: 'password123' });

    // Login the registered user
    const res = await request(app)
      .post('/api/login')
      .send({ username: 'testuser', password: 'password123' });

    token = res.body.token;
  });

  test('should handle a full user interaction', async () => {
    // User sends a message
    const res = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Hello' });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('text');
    expect(res.body.usage).toHaveProperty('inputTokens');
    expect(res.body.usage).toHaveProperty('outputTokens');
    expect(res.body.usage).toHaveProperty('availableTokens');
  });
});
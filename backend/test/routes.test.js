

import request from 'supertest';
import express from 'express';
import router, { secretKey } from '../routes';
import jwt from 'jsonwebtoken';
import bodyParser from 'body-parser';

const app = express();
app.use(bodyParser.json());
app.use('/api', router);

describe('User Authentication and Message Handling', () => {
  let token;
  let pool;

  beforeAll(() => {
    pool = {
      query: jest.fn()
    };

    app.use((req, res, next) => {
      req.pool = pool;
      next();
    });

    token = jwt.sign({ id: 1, username: 'testuser' }, secretKey, { expiresIn: '1d' });
  });

  test('should register a user', async () => {
    pool.query.mockResolvedValueOnce();

    const res = await request(app).post('/api/register').send({
      username: 'testuser',
      password: 'password123'
    });

    expect(res.statusCode).toEqual(201);
    expect(res.text).toEqual('User registered');
  });

  test('should login a user', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          username: 'testuser',
          password: '$2b$10$7DQnA2QRTu03aDmjHQMxDuKjN06Z8kLP3O1O9M7ODvL0yJ7lpoXZG' // hashed 'password123'
        }
      ]
    });

    const res = await request(app).post('/api/login').send({
      username: 'testuser',
      password: 'password123'
    });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('token');
  });

  test('should handle message sending', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          tokens: 1000
        }
      ]
    });

    pool.query.mockResolvedValueOnce();

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

import request from 'supertest';
import express from 'express';
import router from '../routes.js';

const app = express();
const pool = {
  query: jest.fn(),
};

app.use(express.json());
app.use((req, res, next) => {
  req.pool = pool;
  next();
});
app.use('/api', router);

describe('API integration flow', () => {
  beforeEach(() => {
    pool.query.mockReset();
  });

  test('register -> login -> message flow', async () => {
    pool.query.mockResolvedValueOnce();
    const registerRes = await request(app)
      .post('/api/register')
      .send({ username: 'testuser', password: 'password123' });
    expect(registerRes.statusCode).toEqual(201);

    pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          username: 'testuser',
          password: '$2b$10$7DQnA2QRTu03aDmjHQMxDuKjN06Z8kLP3O1O9M7ODvL0yJ7lpoXZG',
        },
      ],
    });
    const loginRes = await request(app)
      .post('/api/login')
      .send({ username: 'testuser', password: 'password123' });
    expect(loginRes.statusCode).toEqual(200);
    expect(loginRes.body).toHaveProperty('token');

    pool.query.mockResolvedValueOnce({
      rows: [{ tokens: 1000 }],
    });
    pool.query.mockResolvedValueOnce();

    const messageRes = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${loginRes.body.token}`)
      .send({ text: 'Hello' });

    expect(messageRes.statusCode).toEqual(200);
    expect(messageRes.body).toHaveProperty('text');
    expect(messageRes.body.usage).toHaveProperty('inputTokens');
    expect(messageRes.body.usage).toHaveProperty('outputTokens');
    expect(messageRes.body.usage).toHaveProperty('availableTokens');
  });
});

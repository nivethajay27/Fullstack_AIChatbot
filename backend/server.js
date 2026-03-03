import express from 'express';
import cors from 'cors';
import routes from './routes.js';
import pool from './db.js';
import { PORT } from './config.js';

const app = express();

app.use(express.json());
app.use(cors());

app.use((req, res, next) => {
  req.pool = pool;
  next();
});

app.use('/api', routes);
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({ error: 'Server error' });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

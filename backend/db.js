import { Pool } from 'pg';

const pool = new Pool({
  user: 'admin',
  host: 'localhost',
  database: 'chatbot_db',
  password: 'ashlyndales',
  port: 5432,
});

export default pool;

import pg from 'pg';
import { DB_CONFIG } from './config.js';

const { Pool } = pg;
const pool = new Pool(DB_CONFIG);

export default pool;

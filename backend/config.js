const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

export const PORT = toInt(process.env.PORT, 8080);
export const TOKEN_LIMIT = toInt(process.env.TOKEN_LIMIT, 1000);
export const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-me';
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307';
export const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';
export const MAX_ATTACHMENT_SIZE_MB = toInt(process.env.MAX_ATTACHMENT_SIZE_MB, 15);

export const DB_CONFIG = {
  user: process.env.DB_USER || 'admin',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'chatbot_db',
  password: process.env.DB_PASSWORD || '',
  port: toInt(process.env.DB_PORT, 5432),
};

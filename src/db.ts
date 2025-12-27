import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root
// When running from dist/src/db.js: go up ../../ to reach alumni-server root
// When running from src/db.ts: go up ../ to reach alumni-server root
const envPath = path.resolve(__dirname, '..', '..', '.env');
console.log('[DB] Loading .env from:', envPath);
dotenv.config({ path: envPath });

function getRequiredEnv(name, optional = false) {
  const value = process.env[name];
  if (!optional && (value === undefined || value === '')) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value || '';
}

const pool = mysql.createPool({
  host: getRequiredEnv('DB_HOST'),
  port: Number(getRequiredEnv('DB_PORT') || 3306),
  user: getRequiredEnv('DB_USER'),
  password: getRequiredEnv('DB_PASSWORD', true), // ← NOW OPTIONAL
  database: getRequiredEnv('DB_DATABASE'),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});
// TEST CONNECTION
(async () => {
  try {
    const connection = await pool.getConnection();
    console.log('Connected to MySQL database: alumniCircle');
    connection.release();
  } catch (err) {
    console.error('DATABASE CONNECTION FAILED:', err.message);
    process.exit(1); // Stop server if DB fails
  }
})();

export default pool;
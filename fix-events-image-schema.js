import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

function env(name, fallback = '') {
  return process.env[name] ?? fallback;
}

async function columnExists(conn, table, column) {
  const [rows] = await conn.execute(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [env('DB_DATABASE', 'alumniCircle'), table, column]
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function addColumnIfMissing(conn, table, column, ddl) {
  const exists = await columnExists(conn, table, column);
  if (exists) return { added: false, column };
  await conn.execute(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  return { added: true, column };
}

async function main() {
  const host = env('DB_HOST', 'localhost');
  const port = Number(env('DB_PORT', '3306'));
  const user = env('DB_USER', 'root');
  const password = env('DB_PASSWORD', '');
  const database = env('DB_DATABASE', 'alumniCircle');

  const conn = await mysql.createConnection({ host, port, user, password, database });
  try {
    const results = [];
    results.push(await addColumnIfMissing(conn, 'events', 'image_url', 'image_url VARCHAR(255) NULL'));
    results.push(await addColumnIfMissing(conn, 'events', 'image_data', 'image_data LONGBLOB NULL'));
    results.push(await addColumnIfMissing(conn, 'events', 'image_mime', 'image_mime VARCHAR(64) NULL'));

    console.log('Events image schema check complete:', results);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('Schema update failed:', err?.message || err);
  process.exit(1);
});

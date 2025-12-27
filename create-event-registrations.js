import mysql from 'mysql2/promise';

async function migrate() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'MoJo@256',
    database: 'alumniCircle'
  });

  try {
    // Create event_registrations table if it doesn't exist
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS event_registrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        event_id INT NOT NULL,
        student_uid VARCHAR(255) NOT NULL,
        registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
        UNIQUE KEY unique_registration (event_id, student_uid)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('✅ event_registrations table created/verified');
    await connection.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration error:', err.message);
    await connection.end();
    process.exit(1);
  }
}

migrate();

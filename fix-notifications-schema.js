// Quick fix: Add 'read' column to notifications table if it doesn't exist
import mysql from 'mysql2/promise';

const DB_CONFIG = {
  host: 'localhost',
  user: 'root',
  password: '', // Update if needed
  database: 'alumniCircle'
};

async function fixSchema() {
  let connection;
  try {
    connection = await mysql.createConnection(DB_CONFIG);
    console.log('Connected to database');

    // Try to add the 'read' column
    try {
      await connection.execute(
        "ALTER TABLE notifications ADD COLUMN `read` TINYINT(1) DEFAULT 0"
      );
      console.log('✓ Added "read" column to notifications table');
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log('✓ Column "read" already exists');
      } else {
        throw err;
      }
    }

    // Verify the column exists
    const [rows] = await connection.execute("SHOW COLUMNS FROM notifications LIKE 'read'");
    if (rows.length > 0) {
      console.log('✓ Verified: "read" column exists in notifications table');
    } else {
      console.error('✗ Failed to add "read" column');
    }

  } catch (error) {
    console.error('Error:', error.message);
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('\nPlease update the password in this script or run:');
      console.error('  mysql -u root -p -e "USE alumniCircle; ALTER TABLE notifications ADD COLUMN \\`read\\` TINYINT(1) DEFAULT 0;"');
    }
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

fixSchema();

import db from './src/db.js';

try {
  const [columns] = await db.execute("DESCRIBE loans");
  console.log('Loans table columns:');
  console.log(columns);
  
  const [sample] = await db.execute("SELECT * FROM loans LIMIT 1");
  console.log('\nSample loan:');
  console.log(sample[0]);
  
  process.exit(0);
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}

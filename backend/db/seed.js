import pool from './connection.js';
import bcrypt from 'bcryptjs';

async function seed() {
  try {
    const [adminExists] = await pool.query('SELECT id FROM users WHERE username = ?', ['admin']);
    if (adminExists.length === 0) {
      const hash = await bcrypt.hash('admin123', 10);
      await pool.query('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', ['admin', hash, 'admin']);
      console.log('Admin created: username=admin, password=admin123');
    }
    const [treasurerExists] = await pool.query('SELECT id FROM users WHERE username = ?', ['treasurer']);
    if (treasurerExists.length === 0) {
      const hash = await bcrypt.hash('treasurer123', 10);
      await pool.query('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', ['treasurer', hash, 'treasurer']);
      console.log('Treasurer created: username=treasurer, password=treasurer123');
    }
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}
seed();

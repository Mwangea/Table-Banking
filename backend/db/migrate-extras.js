import pool from './connection.js';

const migration = `
CREATE TABLE IF NOT EXISTS external_funds (
    id INT PRIMARY KEY AUTO_INCREMENT,
    source ENUM('Financial Aid', 'Government Loan', 'Other') NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    received_date DATE NOT NULL,
    description VARCHAR(255),
    recorded_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (recorded_by) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS expenses (
    id INT PRIMARY KEY AUTO_INCREMENT,
    amount DECIMAL(15, 2) NOT NULL,
    expense_date DATE NOT NULL,
    category VARCHAR(100),
    description VARCHAR(255),
    recorded_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (recorded_by) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS registration_fees (
    id INT PRIMARY KEY AUTO_INCREMENT,
    member_id INT NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    payment_date DATE NOT NULL,
    recorded_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    FOREIGN KEY (recorded_by) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS fines (
    id INT PRIMARY KEY AUTO_INCREMENT,
    member_id INT NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    reason VARCHAR(255),
    issued_date DATE NOT NULL,
    status ENUM('Unpaid', 'Paid') NOT NULL DEFAULT 'Unpaid',
    payment_date DATE,
    recorded_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    FOREIGN KEY (recorded_by) REFERENCES users(id)
);
INSERT INTO settings (key_name, key_value) VALUES 
    ('registration_fee_amount', '500'),
    ('default_fine_amount', '100')
ON DUPLICATE KEY UPDATE key_name = key_name;
`;

async function run() {
  try {
    const statements = migration.trim().split(';').filter(s => s.trim());
    for (const stmt of statements) {
      if (stmt.trim()) await pool.query(stmt);
    }
    console.log('Migration completed.');
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}
run();

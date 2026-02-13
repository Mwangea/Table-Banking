import express from 'express';
import pool from '../db/connection.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM settings');
    const settings = {};
    rows.forEach(r => { settings[r.key_name] = r.key_value; });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { max_loan_multiplier, default_interest_rate, registration_fee_amount, default_fine_amount } = req.body;
    const updates = [
      ['max_loan_multiplier', max_loan_multiplier],
      ['default_interest_rate', default_interest_rate],
      ['registration_fee_amount', registration_fee_amount],
      ['default_fine_amount', default_fine_amount]
    ];
    for (const [key, value] of updates) {
      if (value != null) {
        await pool.query("INSERT INTO settings (key_name, key_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE key_value = ?", [key, value, value]);
      }
    }
    const [rows] = await pool.query('SELECT * FROM settings');
    const settings = {};
    rows.forEach(r => { settings[r.key_name] = r.key_value; });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

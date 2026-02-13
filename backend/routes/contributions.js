import express from 'express';
import pool from '../db/connection.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const { member_id, month, year } = req.query;
    let sql = `SELECT c.*, m.full_name as member_name FROM contributions c 
               JOIN members m ON c.member_id = m.id WHERE 1=1`;
    const params = [];
    if (member_id) { sql += ' AND c.member_id = ?'; params.push(member_id); }
    if (month) { sql += ' AND c.month = ?'; params.push(month); }
    if (year) { sql += ' AND c.year = ?'; params.push(year); }
    sql += ' ORDER BY c.contribution_date DESC, c.id DESC';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { member_id, amount, contribution_date, month, year } = req.body;
    if (!member_id || !amount || !contribution_date || !month || !year) {
      return res.status(400).json({ error: 'member_id, amount, contribution_date, month, year are required' });
    }
    const [result] = await pool.query(
      'INSERT INTO contributions (member_id, amount, contribution_date, month, year, recorded_by) VALUES (?, ?, ?, ?, ?, ?)',
      [member_id, parseFloat(amount), contribution_date, month, year, req.user.id]
    );
    res.status(201).json({ id: result.insertId, ...req.body, recorded_by: req.user.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

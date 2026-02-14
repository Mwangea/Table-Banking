import express from 'express';
import pool from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const { member_id, status } = req.query;
    let sql = `SELECT f.*, m.full_name as member_name FROM fines f 
               JOIN members m ON f.member_id = m.id WHERE 1=1`;
    const params = [];
    if (member_id) { sql += ' AND f.member_id = ?'; params.push(member_id); }
    if (status) { sql += ' AND f.status = ?'; params.push(status); }
    sql += ' ORDER BY f.issued_date DESC, f.id DESC';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { member_id, amount, reason, issued_date } = req.body;
    if (!member_id || amount == null || !issued_date) {
      return res.status(400).json({ error: 'member_id, amount, and issued_date are required' });
    }
    const [result] = await pool.query(
      'INSERT INTO fines (member_id, amount, reason, issued_date, status, recorded_by) VALUES (?, ?, ?, ?, ?, ?)',
      [member_id, parseFloat(amount), reason || null, issued_date, 'Unpaid', req.user.id]
    );
    res.status(201).json({ id: result.insertId, ...req.body, status: 'Unpaid' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const { member_id, amount, reason, issued_date } = req.body;
    if (!member_id || amount == null || !issued_date) {
      return res.status(400).json({ error: 'member_id, amount, and issued_date are required' });
    }
    const [result] = await pool.query(
      'UPDATE fines SET member_id = ?, amount = ?, reason = ?, issued_date = ? WHERE id = ?',
      [member_id, parseFloat(amount), reason || null, issued_date, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
    const [[row]] = await pool.query('SELECT f.*, m.full_name as member_name FROM fines f JOIN members m ON f.member_id = m.id WHERE f.id = ?', [req.params.id]);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/pay', authenticate, async (req, res) => {
  try {
    const { payment_date } = req.body;
    const payDate = payment_date || new Date().toISOString().slice(0, 10);
    const [result] = await pool.query(
      'UPDATE fines SET status = ?, payment_date = ? WHERE id = ? AND status = ?',
      ['Paid', payDate, req.params.id, 'Unpaid']
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Fine not found or already paid' });
    const [[row]] = await pool.query('SELECT * FROM fines WHERE id = ?', [req.params.id]);
    const amount = parseFloat(row.amount || 0);
    res.json({ ...row, addedToPool: amount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM fines WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

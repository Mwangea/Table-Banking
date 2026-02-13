import express from 'express';
import pool from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT r.*, m.full_name as member_name FROM registration_fees r JOIN members m ON r.member_id = m.id ORDER BY r.payment_date DESC, r.id DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { member_id, amount, payment_date } = req.body;
    if (!member_id || amount == null || !payment_date) {
      return res.status(400).json({ error: 'member_id, amount, and payment_date are required' });
    }
    const [result] = await pool.query(
      'INSERT INTO registration_fees (member_id, amount, payment_date, recorded_by) VALUES (?, ?, ?, ?)',
      [member_id, parseFloat(amount), payment_date, req.user.id]
    );
    res.status(201).json({ id: result.insertId, ...req.body });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const { member_id, amount, payment_date } = req.body;
    if (!member_id || amount == null || !payment_date) {
      return res.status(400).json({ error: 'member_id, amount, and payment_date are required' });
    }
    const [result] = await pool.query(
      'UPDATE registration_fees SET member_id = ?, amount = ?, payment_date = ? WHERE id = ?',
      [member_id, parseFloat(amount), payment_date, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
    const [[row]] = await pool.query('SELECT r.*, m.full_name as member_name FROM registration_fees r JOIN members m ON r.member_id = m.id WHERE r.id = ?', [req.params.id]);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM registration_fees WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

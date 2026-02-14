import express from 'express';
import pool from '../db/connection.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT m.*, COALESCE(c.total_contributions, 0) as total_contributions,
        COALESCE(r.registration_fee_paid, 0) as registration_fee_paid
      FROM members m
      LEFT JOIN (SELECT member_id, SUM(amount) as total_contributions FROM contributions GROUP BY member_id) c ON m.id = c.member_id
      LEFT JOIN (SELECT member_id, SUM(amount) as registration_fee_paid FROM registration_fees GROUP BY member_id) r ON m.id = r.member_id
      ORDER BY m.full_name
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const [members] = await pool.query('SELECT * FROM members WHERE id = ?', [req.params.id]);
    if (members.length === 0) return res.status(404).json({ error: 'Member not found' });
    res.json(members[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { full_name, phone, national_id, date_joined, status } = req.body;
    if (!full_name || !phone || !date_joined) {
      return res.status(400).json({ error: 'full_name, phone, and date_joined are required' });
    }
    const [result] = await pool.query(
      'INSERT INTO members (full_name, phone, national_id, date_joined, status) VALUES (?, ?, ?, ?, ?)',
      [full_name, phone, national_id || null, date_joined, status || 'Active']
    );
    res.status(201).json({ id: result.insertId, ...req.body });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { full_name, phone, national_id, date_joined, status } = req.body;
    const [result] = await pool.query(
      'UPDATE members SET full_name = ?, phone = ?, national_id = ?, date_joined = ?, status = ? WHERE id = ?',
      [full_name, phone, national_id || null, date_joined, status || 'Active', req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Member not found' });
    res.json({ id: req.params.id, ...req.body });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/clear-all', authenticate, requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM members');
    res.json({ message: `${result.affectedRows} member(s) deleted` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM members WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Member not found' });
    res.json({ message: 'Member deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

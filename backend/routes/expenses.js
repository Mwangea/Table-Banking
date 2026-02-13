import express from 'express';
import pool from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT e.*, u.username as recorded_by_name FROM expenses e LEFT JOIN users u ON e.recorded_by = u.id ORDER BY e.expense_date DESC, e.id DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { amount, expense_date, category, description } = req.body;
    if (amount == null || !expense_date) {
      return res.status(400).json({ error: 'amount and expense_date are required' });
    }
    const [result] = await pool.query(
      'INSERT INTO expenses (amount, expense_date, category, description, recorded_by) VALUES (?, ?, ?, ?, ?)',
      [parseFloat(amount), expense_date, category || null, description || null, req.user.id]
    );
    res.status(201).json({ id: result.insertId, ...req.body });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const { amount, expense_date, category, description } = req.body;
    if (amount == null || !expense_date) {
      return res.status(400).json({ error: 'amount and expense_date are required' });
    }
    const [result] = await pool.query(
      'UPDATE expenses SET amount = ?, expense_date = ?, category = ?, description = ? WHERE id = ?',
      [parseFloat(amount), expense_date, category || null, description || null, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
    const [[row]] = await pool.query('SELECT * FROM expenses WHERE id = ?', [req.params.id]);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM expenses WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

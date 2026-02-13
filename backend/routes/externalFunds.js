import express from 'express';
import pool from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT e.*, u.username as recorded_by_name FROM external_funds e LEFT JOIN users u ON e.recorded_by = u.id ORDER BY e.received_date DESC, e.id DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { source, amount, received_date, description } = req.body;
    if (!source || amount == null || !received_date) {
      return res.status(400).json({ error: 'source, amount, and received_date are required' });
    }
    const validSources = ['Financial Aid', 'Government Loan', 'Other'];
    if (!validSources.includes(source)) {
      return res.status(400).json({ error: 'Invalid source' });
    }
    const [result] = await pool.query(
      'INSERT INTO external_funds (source, amount, received_date, description, recorded_by) VALUES (?, ?, ?, ?, ?)',
      [source, parseFloat(amount), received_date, description || null, req.user.id]
    );
    res.status(201).json({ id: result.insertId, ...req.body });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const { source, amount, received_date, description } = req.body;
    if (!source || amount == null || !received_date) {
      return res.status(400).json({ error: 'source, amount, and received_date are required' });
    }
    const validSources = ['Financial Aid', 'Government Loan', 'Other'];
    if (!validSources.includes(source)) {
      return res.status(400).json({ error: 'Invalid source' });
    }
    const [result] = await pool.query(
      'UPDATE external_funds SET source = ?, amount = ?, received_date = ?, description = ? WHERE id = ?',
      [source, parseFloat(amount), received_date, description || null, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
    const [[row]] = await pool.query('SELECT * FROM external_funds WHERE id = ?', [req.params.id]);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM external_funds WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

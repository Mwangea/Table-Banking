import express from 'express';
import pool from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const { loan_id } = req.query;
    let sql = `SELECT r.*, l.total_amount as loan_total, m.full_name as member_name FROM repayments r 
               JOIN loans l ON r.loan_id = l.id JOIN members m ON l.member_id = m.id WHERE 1=1`;
    const params = [];
    if (loan_id) { sql += ' AND r.loan_id = ?'; params.push(loan_id); }
    sql += ' ORDER BY r.payment_date DESC';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { loan_id, amount_paid, payment_date } = req.body;
    if (!loan_id || !amount_paid || !payment_date) {
      return res.status(400).json({ error: 'loan_id, amount_paid, payment_date are required' });
    }
    const [loan] = await pool.query('SELECT total_amount FROM loans WHERE id = ?', [loan_id]);
    if (loan.length === 0) return res.status(404).json({ error: 'Loan not found' });
    const [rep] = await pool.query('SELECT COALESCE(SUM(amount_paid), 0) as total_paid FROM repayments WHERE loan_id = ?', [loan_id]);
    const totalPaid = parseFloat(rep[0].total_paid);
    const totalAmount = parseFloat(loan[0].total_amount);
    const amount = parseFloat(amount_paid);
    if (totalPaid + amount > totalAmount) return res.status(400).json({ error: 'Payment exceeds loan balance' });

    const [result] = await pool.query(
      'INSERT INTO repayments (loan_id, amount_paid, payment_date, recorded_by) VALUES (?, ?, ?, ?)',
      [loan_id, amount, payment_date, req.user.id]
    );
    const newTotal = totalPaid + amount;
    const newStatus = newTotal >= totalAmount ? 'Completed' : 'Ongoing';
    await pool.query('UPDATE loans SET status = ? WHERE id = ?', [newStatus, loan_id]);
    res.status(201).json({ id: result.insertId, loan_id, amount_paid: amount, payment_date, recorded_by: req.user.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

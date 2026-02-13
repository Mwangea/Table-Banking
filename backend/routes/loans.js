import express from 'express';
import pool from '../db/connection.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const { member_id, status } = req.query;
    let sql = `SELECT l.*, m.full_name as member_name FROM loans l 
               JOIN members m ON l.member_id = m.id WHERE 1=1`;
    const params = [];
    if (member_id) { sql += ' AND l.member_id = ?'; params.push(member_id); }
    if (status) { sql += ' AND l.status = ?'; params.push(status); }
    sql += ' ORDER BY l.issue_date DESC';
    const [rows] = await pool.query(sql, params);
    const loansWithBalance = await Promise.all(rows.map(async (loan) => {
      const [rep] = await pool.query('SELECT COALESCE(SUM(amount_paid), 0) as total_paid FROM repayments WHERE loan_id = ?', [loan.id]);
      const totalPaid = parseFloat(rep[0].total_paid);
      const balance = parseFloat(loan.total_amount) - totalPaid;
      return { ...loan, total_paid: totalPaid, balance };
    }));
    res.json(loansWithBalance);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const [loans] = await pool.query(
      'SELECT l.*, m.full_name as member_name FROM loans l JOIN members m ON l.member_id = m.id WHERE l.id = ?',
      [req.params.id]
    );
    if (loans.length === 0) return res.status(404).json({ error: 'Loan not found' });
    const [rep] = await pool.query('SELECT COALESCE(SUM(amount_paid), 0) as total_paid FROM repayments WHERE loan_id = ?', [req.params.id]);
    const loan = { ...loans[0], total_paid: parseFloat(rep[0].total_paid), balance: parseFloat(loans[0].total_amount) - parseFloat(rep[0].total_paid) };
    res.json(loan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { member_id, loan_amount, interest_rate, issue_date, due_date } = req.body;
    if (!member_id || !loan_amount || !interest_rate || !issue_date || !due_date) {
      return res.status(400).json({ error: 'member_id, loan_amount, interest_rate, issue_date, due_date are required' });
    }
    const [member] = await pool.query('SELECT status FROM members WHERE id = ?', [member_id]);
    if (member.length === 0) return res.status(404).json({ error: 'Member not found' });
    if (member[0].status !== 'Active') return res.status(400).json({ error: 'Member must be Active to apply for loan' });

    const [regFee] = await pool.query('SELECT COUNT(*) as paid FROM registration_fees WHERE member_id = ?', [member_id]);
    if (!regFee[0]?.paid || regFee[0].paid === 0) {
      return res.status(400).json({ error: 'Member must pay registration fee before applying for a loan' });
    }

    const [contrib] = await pool.query('SELECT COALESCE(SUM(amount), 0) as total FROM contributions');
    const [repaid] = await pool.query('SELECT COALESCE(SUM(amount_paid), 0) as total FROM repayments');
    const [principalLent] = await pool.query('SELECT COALESCE(SUM(loan_amount), 0) as total FROM loans');
    const [[extTotal]] = await pool.query('SELECT COALESCE(SUM(amount), 0) as total FROM external_funds');
    const [[expTotal]] = await pool.query('SELECT COALESCE(SUM(amount), 0) as total FROM expenses');
    const [[regTotal]] = await pool.query('SELECT COALESCE(SUM(amount), 0) as total FROM registration_fees');
    const [[finesTotal]] = await pool.query("SELECT COALESCE(SUM(amount), 0) as total FROM fines WHERE status = 'Paid'");
    const totalContributions = parseFloat(contrib[0].total);
    const totalRepaid = parseFloat(repaid[0].total);
    const totalPrincipalLent = parseFloat(principalLent[0].total);
    const totalExternal = parseFloat(extTotal?.total || 0);
    const totalExpenses = parseFloat(expTotal?.total || 0);
    const totalRegFees = parseFloat(regTotal?.total || 0);
    const totalFinesPaid = parseFloat(finesTotal?.total || 0);
    const [activeLoans] = await pool.query(`
      SELECT l.id, l.total_amount, COALESCE((SELECT SUM(amount_paid) FROM repayments WHERE loan_id = l.id), 0) as total_paid
      FROM loans l WHERE l.status IN ('Ongoing', 'Defaulted', 'Pending')
    `);
    let outstandingBalance = 0;
    for (const row of activeLoans) {
      outstandingBalance += parseFloat(row.total_amount) - parseFloat(row.total_paid);
    }
    const poolTotal = totalContributions + totalRepaid + totalExternal + totalRegFees + totalFinesPaid - totalPrincipalLent - totalExpenses;
    const availableCash = poolTotal - outstandingBalance;

    const [memberContrib] = await pool.query('SELECT COALESCE(SUM(amount), 0) as total FROM contributions WHERE member_id = ?', [member_id]);
    const memberTotalContrib = parseFloat(memberContrib[0].total);
    const [settings] = await pool.query("SELECT key_value FROM settings WHERE key_name = 'max_loan_multiplier'");
    const multiplier = parseFloat(settings[0]?.key_value || 3);
    const loanAmount = parseFloat(loan_amount);
    if (loanAmount > memberTotalContrib * multiplier) {
      return res.status(400).json({ error: `Loan cannot exceed ${multiplier}x member contributions (max: ${(memberTotalContrib * multiplier).toFixed(2)})` });
    }
    if (loanAmount > availableCash) {
      return res.status(400).json({ error: `Insufficient group funds. Available cash: ${availableCash.toFixed(2)}. The group can only lend from pooled contributions minus outstanding loans.` });
    }

    const rate = parseFloat(interest_rate) / 100;
    const interestAmount = loanAmount * rate;
    const totalAmount = loanAmount + interestAmount;

    const [result] = await pool.query(
      'INSERT INTO loans (member_id, loan_amount, interest_rate, interest_amount, total_amount, issue_date, due_date, status, approved_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [member_id, loanAmount, interest_rate, interestAmount, totalAmount, issue_date, due_date, 'Ongoing', req.user.id]
    );
    res.status(201).json({
      id: result.insertId,
      member_id,
      loan_amount: loanAmount,
      interest_rate,
      interest_amount: interestAmount,
      total_amount: totalAmount,
      issue_date,
      due_date,
      status: 'Ongoing'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/status', authenticate, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['Pending', 'Ongoing', 'Completed', 'Defaulted'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const [result] = await pool.query('UPDATE loans SET status = ? WHERE id = ?', [status, req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Loan not found' });
    res.json({ id: req.params.id, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

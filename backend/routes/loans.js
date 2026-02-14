import express from 'express';
import pool from '../db/connection.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { calculateReducingBalance, generateMonthlySchedule } from '../utils/reducingBalance.js';

const router = express.Router();

router.get('/schedule-preview', authenticate, (req, res) => {
  try {
    const loanAmount = parseFloat(req.query.loan_amount);
    const issueDate = req.query.issue_date;
    if (!loanAmount || loanAmount <= 0 || !issueDate) {
      return res.status(400).json({ error: 'loan_amount and issue_date required' });
    }
    const schedule = generateMonthlySchedule(loanAmount, issueDate);
    const totalInterest = schedule.reduce((s, r) => s + r.interest, 0);
    res.json({ schedule, total_interest: totalInterest, total_amount: loanAmount + totalInterest });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
      const [reps] = await pool.query('SELECT amount_paid, payment_date FROM repayments WHERE loan_id = ? ORDER BY payment_date', [loan.id]);
      const calc = calculateReducingBalance(loan, reps);
      return { ...loan, interest_amount: calc.total_interest, total_amount: calc.total_amount, total_paid: calc.total_paid, balance: calc.balance, schedule: calc.schedule };
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
    const [reps] = await pool.query('SELECT amount_paid, payment_date FROM repayments WHERE loan_id = ? ORDER BY payment_date', [req.params.id]);
    const calc = calculateReducingBalance(loans[0], reps);
    const loan = { ...loans[0], interest_amount: calc.total_interest, total_amount: calc.total_amount, total_paid: calc.total_paid, balance: calc.balance, schedule: calc.schedule };
    res.json(loan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { member_id, loan_amount, issue_date, due_date } = req.body;
    if (!member_id || !loan_amount || !issue_date || !due_date) {
      return res.status(400).json({ error: 'member_id, loan_amount, issue_date, due_date are required' });
    }
    const interest_rate = 10; // 10% per annum on reducing balance (fixed)
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
    const [activeLoans] = await pool.query(`SELECT * FROM loans l WHERE l.status IN ('Ongoing', 'Defaulted', 'Pending')`);
    let outstandingBalance = 0;
    for (const loan of activeLoans) {
      const [reps] = await pool.query('SELECT amount_paid, payment_date FROM repayments WHERE loan_id = ? ORDER BY payment_date', [loan.id]);
      const calc = calculateReducingBalance(loan, reps);
      outstandingBalance += calc.balance;
    }
    const poolTotal = totalContributions + totalRepaid + totalExternal + totalRegFees + totalFinesPaid - totalPrincipalLent - totalExpenses;
    const availableCash = poolTotal;

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

    const scheduleCalc = calculateReducingBalance({ loan_amount: loanAmount, issue_date }, []);
    const interestAmount = scheduleCalc.total_interest;
    const totalAmount = scheduleCalc.total_amount;

    const [result] = await pool.query(
      'INSERT INTO loans (member_id, loan_amount, interest_rate, interest_amount, total_amount, issue_date, due_date, status, approved_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [member_id, loanAmount, interest_rate, interestAmount, totalAmount, issue_date, due_date, 'Ongoing', req.user.id]
    );
    const scheduleCalc2 = calculateReducingBalance({ loan_amount: loanAmount, issue_date }, []);
    res.status(201).json({
      id: result.insertId,
      member_id,
      loan_amount: loanAmount,
      interest_rate,
      interest_amount: interestAmount,
      total_amount: totalAmount,
      issue_date,
      due_date,
      status: 'Ongoing',
      schedule: scheduleCalc2.schedule
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

router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { member_id, loan_amount, issue_date, due_date } = req.body;
    if (!member_id || !loan_amount || !issue_date || !due_date) {
      return res.status(400).json({ error: 'member_id, loan_amount, issue_date, due_date are required' });
    }
    const interest_rate = 10; // 10% per annum on reducing balance (fixed)
    const [existing] = await pool.query('SELECT * FROM loans WHERE id = ?', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Loan not found' });
    if (existing[0].status === 'Completed') {
      return res.status(400).json({ error: 'Cannot edit a completed loan' });
    }
    const [member] = await pool.query('SELECT status FROM members WHERE id = ?', [member_id]);
    if (member.length === 0) return res.status(404).json({ error: 'Member not found' });
    const loanAmount = parseFloat(loan_amount);
    const updatedLoan = { ...existing[0], loan_amount: loanAmount, interest_rate: parseFloat(interest_rate), issue_date };
    const [reps] = await pool.query('SELECT amount_paid, payment_date FROM repayments WHERE loan_id = ? ORDER BY payment_date', [req.params.id]);
    const putCalc = calculateReducingBalance(
      { ...updatedLoan, loan_amount: loanAmount, issue_date },
      reps
    );
    if (putCalc.balance < 0) {
      return res.status(400).json({ error: `Amount already repaid (${putCalc.total_paid.toFixed(2)}) exceeds new loan total` });
    }
    await pool.query(
      'UPDATE loans SET member_id = ?, loan_amount = ?, interest_rate = ?, interest_amount = ?, total_amount = ?, issue_date = ?, due_date = ? WHERE id = ?',
      [member_id, loanAmount, interest_rate, putCalc.total_interest, putCalc.total_amount, issue_date, due_date, req.params.id]
    );
    const [loans] = await pool.query(
      'SELECT l.*, m.full_name as member_name FROM loans l JOIN members m ON l.member_id = m.id WHERE l.id = ?',
      [req.params.id]
    );
    const [reps2] = await pool.query('SELECT amount_paid, payment_date FROM repayments WHERE loan_id = ? ORDER BY payment_date', [req.params.id]);
    const getCalc = calculateReducingBalance(loans[0], reps2);
    const row = { ...loans[0], interest_amount: getCalc.total_interest, total_amount: getCalc.total_amount, total_paid: getCalc.total_paid, balance: getCalc.balance, schedule: getCalc.schedule };
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM loans WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Loan not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

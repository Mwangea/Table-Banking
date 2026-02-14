import express from 'express';
import pool from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';
import { calculateReducingBalance } from '../utils/reducingBalance.js';

const router = express.Router();

router.get('/member-statement/:memberId', authenticate, async (req, res) => {
  try {
    const { memberId } = req.params;
    const [member] = await pool.query('SELECT * FROM members WHERE id = ?', [memberId]);
    if (member.length === 0) return res.status(404).json({ error: 'Member not found' });

    const [contributions] = await pool.query('SELECT * FROM contributions WHERE member_id = ? ORDER BY contribution_date DESC', [memberId]);
    const [loans] = await pool.query('SELECT * FROM loans WHERE member_id = ? ORDER BY issue_date DESC', [memberId]);
    const loanIds = loans.map(l => l.id);
    let repayments = [];
    if (loanIds.length > 0) {
      const [rep] = await pool.query('SELECT * FROM repayments WHERE loan_id IN (?) ORDER BY payment_date DESC', [loanIds]);
      repayments = rep;
    }

    const totalContributions = contributions.reduce((s, c) => s + parseFloat(c.amount), 0);
    const [regFees] = await pool.query('SELECT * FROM registration_fees WHERE member_id = ?', [memberId]);
    const [memberFines] = await pool.query('SELECT * FROM fines WHERE member_id = ? ORDER BY issued_date DESC', [memberId]);
    const totalRegFee = regFees.reduce((s, r) => s + parseFloat(r.amount), 0);
    const finesPaid = memberFines.filter(f => f.status === 'Paid').reduce((s, f) => s + parseFloat(f.amount), 0);
    const finesUnpaid = memberFines.filter(f => f.status === 'Unpaid').reduce((s, f) => s + parseFloat(f.amount), 0);
    let totalOutstanding = 0;
    const loansWithBalance = await Promise.all(loans.map(async (l) => {
      const [rep] = await pool.query('SELECT amount_paid, payment_date FROM repayments WHERE loan_id = ? ORDER BY payment_date', [l.id]);
      const calc = calculateReducingBalance(l, rep);
      totalOutstanding += calc.balance;
      return { ...l, total_paid: calc.total_paid, balance: calc.balance };
    }));

    const netPosition = totalContributions - totalOutstanding - finesUnpaid;

    res.json({
      member: member[0],
      contributions,
      loans: loansWithBalance,
      repayments,
      registrationFees: regFees,
      fines: memberFines,
      totalContributions,
      totalRegFee,
      finesPaid,
      finesUnpaid,
      totalOutstandingBalance: totalOutstanding,
      netPosition
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/group-financial', authenticate, async (req, res) => {
  try {
    const [monthlyContrib] = await pool.query(`
      SELECT month, year, SUM(amount) as total FROM contributions GROUP BY month, year ORDER BY year DESC, month DESC
    `);
    const [allLoans] = await pool.query('SELECT * FROM loans');
    const [allRepayments] = await pool.query('SELECT loan_id, amount_paid, payment_date FROM repayments');
    const repayByLoan = {};
    for (const r of allRepayments) {
      if (!repayByLoan[r.loan_id]) repayByLoan[r.loan_id] = [];
      repayByLoan[r.loan_id].push({ amount_paid: r.amount_paid, payment_date: r.payment_date });
    }
    let totalLoanAmount = 0;
    let totalInterestEarned = 0;
    for (const loan of allLoans) {
      const calc = calculateReducingBalance(loan, repayByLoan[loan.id] || []);
      totalLoanAmount += calc.total_amount;
      totalInterestEarned += calc.total_interest;
    }
    const [defaulted] = await pool.query("SELECT * FROM loans WHERE status = 'Defaulted'");
    const [[extTotal]] = await pool.query('SELECT COALESCE(SUM(amount), 0) as t FROM external_funds');
    const [[expTotal]] = await pool.query('SELECT COALESCE(SUM(amount), 0) as t FROM expenses');
    const [[regTotal]] = await pool.query('SELECT COALESCE(SUM(amount), 0) as t FROM registration_fees');
    const [[finesTotal]] = await pool.query("SELECT COALESCE(SUM(amount), 0) as t FROM fines WHERE status = 'Paid'");
    res.json({
      monthlyContributions: monthlyContrib,
      totalLoansIssued: allLoans.length,
      totalLoanAmount,
      totalInterestEarned,
      totalExternalFunds: parseFloat(extTotal?.t || 0),
      totalExpenses: parseFloat(expTotal?.t || 0),
      totalRegFees: parseFloat(regTotal?.t || 0),
      totalFinesPaid: parseFloat(finesTotal?.t || 0),
      defaultedLoans: defaulted
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

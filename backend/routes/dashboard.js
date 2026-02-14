import express from 'express';
import pool from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';
import { calculateReducingBalance } from '../utils/reducingBalance.js';

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const [[members]] = await pool.query('SELECT COUNT(*) as count FROM members WHERE status = ?', ['Active']);
    const [[contrib]] = await pool.query('SELECT COALESCE(SUM(amount), 0) as total FROM contributions');
    const [[externalTotal]] = await pool.query('SELECT COALESCE(SUM(amount), 0) as total FROM external_funds');
    const [[expenseTotal]] = await pool.query('SELECT COALESCE(SUM(amount), 0) as total FROM expenses');
    const [[regFeeTotal]] = await pool.query('SELECT COALESCE(SUM(amount), 0) as total FROM registration_fees');
    const [[finesPaidTotal]] = await pool.query("SELECT COALESCE(SUM(amount), 0) as total FROM fines WHERE status = 'Paid'");
    const [[loans]] = await pool.query("SELECT COUNT(*) as count FROM loans WHERE status IN ('Ongoing', 'Pending')");
    const [[loaned]] = await pool.query('SELECT COALESCE(SUM(loan_amount), 0) as total FROM loans');
    const [[repaid]] = await pool.query('SELECT COALESCE(SUM(amount_paid), 0) as total FROM repayments');

    const [allLoans] = await pool.query('SELECT * FROM loans');
    const [allRepayments] = await pool.query('SELECT loan_id, amount_paid, payment_date FROM repayments');
    const repayByLoan = {};
    for (const r of allRepayments) {
      if (!repayByLoan[r.loan_id]) repayByLoan[r.loan_id] = [];
      repayByLoan[r.loan_id].push({ amount_paid: r.amount_paid, payment_date: r.payment_date });
    }
    let totalInterest = 0;
    let outstandingBalance = 0;
    let totalDefaulted = 0;
    for (const loan of allLoans) {
      const reps = repayByLoan[loan.id] || [];
      const calc = calculateReducingBalance(loan, reps);
      totalInterest += calc.total_interest;
      if (['Ongoing', 'Pending', 'Defaulted'].includes(loan.status)) {
        outstandingBalance += calc.balance;
      }
      if (loan.status === 'Defaulted') totalDefaulted += calc.balance;
    }

    const totalContributions = parseFloat(contrib.total);
    const totalRepaid = parseFloat(repaid.total);
    const totalExternalFunds = parseFloat(externalTotal.total);
    const totalExpenses = parseFloat(expenseTotal.total);
    const totalRegFees = parseFloat(regFeeTotal.total);
    const totalFinesPaid = parseFloat(finesPaidTotal.total);
    const totalPrincipalLent = parseFloat(loaned.total);
    const poolTotal = totalContributions + totalRepaid + totalExternalFunds + totalRegFees + totalFinesPaid - totalPrincipalLent - totalExpenses;
    const availableCash = poolTotal;

    const [recentContrib] = await pool.query(`
      SELECT c.id, c.amount, c.contribution_date, m.full_name as member_name 
      FROM contributions c JOIN members m ON c.member_id = m.id 
      ORDER BY c.contribution_date DESC, c.id DESC LIMIT 8
    `);
    const [recentRepay] = await pool.query(`
      SELECT r.id, r.amount_paid, r.payment_date, m.full_name as member_name, l.id as loan_id 
      FROM repayments r JOIN loans l ON r.loan_id = l.id JOIN members m ON l.member_id = m.id 
      ORDER BY r.payment_date DESC, r.id DESC LIMIT 8
    `);
    const [activeLoansRows] = await pool.query(`
      SELECT l.*, m.full_name as member_name
      FROM loans l JOIN members m ON l.member_id = m.id 
      WHERE l.status IN ('Ongoing', 'Defaulted') 
      ORDER BY l.issue_date DESC LIMIT 5
    `);
    const activeLoansList = activeLoansRows.map(l => {
      const reps = repayByLoan[l.id] || [];
      const calc = calculateReducingBalance(l, reps);
      return { id: l.id, member_name: l.member_name, total_amount: calc.total_amount, total_paid: calc.total_paid, status: l.status, balance: calc.balance };
    });
    const [defaultedRows] = await pool.query(`
      SELECT l.*, m.full_name as member_name
      FROM loans l JOIN members m ON l.member_id = m.id 
      WHERE l.status = 'Defaulted' LIMIT 5
    `);
    const defaultedList = defaultedRows.map(l => {
      const reps = repayByLoan[l.id] || [];
      const calc = calculateReducingBalance(l, reps);
      return { id: l.id, member_name: l.member_name, total_amount: calc.total_amount, total_paid: calc.total_paid, balance: calc.balance };
    });

    const [recentExternal] = await pool.query('SELECT e.id, e.source, e.amount, e.received_date FROM external_funds e ORDER BY e.received_date DESC LIMIT 5');
    const [recentExpenses] = await pool.query('SELECT e.id, e.amount, e.expense_date, e.category FROM expenses e ORDER BY e.expense_date DESC LIMIT 5');

    res.json({
      totalMembers: members.count,
      totalContributions,
      totalExternalFunds,
      totalExpenses,
      totalRegFees,
      totalFinesPaid,
      totalActiveLoans: loans.count,
      totalMoneyLoaned: parseFloat(loaned.total),
      totalInterestEarned: totalInterest,
      totalMoneyRepaid: totalRepaid,
      totalOutstandingBalance: outstandingBalance,
      availableCashInGroup: availableCash,
      poolTotal,
      totalDefaulted,
      recentContributions: recentContrib,
      recentRepayments: recentRepay,
      activeLoans: activeLoansList,
      defaultedLoans: defaultedList,
      recentExternalFunds: recentExternal,
      recentExpenses: recentExpenses
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

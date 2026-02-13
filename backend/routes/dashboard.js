import express from 'express';
import pool from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';

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
    const [[interest]] = await pool.query('SELECT COALESCE(SUM(interest_amount), 0) as total FROM loans');
    const [[repaid]] = await pool.query('SELECT COALESCE(SUM(amount_paid), 0) as total FROM repayments');
    const [[defaulted]] = await pool.query("SELECT COALESCE(SUM(total_amount), 0) - COALESCE((SELECT SUM(r.amount_paid) FROM repayments r WHERE r.loan_id IN (SELECT id FROM loans WHERE status = 'Defaulted')), 0) as total FROM loans WHERE status = ?", ['Defaulted']);
    
    const activeLoans = await pool.query(`
      SELECT l.id, l.total_amount, COALESCE(SUM(r.amount_paid), 0) as paid 
      FROM loans l LEFT JOIN repayments r ON l.id = r.loan_id 
      WHERE l.status IN ('Ongoing', 'Pending', 'Defaulted') GROUP BY l.id
    `);
    let outstandingBalance = 0;
    for (const row of activeLoans[0]) {
      outstandingBalance += parseFloat(row.total_amount) - parseFloat(row.paid);
    }

    const totalContributions = parseFloat(contrib.total);
    const totalRepaid = parseFloat(repaid.total);
    const totalExternalFunds = parseFloat(externalTotal.total);
    const totalExpenses = parseFloat(expenseTotal.total);
    const totalRegFees = parseFloat(regFeeTotal.total);
    const totalFinesPaid = parseFloat(finesPaidTotal.total);
    const totalPrincipalLent = parseFloat(loaned.total);
    const poolTotal = totalContributions + totalRepaid + totalExternalFunds + totalRegFees + totalFinesPaid - totalPrincipalLent - totalExpenses;
    const availableCash = poolTotal - outstandingBalance;

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
    const [activeLoansList] = await pool.query(`
      SELECT l.id, m.full_name as member_name, l.total_amount, 
        COALESCE((SELECT SUM(amount_paid) FROM repayments WHERE loan_id = l.id), 0) as total_paid,
        l.status
      FROM loans l JOIN members m ON l.member_id = m.id 
      WHERE l.status IN ('Ongoing', 'Defaulted') 
      ORDER BY l.issue_date DESC LIMIT 5
    `);
    const [defaultedList] = await pool.query(`
      SELECT l.id, m.full_name as member_name, l.total_amount, 
        COALESCE((SELECT SUM(amount_paid) FROM repayments WHERE loan_id = l.id), 0) as total_paid
      FROM loans l JOIN members m ON l.member_id = m.id 
      WHERE l.status = 'Defaulted' LIMIT 5
    `);

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
      totalInterestEarned: parseFloat(interest.total),
      totalMoneyRepaid: totalRepaid,
      totalOutstandingBalance: outstandingBalance,
      availableCashInGroup: availableCash,
      poolTotal,
      totalDefaulted: parseFloat(defaulted[0]?.total || 0),
      recentContributions: recentContrib,
      recentRepayments: recentRepay,
      activeLoans: activeLoansList.map(l => ({
        ...l,
        balance: parseFloat(l.total_amount) - parseFloat(l.total_paid),
        total_paid: parseFloat(l.total_paid)
      })),
      defaultedLoans: defaultedList.map(l => ({
        ...l,
        balance: parseFloat(l.total_amount) - parseFloat(l.total_paid)
      })),
      recentExternalFunds: recentExternal,
      recentExpenses: recentExpenses
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

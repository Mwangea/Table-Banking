import express from 'express';
import ExcelJS from 'exceljs';
import pool from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

function getExportDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function createWorkbook() {
  return new ExcelJS.Workbook();
}

router.get('/members', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT m.id, m.full_name, m.phone, m.national_id, m.date_joined, m.status,
        COALESCE(r.reg_fee_paid, 0) as registration_fee_paid
      FROM members m
      LEFT JOIN (SELECT member_id, SUM(amount) as reg_fee_paid FROM registration_fees GROUP BY member_id) r ON m.id = r.member_id
      ORDER BY m.full_name
    `);
    const wb = await createWorkbook();
    const ws = wb.addWorksheet('Members');
    ws.columns = [
      { header: 'ID', key: 'id', width: 8 },
      { header: 'Full Name', key: 'full_name', width: 25 },
      { header: 'Phone', key: 'phone', width: 15 },
      { header: 'National ID', key: 'national_id', width: 18 },
      { header: 'Date Joined', key: 'date_joined', width: 15 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Reg. Fee Paid', key: 'registration_fee_paid', width: 14 }
    ];
    ws.addRows(rows.map(r => ({ ...r, registration_fee_paid: parseFloat(r.registration_fee_paid || 0) })));
    ws.getRow(1).font = { bold: true };
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=members-${getExportDate()}.xlsx`);
    await wb.xlsx.write(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/contributions', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT c.member_id, m.full_name as member_name, c.month, c.year, c.amount, c.contribution_date 
      FROM contributions c JOIN members m ON c.member_id = m.id ORDER BY c.contribution_date DESC
    `);
    const wb = await createWorkbook();
    const ws = wb.addWorksheet('Contributions');
    ws.columns = [
      { header: 'Member', key: 'member_name', width: 25 },
      { header: 'Month', key: 'month', width: 8 },
      { header: 'Year', key: 'year', width: 8 },
      { header: 'Amount', key: 'amount', width: 15 },
      { header: 'Date', key: 'contribution_date', width: 15 }
    ];
    ws.addRows(rows);
    ws.getRow(1).font = { bold: true };
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=contributions-${getExportDate()}.xlsx`);
    await wb.xlsx.write(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/loans', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT l.id, l.member_id, m.full_name as member_name, l.loan_amount, l.interest_rate, l.interest_amount, l.total_amount, 
        COALESCE(r.total_paid, 0) as total_paid, 
        (l.total_amount - COALESCE(r.total_paid, 0)) as balance, l.status
      FROM loans l 
      JOIN members m ON l.member_id = m.id 
      LEFT JOIN (SELECT loan_id, SUM(amount_paid) as total_paid FROM repayments GROUP BY loan_id) r ON l.id = r.loan_id
      ORDER BY l.issue_date DESC
    `);
    const wb = await createWorkbook();
    const ws = wb.addWorksheet('Loans');
    ws.columns = [
      { header: 'Member', key: 'member_name', width: 25 },
      { header: 'Total Contributions', key: 'total_contributions', width: 18 },
      { header: 'Loan Amount', key: 'loan_amount', width: 15 },
      { header: 'Interest', key: 'interest_amount', width: 12 },
      { header: 'Total Loan', key: 'total_amount', width: 15 },
      { header: 'Total Paid', key: 'total_paid', width: 15 },
      { header: 'Balance', key: 'balance', width: 15 }
    ];
    const contribMap = {};
    const [contrib] = await pool.query('SELECT member_id, SUM(amount) as total FROM contributions GROUP BY member_id');
    contrib.forEach(c => { contribMap[c.member_id] = parseFloat(c.total); });
    const data = rows.map(r => ({
      member_name: r.member_name,
      total_contributions: contribMap[r.member_id] || 0,
      loan_amount: parseFloat(r.loan_amount),
      interest_amount: parseFloat(r.interest_amount),
      total_amount: parseFloat(r.total_amount),
      total_paid: parseFloat(r.total_paid),
      balance: parseFloat(r.balance)
    }));
    ws.addRows(data);
    ws.getRow(1).font = { bold: true };
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=loans-${getExportDate()}.xlsx`);
    await wb.xlsx.write(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/repayments', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT r.id, m.full_name as member_name, l.id as loan_id, r.amount_paid, r.payment_date 
      FROM repayments r JOIN loans l ON r.loan_id = l.id JOIN members m ON l.member_id = m.id ORDER BY r.payment_date DESC
    `);
    const wb = await createWorkbook();
    const ws = wb.addWorksheet('Repayments');
    ws.columns = [
      { header: 'Member', key: 'member_name', width: 25 },
      { header: 'Loan ID', key: 'loan_id', width: 10 },
      { header: 'Amount Paid', key: 'amount_paid', width: 15 },
      { header: 'Payment Date', key: 'payment_date', width: 15 }
    ];
    ws.addRows(rows);
    ws.getRow(1).font = { bold: true };
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=repayments-${getExportDate()}.xlsx`);
    await wb.xlsx.write(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/external-funds', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT source, amount, received_date, description FROM external_funds ORDER BY received_date DESC');
    const wb = await createWorkbook();
    const ws = wb.addWorksheet('External Funds');
    ws.columns = [
      { header: 'Source', key: 'source', width: 18 },
      { header: 'Amount', key: 'amount', width: 15 },
      { header: 'Date', key: 'received_date', width: 15 },
      { header: 'Description', key: 'description', width: 30 }
    ];
    ws.addRows(rows);
    ws.getRow(1).font = { bold: true };
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=external-funds-${getExportDate()}.xlsx`);
    await wb.xlsx.write(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/expenses', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT amount, expense_date, category, description FROM expenses ORDER BY expense_date DESC');
    const wb = await createWorkbook();
    const ws = wb.addWorksheet('Expenses');
    ws.columns = [
      { header: 'Amount', key: 'amount', width: 15 },
      { header: 'Date', key: 'expense_date', width: 15 },
      { header: 'Category', key: 'category', width: 18 },
      { header: 'Description', key: 'description', width: 30 }
    ];
    ws.addRows(rows);
    ws.getRow(1).font = { bold: true };
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=expenses-${getExportDate()}.xlsx`);
    await wb.xlsx.write(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/registration-fees', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT m.full_name as member_name, r.amount, r.payment_date 
      FROM registration_fees r JOIN members m ON r.member_id = m.id ORDER BY r.payment_date DESC
    `);
    const wb = await createWorkbook();
    const ws = wb.addWorksheet('Registration Fees');
    ws.columns = [
      { header: 'Member', key: 'member_name', width: 25 },
      { header: 'Amount', key: 'amount', width: 15 },
      { header: 'Date', key: 'payment_date', width: 15 }
    ];
    ws.addRows(rows);
    ws.getRow(1).font = { bold: true };
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=registration-fees-${getExportDate()}.xlsx`);
    await wb.xlsx.write(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/fines', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT m.full_name as member_name, f.amount, f.reason, f.issued_date, f.status, f.payment_date 
      FROM fines f JOIN members m ON f.member_id = m.id ORDER BY f.issued_date DESC
    `);
    const wb = await createWorkbook();
    const ws = wb.addWorksheet('Fines');
    ws.columns = [
      { header: 'Member', key: 'member_name', width: 25 },
      { header: 'Amount', key: 'amount', width: 12 },
      { header: 'Reason', key: 'reason', width: 20 },
      { header: 'Issued', key: 'issued_date', width: 12 },
      { header: 'Status', key: 'status', width: 10 },
      { header: 'Paid Date', key: 'payment_date', width: 12 }
    ];
    ws.addRows(rows);
    ws.getRow(1).font = { bold: true };
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=fines-${getExportDate()}.xlsx`);
    await wb.xlsx.write(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/monthly-summary', authenticate, async (req, res) => {
  try {
    const [contrib] = await pool.query('SELECT month, year, SUM(amount) as total FROM contributions GROUP BY month, year ORDER BY year, month');
    const [loans] = await pool.query('SELECT MONTH(issue_date) as month, YEAR(issue_date) as year, COUNT(*) as count, SUM(loan_amount) as principal, SUM(interest_amount) as interest FROM loans GROUP BY month, year ORDER BY year, month');
    const [repay] = await pool.query('SELECT MONTH(payment_date) as month, YEAR(payment_date) as year, SUM(amount_paid) as total FROM repayments GROUP BY month, year ORDER BY year, month');
    const wb = await createWorkbook();
    const ws = wb.addWorksheet('Monthly Summary');
    ws.columns = [
      { header: 'Month', key: 'month', width: 8 },
      { header: 'Year', key: 'year', width: 8 },
      { header: 'Contributions', key: 'contributions', width: 15 },
      { header: 'Loans Count', key: 'loans_count', width: 12 },
      { header: 'Principal Lent', key: 'loans_principal', width: 15 },
      { header: 'Interest', key: 'loans_interest', width: 12 },
      { header: 'Repayments', key: 'repayments', width: 15 }
    ];
    const contribMap = {};
    contrib.forEach(c => { contribMap[`${c.year}-${c.month}`] = { total: parseFloat(c.total) }; });
    const loansMap = {};
    loans.forEach(l => { loansMap[`${l.year}-${l.month}`] = { count: l.count, principal: parseFloat(l.principal), interest: parseFloat(l.interest) }; });
    const repayMap = {};
    repay.forEach(r => { repayMap[`${r.year}-${r.month}`] = parseFloat(r.total); });
    const keys = new Set([...Object.keys(contribMap), ...Object.keys(loansMap), ...Object.keys(repayMap)]);
    const data = [...keys].sort().map(k => {
      const [y, m] = k.split('-');
      return {
        month: parseInt(m),
        year: parseInt(y),
        contributions: contribMap[k]?.total || 0,
        loans_count: loansMap[k]?.count || 0,
        loans_principal: loansMap[k]?.principal || 0,
        loans_interest: loansMap[k]?.interest || 0,
        repayments: repayMap[k] || 0
      };
    });
    ws.addRows(data);
    ws.getRow(1).font = { bold: true };
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=monthly-summary-${getExportDate()}.xlsx`);
    await wb.xlsx.write(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function buildDateFilter(period, date, month, year) {
  const d = date ? new Date(date) : new Date();
  const y = parseInt(year || d.getFullYear());
  const m = parseInt(month || d.getMonth() + 1);
  let startDate, endDate, label;
  switch (period) {
    case 'day':
      startDate = new Date(d);
      endDate = new Date(d);
      endDate.setHours(23, 59, 59, 999);
      label = `day-${d.toISOString().slice(0, 10)}`;
      break;
    case 'week':
      const dayOfWeek = d.getDay();
      const start = new Date(d);
      start.setDate(d.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      startDate = start;
      endDate = end;
      label = `week-${start.toISOString().slice(0, 10)}-to-${end.toISOString().slice(0, 10)}`;
      break;
    case 'month':
      startDate = new Date(y, m - 1, 1);
      endDate = new Date(y, m, 0, 23, 59, 59, 999);
      label = `month-${y}-${String(m).padStart(2, '0')}`;
      break;
    case 'year':
      startDate = new Date(y, 0, 1);
      endDate = new Date(y, 11, 31, 23, 59, 59, 999);
      label = `year-${y}`;
      break;
    default:
      return { whereClause: () => '', params: [], label: 'all' };
  }
  const startStr = startDate.toISOString().slice(0, 10);
  const endStr = endDate.toISOString().slice(0, 10);
  return {
    whereClause: (col) => ` WHERE ${col} BETWEEN ? AND ?`,
    params: [startStr, endStr],
    startDate,
    endDate,
    label
  };
}

router.get('/full-report', authenticate, async (req, res) => {
  try {
    const { period, date, month, year } = req.query;
    const hasDateFilter = period && ['day', 'week', 'month', 'year'].includes(period);
    const filter = hasDateFilter ? buildDateFilter(period, date, month, year) : null;
    const dateWhereContrib = filter ? filter.whereClause('c.contribution_date') : '';
    const dateWhereLoan = filter ? filter.whereClause('l.issue_date') : '';
    const dateWhereRepay = filter ? filter.whereClause('r.payment_date') : '';
    const dateParams = filter ? filter.params : [];

    const [members] = await pool.query(`
      SELECT m.id, m.full_name, m.phone, m.national_id, m.date_joined, m.status,
        COALESCE(r.reg_fee_paid, 0) as registration_fee_paid
      FROM members m
      LEFT JOIN (SELECT member_id, SUM(amount) as reg_fee_paid FROM registration_fees GROUP BY member_id) r ON m.id = r.member_id
      ORDER BY m.full_name
    `);
    const contribSql = `SELECT c.member_id, m.full_name as member_name, c.month, c.year, c.amount, c.contribution_date 
      FROM contributions c JOIN members m ON c.member_id = m.id 
      ${dateWhereContrib}
      ORDER BY c.contribution_date DESC`;
    const loanSql = `SELECT l.id, l.member_id, m.full_name as member_name, l.loan_amount, l.interest_rate, l.interest_amount, l.total_amount, l.issue_date,
        COALESCE(r.total_paid, 0) as total_paid, 
        (l.total_amount - COALESCE(r.total_paid, 0)) as balance, l.status
      FROM loans l JOIN members m ON l.member_id = m.id 
      LEFT JOIN (SELECT loan_id, SUM(amount_paid) as total_paid FROM repayments GROUP BY loan_id) r ON l.id = r.loan_id
      ${dateWhereLoan}
      ORDER BY l.issue_date DESC`;
    const repaySql = `SELECT r.id, r.loan_id, l.member_id, m.full_name as member_name, r.amount_paid, r.payment_date 
      FROM repayments r JOIN loans l ON r.loan_id = l.id JOIN members m ON l.member_id = m.id 
      ${dateWhereRepay}
      ORDER BY r.payment_date DESC`;

    const [contributions] = dateParams.length ? await pool.query(contribSql, dateParams) : await pool.query(contribSql);
    const [loans] = dateParams.length ? await pool.query(loanSql, dateParams) : await pool.query(loanSql);
    const [repayments] = dateParams.length ? await pool.query(repaySql, dateParams) : await pool.query(repaySql);

    const wb = await createWorkbook();

    const wsMembers = wb.addWorksheet('Members', { views: [{ state: 'frozen', ySplit: 1 }] });
    wsMembers.columns = [
      { header: 'ID', key: 'id', width: 8 },
      { header: 'Full Name', key: 'full_name', width: 25 },
      { header: 'Phone', key: 'phone', width: 15 },
      { header: 'National ID', key: 'national_id', width: 18 },
      { header: 'Date Joined', key: 'date_joined', width: 15 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Reg. Fee Paid', key: 'registration_fee_paid', width: 14 }
    ];
    wsMembers.addRows(members.map(m => ({
      id: m.id,
      full_name: m.full_name,
      phone: m.phone,
      national_id: m.national_id,
      date_joined: m.date_joined,
      status: m.status,
      registration_fee_paid: parseFloat(m.registration_fee_paid || 0)
    })));
    wsMembers.getRow(1).font = { bold: true };

    const wsContrib = wb.addWorksheet('Contributions', { views: [{ state: 'frozen', ySplit: 1 }] });
    wsContrib.columns = [
      { header: 'Member ID', key: 'member_id', width: 10 },
      { header: 'Member', key: 'member_name', width: 25 },
      { header: 'Month', key: 'month', width: 8 },
      { header: 'Year', key: 'year', width: 8 },
      { header: 'Amount', key: 'amount', width: 15 },
      { header: 'Date', key: 'contribution_date', width: 15 }
    ];
    wsContrib.addRows(contributions.map(c => ({
      member_id: c.member_id,
      member_name: c.member_name,
      month: c.month,
      year: c.year,
      amount: parseFloat(c.amount || 0),
      contribution_date: c.contribution_date
    })));
    wsContrib.getRow(1).font = { bold: true };

    const contribMap = {};
    contributions.forEach(c => {
      if (!contribMap[c.member_id]) contribMap[c.member_id] = 0;
      contribMap[c.member_id] += parseFloat(c.amount);
    });
    const wsLoans = wb.addWorksheet('Loans', { views: [{ state: 'frozen', ySplit: 1 }] });
    wsLoans.columns = [
      { header: 'Loan ID', key: 'id', width: 10 },
      { header: 'Member ID', key: 'member_id', width: 10 },
      { header: 'Member', key: 'member_name', width: 25 },
      { header: 'Contributions', key: 'total_contributions', width: 14 },
      { header: 'Principal', key: 'loan_amount', width: 12 },
      { header: 'Interest', key: 'interest_amount', width: 12 },
      { header: 'Total', key: 'total_amount', width: 12 },
      { header: 'Paid', key: 'total_paid', width: 12 },
      { header: 'Balance', key: 'balance', width: 12 },
      { header: 'Status', key: 'status', width: 12 }
    ];
    wsLoans.addRows(loans.map(l => ({
      id: l.id,
      member_id: l.member_id,
      member_name: l.member_name,
      total_contributions: contribMap[l.member_id] || 0,
      loan_amount: parseFloat(l.loan_amount),
      interest_amount: parseFloat(l.interest_amount),
      total_amount: parseFloat(l.total_amount),
      total_paid: parseFloat(l.total_paid),
      balance: parseFloat(l.balance),
      status: l.status
    })));
    wsLoans.getRow(1).font = { bold: true };

    const wsRepay = wb.addWorksheet('Repayments', { views: [{ state: 'frozen', ySplit: 1 }] });
    wsRepay.columns = [
      { header: 'Member ID', key: 'member_id', width: 10 },
      { header: 'Member', key: 'member_name', width: 25 },
      { header: 'Loan ID', key: 'loan_id', width: 10 },
      { header: 'Amount Paid', key: 'amount_paid', width: 15 },
      { header: 'Payment Date', key: 'payment_date', width: 15 }
    ];
    wsRepay.addRows(repayments.map(r => ({
      member_id: r.member_id,
      member_name: r.member_name,
      loan_id: r.loan_id,
      amount_paid: parseFloat(r.amount_paid || 0),
      payment_date: r.payment_date
    })));
    wsRepay.getRow(1).font = { bold: true };

    const [externalFunds] = await pool.query('SELECT source, amount, received_date, description FROM external_funds ORDER BY received_date DESC');
    const wsExt = wb.addWorksheet('External Funds', { views: [{ state: 'frozen', ySplit: 1 }] });
    wsExt.columns = [{ header: 'Source', key: 'source', width: 18 }, { header: 'Amount', key: 'amount', width: 15 }, { header: 'Date', key: 'received_date', width: 15 }, { header: 'Description', key: 'description', width: 30 }];
    wsExt.addRows(externalFunds.map(e => ({ source: e.source, amount: parseFloat(e.amount), received_date: e.received_date, description: e.description || '' })));
    wsExt.getRow(1).font = { bold: true };

    const [expenses] = await pool.query('SELECT amount, expense_date, category, description FROM expenses ORDER BY expense_date DESC');
    const wsExp = wb.addWorksheet('Expenses', { views: [{ state: 'frozen', ySplit: 1 }] });
    wsExp.columns = [{ header: 'Amount', key: 'amount', width: 15 }, { header: 'Date', key: 'expense_date', width: 15 }, { header: 'Category', key: 'category', width: 18 }, { header: 'Description', key: 'description', width: 30 }];
    wsExp.addRows(expenses.map(e => ({ amount: parseFloat(e.amount), expense_date: e.expense_date, category: e.category || '', description: e.description || '' })));
    wsExp.getRow(1).font = { bold: true };

    const [regFees] = await pool.query('SELECT m.full_name as member_name, r.amount, r.payment_date FROM registration_fees r JOIN members m ON r.member_id = m.id ORDER BY r.payment_date DESC');
    const wsReg = wb.addWorksheet('Registration Fees', { views: [{ state: 'frozen', ySplit: 1 }] });
    wsReg.columns = [{ header: 'Member', key: 'member_name', width: 25 }, { header: 'Amount', key: 'amount', width: 15 }, { header: 'Date', key: 'payment_date', width: 15 }];
    wsReg.addRows(regFees.map(r => ({ member_name: r.member_name, amount: parseFloat(r.amount), payment_date: r.payment_date })));
    wsReg.getRow(1).font = { bold: true };

    const [fines] = await pool.query('SELECT m.full_name as member_name, f.amount, f.reason, f.issued_date, f.status, f.payment_date FROM fines f JOIN members m ON f.member_id = m.id ORDER BY f.issued_date DESC');
    const wsFines = wb.addWorksheet('Fines', { views: [{ state: 'frozen', ySplit: 1 }] });
    wsFines.columns = [{ header: 'Member', key: 'member_name', width: 25 }, { header: 'Amount', key: 'amount', width: 12 }, { header: 'Reason', key: 'reason', width: 20 }, { header: 'Issued', key: 'issued_date', width: 12 }, { header: 'Status', key: 'status', width: 10 }, { header: 'Paid Date', key: 'payment_date', width: 12 }];
    wsFines.addRows(fines.map(f => ({ member_name: f.member_name, amount: parseFloat(f.amount), reason: f.reason || '', issued_date: f.issued_date, status: f.status, payment_date: f.payment_date || '' })));
    wsFines.getRow(1).font = { bold: true };

    const contribByMonth = {};
    contributions.forEach(c => {
      const k = `${c.year}-${c.month}`;
      if (!contribByMonth[k]) contribByMonth[k] = 0;
      contribByMonth[k] += parseFloat(c.amount);
    });
    const loansByMonth = {};
    loans.forEach(l => {
      const d = new Date(l.issue_date);
      const k = `${d.getFullYear()}-${d.getMonth() + 1}`;
      if (!loansByMonth[k]) loansByMonth[k] = { count: 0, principal: 0, interest: 0, repaid: 0 };
      loansByMonth[k].count++;
      loansByMonth[k].principal += parseFloat(l.loan_amount);
      loansByMonth[k].interest += parseFloat(l.interest_amount);
      loansByMonth[k].repaid += parseFloat(l.total_paid);
    });
    const repayByMonth = {};
    repayments.forEach(r => {
      const d = new Date(r.payment_date);
      const k = `${d.getFullYear()}-${d.getMonth() + 1}`;
      if (!repayByMonth[k]) repayByMonth[k] = 0;
      repayByMonth[k] += parseFloat(r.amount_paid);
    });
    const monthKeys = new Set([...Object.keys(contribByMonth), ...Object.keys(loansByMonth), ...Object.keys(repayByMonth)]);
    const monthlyData = [...monthKeys].sort().map(k => {
      const [y, m] = k.split('-');
      return {
        month: parseInt(m),
        year: parseInt(y),
        contributions: contribByMonth[k] || 0,
        loans_count: loansByMonth[k]?.count || 0,
        loans_principal: loansByMonth[k]?.principal || 0,
        loans_interest: loansByMonth[k]?.interest || 0,
        repayments: repayByMonth[k] || 0
      };
    });

    const wsMonthly = wb.addWorksheet('Monthly Summary', { views: [{ state: 'frozen', ySplit: 1 }] });
    wsMonthly.columns = [
      { header: 'Month', key: 'month', width: 8 },
      { header: 'Year', key: 'year', width: 8 },
      { header: 'Contributions', key: 'contributions', width: 15 },
      { header: 'Loans Count', key: 'loans_count', width: 12 },
      { header: 'Principal Lent', key: 'loans_principal', width: 15 },
      { header: 'Interest', key: 'loans_interest', width: 12 },
      { header: 'Repayments', key: 'repayments', width: 15 }
    ];
    wsMonthly.addRows(monthlyData);
    wsMonthly.getRow(1).font = { bold: true };

    const wsMemberSummary = wb.addWorksheet('Member Summary', { views: [{ state: 'frozen', ySplit: 1 }] });
    wsMemberSummary.columns = [
      { header: 'Member ID', key: 'member_id', width: 10 },
      { header: 'Member Name', key: 'member_name', width: 25 },
      { header: 'Total Contributions', key: 'total_contributions', width: 18 },
      { header: 'Principal Lent', key: 'total_loans', width: 15 },
      { header: 'Interest', key: 'total_interest', width: 12 },
      { header: 'Total Repaid', key: 'total_repaid', width: 15 },
      { header: 'Outstanding', key: 'outstanding', width: 15 },
      { header: 'Net Position', key: 'net_position', width: 15 }
    ];
    const memberLoansMap = {};
    const memberRepayMap = {};
    loans.forEach(l => {
      if (!memberLoansMap[l.member_id]) memberLoansMap[l.member_id] = { principal: 0, interest: 0, repaid: 0, outstanding: 0 };
      memberLoansMap[l.member_id].principal += parseFloat(l.loan_amount);
      memberLoansMap[l.member_id].interest += parseFloat(l.interest_amount);
      memberLoansMap[l.member_id].repaid += parseFloat(l.total_paid);
      memberLoansMap[l.member_id].outstanding += parseFloat(l.balance);
    });
    repayments.forEach(r => {
      if (!memberRepayMap[r.member_id]) memberRepayMap[r.member_id] = 0;
      memberRepayMap[r.member_id] += parseFloat(r.amount_paid);
    });
    const memberSummaryRows = members.map(m => {
      const contrib = contribMap[m.id] || 0;
      const loanData = memberLoansMap[m.id] || { principal: 0, interest: 0, repaid: 0, outstanding: 0 };
      const net = contrib - loanData.outstanding;
      return {
        member_id: m.id,
        member_name: m.full_name,
        total_contributions: contrib,
        total_loans: loanData.principal,
        total_interest: loanData.interest,
        total_repaid: loanData.repaid,
        outstanding: loanData.outstanding,
        net_position: net
      };
    });
    wsMemberSummary.addRows(memberSummaryRows);
    wsMemberSummary.getRow(1).font = { bold: true };

    const label = filter ? filter.label : 'all';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=full-report-${label}-${getExportDate()}.xlsx`);
    await wb.xlsx.write(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/member-statement/:memberId', authenticate, async (req, res) => {
  try {
    const { memberId } = req.params;
    const [member] = await pool.query('SELECT * FROM members WHERE id = ?', [memberId]);
    if (member.length === 0) return res.status(404).json({ error: 'Member not found' });

    const [contributions] = await pool.query('SELECT * FROM contributions WHERE member_id = ? ORDER BY contribution_date', [memberId]);
    const [loans] = await pool.query('SELECT * FROM loans WHERE member_id = ? ORDER BY issue_date', [memberId]);
    const contribTotal = contributions.reduce((s, c) => s + parseFloat(c.amount), 0);
    let outBalance = 0;
    for (const l of loans) {
      const [rep] = await pool.query('SELECT COALESCE(SUM(amount_paid), 0) as total FROM repayments WHERE loan_id = ?', [l.id]);
      outBalance += parseFloat(l.total_amount) - parseFloat(rep[0].total);
    }

    const wb = await createWorkbook();
    const ws = wb.addWorksheet('Member Statement');
    ws.addRow([`Statement for ${member[0].full_name}`]).font = { bold: true, size: 14 };
    ws.addRow([]);
    ws.addRow(['Total Contributions', contribTotal]);
    ws.addRow(['Outstanding Loan Balance', outBalance]);
    ws.addRow(['Net Position', contribTotal - outBalance]);
    ws.addRow([]);
    ws.addRow(['Contributions History']).font = { bold: true };
    ws.addRow(['Month', 'Year', 'Amount', 'Date']);
    contributions.forEach(c => ws.addRow([c.month, c.year, c.amount, c.contribution_date]));
    ws.addRow([]);
    ws.addRow(['Loan History']).font = { bold: true };
    ws.addRow(['Amount', 'Interest', 'Total', 'Issue Date', 'Status']);
    loans.forEach(l => ws.addRow([l.loan_amount, l.interest_amount, l.total_amount, l.issue_date, l.status]));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=member-statement-${memberId}-${getExportDate()}.xlsx`);
    await wb.xlsx.write(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

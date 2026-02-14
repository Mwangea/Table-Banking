import express from 'express';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import pool from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';
import { calculateReducingBalance } from '../utils/reducingBalance.js';

const router = express.Router();

function getExportDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function drawTable(doc, x, y, columns, rows, title = null) {
  const colCount = columns.length;
  const rowHeight = 24;
  const margin = 50;
  const pageWidth = doc.page.width - margin * 2;
  const colWidth = pageWidth / colCount;
  const tableWidth = colWidth * colCount;
  const headerBg = '#2c3e50';
  const rowBgAlt = '#f1f5f9';
  const borderColor = '#cbd5e1';

  let startY = y;

  if (title) {
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1e293b').text(title, x, startY);
    startY += 30;
  }

  const tableStartY = startY;
  doc.rect(x, startY, tableWidth, rowHeight).fill(headerBg);
  doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold');
  columns.forEach((col, i) => {
    doc.text(col.label, x + i * colWidth + 10, startY + 7, { width: colWidth - 20, align: col.align || 'left' });
  });
  startY += rowHeight;

  rows.forEach((row, rowIndex) => {
    const bg = rowIndex % 2 === 0 ? '#ffffff' : rowBgAlt;
    doc.rect(x, startY, tableWidth, rowHeight).fill(bg);
    doc.fillColor('#334155').fontSize(9).font('Helvetica');
    columns.forEach((col, i) => {
      const val = row[col.key];
      doc.text(String(val ?? ''), x + i * colWidth + 10, startY + 7, { width: colWidth - 20, align: col.align || 'left' });
    });
    startY += rowHeight;
  });

  doc.strokeColor(borderColor).lineWidth(0.5);
  doc.rect(x, tableStartY, tableWidth, startY - tableStartY).stroke();
  for (let i = 1; i < colCount; i++) {
    doc.moveTo(x + i * colWidth, tableStartY).lineTo(x + i * colWidth, startY).stroke();
  }
  for (let r = 1; r <= rows.length; r++) {
    doc.moveTo(x, tableStartY + rowHeight * r).lineTo(x + tableWidth, tableStartY + rowHeight * r).stroke();
  }
  return startY + 24;
}

async function getLoanTotals() {
  const [allLoans] = await pool.query('SELECT * FROM loans');
  const [allRepayments] = await pool.query('SELECT loan_id, amount_paid, payment_date FROM repayments');
  const repayByLoan = {};
  for (const r of allRepayments) {
    if (!repayByLoan[r.loan_id]) repayByLoan[r.loan_id] = [];
    repayByLoan[r.loan_id].push({ amount_paid: r.amount_paid, payment_date: r.payment_date });
  }
  let totalAmount = 0;
  let totalInterest = 0;
  for (const loan of allLoans) {
    const calc = calculateReducingBalance(loan, repayByLoan[loan.id] || []);
    totalAmount += calc.total_amount;
    totalInterest += calc.total_interest;
  }
  return { count: allLoans.length, totalAmount, totalInterest };
}

router.get('/financial-report-pdf', authenticate, async (req, res) => {
  try {
    const [monthlyContrib] = await pool.query(`
      SELECT month, year, SUM(amount) as total FROM contributions GROUP BY month, year ORDER BY year DESC, month DESC LIMIT 12
    `);
    const loanTotals = await getLoanTotals();
    const [defaulted] = await pool.query("SELECT * FROM loans WHERE status = 'Defaulted'");
    const [[extTotal]] = await pool.query('SELECT COALESCE(SUM(amount), 0) as t FROM external_funds');
    const [[expTotal]] = await pool.query('SELECT COALESCE(SUM(amount), 0) as t FROM expenses');
    const [[regTotal]] = await pool.query('SELECT COALESCE(SUM(amount), 0) as t FROM registration_fees');
    const [[finesTotal]] = await pool.query("SELECT COALESCE(SUM(amount), 0) as t FROM fines WHERE status = 'Paid'");
    const [[contribTotal]] = await pool.query('SELECT COALESCE(SUM(amount), 0) as t FROM contributions');
    const [[repayTotal]] = await pool.query('SELECT COALESCE(SUM(amount_paid), 0) as t FROM repayments');

    const totalLoans = loanTotals.count;
    const totalLoanAmt = loanTotals.totalAmount;
    const totalInterest = loanTotals.totalInterest;
    const ext = parseFloat(extTotal?.t || 0);
    const exp = parseFloat(expTotal?.t || 0);
    const reg = parseFloat(regTotal?.t || 0);
    const fines = parseFloat(finesTotal?.t || 0);
    const contrib = parseFloat(contribTotal?.t || 0);
    const repay = parseFloat(repayTotal?.t || 0);
    const defaultedCount = defaulted.length;

    const summaryRows = [
      { metric: 'Total Contributions', value: contrib.toLocaleString() },
      { metric: 'Total Loans Issued', value: String(totalLoans) },
      { metric: 'Total Loan Amount', value: totalLoanAmt.toLocaleString() },
      { metric: 'Total Interest Earned', value: totalInterest.toLocaleString() },
      { metric: 'Total Repayments', value: repay.toLocaleString() },
      { metric: 'External Funds', value: ext.toLocaleString() },
      { metric: 'Registration Fees', value: reg.toLocaleString() },
      { metric: 'Fines (Paid)', value: fines.toLocaleString() },
      { metric: 'Expenses', value: exp.toLocaleString() },
      { metric: 'Defaulted Loans', value: String(defaultedCount) }
    ];

    const monthNames = ['', 'Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthlyRows = monthlyContrib.map(c => ({
      month: monthNames[c.month] || c.month,
      year: String(c.year),
      total: parseFloat(c.total || 0).toLocaleString()
    }));

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=financial-report-${getExportDate()}.pdf`);

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    doc.pipe(res);

    const margin = 50;
    const pageWidth = doc.page.width - margin * 2;
    let y = 40;

    doc.rect(0, 0, doc.page.width, 85).fill('#1a365d');
    doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold');
    doc.text('A Generated Financial Report', margin, 28, { width: pageWidth, align: 'center' });
    doc.fontSize(11).font('Helvetica');
    doc.text('Table Banking - Financial Summary', margin, 52, { width: pageWidth, align: 'center' });
    doc.text(`Generated on ${new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`, margin, 68, { width: pageWidth, align: 'center' });

    y = 110;

    const summaryCols = [
      { key: 'metric', label: 'Metric', align: 'left' },
      { key: 'value', label: 'Amount / Count', align: 'right' }
    ];
    y = drawTable(doc, margin, y, summaryCols, summaryRows, 'Financial Summary');

    const monthlyCols = [
      { key: 'month', label: 'Month', align: 'left' },
      { key: 'year', label: 'Year', align: 'center' },
      { key: 'total', label: 'Total (KES)', align: 'right' }
    ];
    y = drawTable(doc, margin, y, monthlyCols, monthlyRows, 'Monthly Contributions');

    y += 15;
    doc.rect(margin, y, pageWidth, 45).fill('#f0f4f8').stroke('#cbd5e0');
    doc.fillColor('#475569').fontSize(9).font('Helvetica');
    doc.text('This is a generated financial report. Data is current as of the date above.', margin + 12, y + 15, { width: pageWidth - 24 });
    doc.text('For official records, please verify with your system administrator.', margin + 12, y + 30, { width: pageWidth - 24 });

    doc.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
      SELECT l.*, m.full_name as member_name
      FROM loans l JOIN members m ON l.member_id = m.id 
      ORDER BY l.issue_date DESC
    `);
    const [allRepayments] = await pool.query('SELECT loan_id, amount_paid, payment_date FROM repayments');
    const repayByLoan = {};
    for (const r of allRepayments) {
      if (!repayByLoan[r.loan_id]) repayByLoan[r.loan_id] = [];
      repayByLoan[r.loan_id].push({ amount_paid: r.amount_paid, payment_date: r.payment_date });
    }
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
    const data = rows.map(r => {
      const calc = calculateReducingBalance(r, repayByLoan[r.id] || []);
      return {
        member_name: r.member_name,
        total_contributions: contribMap[r.member_id] || 0,
        loan_amount: parseFloat(r.loan_amount),
        interest_amount: calc.total_interest,
        total_amount: calc.total_amount,
        total_paid: calc.total_paid,
        balance: calc.balance
      };
    });
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
    const [allLoans] = await pool.query('SELECT * FROM loans');
    const [allRepayments] = await pool.query('SELECT loan_id, amount_paid, payment_date FROM repayments');
    const repayByLoan = {};
    for (const r of allRepayments) {
      if (!repayByLoan[r.loan_id]) repayByLoan[r.loan_id] = [];
      repayByLoan[r.loan_id].push({ amount_paid: r.amount_paid, payment_date: r.payment_date });
    }
    const loansMap = {};
    for (const l of allLoans) {
      const d = new Date(l.issue_date);
      const k = `${d.getFullYear()}-${d.getMonth() + 1}`;
      const calc = calculateReducingBalance(l, repayByLoan[l.id] || []);
      if (!loansMap[k]) loansMap[k] = { count: 0, principal: 0, interest: 0 };
      loansMap[k].count++;
      loansMap[k].principal += parseFloat(l.loan_amount);
      loansMap[k].interest += calc.total_interest;
    }
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
    const [repay] = await pool.query('SELECT MONTH(payment_date) as month, YEAR(payment_date) as year, SUM(amount_paid) as total FROM repayments GROUP BY month, year ORDER BY year, month');
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
    const loanSql = `SELECT l.*, m.full_name as member_name
      FROM loans l JOIN members m ON l.member_id = m.id 
      ${dateWhereLoan}
      ORDER BY l.issue_date DESC`;
    const repaySql = `SELECT r.id, r.loan_id, l.member_id, m.full_name as member_name, r.amount_paid, r.payment_date 
      FROM repayments r JOIN loans l ON r.loan_id = l.id JOIN members m ON l.member_id = m.id 
      ${dateWhereRepay}
      ORDER BY r.payment_date DESC`;

    const [contributions] = dateParams.length ? await pool.query(contribSql, dateParams) : await pool.query(contribSql);
    const [loansRaw] = dateParams.length ? await pool.query(loanSql, dateParams) : await pool.query(loanSql);
    const [repayments] = dateParams.length ? await pool.query(repaySql, dateParams) : await pool.query(repaySql);

    const [allRepayments] = await pool.query('SELECT loan_id, amount_paid, payment_date FROM repayments');
    const repayByLoan = {};
    for (const r of allRepayments) {
      if (!repayByLoan[r.loan_id]) repayByLoan[r.loan_id] = [];
      repayByLoan[r.loan_id].push({ amount_paid: r.amount_paid, payment_date: r.payment_date });
    }
    const loans = loansRaw.map(l => {
      const calc = calculateReducingBalance(l, repayByLoan[l.id] || []);
      return { ...l, interest_amount: calc.total_interest, total_amount: calc.total_amount, total_paid: calc.total_paid, balance: calc.balance };
    });

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
    const [loansRaw] = await pool.query('SELECT * FROM loans WHERE member_id = ? ORDER BY issue_date', [memberId]);
    const contribTotal = contributions.reduce((s, c) => s + parseFloat(c.amount), 0);
    let outBalance = 0;
    const loans = [];
    for (const l of loansRaw) {
      const [rep] = await pool.query('SELECT amount_paid, payment_date FROM repayments WHERE loan_id = ? ORDER BY payment_date', [l.id]);
      const calc = calculateReducingBalance(l, rep);
      outBalance += calc.balance;
      loans.push({ ...l, interest_amount: calc.total_interest, total_amount: calc.total_amount });
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

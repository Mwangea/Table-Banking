/**
 * 10% monthly reducing balance interest for 3-month loan term.
 * Principal divided equally across 3 months.
 * Interest calculated each month on remaining principal.
 */

const LOAN_TERM_MONTHS = 3;
const MONTHLY_INTEREST_RATE = 0.10;

function parseDate(d) {
  if (typeof d === 'string') return new Date(d + 'T00:00:00');
  return d instanceof Date ? d : new Date(d);
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function formatDateYMD(d) {
  return d.toISOString().slice(0, 10);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Generate monthly breakdown for a loan.
 * @param {number} principal - Loan amount
 * @param {string|Date} issueDate - Loan start date
 * @returns {Array} [{ month, opening_balance, interest, principal_paid, total_installment, closing_balance, due_date }]
 */
export function generateMonthlySchedule(principal, issueDate) {
  const issue = parseDate(issueDate);
  const schedule = [];
  let openingBalance = round2(principal);
  const monthlyPrincipal = round2(principal / LOAN_TERM_MONTHS);

  for (let month = 1; month <= LOAN_TERM_MONTHS; month++) {
    const interest = round2(openingBalance * MONTHLY_INTEREST_RATE);
    const principalPaid = month === LOAN_TERM_MONTHS
      ? round2(openingBalance)
      : monthlyPrincipal;
    const totalInstallment = round2(interest + principalPaid);
    const closingBalance = round2(openingBalance - principalPaid);

    schedule.push({
      month,
      opening_balance: openingBalance,
      interest,
      principal_paid: principalPaid,
      total_installment: totalInstallment,
      closing_balance: closingBalance >= 0 ? closingBalance : 0,
      due_date: formatDateYMD(addMonths(issue, month))
    });

    openingBalance = closingBalance >= 0 ? closingBalance : 0;
  }

  return schedule;
}

/**
 * Calculate loan totals using 10% monthly reducing balance (3 months, equal principal).
 * @param {Object} loan - { loan_amount, interest_rate, issue_date }
 * @param {Array} repayments - [{ amount_paid, payment_date }]
 * @returns {Object} { total_interest, total_amount, balance, total_paid, schedule }
 */
export function calculateReducingBalance(loan, repayments = []) {
  const principal = parseFloat(loan.loan_amount);
  const schedule = generateMonthlySchedule(principal, loan.issue_date);

  const totalInterest = round2(schedule.reduce((s, row) => s + row.interest, 0));
  const totalAmount = round2(principal + totalInterest);
  const totalPaid = repayments.reduce((s, r) => s + parseFloat(r.amount_paid || 0), 0);
  const balance = Math.max(0, round2(totalAmount - totalPaid));

  return {
    total_interest: totalInterest,
    total_amount: totalAmount,
    balance,
    total_paid: round2(totalPaid),
    schedule
  };
}

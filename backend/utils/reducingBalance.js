/**
 * Reducing balance interest: 10% per annum on outstanding balance.
 * Interest accrues daily: balance × (rate/100) × (days/365)
 * When repayments are made, they first cover accrued interest, then reduce principal.
 */

function parseDate(d) {
  if (typeof d === 'string') return new Date(d + 'T00:00:00');
  return d instanceof Date ? d : new Date(d);
}

function daysBetween(start, end) {
  return Math.max(0, Math.round((parseDate(end) - parseDate(start)) / (24 * 60 * 60 * 1000)));
}

/**
 * Calculate loan totals using reducing balance.
 * @param {Object} loan - { loan_amount, interest_rate, issue_date }
 * @param {Array} repayments - [{ amount_paid, payment_date }] sorted by payment_date asc
 * @param {string} [asOfDate] - optional; default is last payment date or today
 * @returns {Object} { total_interest, total_amount, balance, total_paid }
 */
export function calculateReducingBalance(loan, repayments = [], asOfDate = null) {
  const principal = parseFloat(loan.loan_amount);
  const annualRate = parseFloat(loan.interest_rate || 0) / 100;
  const issueDate = parseDate(loan.issue_date);

  const sortedRepayments = [...repayments]
    .filter(r => parseFloat(r.amount_paid || 0) > 0)
    .sort((a, b) => parseDate(a.payment_date) - parseDate(b.payment_date));

  let balance = principal;
  let totalInterest = 0;
  let lastDate = issueDate;

  for (const r of sortedRepayments) {
    const paymentDate = parseDate(r.payment_date);
    const amount = parseFloat(r.amount_paid || 0);
    const days = daysBetween(lastDate, paymentDate);

    const interestAccrued = balance * annualRate * (days / 365);
    totalInterest += interestAccrued;
    balance += interestAccrued;

    balance -= amount;
    if (balance < 0) balance = 0;
    lastDate = paymentDate;
  }

  const endDate = asOfDate ? parseDate(asOfDate) : new Date();
  const daysToNow = daysBetween(lastDate, endDate);
  const interestToDate = balance * annualRate * (daysToNow / 365);
  totalInterest += interestToDate;
  balance += interestToDate;

  const totalPaid = sortedRepayments.reduce((sum, r) => sum + parseFloat(r.amount_paid || 0), 0);

  return {
    total_interest: Math.round(totalInterest * 100) / 100,
    total_amount: Math.round((principal + totalInterest) * 100) / 100,
    balance: Math.max(0, Math.round(balance * 100) / 100),
    total_paid: totalPaid
  };
}

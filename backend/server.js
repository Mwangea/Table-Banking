import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { authenticate } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import membersRoutes from './routes/members.js';
import contributionsRoutes from './routes/contributions.js';
import loansRoutes from './routes/loans.js';
import repaymentsRoutes from './routes/repayments.js';
import externalFundsRoutes from './routes/externalFunds.js';
import expensesRoutes from './routes/expenses.js';
import registrationFeesRoutes from './routes/registrationFees.js';
import finesRoutes from './routes/fines.js';
import dashboardRoutes from './routes/dashboard.js';
import reportsRoutes from './routes/reports.js';
import exportRoutes from './routes/export.js';
import settingsRoutes from './routes/settings.js';
import usersRoutes from './routes/users.js';

dotenv.config();

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET must be set in production');
  process.exit(1);
}

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
  : true;
app.use(cors({
  origin: corsOrigins === true ? true : (origin, cb) => {
    if (!origin || corsOrigins.includes(origin)) cb(null, true);
    else cb(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

const apiProtect = (req, res, next) => {
  const path = (req.baseUrl || '') + (req.path || '');
  if (req.method === 'POST' && (path === '/api/auth/login' || path.endsWith('/auth/login'))) return next();
  return authenticate(req, res, next);
};

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' }
});

app.use('/api', apiProtect);
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/members', membersRoutes);
app.use('/api/contributions', contributionsRoutes);
app.use('/api/loans', loansRoutes);
app.use('/api/repayments', repaymentsRoutes);
app.use('/api/external-funds', externalFundsRoutes);
app.use('/api/expenses', expensesRoutes);
app.use('/api/registration-fees', registrationFeesRoutes);
app.use('/api/fines', finesRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/users', usersRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

const candidates = [
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(process.cwd(), '.env'),
];

let loaded = false;
for (const p of candidates) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p });
    console.log('[env] loaded:', p);
    loaded = true;
    break;
  }
}
if (!loaded) console.warn('[env] .env not found; tried:', candidates);

import express from 'express';
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { verifyMailer } from './utils/mailer';

import authRoutes from './api/auth/auth.routes';
import incomeRoutes from './api/income/income.routes';
import expenseRoutes from './api/expense/expense.routes';
import dashboardRoutes from './api/dashboard/dashboard-routes';
import budgetsRoutes from './api/budget/budget.routes';
import transactionRoutes from './api/transaction/transaction.routes';
import categoriesRoutes from './api/Categories/category.routes';
import taxRoutes from './api/TaxEstimator/TaxEstimator.routes';
import financialReportsRoutes from './api/FinancialReport/FinancialReport.routes';
import exportRoutes from './api/ExportDownload/ExportDownload.routes';

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.disable('x-powered-by');

// CORS
const explicit = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const corsOpts: cors.CorsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);                 // curl/Postman
    if (explicit.includes(origin)) return cb(null, true);
    if (origin.endsWith('.vercel.app')) return cb(null, true); // allow Vercel
    return cb(null, false);
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204
};

app.use(cors(corsOpts));
app.options('*', cors(corsOpts));

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// DB
const mongoUri =
  process.env.MONGODB_URI ||
  process.env.MONGO_URI ||
  'mongodb://localhost:27017/taxpal';

console.log('[db] Connecting to:', mongoUri);
mongoose
  .connect(mongoUri)
  .then(() => console.log('[db] ✅ Connected to MongoDB'))
  .catch(err => console.error('[db] connection error:', err));

// Routes
app.get('/', (_req, res) => res.send('✅ TaxPal backend is running successfully!'));
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/incomes', incomeRoutes);
app.use('/api/v1/expenses', expenseRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/budgets', budgetsRoutes);
app.use('/api/v1/transactions', transactionRoutes);
app.use('/api/v1/categories', categoriesRoutes);
app.use('/api/v1/tax', taxRoutes);
app.use('/api/v1/financial-reports', financialReportsRoutes);
app.use('/api/export', exportRoutes);

// Legacy mount
app.use('/api/transactions', transactionRoutes);

// Health & inspector
app.get('/api/v1/health', (_req, res) => res.json({ status: 'OK', message: 'TaxPal API is running' }));
app.get('/__routes', (_req, res) => {
  const stack: any[] = (app as any)._router?.stack || [];
  const routes: string[] = [];
  stack.forEach((l: any) => {
    if (l.name === 'router' && l.handle?.stack) {
      const prefix = l.regexp?.toString().replace(/^\/\^\\/, '/').replace(/\\\/\?\(\?\=\/\|\$\)\/i$/, '') || '';
      l.handle.stack.forEach((s: any) => {
        if (s.route) routes.push(`${Object.keys(s.route.methods).join(',').toUpperCase()} ${prefix}${s.route.path}`);
      });
    } else if (l.route && l.route.path) {
      routes.push(`${Object.keys(l.route.methods).join(',').toUpperCase()} ${l.route.path}`);
    }
  });
  res.json({ routes });
});

// Start
if (!(global as any).__taxpal_server_started) {
  const server = app.listen(PORT, () => {
    (global as any).__taxpal_server_started = true;
    console.log(`🚀 TaxPal server running at http://localhost:${PORT}`);
    verifyMailer().catch(() => {});
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} else {
  console.log('[server] listen skipped (already started)');
}

export default app;

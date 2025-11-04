import { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken } from '../auth/auth';
import {
  createTransaction,
  deleteTransaction,
  deleteAllTransactions,
  getTransactions,
  getTransactionById,
  updateTransaction,
  validateTransaction,
} from './transactionController';
import { handleValidationErrors } from '../../utils/validators/dashboardValidation';

const r = Router();

// All routes require auth
r.use(authenticateToken);

/** Ensure req.params.id exists if id is sent via ?id= or body { id } */
function normalizeId(req: Request, _res: Response, next: NextFunction) {
  if (!req.params?.id) {
    const q = (req.query as any)?.id;
    const b = (req.body as any)?.id;
    if (q) req.params = { ...(req.params || {}), id: String(q) };
    else if (b) req.params = { ...(req.params || {}), id: String(b) };
  }
  next();
}

/* --------- READ --------- */
r.get('/', getTransactions);
r.get('/:id', getTransactionById);

/* --------- CREATE --------- */
r.post('/', validateTransaction, handleValidationErrors, createTransaction);

/* --------- UPDATE --------- */
r.put('/:id', validateTransaction, handleValidationErrors, updateTransaction);

/* --------- DELETE --------- */
/**
 * DELETE /
 * - If id is provided via query/body → delete single (back-compat)
 * - If no id provided → delete all (your original behavior)
 */
r.delete('/', normalizeId, (req: Request, res: Response, next: NextFunction) => {
  if (req.params?.id) return deleteTransaction(req, res, next);
  return deleteAllTransactions(req, res, next);
});

/** Legacy convenience: DELETE /delete/:id */
r.delete('/delete/:id', normalizeId, deleteTransaction);

/** Canonical REST: DELETE /:id  (place AFTER /delete/:id to avoid greedy match) */
r.delete('/:id', normalizeId, deleteTransaction);

export default r;

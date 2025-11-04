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

/** Ensure req.params.id is set if id comes via ?id= or body { id } */
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
 * - If id provided via query/body → delete single (back-compat)
 * - If no id → delete all (original behavior)
 */
r.delete('/', normalizeId, (req: Request, res: Response) => {
  if (req.params?.id) return deleteTransaction(req, res); // 2 args only
  return deleteAllTransactions(req, res);
});

/** Legacy convenience: DELETE /delete/:id */
r.delete('/delete/:id', normalizeId, (req: Request, res: Response) => deleteTransaction(req, res));

/** Canonical REST: DELETE /:id  */
r.delete('/:id', normalizeId, (req: Request, res: Response) => deleteTransaction(req, res));

export default r;

// server/src/utils/validation.ts
import { validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';

export function handleValidation(req: Request, res: Response, next: NextFunction) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  // Only keep the first error per field to avoid noisy responses
  const errors = result.array({ onlyFirstError: true });
  const firstMsg = errors[0]?.msg || 'Invalid input';

  // Convenience map: { [fieldName]: 'error message' }
  const fieldErrors = errors.reduce((acc, e) => {
    // express-validator v7+ uses `path` (older versions used `param`)
    const field = (e as any).path || (e as any).param;
    if (e.type === 'field' && field) acc[field] = e.msg;
    return acc;
  }, {} as Record<string, string>);

  return res.status(400).json({
    message: firstMsg,
    errors,
    fieldErrors
  });
}

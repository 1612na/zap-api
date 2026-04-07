import type { Request, Response, NextFunction } from 'express';

const COLLECTOR_API_KEY = process.env['COLLECTOR_API_KEY'] ?? '';

if (!COLLECTOR_API_KEY) {
  console.warn('[auth] COLLECTOR_API_KEY não definido — todos os requests serão rejeitados!');
}

/**
 * Middleware que valida o header X-Api-Key.
 * Rejeita com 401 se ausente ou incorreto.
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['x-api-key'];
  if (!key || key !== COLLECTOR_API_KEY) {
    res.status(401).json({ error: 'Unauthorized — X-Api-Key inválido ou ausente' });
    return;
  }
  next();
}

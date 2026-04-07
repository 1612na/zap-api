import { timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction } from 'express';

const COLLECTOR_API_KEY = process.env['COLLECTOR_API_KEY'] ?? '';

if (!COLLECTOR_API_KEY) {
  console.warn('[auth] COLLECTOR_API_KEY não definido — todos os requests serão rejeitados!');
}

const API_KEY_BUF = Buffer.from(COLLECTOR_API_KEY);

/**
 * Middleware que valida o header X-Api-Key.
 * Rejeita com 401 se ausente ou incorreto.
 * Usa comparação timing-safe para evitar timing attacks.
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['x-api-key'];
  if (typeof key !== 'string' || key.length !== COLLECTOR_API_KEY.length) {
    res.status(401).json({ error: 'Unauthorized — X-Api-Key inválido ou ausente' });
    return;
  }
  if (!timingSafeEqual(Buffer.from(key), API_KEY_BUF)) {
    res.status(401).json({ error: 'Unauthorized — X-Api-Key inválido ou ausente' });
    return;
  }
  next();
}

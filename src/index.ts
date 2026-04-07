import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import { requireApiKey } from './middleware/auth.js';
import { ingestRouter } from './routes/ingest.js';
import { queryRouter } from './routes/query.js';
import { db } from './db/client.js';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

const PORT = Number(process.env['PORT']) || 3001;

async function main(): Promise<void> {
  // Rodar migrações ao iniciar
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('[zap-api] Migrações aplicadas');

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Health check público (sem auth) — usado pelo Render para verificar deploy
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true, ts: new Date().toISOString() });
  });

  // Todas as demais rotas exigem X-Api-Key
  app.use(requireApiKey);

  app.use('/ingest', ingestRouter);
  app.use('/conversations', queryRouter);

  // Error handler
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error('[zap-api] Erro:', err);
      const message =
        process.env['NODE_ENV'] === 'production'
          ? 'Internal server error'
          : err instanceof Error
            ? err.message
            : 'Erro interno';
      res.status(500).json({ error: message });
    },
  );

  app.listen(PORT, () => {
    console.log(`[zap-api] Servidor em http://localhost:${PORT}`);
    console.log(`[zap-api] Ingest:  POST /ingest/contacts|conversations|messages`);
    console.log(`[zap-api] Query:   GET  /conversations/summary|updated|:id/full`);
  });
}

main().catch((err) => {
  console.error('[zap-api] Erro fatal:', err);
  process.exit(1);
});

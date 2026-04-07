import { Router, type Request, type Response, type NextFunction } from 'express';
import { sql, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { contacts, conversations, messages } from '../db/schema.js';

export const ingestRouter = Router();

// ---------------------------------------------------------------------------
// Tipos dos payloads enviados pelo coletor (espelham NormalizedContact/Chat/Message)
// ---------------------------------------------------------------------------

interface IngestContact {
  id: string;
  name: string | null;
  push_name: string | null;
  display_name: string | null;
  is_business: 0 | 1;
  avatar_url: string | null;
  about: string | null;
  created_at: number;
  updated_at: number;
}

interface IngestConversation {
  id: string;
  contact_id: string | null;
  name: string | null;
  is_group: 0 | 1;
  last_message_at: number | null;
  unread_count: number;
  created_at: number;
  updated_at: number;
}

interface IngestMessage {
  id: string;
  chat_id: string;
  sender_jid: string | null;
  from_me: 0 | 1;
  timestamp: number;
  text: string | null;
  message_type: string;
  has_media: 0 | 1;
  media_url: string | null;
  media_mime: string | null;
  is_forwarded: 0 | 1;
  quoted_message_id: string | null;
  raw_payload: string;
  created_at: number;
}

/** Deduplica array pelo campo id, mantendo o último valor para cada chave. */
function dedupeById<T extends { id: string }>(arr: T[]): T[] {
  return [...new Map(arr.map((item) => [item.id, item])).values()];
}

// ---------------------------------------------------------------------------
// POST /ingest/contacts
// ---------------------------------------------------------------------------

ingestRouter.post('/contacts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data } = req.body as { data: IngestContact[] };
    if (!Array.isArray(data) || data.length === 0) {
      res.status(400).json({ error: 'data deve ser um array não vazio' });
      return;
    }
    if (data.length > 500) {
      res.status(400).json({ error: 'Máximo de 500 registros por lote' });
      return;
    }

    // Deduplica para evitar "ON CONFLICT DO UPDATE cannot affect row a second time"
    const unique = dedupeById(data);

    const values = unique.map((c) => ({
      id: c.id,
      name: c.name,
      push_name: c.push_name,
      display_name: c.display_name,
      is_business: c.is_business === 1,
      avatar_url: c.avatar_url,
      about: c.about,
      created_at: c.created_at,
      updated_at: c.updated_at,
    }));

    await db
      .insert(contacts)
      .values(values)
      .onConflictDoUpdate({
        target: contacts.id,
        set: {
          name: sql`excluded.name`,
          push_name: sql`excluded.push_name`,
          display_name: sql`excluded.display_name`,
          is_business: sql`excluded.is_business`,
          avatar_url: sql`excluded.avatar_url`,
          about: sql`excluded.about`,
          updated_at: sql`excluded.updated_at`,
        },
      });

    res.json({ accepted: unique.length });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /ingest/conversations
// ---------------------------------------------------------------------------

ingestRouter.post('/conversations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data } = req.body as { data: IngestConversation[] };
    if (!Array.isArray(data) || data.length === 0) {
      res.status(400).json({ error: 'data deve ser um array não vazio' });
      return;
    }
    if (data.length > 500) {
      res.status(400).json({ error: 'Máximo de 500 registros por lote' });
      return;
    }

    // Deduplica pelo id
    const unique = dedupeById(data);

    // Verifica quais contact_ids realmente existem na tabela contacts.
    // contact_ids ausentes são anulados para evitar FK violation.
    const candidateContactIds = unique
      .map((c) => c.contact_id)
      .filter((id): id is string => id !== null);

    const existingContactIds = new Set<string>();
    if (candidateContactIds.length > 0) {
      const rows = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(inArray(contacts.id, candidateContactIds));
      rows.forEach((r) => existingContactIds.add(r.id));
    }

    const values = unique.map((c) => ({
      id: c.id,
      contact_id:
        c.contact_id !== null && existingContactIds.has(c.contact_id)
          ? c.contact_id
          : null,
      name: c.name,
      is_group: c.is_group === 1,
      last_message_at: c.last_message_at,
      unread_count: c.unread_count,
      created_at: c.created_at,
      updated_at: c.updated_at,
    }));

    await db
      .insert(conversations)
      .values(values)
      .onConflictDoUpdate({
        target: conversations.id,
        set: {
          // Preservar contact_id já existente se o novo for null
          contact_id: sql`CASE WHEN excluded.contact_id IS NOT NULL THEN excluded.contact_id ELSE conversations.contact_id END`,
          last_message_at: sql`excluded.last_message_at`,
          unread_count: sql`excluded.unread_count`,
          name: sql`excluded.name`,
          updated_at: sql`excluded.updated_at`,
        },
      });

    res.json({ accepted: unique.length });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /ingest/messages
// ---------------------------------------------------------------------------

ingestRouter.post('/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data } = req.body as { data: IngestMessage[] };
    if (!Array.isArray(data) || data.length === 0) {
      res.status(400).json({ error: 'data deve ser um array não vazio' });
      return;
    }
    if (data.length > 500) {
      res.status(400).json({ error: 'Máximo de 500 registros por lote' });
      return;
    }

    // Deduplica pelo id
    const unique = dedupeById(data);

    // Garante que todas as conversas referenciadas existem.
    // Cria stubs mínimos para evitar FK violation — serão sobrescritos
    // pelo /ingest/conversations quando chegar o payload completo.
    const chatIds = [...new Set(unique.map((m) => m.chat_id))];
    if (chatIds.length > 0) {
      const now = Date.now();
      const stubs = chatIds.map((id) => ({
        id,
        contact_id: null,
        name: null,
        is_group: false,
        last_message_at: null as number | null,
        unread_count: 0,
        created_at: now,
        updated_at: now,
      }));
      await db.insert(conversations).values(stubs).onConflictDoNothing();
    }

    const values = unique.map((m) => ({
      id: m.id,
      chat_id: m.chat_id,
      sender_jid: m.sender_jid,
      from_me: m.from_me === 1,
      timestamp: m.timestamp,
      text: m.text,
      message_type: m.message_type,
      has_media: m.has_media === 1,
      media_url: m.media_url,
      media_mime: m.media_mime,
      is_forwarded: m.is_forwarded === 1,
      quoted_message_id: m.quoted_message_id,
      raw_payload: m.raw_payload,
      created_at: m.created_at,
    }));

    await db
      .insert(messages)
      .values(values)
      .onConflictDoNothing(); // mensagem é imutável

    res.json({ accepted: unique.length });
  } catch (err) {
    next(err);
  }
});

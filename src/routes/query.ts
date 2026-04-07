import { Router, type Request, type Response, type NextFunction } from 'express';
import { desc, gte, lt, eq, sql, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import { conversations, contacts, messages } from '../db/schema.js';
import {
  buildApiMessage,
  buildApiMessageFull,
  toE164,
  UNKNOWN_CONTACT,
  type ApiContact,
  type ApiContactFull,
  type ApiMessage,
  type ApiMessageFull,
} from '../helpers/format.js';

export const queryRouter = Router();

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function parseIntParam(raw: unknown, def: number): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.floor(n) : def;
}

// ---------------------------------------------------------------------------
// GET /conversations/summary
// ---------------------------------------------------------------------------

queryRouter.get('/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseIntParam(req.query['page'], 1));
    const limit = clamp(parseIntParam(req.query['limit'], 50), 1, 100);
    const offset = (page - 1) * limit;

    const sinceRaw = req.query['since'] ?? req.query['updated_after'];
    const sinceMs = sinceRaw ? new Date(String(sinceRaw)).getTime() : null;

    const whereClause =
      sinceMs && Number.isFinite(sinceMs)
        ? gte(conversations.last_message_at, sinceMs)
        : undefined;

    const [totalRow, rows] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(conversations)
        .where(whereClause)
        .then((r) => r[0]),
      db
        .select({
          id: conversations.id,
          is_group: conversations.is_group,
          last_message_at: conversations.last_message_at,
          unread_count: conversations.unread_count,
          contact_id: conversations.contact_id,
          contact_name: contacts.name,
          contact_push_name: contacts.push_name,
          contact_is_business: contacts.is_business,
          contact_avatar_url: contacts.avatar_url,
        })
        .from(conversations)
        .leftJoin(contacts, eq(conversations.contact_id, contacts.id))
        .where(whereClause)
        .orderBy(desc(conversations.last_message_at))
        .limit(limit)
        .offset(offset),
    ]);

    const total = totalRow?.count ?? 0;

    const data = await Promise.all(
      rows.map(async (row) => {
        const [countRow, sampleRows] = await Promise.all([
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(messages)
            .where(eq(messages.chat_id, row.id))
            .then((r) => r[0]),
          db
            .select({
              id: messages.id,
              from_me: messages.from_me,
              sender_jid: messages.sender_jid,
              chat_id: messages.chat_id,
              message_type: messages.message_type,
              text: messages.text,
              timestamp: messages.timestamp,
              has_media: messages.has_media,
            })
            .from(messages)
            .where(eq(messages.chat_id, row.id))
            .orderBy(desc(messages.timestamp))
            .limit(10),
        ]);

        const contact: ApiContact = row.contact_id
          ? {
              phone: toE164(row.contact_id),
              name: row.contact_name,
              push_name: row.contact_push_name,
              is_business: row.contact_is_business ?? false,
              avatar_url: row.contact_avatar_url,
            }
          : UNKNOWN_CONTACT;

        return {
          conversation_id: row.id,
          type: row.is_group ? 'group' : 'individual',
          contact,
          last_message_at: row.last_message_at
            ? new Date(row.last_message_at).toISOString()
            : new Date(0).toISOString(),
          message_count: countRow?.count ?? 0,
          unread_count: row.unread_count,
          sample_messages: sampleRows.map(buildApiMessage) as ApiMessage[],
        };
      }),
    );

    const lastItem = rows[rows.length - 1];
    res.json({
      data,
      pagination: {
        page,
        limit,
        total,
        has_next: offset + rows.length < total,
        next_cursor: lastItem?.last_message_at
          ? new Date(lastItem.last_message_at).toISOString()
          : null,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /conversations/updated  ← DEVE vir ANTES de /:id
// ---------------------------------------------------------------------------

queryRouter.get('/updated', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sinceRaw = req.query['since'];
    if (!sinceRaw) {
      res.status(400).json({ error: 'Parâmetro "since" obrigatório (ISO 8601)' });
      return;
    }

    const sinceMs = new Date(String(sinceRaw)).getTime();
    if (!Number.isFinite(sinceMs)) {
      res.status(400).json({ error: 'Formato inválido para "since" — use ISO 8601' });
      return;
    }

    const limit = clamp(parseIntParam(req.query['limit'], 50), 1, 100);

    const rows = await db
      .select({ id: conversations.id, last_message_at: conversations.last_message_at })
      .from(conversations)
      .where(gte(conversations.last_message_at, sinceMs))
      .orderBy(conversations.last_message_at)
      .limit(limit);

    const lastItem = rows[rows.length - 1];
    // +1ms evita sobreposição no próximo ciclo de sync
    const syncToken = lastItem?.last_message_at
      ? new Date(lastItem.last_message_at + 1).toISOString()
      : null;

    res.json({
      data: rows.map((r) => ({
        conversation_id: r.id,
        last_message_at: r.last_message_at
          ? new Date(r.last_message_at).toISOString()
          : new Date(0).toISOString(),
      })),
      sync_token: syncToken,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /conversations/:id/full
// ---------------------------------------------------------------------------

queryRouter.get('/:id/full', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const msgLimit = clamp(parseIntParam(req.query['limit'], 200), 1, 500);
    const beforeRaw = req.query['before'];
    const beforeMs = beforeRaw ? new Date(String(beforeRaw)).getTime() : null;

    const conv = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
      .then((r) => r[0]);

    if (!conv) {
      res.status(404).json({ error: 'Conversa não encontrada' });
      return;
    }

    const contactRow = conv.contact_id
      ? await db
          .select()
          .from(contacts)
          .where(eq(contacts.id, conv.contact_id))
          .then((r) => r[0])
      : null;

    const contact: ApiContactFull = contactRow
      ? {
          phone: toE164(contactRow.id),
          name: contactRow.name,
          push_name: contactRow.push_name,
          is_business: contactRow.is_business,
          avatar_url: contactRow.avatar_url,
          about: contactRow.about,
        }
      : UNKNOWN_CONTACT;

    const msgWhere =
      beforeMs && Number.isFinite(beforeMs)
        ? and(eq(messages.chat_id, id), lt(messages.timestamp, beforeMs))
        : eq(messages.chat_id, id);

    const [countRow, msgRows] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(messages)
        .where(eq(messages.chat_id, id))
        .then((r) => r[0]),
      db
        .select({
          id: messages.id,
          from_me: messages.from_me,
          sender_jid: messages.sender_jid,
          chat_id: messages.chat_id,
          message_type: messages.message_type,
          text: messages.text,
          timestamp: messages.timestamp,
          has_media: messages.has_media,
          media_url: messages.media_url,
          media_mime: messages.media_mime,
          quoted_message_id: messages.quoted_message_id,
          is_forwarded: messages.is_forwarded,
        })
        .from(messages)
        .where(msgWhere)
        .orderBy(desc(messages.timestamp))
        .limit(msgLimit),
    ]);

    res.json({
      conversation_id: conv.id,
      type: conv.is_group ? 'group' : 'individual',
      contact,
      created_at: new Date(conv.created_at).toISOString(),
      last_message_at: conv.last_message_at
        ? new Date(conv.last_message_at).toISOString()
        : new Date(0).toISOString(),
      message_count: countRow?.count ?? 0,
      messages: msgRows.map(buildApiMessageFull) as ApiMessageFull[],
    });
  } catch (err) {
    next(err);
  }
});

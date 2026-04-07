import {
  pgTable,
  text,
  bigint,
  boolean,
  integer,
  index,
} from 'drizzle-orm/pg-core';

// contacts
export const contacts = pgTable('contacts', {
  id: text('id').primaryKey(),               // número limpo ex: "5511999998888"
  name: text('name'),
  push_name: text('push_name'),
  display_name: text('display_name'),
  is_business: boolean('is_business').default(false).notNull(),
  avatar_url: text('avatar_url'),
  about: text('about'),
  created_at: bigint('created_at', { mode: 'number' }).notNull(),
  updated_at: bigint('updated_at', { mode: 'number' }).notNull(),
});

// conversations
export const conversations = pgTable(
  'conversations',
  {
    id: text('id').primaryKey(),             // JID completo ex: "5511...@s.whatsapp.net"
    contact_id: text('contact_id').references(() => contacts.id),
    name: text('name'),
    is_group: boolean('is_group').default(false).notNull(),
    last_message_at: bigint('last_message_at', { mode: 'number' }),
    unread_count: integer('unread_count').default(0).notNull(),
    created_at: bigint('created_at', { mode: 'number' }).notNull(),
    updated_at: bigint('updated_at', { mode: 'number' }).notNull(),
  },
  (table) => [index('conversations_last_message_at_idx').on(table.last_message_at)],
);

// messages
export const messages = pgTable(
  'messages',
  {
    id: text('id').primaryKey(),
    chat_id: text('chat_id').notNull().references(() => conversations.id),
    sender_jid: text('sender_jid'),
    from_me: boolean('from_me').default(false).notNull(),
    timestamp: bigint('timestamp', { mode: 'number' }).notNull(),
    text: text('text'),
    message_type: text('message_type').notNull(),
    has_media: boolean('has_media').default(false).notNull(),
    media_url: text('media_url'),
    media_mime: text('media_mime'),
    is_forwarded: boolean('is_forwarded').default(false).notNull(),
    quoted_message_id: text('quoted_message_id'),
    raw_payload: text('raw_payload').notNull(),
    created_at: bigint('created_at', { mode: 'number' }).notNull(),
  },
  (table) => [
    index('messages_chat_id_idx').on(table.chat_id),
    index('messages_timestamp_idx').on(table.timestamp),
  ],
);

// src/helpers/format.ts
// Funções puras de transformação de dados para as respostas da API.

export type ApiMessageType = 'text' | 'image' | 'document' | 'audio' | 'video' | 'sticker';

const MSG_TYPE_MAP: Record<string, ApiMessageType> = {
  conversation: 'text',
  extendedTextMessage: 'text',
  imageMessage: 'image',
  videoMessage: 'video',
  documentMessage: 'document',
  audioMessage: 'audio',
  stickerMessage: 'sticker',
};

export function mapMsgType(raw: string): ApiMessageType {
  return MSG_TYPE_MAP[raw] ?? 'text';
}

export function toE164(rawPhone: string): string {
  return rawPhone.startsWith('+') ? rawPhone : `+${rawPhone}`;
}

export interface ApiContact {
  phone: string;
  name: string | null;
  push_name: string | null;
  is_business: boolean;
  avatar_url: string | null;
}

export interface ApiContactFull extends ApiContact {
  about: string | null;
}

export interface ApiMessage {
  id: string;
  from: string;
  direction: 'inbound' | 'outbound';
  type: ApiMessageType;
  text: string | null;
  timestamp: string; // ISO 8601
  has_media: boolean;
}

export interface ApiMessageFull extends ApiMessage {
  media_url: string | null;
  media_mime: string | null;
  quoted_message_id: string | null;
  is_forwarded: boolean;
}

export function buildFrom(fromMe: boolean, senderJid: string | null, chatId: string): string {
  if (fromMe) return 'me';
  return senderJid ?? chatId;
}

export function buildApiMessage(row: {
  id: string;
  from_me: boolean;
  sender_jid: string | null;
  chat_id: string;
  message_type: string;
  text: string | null;
  timestamp: number;
  has_media: boolean;
}): ApiMessage {
  return {
    id: row.id,
    from: buildFrom(row.from_me, row.sender_jid, row.chat_id),
    direction: row.from_me ? 'outbound' : 'inbound',
    type: mapMsgType(row.message_type),
    text: row.text,
    timestamp: new Date(row.timestamp).toISOString(),
    has_media: row.has_media,
  };
}

export function buildApiMessageFull(row: {
  id: string;
  from_me: boolean;
  sender_jid: string | null;
  chat_id: string;
  message_type: string;
  text: string | null;
  timestamp: number;
  has_media: boolean;
  media_url: string | null;
  media_mime: string | null;
  quoted_message_id: string | null;
  is_forwarded: boolean;
}): ApiMessageFull {
  return {
    ...buildApiMessage(row),
    media_url: row.media_url,
    media_mime: row.media_mime,
    quoted_message_id: row.quoted_message_id,
    is_forwarded: row.is_forwarded,
  };
}

export const UNKNOWN_CONTACT: ApiContactFull = {
  phone: '+0',
  name: null,
  push_name: null,
  is_business: false,
  avatar_url: null,
  about: null,
};

CREATE TABLE "contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"push_name" text,
	"display_name" text,
	"is_business" boolean DEFAULT false NOT NULL,
	"avatar_url" text,
	"about" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"contact_id" text,
	"name" text,
	"is_group" boolean DEFAULT false NOT NULL,
	"last_message_at" bigint,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"sender_jid" text,
	"from_me" boolean DEFAULT false NOT NULL,
	"timestamp" bigint NOT NULL,
	"text" text,
	"message_type" text NOT NULL,
	"has_media" boolean DEFAULT false NOT NULL,
	"media_url" text,
	"media_mime" text,
	"is_forwarded" boolean DEFAULT false NOT NULL,
	"quoted_message_id" text,
	"raw_payload" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_chat_id_conversations_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_last_message_at_idx" ON "conversations" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "messages_chat_id_idx" ON "messages" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "messages_timestamp_idx" ON "messages" USING btree ("timestamp");
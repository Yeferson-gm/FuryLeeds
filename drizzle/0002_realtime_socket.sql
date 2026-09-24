-- Realtime notifications consumed by src/lib/realtime/events.ts.

CREATE OR REPLACE FUNCTION public.furyleeds_notify_conversation_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
	changed public.conversations%ROWTYPE;
	payload jsonb;
BEGIN
	IF TG_OP = 'DELETE' THEN
		changed := OLD;
	ELSE
		changed := NEW;
	END IF;

	payload := pg_catalog.jsonb_build_object(
		'v', 1,
		'kind', 'conversation',
		'eventType', TG_OP,
		'accountId', changed.account_id,
		'entityId', changed.id,
		'conversationId', changed.id
	);

	PERFORM pg_catalog.pg_notify('furyleeds_realtime_v1', payload::text);
	RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS furyleeds_realtime_conversations ON public.conversations;
--> statement-breakpoint
CREATE TRIGGER furyleeds_realtime_conversations
AFTER INSERT OR UPDATE OR DELETE ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.furyleeds_notify_conversation_change();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.furyleeds_notify_message_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
	changed public.messages%ROWTYPE;
	account_id uuid;
	contact_name text;
	contact_wa_username text;
	contact_phone text;
	truncated_content text;
	payload jsonb;
	payload_size integer;
	characters_to_remove integer;
BEGIN
	IF TG_OP = 'DELETE' THEN
		changed := OLD;
	ELSE
		changed := NEW;
	END IF;

	SELECT
		conversation.account_id,
		contact.name,
		contact.wa_username,
		contact.phone
	INTO account_id, contact_name, contact_wa_username, contact_phone
	FROM public.conversations AS conversation
	JOIN public.contacts AS contact ON contact.id = conversation.contact_id
	WHERE conversation.id = changed.conversation_id;

	IF account_id IS NULL THEN
		RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
	END IF;

	payload := pg_catalog.jsonb_build_object(
		'v', 1,
		'kind', 'thread',
		'eventType', TG_OP,
		'accountId', account_id,
		'entityId', changed.id,
		'conversationId', changed.conversation_id
	);

	IF TG_OP = 'INSERT' AND changed.sender_type = 'customer' THEN
		truncated_content := changed.content_text;

		LOOP
			payload := pg_catalog.jsonb_build_object(
				'v', 1,
				'kind', 'thread',
				'eventType', TG_OP,
				'accountId', account_id,
				'entityId', changed.id,
				'conversationId', changed.conversation_id,
				'browserMessage', pg_catalog.jsonb_build_object(
					'id', changed.id,
					'conversation_id', changed.conversation_id,
					'sender_type', changed.sender_type,
					'content_type', changed.content_type,
					'content_text', truncated_content,
					'created_at', COALESCE(changed.created_at, pg_catalog.statement_timestamp()),
					'contact_name', contact_name,
					'contact_wa_username', contact_wa_username,
					'contact_phone', contact_phone
				)
			);

			payload_size := pg_catalog.octet_length(payload::text);
			EXIT WHEN payload_size <= 7900 OR truncated_content IS NULL OR truncated_content = '';

			characters_to_remove := GREATEST(payload_size - 7800, 1);
			truncated_content := pg_catalog.left(
				truncated_content,
				GREATEST(
					pg_catalog.char_length(truncated_content) - characters_to_remove,
					0
				)
			);
		END LOOP;

		-- An oversized contact field must never make the originating INSERT fail.
		IF pg_catalog.octet_length(payload::text) >= 8000 THEN
			payload := pg_catalog.jsonb_build_object(
				'v', 1,
				'kind', 'thread',
				'eventType', TG_OP,
				'accountId', account_id,
				'entityId', changed.id,
				'conversationId', changed.conversation_id
			);
		END IF;
	END IF;

	PERFORM pg_catalog.pg_notify('furyleeds_realtime_v1', payload::text);
	RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS furyleeds_realtime_messages ON public.messages;
--> statement-breakpoint
CREATE TRIGGER furyleeds_realtime_messages
AFTER INSERT OR UPDATE OR DELETE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.furyleeds_notify_message_change();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.furyleeds_notify_message_reaction_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
	changed public.message_reactions%ROWTYPE;
	account_id uuid;
	payload jsonb;
BEGIN
	IF TG_OP = 'DELETE' THEN
		changed := OLD;
	ELSE
		changed := NEW;
	END IF;

	SELECT conversation.account_id
	INTO account_id
	FROM public.conversations AS conversation
	WHERE conversation.id = changed.conversation_id;

	IF account_id IS NULL THEN
		RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
	END IF;

	payload := pg_catalog.jsonb_build_object(
		'v', 1,
		'kind', 'thread',
		'eventType', TG_OP,
		'accountId', account_id,
		'entityId', changed.id,
		'conversationId', changed.conversation_id
	);

	PERFORM pg_catalog.pg_notify('furyleeds_realtime_v1', payload::text);
	RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS furyleeds_realtime_message_reactions ON public.message_reactions;
--> statement-breakpoint
CREATE TRIGGER furyleeds_realtime_message_reactions
AFTER INSERT OR UPDATE OR DELETE ON public.message_reactions
FOR EACH ROW EXECUTE FUNCTION public.furyleeds_notify_message_reaction_change();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.furyleeds_notify_notification_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
	changed public.notifications%ROWTYPE;
	payload jsonb;
BEGIN
	IF TG_OP = 'DELETE' THEN
		changed := OLD;
	ELSE
		changed := NEW;
	END IF;

	payload := pg_catalog.jsonb_build_object(
		'v', 1,
		'kind', 'notification',
		'eventType', TG_OP,
		'accountId', changed.account_id,
		'entityId', changed.id,
		'targetUserId', changed.user_id
	);

	PERFORM pg_catalog.pg_notify('furyleeds_realtime_v1', payload::text);
	RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS furyleeds_realtime_notifications ON public.notifications;
--> statement-breakpoint
CREATE TRIGGER furyleeds_realtime_notifications
AFTER INSERT OR UPDATE OR DELETE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.furyleeds_notify_notification_change();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.furyleeds_notify_presence_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
	changed public.member_presence%ROWTYPE;
	payload jsonb;
BEGIN
	IF TG_OP = 'DELETE' THEN
		changed := OLD;
	ELSE
		changed := NEW;
	END IF;

	payload := pg_catalog.jsonb_build_object(
		'v', 1,
		'kind', 'presence',
		'eventType', TG_OP,
		'accountId', changed.account_id,
		'entityId', changed.user_id,
		'targetUserId', changed.user_id,
		'status', changed.status,
		'lastSeenAt', changed.last_seen_at
	);

	PERFORM pg_catalog.pg_notify('furyleeds_realtime_v1', payload::text);
	RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS furyleeds_realtime_member_presence ON public.member_presence;
--> statement-breakpoint
CREATE TRIGGER furyleeds_realtime_member_presence
AFTER INSERT OR UPDATE OR DELETE ON public.member_presence
FOR EACH ROW EXECUTE FUNCTION public.furyleeds_notify_presence_change();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.furyleeds_notify_broadcast_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
	changed public.broadcasts%ROWTYPE;
	payload jsonb;
BEGIN
	IF TG_OP = 'DELETE' THEN
		changed := OLD;
	ELSE
		changed := NEW;
	END IF;

	payload := pg_catalog.jsonb_build_object(
		'v', 1,
		'kind', 'broadcast',
		'eventType', TG_OP,
		'accountId', changed.account_id,
		'entityId', changed.id,
		'broadcastId', changed.id
	);

	PERFORM pg_catalog.pg_notify('furyleeds_realtime_v1', payload::text);
	RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS furyleeds_realtime_broadcasts ON public.broadcasts;
--> statement-breakpoint
CREATE TRIGGER furyleeds_realtime_broadcasts
AFTER INSERT OR UPDATE OR DELETE ON public.broadcasts
FOR EACH ROW EXECUTE FUNCTION public.furyleeds_notify_broadcast_change();
--> statement-breakpoint

-- Keep campaign funnel counters synchronized with recipient state. Pending bulk
-- inserts are ignored so creating a large audience does not recalculate the
-- same aggregate once per recipient.
CREATE OR REPLACE FUNCTION public.furyleeds_refresh_broadcast_counts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
	changed_broadcast_id uuid;
BEGIN
	IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
		RETURN NEW;
	END IF;
	IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
		RETURN NEW;
	END IF;

	changed_broadcast_id := CASE
		WHEN TG_OP = 'DELETE' THEN OLD.broadcast_id
		ELSE NEW.broadcast_id
	END;

	UPDATE public.broadcasts AS broadcast
	SET
		sent_count = counts.sent_count,
		delivered_count = counts.delivered_count,
		read_count = counts.read_count,
		replied_count = counts.replied_count,
		failed_count = counts.failed_count,
		updated_at = pg_catalog.statement_timestamp()
	FROM (
		SELECT
			pg_catalog.count(*) FILTER (
				WHERE status IN ('sent', 'delivered', 'read', 'replied')
			)::integer AS sent_count,
			pg_catalog.count(*) FILTER (
				WHERE status IN ('delivered', 'read', 'replied')
			)::integer AS delivered_count,
			pg_catalog.count(*) FILTER (
				WHERE status IN ('read', 'replied')
			)::integer AS read_count,
			pg_catalog.count(*) FILTER (WHERE status = 'replied')::integer AS replied_count,
			pg_catalog.count(*) FILTER (WHERE status = 'failed')::integer AS failed_count
		FROM public.broadcast_recipients
		WHERE broadcast_id = changed_broadcast_id
	) AS counts
	WHERE broadcast.id = changed_broadcast_id;

	RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS furyleeds_refresh_broadcast_counts ON public.broadcast_recipients;
--> statement-breakpoint
CREATE TRIGGER furyleeds_refresh_broadcast_counts
AFTER INSERT OR UPDATE OF status OR DELETE ON public.broadcast_recipients
FOR EACH ROW EXECUTE FUNCTION public.furyleeds_refresh_broadcast_counts();

import type { RequestHandler } from "express";
import { json } from "express";

/** Where Meta posts WhatsApp statuses and messages (`MetaWebhookController`). */
export const META_WEBHOOK_PATH = "/public/webhooks/meta";

/**
 * Meta's webhook payloads can be up to 3 MB (its Webhooks docs); a batch of
 * statuses past the API's default 100 kB was refused with 413 before the
 * signature was checked, and Meta retries, then drops it (03-L7).
 */
export const META_WEBHOOK_BODY_LIMIT = "3mb";

/**
 * The JSON parser for the Meta webhook alone, with the larger limit and the
 * raw bytes kept for the signature check, as the API's own parser keeps
 * them. Mounted before it in `main.ts`; that parser then skips a body
 * already read. Every other route keeps the default limit.
 */
export function metaWebhookBody(): RequestHandler {
    return json({
        limit: META_WEBHOOK_BODY_LIMIT,
        verify: (req, _res, buffer) => {
            (req as { rawBody?: Buffer }).rawBody = buffer;
        },
    });
}

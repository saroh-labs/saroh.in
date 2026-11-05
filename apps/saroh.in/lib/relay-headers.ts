import { env } from "@/env";
import { linkPreviewHeaders } from "@/lib/link-preview-forward";
import { relaySecret } from "@/lib/relay";

/**
 * The signed headers for forwarding this request to api.saroh.in, or null
 * when there is no secret to sign with. Server only. The older routes still
 * spell this out; a new route takes it from here (DEC-195).
 */
export const relayHeaders = (req: Request): Record<string, string> | null =>
    linkPreviewHeaders({
        headers: req.headers,
        host: new URL(req.url).host,
        secret: relaySecret(env.SITE_RELAY_SECRET, env.NODE_ENV),
    });

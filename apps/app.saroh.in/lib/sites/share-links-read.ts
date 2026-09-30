import { cache } from "react";

import { env } from "@/env";
import { apiFetch, orgBase } from "@/lib/api/http";

import type { WebAddressLinks } from "./share-links";

/**
 * The renderer's apex, for the one case the API's read isn't there to say
 * it (`siteAddressOf`'s fallback). The renderer defaults the same way.
 */
export const RENDERER_APEX = env.NEXT_PUBLIC_ROOT_DOMAIN ?? "saroh.app";

/**
 * The business's web address and its live links (DEC-069, L2's
 * `GET organizations/:id/web-address`), once per render. Server-only.
 *
 * Tolerant on purpose, never `getJson`: the read needs
 * `org:settings:read`, which a Member or a Reviewer doesn't hold, and its
 * 403 must not turn Orders, Bookings or the Website screen into a 403 page.
 * Null — for that, a failure, or an API without the route yet — means
 * "not known": share buttons are left out, and addresses fall back to the
 * site's own subdomain.
 */
export const readWebAddressLinks = cache(
    async (): Promise<WebAddressLinks | null> => {
        try {
            const base = await orgBase();
            if (!base) return null;
            const res = await apiFetch(`${base}/web-address`);
            if (!res.ok) return null;
            const body = (await res.json()) as Partial<WebAddressLinks> | null;
            return body?.links && typeof body.origin === "string"
                ? (body as WebAddressLinks)
                : null;
        } catch {
            return null;
        }
    },
);

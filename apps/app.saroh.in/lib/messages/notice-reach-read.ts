import { apiFetch, orgBase } from "@/lib/api/http";

import type { NoticeChannels, NoticeReach } from "./notice-reach";
import { isNoticeReach } from "./notice-reach";

/**
 * How a notice about a customer's own booking or order reaches them
 * (round-2 A14): the business's channels, and, for a contact, that
 * customer's reach. `GET customer-notices/reach` under `contact:read`.
 * Server-only. Null when it can't be read (not permitted, or the API
 * failed): the screens then claim nothing either way.
 */
export async function readNoticeReach(
    contactId?: string | null,
): Promise<(NoticeChannels & { reach: NoticeReach | null }) | null> {
    const base = await orgBase();
    if (!base) return null;
    try {
        const query = contactId
            ? `?contactId=${encodeURIComponent(contactId)}`
            : "";
        const res = await apiFetch(`${base}/customer-notices/reach${query}`);
        if (!res.ok) return null;
        const body = (await res.json()) as Partial<{
            email: unknown;
            thread: unknown;
            reach: unknown;
        }>;
        if (typeof body.email !== "boolean" || typeof body.thread !== "boolean")
            return null;
        return {
            email: body.email,
            thread: body.thread,
            reach: isNoticeReach(body.reach) ? body.reach : null,
        };
    } catch {
        return null;
    }
}

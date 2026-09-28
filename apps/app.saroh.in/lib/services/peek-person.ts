import { apiFetch, orgBase } from "@/lib/api/http";
import { getContact } from "@/lib/contacts/service";
import { readNoticeReach } from "@/lib/messages/notice-reach-read";

import type { PeekAttention, PeekPerson } from "./peek";

/**
 * The person behind a booking, for the peek (E5). Server-only.
 *
 * Two reads the viewer's own role decides: the contact (for the phone) and
 * Needs attention (C1, `GET customers/:contactId/attention`), both under
 * `contact:read`, and how a move or cancel reaches them (A14). The attention read already hides sensitive entries from a
 * viewer who may not see them and only counts them.
 *
 * Null when the contact can't be read — not permitted, gone, or the API
 * failed — so the peek says it doesn't know instead of "No phone yet".
 * Attention failing on its own leaves just that row out.
 */
export async function readPeekPerson(
    contactId: string,
): Promise<PeekPerson | null> {
    const base = await orgBase();
    if (!base) return null;
    const [contact, attention, notices] = await Promise.all([
        getContact(contactId).catch(() => null),
        readAttention(base, contactId),
        readNoticeReach(contactId),
    ]);
    if (!contact) return null;
    return { phone: contact.phone, attention, reach: notices?.reach ?? null };
}

/** Needs attention for one contact; null when it can't be read. The
 * customer picker (E4) reads it too, through `lib/customers/search.ts`. */
export async function readAttention(
    base: string,
    contactId: string,
): Promise<PeekAttention | null> {
    try {
        const res = await apiFetch(
            `${base}/customers/${encodeURIComponent(contactId)}/attention`,
        );
        if (!res.ok) return null;
        const body = (await res.json()) as Partial<PeekAttention>;
        return {
            entries: Array.isArray(body.entries)
                ? body.entries.map((e) => ({
                      id: e.id,
                      kind: e.kind,
                      label: e.label,
                      sensitive: e.sensitive,
                      ...(Array.isArray(e.matchAllergens)
                          ? { matchAllergens: e.matchAllergens }
                          : {}),
                  }))
                : [],
            hiddenSensitiveCount:
                typeof body.hiddenSensitiveCount === "number"
                    ? body.hiddenSensitiveCount
                    : 0,
        };
    } catch {
        return null;
    }
}

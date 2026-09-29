import { apiFetch, getJson, orgBase } from "@/lib/api/http";

import type { CappedList } from "@/lib/lists/capped";
import { withLive } from "@/lib/lists/capped";

import type { Invoice } from "./service";
import type { InvoiceScope } from "./sources";

/**
 * The Invoices list narrowed to one pack's or one course's (D18,
 * `?pack=`/`?course=`). Server-only: `orgBase` reads the active
 * organization.
 */

/** `?pack=` or `?course=` from the address; a pack wins if both are sent. */
export function scopeFromQuery(query: {
    pack?: string;
    course?: string;
}): { kind: "pack" | "course"; id: string } | null {
    const pack = query.pack?.trim();
    if (pack) return { kind: "pack", id: pack };
    const course = query.course?.trim();
    if (course) return { kind: "course", id: course };
    return null;
}

/**
 * That pack's or course's invoices, asked of the API (`?packId=`,
 * `?courseId=`) — the newest and every unpaid one, as the whole list is —
 * rather than picked out of the capped newest page, where an older sale
 * is missing.
 */
export async function listInvoicesIn(scope: {
    kind: "pack" | "course";
    id: string;
}): Promise<CappedList<Invoice>> {
    const base = await orgBase();
    if (!base) return { rows: [], truncated: false };
    const only = `${scope.kind === "pack" ? "packId" : "courseId"}=${encodeURIComponent(scope.id)}`;
    const [newest, issued, overdue] = await Promise.all([
        getJson<Invoice[]>(`${base}/invoices?${only}`),
        getJson<Invoice[]>(`${base}/invoices?view=issued&${only}`),
        getJson<Invoice[]>(`${base}/invoices?view=overdue&${only}`),
    ]);
    return withLive(newest ?? [], issued ?? [], overdue ?? []);
}

/**
 * The pack's or course's name for the pill. Someone may read invoices
 * without reading packs or courses, and a name is not worth the page: any
 * refusal or failure is a null, and the pill says "this pack".
 */
export async function scopeWithName(scope: {
    kind: "pack" | "course";
    id: string;
}): Promise<InvoiceScope> {
    const base = await orgBase();
    const path = scope.kind === "pack" ? "class-packs" : "courses";
    let name: string | null = null;
    if (base) {
        try {
            const res = await apiFetch(
                `${base}/${path}/${encodeURIComponent(scope.id)}`,
            );
            if (res.ok) {
                const body = (await res.json()) as { name?: unknown };
                name = typeof body.name === "string" ? body.name : null;
            }
        } catch {
            name = null;
        }
    }
    return { ...scope, name };
}

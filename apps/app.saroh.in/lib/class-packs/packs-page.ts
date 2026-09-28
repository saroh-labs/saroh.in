import { apiFetch, getJson, orgBase } from "@/lib/api/http";
import type { BookingRules } from "@/lib/staff/types";
import type { Plan } from "@/lib/subscriptions/service";
import { listPlansOptional } from "@/lib/subscriptions/service";

import type { PackListItem } from "./pack-cards";

/**
 * The Packs list's reads (round-2 E15). Server-only. The packs are the
 * page's one required read; the booking rule and the memberships are extras
 * that cost only their own line when they can't be read.
 */

/** Every pack, drafts included, for the cards (E14's `include=drafts`). */
export async function listPackCards(): Promise<PackListItem[]> {
    const base = await orgBase();
    if (!base) return [];
    return (
        (await getJson<PackListItem[]>(`${base}/class-packs?include=drafts`)) ??
        []
    );
}

/**
 * The business's free-cancel window, for the rule line: hours, null for
 * none, or undefined when it could not be read (the line then leaves the
 * cancel sentence out). Not `getJson`: a 403 must not fail the page.
 */
export async function readFreeCancelHours(): Promise<
    number | null | undefined
> {
    const base = await orgBase();
    if (!base) return undefined;
    try {
        const res = await apiFetch(`${base}/booking-rules`);
        if (!res.ok) return undefined;
        const rules = (await res.json()) as Partial<BookingRules>;
        return rules.freeCancelHours === undefined
            ? undefined
            : rules.freeCancelHours;
    } catch {
        return undefined;
    }
}

/** A membership plan as the Packs list's note shows it. */
export type MembershipPlan = Pick<
    Plan,
    "id" | "name" | "classesPerMonth" | "subscriberCount"
>;

/**
 * The live membership plans, for "Memberships include classes too"; null
 * when they could not be read or aren't this person's to see. Asked only
 * when Payments (where plans live) is available, so a module switched off
 * is never shown (DEC-057).
 */
export async function readMembershipPlans(): Promise<MembershipPlan[] | null> {
    const read = await listPlansOptional();
    if (read.state !== "ok") return null;
    return read.data
        .filter((p) => p.status === "ACTIVE")
        .map(({ id, name, classesPerMonth, subscriberCount }) => ({
            id,
            name,
            classesPerMonth,
            subscriberCount,
        }));
}

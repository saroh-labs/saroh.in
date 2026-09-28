import { toFailure } from "@/lib/api/failure";
import { apiFetch, getJson, orgBase } from "@/lib/api/http";

import type { PackStanding } from "./balance";
import type { MoneyTotal, PackListItem } from "./pack-cards";
import type { PackPurchase } from "./service";

/**
 * Pack Detail's reads and Extend (round-2 E16, on E13's API). Server-only.
 *
 * The pack is the page's one required read; who has it, its receipts and
 * the sell dialog's context each cost only their own part when they fail.
 * `pack:read` covers all of it, prices and sales included (DEC-039); the
 * invoice ids behind Receipts come only to someone who may open invoices.
 *
 * Its own file rather than `service.ts`, which `pack-cards.ts` reads types
 * from: the detail's types build on the list's, and the other way round
 * would be an import cycle.
 */

/** Pack Detail's Overview figures, worked out by the API (E13). */
export interface PackOverview {
    /** People with a live purchase: time and classes left. */
    holders: number;
    /** Classes (or sessions) left across live purchases. */
    creditsLeft: number;
    /** Live purchases ending within 14 days. */
    runningOut: number;
    /** Classes never used on purchases that have run out. */
    lostToExpiry: number;
    sold: number;
    soldThisMonth: number;
    takings: MoneyTotal[];
    takingsThisMonth: MoneyTotal[];
}

/** One pack as Pack Detail reads it: the list's fields and the Overview. */
export interface PackDetail extends PackListItem {
    overview: PackOverview;
}

/** Days a holder's pack was given, with why and who gave it (E13). */
export interface PackExtension {
    id: string;
    days: number;
    reason: string;
    expiresBefore: string;
    expiresAfter: string;
    /** A teammate by name; a null name is Saroh support. */
    by: { userId: string | null; name: string | null };
    createdAt: string;
}

/** One purchase of the pack, as Who has it lists it (E13's holders). */
export interface PackHolder {
    purchaseId: string;
    contact: { id: string; name: string };
    credits: number;
    used: number;
    left: number;
    standing: PackStanding;
    expiresAt: string;
    soldAt: string;
    /** What it was sold for, which may be an older price. */
    price: string;
    currency: string;
    paidBy: PackPurchase["paidBy"];
    extendedDays: number;
    /** Oldest first. */
    extensions: PackExtension[];
}

/** A read one part of the page can do without: said so there, never the page. */
export type PartRead<T> =
    { state: "ok"; data: T } | { state: "denied" } | { state: "failed" };

const packPath = (id: string) => `/class-packs/${encodeURIComponent(id)}`;

async function partRead<T>(path: string): Promise<PartRead<T>> {
    const base = await orgBase();
    if (!base) return { state: "failed" };
    try {
        const res = await apiFetch(`${base}${path}`);
        if (res.status === 403) return { state: "denied" };
        if (!res.ok) return { state: "failed" };
        return { state: "ok", data: (await res.json()) as T };
    } catch {
        return { state: "failed" };
    }
}

/**
 * The pack with its Overview, a draft too; null when it isn't this
 * business's. A 403 is the role's answer (`forbidden()`); anything else
 * throws to the page's boundary.
 */
export async function getPackDetail(id: string): Promise<PackDetail | null> {
    const base = await orgBase();
    if (!base) return null;
    return getJson<PackDetail>(`${base}${packPath(id)}`);
}

/** Everyone who has bought it, live purchases first (Who has it). */
export function readPackHolders(id: string): Promise<PartRead<PackHolder[]>> {
    return partRead<PackHolder[]>(`${packPath(id)}/holders`);
}

/**
 * Its purchases, for the Receipts card: the API sends each one's invoice id
 * only to someone who may open invoices.
 */
export function readPackPurchases(
    id: string,
): Promise<PartRead<PackPurchase[]>> {
    const query = new URLSearchParams({ packId: id });
    return partRead<PackPurchase[]>(
        `/class-packs/purchases?${query.toString()}`,
    );
}

/**
 * Every purchase and every pack, for the sell dialog's first-pack check.
 * An aid, not the rule: the API refuses a first-pack sale either way, so a
 * failed read only means the dialog can't warn before saving.
 */
export async function readSellContext(): Promise<{
    held: PackPurchase[];
    packs: PackListItem[];
}> {
    const [held, packs] = await Promise.all([
        partRead<PackPurchase[]>("/class-packs/purchases"),
        partRead<PackListItem[]>("/class-packs?include=drafts"),
    ]);
    return {
        held: held.state === "ok" ? held.data : [],
        packs: packs.state === "ok" ? packs.data : [],
    };
}

/** An extend's outcome; a refusal keeps its status so a 409 is said plainly. */
export type ExtendResult =
    | { ok: true; data: PackHolder }
    | { ok: false; error: string; field?: string; status: number };

/**
 * Give a holder's pack more days: 1 to 30 at a time, with a reason (E13).
 * The status comes back so a 409 — nothing left to extend — is said in
 * the merchant's words, not the API's.
 */
export async function extendPurchase(
    purchaseId: string,
    days: number,
    reason: string,
): Promise<ExtendResult> {
    const base = await orgBase();
    if (!base) return { ok: false, error: "No active business.", status: 0 };
    const res = await apiFetch(
        `${base}/class-packs/purchases/${encodeURIComponent(purchaseId)}/extend`,
        { method: "POST", body: JSON.stringify({ days, reason }) },
    );
    const data: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: data as PackHolder };
    return {
        ...toFailure(data, "Could not extend that pack."),
        status: res.status,
    };
}

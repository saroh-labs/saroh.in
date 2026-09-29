import { formatMoneyMajor } from "@/lib/format/money";

import type { PackStanding } from "./balance";
import type { ClassPack } from "./service";

/**
 * How the Packs list says each pack (round-2 E15, after "Saroh Packs"): the
 * card's badges, price, terms and counts, the page's summary and its rule
 * line. Pure, so the words are tested once and the card only draws them.
 *
 * Every figure is the API's (sold, classes left, people, what it took);
 * the one sum made here is the summary's, over the purchases list the page
 * already reads, and it is labelled as what was sold, not what was paid.
 */

export type PackKind = "CLASSES" | "ONE_TO_ONE";

/** Money summed per currency, as the API sends it. */
export interface MoneyTotal {
    currency: string;
    amount: string;
}

/**
 * A pack as the Packs list reads it, drafts included. The E13–E15 fields
 * are optional: an API from before them leaves them out, and the card then
 * says less rather than something untrue.
 */
export interface PackListItem extends Omit<ClassPack, "status"> {
    status: "ACTIVE" | "ARCHIVED" | "DRAFT";
    kind?: PackKind;
    firstPackOnly?: boolean;
    /** Classes (or sessions) left across live purchases. */
    creditsLeft?: number;
    /** People holding a live purchase. */
    people?: number;
    /** What its sales were sold for, per currency. */
    takings?: MoneyTotal[];
    /** A live pack holding changes nobody has published yet (E14). */
    hasPendingChanges?: boolean;
}

export function packKind(p: { kind?: string | null }): PackKind {
    return p.kind === "ONE_TO_ONE" ? "ONE_TO_ONE" : "CLASSES";
}

/** "class" / "classes", or "session" / "sessions" for a one-to-one pack. */
export function unitWord(kind: PackKind, n: number): string {
    if (kind === "ONE_TO_ONE") return n === 1 ? "session" : "sessions";
    return n === 1 ? "class" : "classes";
}

const count = (n: number, one: string, other: string) =>
    `${n} ${n === 1 ? one : other}`;

/** A card's figure: "₹1,500", with no ".00" on a whole amount. */
export function money(amount: number | string, currency: string): string {
    return formatMoneyMajor(amount, currency) ?? String(amount);
}

function moneyTotals(totals: readonly MoneyTotal[]): string {
    return totals.map((t) => money(t.amount, t.currency)).join(" + ");
}

export type BadgeTone = "off" | "accent";

export interface PackCardView {
    id: string;
    name: string;
    /** Where the name leads; null when it leads nowhere this person can go. */
    href: string | null;
    /** The card's Open button: Pack Detail, for a published pack only. */
    openHref: string | null;
    badges: { label: string; tone: BadgeTone }[];
    /** "₹1,500", or "No price yet" on a draft still at nothing. */
    price: string;
    /** "₹150 a class"; null when there is nothing to divide. */
    each: string | null;
    /** "10 classes · use within 60 days · HIIT, Yoga". */
    terms: string;
    sold: string;
    /** "₹33,000 taken", "None yet", or null when the API did not say. */
    takings: string | null;
    stillToUse: string;
    /** "across 3 people", or "Nobody has any left". */
    stillToUseNote: string;
    /** Why the card can't be sold now; null when it can. */
    why: string | null;
    draft: boolean;
    archived: boolean;
    /** Draft packs are sold from nowhere until published; none has a Sell. */
    showSell: boolean;
    /** Archived packs keep Sell visible but off, with `why` beside it. */
    sellDisabled: boolean;
    /** Archive and Sell again are for published packs; a draft is deleted in the editor. */
    canArchive: boolean;
    editHref: string;
}

/** The Pack Editor for a pack (E18's page; a draft opens nowhere else). */
export function editHref(id: string): string {
    return `/class-packs/${encodeURIComponent(id)}/edit`;
}

/** Pack Detail (E16), on a tab other than Overview when one is named. */
export function detailHref(id: string, tab?: string): string {
    const base = `/class-packs/${encodeURIComponent(id)}`;
    return tab && tab !== "overview" ? `${base}?tab=${tab}` : base;
}

/**
 * Where a card's name leads: a published pack to its own page (E16), for
 * anyone who can see the list; a draft to the editor ("Draft cards open the
 * editor"), and nowhere for someone who can't change packs.
 */
export function packHref(
    p: Pick<PackListItem, "id" | "status">,
    canWrite: boolean,
): string | null {
    if (p.status !== "DRAFT") return detailHref(p.id);
    return canWrite ? editHref(p.id) : null;
}

export function packCard(p: PackListItem, canWrite: boolean): PackCardView {
    const kind = packKind(p);
    const draft = p.status === "DRAFT";
    const archived = p.status === "ARCHIVED";
    const price = Number(p.price);
    const priced = Number.isFinite(price) && price > 0;
    const badges: PackCardView["badges"] = [];
    if (draft) badges.push({ label: "Draft", tone: "off" });
    if (kind === "ONE_TO_ONE")
        badges.push({ label: "One-to-one", tone: "off" });
    if (p.firstPackOnly)
        badges.push({ label: "First pack only", tone: "accent" });
    if (!draft && p.hasPendingChanges)
        badges.push({ label: "Changes not published", tone: "accent" });
    if (archived) badges.push({ label: "Archived", tone: "off" });

    const services = p.services.map((s) => s.name).join(", ");
    const terms = [
        `${p.credits} ${unitWord(kind, p.credits)}`,
        `use within ${count(p.validityDays, "day", "days")}`,
        ...(services ? [services] : []),
    ].join(" · ");

    const takings = p.takings
        ? p.sold > 0 && p.takings.length > 0
            ? `${moneyTotals(p.takings)} taken`
            : "None yet"
        : null;
    const people = p.people ?? p.activeHolders;
    const left = p.creditsLeft;

    return {
        id: p.id,
        name: p.name,
        href: packHref(p, canWrite),
        openHref: draft ? null : detailHref(p.id),
        badges,
        price: priced || !draft ? money(p.price, p.currency) : "No price yet",
        each:
            priced && p.credits > 0
                ? `${money(Math.round(price / p.credits), p.currency)} a ${unitWord(kind, 1)}`
                : null,
        terms,
        sold: String(p.sold),
        takings,
        stillToUse: left === undefined ? "—" : String(left),
        stillToUseNote:
            people > 0
                ? `across ${count(people, "person", "people")}`
                : "Nobody has any left",
        why: draft
            ? "Draft — not on sale until you publish it in the editor."
            : archived
              ? "Archived, so it can't be sold. Sell again puts it back on sale."
              : null,
        draft,
        archived,
        showSell: !draft,
        sellDisabled: archived,
        canArchive: !draft,
        editHref: editHref(p.id),
    };
}

/** On sale first, then drafts, then archived; newest last within each. */
export function orderForList<T extends Pick<PackListItem, "status">>(
    packs: readonly T[],
): T[] {
    const rank = { ACTIVE: 0, DRAFT: 1, ARCHIVED: 2 } as const;
    return packs
        .map((p, i) => ({ p, i }))
        .sort((a, b) => rank[a.p.status] - rank[b.p.status] || a.i - b.i)
        .map((x) => x.p);
}

/** What the summary reads from a purchase. */
export interface OwedPurchase {
    contact: { id: string };
    credits: number;
    left: number;
    standing: PackStanding;
    price: string;
    currency: string;
}

/**
 * The page's summary: "12 classes still owed to 5 people · ₹6,200 sold and
 * not yet used". The worth is each live purchase's price for the classes
 * left on it — what was sold, not what was paid (a sale can record none).
 */
export function owedSummary(purchases: readonly OwedPurchase[]): string {
    const live = purchases.filter((p) => p.standing === "ACTIVE" && p.left > 0);
    if (live.length === 0) return "No classes owed right now";
    const owed = live.reduce((n, p) => n + p.left, 0);
    const people = new Set(live.map((p) => p.contact.id)).size;
    const worth = new Map<string, number>();
    for (const p of live) {
        if (p.credits <= 0) continue;
        const share = (Number(p.price) * p.left) / p.credits;
        if (!Number.isFinite(share)) continue;
        worth.set(p.currency, (worth.get(p.currency) ?? 0) + share);
    }
    const value = Array.from(worth.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([currency, amount]) => money(Math.round(amount), currency))
        .join(" + ");
    const head = `${count(owed, "class", "classes")} still owed to ${count(people, "person", "people")}`;
    return value ? `${head} · ${value} sold and not yet used` : head;
}

/**
 * The rule line under the title: how a booking spends a class, and when a
 * cancel gives it back. `freeCancelHours` is the business's booking rule —
 * null is no deadline (every cancel gives it back); undefined, unread, so
 * the cancel sentence is left out rather than guessed.
 */
export function rulesNote(freeCancelHours: number | null | undefined): string {
    const spend =
        "A booking uses a membership's classes first, then the pack that runs out soonest.";
    const end = "Unused classes end with the pack.";
    if (freeCancelHours === undefined) return `${spend} ${end}`;
    const cancel =
        freeCancelHours === null
            ? "Cancel before it starts and the class comes back."
            : `Cancel ${count(freeCancelHours, "hour", "hours")} or more before and the class comes back; later, it's used.`;
    return `${spend} ${cancel} ${end}`;
}

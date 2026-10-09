import { packStanding } from "@/lib/class-packs/balance";
import { useWords } from "@/lib/class-packs/pack-activity";
import { packKind, unitWord } from "@/lib/class-packs/pack-cards";
import type { Tone } from "@/lib/class-packs/pack-detail";
import { day } from "@/lib/class-packs/pack-detail";
import type { PackHolder } from "@/lib/class-packs/pack-detail-data";
import type { HolderRow } from "@/lib/class-packs/pack-holders";
import { holderRow } from "@/lib/class-packs/pack-holders";
import type { HeldPack } from "@/lib/class-packs/sell-words";
import { paidByLabel } from "@/lib/class-packs/sell-words";

import type { CustomerDetail, DetailPack } from "./detail";

/**
 * A customer's class packs on Customer Detail (round-2 C7), in words: the
 * Packs tab's rows — each purchase as Pack Detail's Who has it says it, seen
 * from the person's side — and the classes spent from it. Pure: `now` and
 * the zone are passed in, so the server and the browser say the same.
 *
 * The balance is the API's (`used` counts the redemptions not given back,
 * ADR-007); nothing here adds it up again.
 */

/** A pack's own page, Pack Detail (E16). */
export function packHref(packId: string): string {
    return `/class-packs/${encodeURIComponent(packId)}`;
}

/** One class spent from a purchase: when, what, and what became of it. */
export interface PackUseRow {
    key: string;
    href: string;
    /** "Mon 29 Sep 07:00". */
    when: string;
    what: string;
    state: { label: string; tone: Tone };
}

/** A purchase, as the Packs tab lists it. */
export interface PackTabRow extends Pick<
    HolderRow,
    | "purchaseId"
    | "left"
    | "pct"
    | "bar"
    | "when"
    | "whenTone"
    | "extNote"
    | "extendBlock"
> {
    /** "10 classes pack". */
    name: string;
    /** Its Pack Detail. */
    href: string;
    /** "Bought 1 Sep · ₹3,000 · UPI". */
    bought: string;
    expiresAt: string;
    /** "classes" or "sessions". */
    unitsWord: string;
    /** Latest first. */
    uses: PackUseRow[];
}

/**
 * The purchase as Who has it reads a holder, so the use-by line, the
 * extensions and the Extend rule are E16's own. The holder is the person
 * on this page; only the purchase's fields are read.
 */
function asHolder(p: DetailPack): PackHolder {
    const extensions = p.extensions ?? [];
    return {
        purchaseId: p.id,
        contact: { id: "", name: "" },
        credits: p.credits,
        used: p.used,
        left: p.left,
        standing: p.standing,
        expiresAt: p.expiresAt,
        soldAt: p.boughtAt,
        price: p.price ?? "0",
        currency: p.currency ?? "",
        paidBy: p.paidBy ?? null,
        extendedDays: extensions.reduce((n, e) => n + e.days, 0),
        extensions: extensions.map((e, i) => ({
            id: `${p.id}:${i}`,
            days: e.days,
            reason: e.reason,
            expiresBefore: "",
            expiresAfter: "",
            by: { userId: null, name: null },
            createdAt: e.createdAt,
        })),
    };
}

export function packTabRow(
    p: DetailPack,
    timeZone: string,
    now: Date,
): PackTabRow {
    // The purchase's own price is "the pack's" here: this page doesn't
    // read today's price, so it never calls one older.
    const h = holderRow(
        asHolder(p),
        { price: p.price ?? "0", currency: p.currency ?? "" },
        now,
        timeZone,
    );
    return {
        purchaseId: h.purchaseId,
        name: `${p.pack.name} pack`,
        href: packHref(p.pack.id),
        left: h.left,
        pct: h.pct,
        bar: h.bar,
        when: h.when,
        whenTone: h.whenTone,
        extNote: h.extNote,
        // Prices come with `pack:read`, which this tab needs; an answer
        // without one says the rest.
        bought:
            p.price && p.currency
                ? h.bought
                : [
                      `Bought ${day(p.boughtAt, timeZone)}`,
                      p.paidBy ? paidByLabel(p.paidBy) : null,
                  ]
                      .filter(Boolean)
                      .join(" · "),
        extendBlock: h.extendBlock,
        expiresAt: p.expiresAt,
        unitsWord: unitWord(packKind(p.pack), 2),
        uses: (p.uses ?? []).map((u) => ({
            key: u.bookingId,
            href: `/bookings/${encodeURIComponent(u.bookingId)}`,
            ...useWords(u, timeZone),
            what: u.service.name,
        })),
    };
}

/**
 * Can still use (soonest to end first), and used up or expired (most
 * recently ended first) — Who has it's order.
 */
export function packTabRows(
    packs: readonly DetailPack[],
    timeZone: string,
    now: Date,
): { live: PackTabRow[]; done: PackTabRow[] } {
    const live = packs
        .filter((p) => p.standing === "ACTIVE")
        .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
    const done = packs
        .filter((p) => p.standing !== "ACTIVE")
        .sort((a, b) => b.expiresAt.localeCompare(a.expiresAt));
    return {
        live: live.map((p) => packTabRow(p, timeZone, now)),
        done: done.map((p) => packTabRow(p, timeZone, now)),
    };
}

/** When they have never had a pack. */
export function packsEmptyText(first: string, canSell: boolean): string {
    return canSell
        ? `${first} has no class pack. Sell them one and their classes come off it as they book.`
        : `${first} has no class pack.`;
}

/**
 * What they hold, for the sell dialog's first-pack-only rule and its
 * "Has 4 left" line.
 */
export function heldPacks(
    d: Pick<CustomerDetail, "contact" | "packs">,
    now: Date,
): HeldPack[] {
    return (d.packs?.rows ?? []).map((p) => ({
        contactId: d.contact.id,
        packId: p.pack.id,
        left: p.left,
        standing: packStanding(p, now),
    }));
}

/**
 * The parts to name at the top of the page. Class packs say their own
 * failure, in the Classes left card and the Packs tab, so they aren't
 * named again above them.
 */
export function pageMissing(d: Pick<CustomerDetail, "unavailable">): string[] {
    return d.unavailable
        .filter((u) => u.source !== "packs")
        .map((u) => u.label);
}

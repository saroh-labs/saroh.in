import { invoiceHref, invoicesHref } from "@/lib/invoices/links";

import { money, packKind, unitWord } from "./pack-cards";
import type { PackDetailTab } from "./pack-detail";
import {
    DAY_MS,
    MAX_EXTEND_DAYS,
    RUNNING_OUT_DAYS,
    count,
    day,
    detailHeader,
    each,
    people,
    runningOut,
    totals,
} from "./pack-detail";
import type { PackDetail, PackHolder } from "./pack-detail-data";

/**
 * Pack Detail's Overview in words (round-2 E16): the four figures, the
 * cards for what is linked to the pack, everything about it, and the
 * customer view. Pure. Every figure is the API's (E13).
 */

// — Overview ———————————————————————————————————————————————————————————

export interface Tile {
    k: string;
    v: string;
    sub: string;
}

/**
 * Can be sold now, Sold, Still to use and Running out — the design's four.
 * What ran out unused is said on the Who has it card below.
 */
export function overviewTiles(pack: PackDetail): Tile[] {
    const o = pack.overview;
    const head = detailHeader(pack);
    return [
        {
            k: "Can be sold now",
            v: head.onSale ? "Yes" : "No",
            sub: head.onSale
                ? "At the desk and on the booking page"
                : head.draft
                  ? "Draft"
                  : "Archived",
        },
        {
            k: "Sold",
            v: String(o.sold),
            sub:
                o.sold > 0 && o.takings.length > 0
                    ? `${totals(o.takings)} taken`
                    : "None yet",
        },
        {
            k: "Still to use",
            v: String(o.creditsLeft),
            sub:
                o.holders > 0
                    ? `across ${people(o.holders)}`
                    : "Nobody has any left",
        },
        {
            k: "Running out",
            v: String(o.runningOut),
            sub:
                o.runningOut > 0
                    ? `within ${RUNNING_OUT_DAYS} days`
                    : "Nobody close",
        },
    ];
}

/** A drop-in price the Overview names beside each service it covers. */
export interface DropIn {
    id: string;
    priceCents: number | null;
    currency: string | null;
}

export interface LinkedLine {
    text: string;
    href?: string;
}

export interface LinkedCard {
    key: "covers" | "who" | "receipts" | "booking";
    k: string;
    v: string;
    lines: LinkedLine[];
    /** Where Open goes: a tab here, the customer view, or a page. */
    open: { tab: PackDetailTab } | { lens: "customer" } | { href: string };
}

/** A purchase as the Receipts card reads it. */
export interface ReceiptSource {
    invoiceId: string | null;
    contact: { name: string };
    createdAt: string;
}

/**
 * Each service the pack pays for, with its drop-in price when read:
 * "HIIT · drop-in ₹500". The Overview's card and Used this week's chips.
 */
export function coverLines(
    pack: Pick<PackDetail, "services">,
    dropIns: readonly DropIn[] | null,
): string[] {
    const priceOf = new Map((dropIns ?? []).map((d) => [d.id, d] as const));
    return pack.services.map((s) => {
        const d = priceOf.get(s.id);
        const cents = d?.priceCents;
        const currency = d?.currency;
        return typeof cents === "number" && currency
            ? `${s.name} · drop-in ${money(cents / 100, currency)}`
            : s.name;
    });
}

/**
 * "Linked to this pack": what it covers, who has it, its receipts (only
 * when the page could read them) and how the booking page shows it.
 */
export function linkedCards(
    pack: PackDetail,
    opts: {
        dropIns: readonly DropIn[] | null;
        holders: readonly PackHolder[] | null;
        receipts: readonly ReceiptSource[] | null;
        now: Date;
        timeZone: string;
    },
): LinkedCard[] {
    const kind = packKind(pack);
    const units = unitWord(kind, 2);
    const o = pack.overview;
    const header = detailHeader(pack);
    const covers: LinkedCard = {
        key: "covers",
        k: kind === "ONE_TO_ONE" ? "Sessions it covers" : "Classes it covers",
        v: pack.services.map((s) => s.name).join(", ") || "None chosen yet",
        lines: coverLines(pack, opts.dropIns).map((text) => ({ text })),
        open: { href: "/services" },
    };

    const soon = (opts.holders ?? []).filter((h) => runningOut(h, opts.now));
    const who: LinkedCard = {
        key: "who",
        k: "Who has it",
        v:
            o.holders > 0
                ? `${people(o.holders)} · ${o.creditsLeft} ${unitWord(kind, o.creditsLeft)} to go`
                : "Nobody right now",
        lines: [
            ...soon.map((h) => ({
                text: `${h.contact.name}: ${h.left} run out ${day(h.expiresAt, opts.timeZone)}`,
            })),
            ...(o.lostToExpiry > 0
                ? [
                      {
                          text: `${o.lostToExpiry} ${unitWord(kind, o.lostToExpiry)} ran out unused`,
                      },
                  ]
                : []),
        ],
        open: { tab: "who" },
    };

    const cards: LinkedCard[] = [covers, who];
    if (opts.receipts) {
        const issued = opts.receipts
            .filter((r) => r.invoiceId !== null)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        cards.push({
            key: "receipts",
            k: "Receipts",
            v:
                issued.length > 0
                    ? count(issued.length, "receipt", "receipts")
                    : "None issued",
            lines:
                issued.length > 0
                    ? issued.slice(0, 2).map((r) => ({
                          text: `${r.contact.name} · ${day(r.createdAt, opts.timeZone)}`,
                          href: invoiceHref(r.invoiceId ?? ""),
                      }))
                    : [
                          {
                              text: "A sale makes a receipt while Payments is on.",
                          },
                      ],
            // The Invoices list narrowed to this pack's sales (D18).
            open: { href: invoicesHref({ pack: pack.id }) },
        });
    }
    cards.push({
        key: "booking",
        k: "Booking page",
        v: header.onSale
            ? `Offered when booking a ${unitWord(kind, 1)}`
            : "Hidden",
        lines: [
            {
                text: header.onSale
                    ? pack.firstPackOnly
                        ? "Only to people who haven't bought one"
                        : `To anyone without ${units} left`
                    : header.draft
                      ? "Draft — not on sale"
                      : "Archived",
            },
        ],
        open: { lens: "customer" },
    });
    return cards;
}

export interface AboutRow {
    k: string;
    v: string;
}

/**
 * "Everything about it", in two cards. `freeCancelHours` is the booking
 * rule: null is no deadline; undefined, unread, so its row is left out
 * rather than guessed.
 */
export function aboutRows(
    pack: PackDetail,
    opts: {
        freeCancelHours: number | null | undefined;
        timeZone: string;
        /** Its prices over time (`priceHistory`); null when unread, left out. */
        priceHistory?: string | null;
    },
): AboutRow[][] {
    const kind = packKind(pack);
    const unit = unitWord(kind, 1);
    const price = [money(pack.price, pack.currency), each(pack, kind)]
        .filter(Boolean)
        .join(" · ");
    const first: AboutRow[] = [
        {
            k: "Credits are for",
            v:
                kind === "ONE_TO_ONE"
                    ? "One-to-one sessions only — never classes"
                    : "Classes only — never one-to-one sessions",
        },
        { k: "How many", v: `${pack.credits} ${unitWord(kind, pack.credits)}` },
        { k: "Price", v: price },
        {
            k: "Use within",
            v: `${count(pack.validityDays, "day", "days")} from the sale`,
        },
        {
            k: "Good for",
            v:
                pack.services.map((s) => s.name).join(", ") ||
                "Nothing chosen yet",
        },
    ];
    const second: AboutRow[] = [
        {
            k: "Who can buy it",
            v: pack.firstPackOnly ? "First pack only (intro offer)" : "Anyone",
        },
        { k: "Created", v: day(pack.createdAt, opts.timeZone) },
        ...(opts.priceHistory
            ? [{ k: "Price history", v: opts.priceHistory }]
            : []),
        {
            k: "Unused credits",
            v: `End with the pack; you can extend a use-by by up to ${MAX_EXTEND_DAYS} days`,
        },
    ];
    if (opts.freeCancelHours !== undefined) {
        second.push({
            k: "Cancelling",
            v:
                opts.freeCancelHours === null
                    ? `A ${unit} cancelled before it starts gives the credit back`
                    : `A ${unit} cancelled ${count(opts.freeCancelHours, "hour", "hours")} before or earlier gives the credit back`,
        });
    }
    return [first, second];
}

/** The customer view: how it shows to someone booking with none left. */
export function customerPreview(
    pack: PackDetail,
    now: Date,
    timeZone: string,
): { note: string; line: string; price: string } {
    const kind = packKind(pack);
    const useBy = new Date(now.getTime() + pack.validityDays * DAY_MS);
    return {
        note: `How it shows to a customer booking a ${unitWord(kind, 1)} who has no ${unitWord(kind, 2)} left.`,
        line: [
            `${pack.credits} ${unitWord(kind, pack.credits)}`,
            each(pack, kind),
            `use by ${day(useBy.toISOString(), timeZone)}`,
        ]
            .filter(Boolean)
            .join(" · "),
        price: money(pack.price, pack.currency),
    };
}

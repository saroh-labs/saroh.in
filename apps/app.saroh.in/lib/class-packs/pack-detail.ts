import { DISPLAY_LOCALE } from "@/lib/format/locale";

import { shortDay } from "./balance";
import type { MoneyTotal, PackKind } from "./pack-cards";
import { editHref, money, packKind, unitWord } from "./pack-cards";
import type { PackDetail, PackHolder, PackOverview } from "./pack-detail-data";

/**
 * How Pack Detail says a pack (round-2 E16, after "Saroh Pack Detail"): its
 * tabs, the words every part shares, and the header. The Overview's are in
 * `pack-overview.ts`, Who has it's and Extend's in `pack-holders.ts`. Pure,
 * so the words are tested once and the components only draw them.
 *
 * Every figure is the API's (E13). `pack:read` covers the whole pack, its
 * prices and what it took included (DEC-039), so the money here shows to
 * everyone who can open the page; receipts need `invoice:read` as well,
 * and the page asks for them only then.
 */

export const DAY_MS = 86_400_000;

/** A live pack ending within this many days is "running out" (E13's rule). */
export const RUNNING_OUT_DAYS = 14;

/** The most days one extension adds (E13, default 46). */
export const MAX_EXTEND_DAYS = 30;

/** The Extend dialog's choices, as the design draws them. */
export const EXTEND_CHOICES = [7, 14, 21, 30] as const;

/** Its reason is kept to what the API stores. */
export const EXTEND_REASON_MAX = 200;

export type Tone = "ok" | "accent" | "bad" | "off";

// — Tabs ———————————————————————————————————————————————————————————————

export type PackDetailTab = "overview" | "who" | "used" | "sales" | "activity";

/**
 * The tabs in the design's order. E16 drew Overview and Who has it; E17
 * Used this week, Sales and Activity. A tab stays out of the bar while
 * `built` is false (no control ships before the unit that makes it work).
 */
export const PACK_DETAIL_TABS: readonly {
    key: PackDetailTab;
    label: string;
    built: boolean;
}[] = [
    { key: "overview", label: "Overview", built: true },
    { key: "who", label: "Who has it", built: true },
    { key: "used", label: "Used this week", built: true },
    { key: "sales", label: "Sales", built: true },
    { key: "activity", label: "Activity", built: true },
];

/** The tabs this build draws. */
export const BUILT_TABS: readonly PackDetailTab[] = PACK_DETAIL_TABS.filter(
    (t) => t.built,
).map((t) => t.key);

/** `?tab=who` opens Who has it; anything unknown or unbuilt, Overview. */
export function tabFromQuery(tab: string | undefined): PackDetailTab {
    return BUILT_TABS.find((t) => t === tab) ?? "overview";
}

/**
 * The counts a tab shows that come from its own read: null when that read
 * failed, so a failure never shows as a zero.
 */
export interface TabCounts {
    used: number | null;
    /** Events on the first page; `more` when older ones are still to read. */
    activity: { n: number; more: boolean } | null;
}

/** A tab's count beside its name, or "2 running out" in the accent. */
export function tabMeta(
    tab: PackDetailTab,
    overview: PackOverview,
    counts: TabCounts = { used: null, activity: null },
): { text: string; tone: "off" | "accent" } | null {
    if (tab === "used") {
        return counts.used ? { text: String(counts.used), tone: "off" } : null;
    }
    if (tab === "activity") {
        const a = counts.activity;
        return a && a.n > 0
            ? { text: `${a.n}${a.more ? "+" : ""}`, tone: "off" }
            : null;
    }
    if (tab === "who") {
        if (overview.runningOut > 0) {
            return {
                text: `${overview.runningOut} running out`,
                tone: "accent",
            };
        }
        return overview.holders > 0
            ? { text: String(overview.holders), tone: "off" }
            : null;
    }
    if (tab === "sales") {
        return overview.sold > 0
            ? { text: String(overview.sold), tone: "off" }
            : null;
    }
    return null;
}

// — Words ——————————————————————————————————————————————————————————————

export const count = (n: number, one: string, other: string) =>
    `${n} ${n === 1 ? one : other}`;

export const people = (n: number) => count(n, "person", "people");

export function totals(list: readonly MoneyTotal[]): string {
    return list.map((t) => money(t.amount, t.currency)).join(" + ");
}

/** "Hatha, Vinyasa and Yin". */
export function serviceList(services: readonly { name: string }[]): string {
    const names = services.map((s) => s.name);
    if (names.length <= 1) return names.join("");
    return `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? ""}`;
}

/** "₹150 a class"; null when there is nothing to divide. */
export function each(pack: PackDetail, kind: PackKind): string | null {
    const price = Number(pack.price);
    if (!Number.isFinite(price) || price <= 0 || pack.credits <= 0) {
        return null;
    }
    return `${money(Math.round(price / pack.credits), pack.currency)} a ${unitWord(kind, 1)}`;
}

/** "12 Oct" — a day, in the business's zone. */
export function day(iso: string, timeZone: string): string {
    return shortDay(iso, timeZone).replace("Sept", "Sep");
}

/** "Sat 18 Oct" — a day with its weekday, for a new use-by date. */
export function dayWithWeekday(iso: string, timeZone: string): string {
    return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
        timeZone,
        weekday: "short",
        day: "numeric",
        month: "short",
    })
        .format(new Date(iso))
        .replace(",", "")
        .replace("Sept", "Sep");
}

// — Header —————————————————————————————————————————————————————————————

export interface DetailHeader {
    /** The thumb: "10" over "classes". */
    thumbN: string;
    thumbUnit: string;
    status: { label: string; tone: Tone };
    kindLabel: string;
    firstOnly: boolean;
    /** A live pack holding changes nobody has published (E14). */
    pending: boolean;
    /** "₹1,500 · ₹150 a class · use within 60 days · Hatha, Yin". */
    meta: string;
    onSale: boolean;
    draft: boolean;
    archived: boolean;
    /** The crumb bar's right-hand words. */
    bookingPage: string;
    /** The band under the header for a pack not on sale; null on sale. */
    note: { head: string; body: string } | null;
    /** Edit pack: the editor doesn't open an archived pack. */
    editHref: string | null;
}

export function detailHeader(pack: PackDetail): DetailHeader {
    const kind = packKind(pack);
    const draft = pack.status === "DRAFT";
    const archived = pack.status === "ARCHIVED";
    const onSale = !draft && !archived;
    const units = unitWord(kind, 2);
    const holders = pack.overview.holders;
    const services = pack.services.map((s) => s.name).join(", ");
    const meta = [
        money(pack.price, pack.currency),
        each(pack, kind),
        `use within ${count(pack.validityDays, "day", "days")}`,
        services || null,
    ]
        .filter((x): x is string => Boolean(x))
        .join(" · ");
    return {
        thumbN: String(pack.credits),
        thumbUnit: units,
        status: draft
            ? { label: "Draft", tone: "off" }
            : archived
              ? { label: "Archived", tone: "off" }
              : { label: "On sale", tone: "ok" },
        kindLabel: kind === "ONE_TO_ONE" ? "One-to-one" : "Classes",
        firstOnly: Boolean(pack.firstPackOnly),
        pending: onSale && Boolean(pack.hasPendingChanges),
        meta,
        onSale,
        draft,
        archived,
        bookingPage: onSale ? "On the booking page" : "Not on the booking page",
        note: draft
            ? {
                  head: "Draft.",
                  body: "Not on the booking page and can't be sold. Publish it from the editor.",
              }
            : archived
              ? {
                    head: "Archived.",
                    body:
                        holders > 0
                            ? `Nobody new can buy it. ${holders} ${holders === 1 ? "person keeps" : "people keep"} their ${units} until their dates.`
                            : "Nobody new can buy it. Its sales and history stay here.",
                }
              : null,
        editHref: archived ? null : editHref(pack.id),
    };
}

/** Archived, or back on sale: the toast Undo sits beside. */
export function archiveToast(pack: PackDetail, archived: boolean): string {
    if (!archived) return `${pack.name} is on sale again.`;
    const n = pack.overview.holders;
    const units = unitWord(packKind(pack), 2);
    return n > 0
        ? `${pack.name} archived. ${n} ${n === 1 ? "person keeps" : "people keep"} their ${units}.`
        : `${pack.name} archived. Nobody new can buy it.`;
}

/** A live purchase ending within {@link RUNNING_OUT_DAYS} days. */
export function runningOut(h: PackHolder, now: Date): boolean {
    const end = new Date(h.expiresAt).getTime();
    return (
        h.standing === "ACTIVE" &&
        end > now.getTime() &&
        end <= now.getTime() + RUNNING_OUT_DAYS * DAY_MS
    );
}

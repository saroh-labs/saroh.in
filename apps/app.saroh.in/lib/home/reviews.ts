import { localDateKey } from "@/lib/format/datetime";

import type { HomeReviewSite } from "./service";

/**
 * A Reviewer's Home (round 2, F9), in words: "Sent to you for review", one
 * row per page of a site waiting on them — "Home page · From Priya Raman ·
 * sent yesterday · 2 notes open" — and a row per granted site nobody has
 * sent yet, so the site is still one click away. Pure, so it is tested
 * without a page.
 */

export interface ReviewRow {
    key: string;
    title: string;
    sub: string;
    /** Null for the "nothing sent" row, which goes nowhere. */
    href: string | null;
}

/** The published sites, for "See the live site". */
export interface LiveSite {
    id: string;
    name: string;
    url: string;
}

const MS_PER_DAY = 86_400_000;

/** "2 notes open"; nothing when none are. */
export function notesOpen(n: number): string | null {
    if (n <= 0) return null;
    return n === 1 ? "1 note open" : `${n} notes open`;
}

/**
 * When a review was asked for, as the design says it: "sent this
 * morning", "sent yesterday", "sent 22 Sep" — in the business's zone.
 */
export function sentWhen(iso: string, zone: string, now: Date): string {
    const key = localDateKey(iso, zone);
    if (key === localDateKey(now, zone)) {
        const hour = Number(
            new Intl.DateTimeFormat("en-GB", {
                timeZone: zone,
                hour: "2-digit",
                hour12: false,
            }).format(new Date(iso)),
        );
        // The greeting's parts of the day (`home-last-day.ts`).
        const part =
            hour >= 5 && hour < 12
                ? "this morning"
                : hour >= 12 && hour < 17
                  ? "this afternoon"
                  : "this evening";
        return `sent ${part}`;
    }
    if (key === localDateKey(new Date(now.getTime() - MS_PER_DAY), zone)) {
        return "sent yesterday";
    }
    const day = new Intl.DateTimeFormat("en-GB", {
        timeZone: zone,
        day: "numeric",
        month: "short",
    })
        .format(new Date(iso))
        // ICU writes "Sept"; the designs write three letters every month.
        .replace("Sept", "Sep");
    return `sent ${day}`;
}

const join = (parts: (string | null)[]) =>
    parts.filter((p): p is string => Boolean(p)).join(" · ");

/**
 * The rows, sites waiting on the reviewer first. A site's name goes in
 * front of each line only when there is more than one site to tell apart.
 */
export function reviewRows(
    sites: readonly HomeReviewSite[],
    { zone, now }: { zone: string; now: Date },
): ReviewRow[] {
    if (sites.length === 0) {
        return [
            {
                key: "none",
                title: "Nothing sent to you right now",
                sub: "Pages show up here when someone shares them for review.",
                href: null,
            },
        ];
    }
    const several = sites.length > 1;
    const waiting = sites.filter((s) => s.requestedAt !== null);
    const rest = sites.filter((s) => s.requestedAt === null);
    const rows: ReviewRow[] = [];

    for (const site of waiting) {
        const from = site.requestedBy ? `From ${site.requestedBy}` : null;
        const sent = site.requestedAt
            ? sentWhen(site.requestedAt, zone, now)
            : null;
        for (const page of site.pages) {
            rows.push({
                key: `${site.id}:${page.id}`,
                title: page.title,
                sub: join([
                    several ? site.name : null,
                    from,
                    sent,
                    notesOpen(page.openNotes),
                ]),
                href: page.href,
            });
        }
        // A site with no pages yet is still what they were sent.
        if (site.pages.length === 0) {
            rows.push({
                key: site.id,
                title: site.name,
                sub: join([from, sent, notesOpen(site.openNotes)]),
                href: site.href,
            });
        }
        const more = site.pageCount - site.pages.length;
        if (more > 0) {
            rows.push({
                key: `${site.id}:more`,
                title: `${more} more page${more === 1 ? "" : "s"}`,
                sub: site.name,
                href: site.href,
            });
        }
    }

    for (const site of rest) {
        rows.push({
            key: site.id,
            title: site.name,
            sub: join(["Nothing sent right now", notesOpen(site.openNotes)]),
            href: site.href,
        });
    }
    return rows;
}

/** Each published site with an address, for "See the live site". */
export function liveSites(
    sites: readonly HomeReviewSite[],
    rootDomain: string,
): LiveSite[] {
    return sites
        .filter((s) => s.live && s.subdomain)
        .map((s) => ({
            id: s.id,
            name: s.name,
            url: `https://${s.subdomain}.${rootDomain}`,
        }));
}

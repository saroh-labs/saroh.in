import { prisma } from "@saroh/database";

import { moneyWordsMinor } from "../../common/words-format";
import type { Flag, FlagPageInput } from "./site-flags";

/**
 * Check before publish (plan 2026-11-18-001 U10, RULES §6): a price typed
 * on the site that isn't the one in Services, a "free" next to a service
 * that has a price, and a photo with no description. Broken links are
 * `checkSite`'s `brokenLink`, the rule Pages' "To fix" reads too
 * (`page-health.ts`).
 *
 * Advice only, like every flag but `addressMissing`: none sets `blocking`.
 * Pure, except `publishCheckFlags`, which loads what the checks read.
 */

/** A service as the checks need it. */
export interface CheckService {
    id: string;
    name: string;
    priceCents: number | null;
    currency: string | null;
}

/**
 * Blocks that read the business live ("From your business", the app's
 * `BOUND_BLOCKS`): their prices come from Services when the page is
 * viewed, so they can't disagree with it.
 */
const FROM_YOUR_BUSINESS = new Set([
    "servicesList",
    "visitUs",
    "journal",
    "plans",
    "packs",
    "productGrid",
    "booking",
    "timetable",
    "hours",
]);

/** Keys that are not words a visitor reads. */
const NOT_WORDS = new Set([
    "src",
    "alt",
    "href",
    "link",
    "imageBrief",
    "id",
    "key",
    "serviceId",
    "productId",
    "pageId",
    "variant",
    "layout",
    "padding",
]);

/**
 * The last word of a service's name that people say alone: "free trial"
 * names "Trial session", "first class free" names "Yoga class".
 */
const HEAD_WORDS = new Set([
    "appointment",
    "call",
    "chat",
    "class",
    "consult",
    "consultation",
    "lesson",
    "package",
    "session",
    "trial",
    "visit",
]);

/** "₹2,500", "Rs. 2500", "INR 2,500.50", "$40". */
const AMOUNT = String.raw`(?:₹|\brs\.?|\binr|\$|£|€)\s?(\d[\d,]*)(?:\.(\d{1,2}))?`;
const WORD = String.raw`[\p{L}\p{N}][\p{L}\p{N}'’-]*`;
const TOKEN = new RegExp(`${AMOUNT}|(${WORD})`, "giu");

/** How many words apart a price or "free" may sit from the name it is about. */
const NEAR = 6;
const FREE_NEAR = 3;

type Token = { word: string } | { minor: number };

function tokens(sentence: string): Token[] {
    return [...sentence.matchAll(TOKEN)].map((m) => {
        // A group that didn't take part is undefined at run time.
        const [, whole, cents, word] = m as unknown as (string | undefined)[];
        return word !== undefined
            ? { word: word.toLowerCase() }
            : {
                  minor:
                      Number((whole ?? "0").replace(/,/g, "")) * 100 +
                      Number((cents ?? "0").padEnd(2, "0")),
              };
    });
}

function wordsOf(text: string): string[] {
    return tokens(text).flatMap((t) => ("word" in t ? [t.word] : []));
}

/** Where `name` (as words) starts in `toks`, every place it does. */
function spans(toks: Token[], name: string[]): [number, number][] {
    const out: [number, number][] = [];
    if (name.length === 0) return out;
    for (let i = 0; i + name.length <= toks.length; i++) {
        if (
            name.every((w, j) => {
                const t = toks[i + j];
                return "word" in t && t.word === w;
            })
        ) {
            out.push([i, i + name.length - 1]);
        }
    }
    return out;
}

function distance(at: number, [from, to]: [number, number]): number {
    return at < from ? from - at : at > to ? at - to : 0;
}

/** The ways a sentence can name a service: its name, and its head word. */
function aliasesOf(name: string): string[][] {
    const words = wordsOf(name);
    const out = [words];
    const head = words[words.length - 1];
    if (words.length > 1 && HEAD_WORDS.has(head)) {
        out.push(words.slice(0, -1), [head]);
    }
    return out.filter((a) => a.join(" ").length >= 3);
}

/** Strip tags so a rich-text field reads as its words. */
function textOf(value: string): string {
    return value.includes("<") ? value.replace(/<[^>]*>/g, " ") : value;
}

/** Sentences, without splitting "Rs. 2,500". */
function sentencesOf(text: string): string[] {
    return text.split(/(?<=[.!?])\s+(?=[A-Z])|\n+/);
}

interface Spot {
    /** The section's own field it sits in, for the editor's marker. */
    field: string;
    text: string;
    /** A Lookbook photo linked to a service names it by id. */
    serviceId?: string;
}

/** Each object's own words, joined: a card's title beside its price. */
function spotsOf(value: unknown, field: string | null, out: Spot[]): Spot[] {
    if (Array.isArray(value)) {
        value.forEach((v) => spotsOf(v, field, out));
        return out;
    }
    if (typeof value === "string") {
        if (field) out.push({ field, text: textOf(value) });
        return out;
    }
    if (typeof value !== "object" || value === null) return out;
    const own: string[] = [];
    for (const [key, v] of Object.entries(value)) {
        if (NOT_WORDS.has(key)) continue;
        if (typeof v === "string") own.push(textOf(v));
        else spotsOf(v, field ?? key, out);
    }
    if (own.length > 0) {
        const link = (value as { link?: unknown }).link;
        const serviceId =
            typeof link === "object" &&
            link !== null &&
            (link as { kind?: unknown }).kind === "service"
                ? String((link as { serviceId?: unknown }).serviceId)
                : undefined;
        // A top-level string field is its own spot, so the marker names it.
        if (field === null) {
            for (const [key, v] of Object.entries(value)) {
                if (!NOT_WORDS.has(key) && typeof v === "string") {
                    out.push({ field: key, text: textOf(v) });
                }
            }
        } else {
            out.push({ field, text: own.join(" · "), serviceId });
        }
    }
    return out;
}

function priced(s: CheckService): s is CheckService & { priceCents: number } {
    return s.priceCents !== null && s.priceCents > 0;
}

function price(s: CheckService & { priceCents: number }): string {
    return moneyWordsMinor(s.priceCents, s.currency ?? "INR");
}

/** Price and "free" flags on one section's words. */
export function checkSectionPrices(
    content: unknown,
    services: readonly CheckService[],
    /** `prices: false` for a block whose prices are read from Services. */
    opts: { prices: boolean } = { prices: true },
): { type: "priceMismatch" | "freeClaim"; field: string; message: string }[] {
    const named = services.map((s) => ({
        service: s,
        full: wordsOf(s.name),
        aliases: aliasesOf(s.name),
    }));
    const out: {
        type: "priceMismatch" | "freeClaim";
        field: string;
        message: string;
    }[] = [];
    const said = new Set<string>();
    const push = (
        type: "priceMismatch" | "freeClaim",
        field: string,
        s: CheckService,
        message: string,
    ) => {
        const key = `${type}:${s.id}`;
        if (said.has(key)) return;
        said.add(key);
        out.push({ type, field, message });
    };

    for (const spot of spotsOf(content, null, [])) {
        for (const sentence of sentencesOf(spot.text)) {
            const toks = tokens(sentence);
            const amounts = toks.flatMap((t, i) =>
                "minor" in t ? [{ at: i, minor: t.minor }] : [],
            );

            // A typed price beside a service's full name (or its linked id).
            if (opts.prices && amounts.length > 0) {
                const linked = spot.serviceId
                    ? services.find((s) => s.id === spot.serviceId)
                    : undefined;
                const hits = linked
                    ? [{ service: linked, near: amounts }]
                    : named
                          .map((n) => ({
                              service: n.service,
                              near: amounts.filter((a) =>
                                  spans(toks, n.full).some(
                                      (span) => distance(a.at, span) <= NEAR,
                                  ),
                              ),
                          }))
                          .filter((h) => h.near.length > 0);
                // shortcut: two services in one sentence can't say whose
                // price is whose, so it is left alone; a parser of "A ₹x, B ₹y"
                // would be the upgrade if merchants write it that way.
                const hit = hits.length === 1 ? hits[0] : null;
                if (hit && priced(hit.service)) {
                    const s = hit.service;
                    if (!hit.near.some((a) => a.minor === s.priceCents)) {
                        const typed = moneyWordsMinor(
                            hit.near[0].minor,
                            s.currency ?? "INR",
                        );
                        push(
                            "priceMismatch",
                            spot.field,
                            s,
                            `This says ${typed} for ${s.name}, but Services has ${price(s)}, which is what people pay.`,
                        );
                    }
                }
            }

            // "free" right next to a name: a claim only if every service it
            // could mean has a price.
            const frees = toks.flatMap((t, i) =>
                "word" in t && t.word === "free" ? [i] : [],
            );
            if (frees.length === 0) continue;
            const meant = named
                .filter((n) =>
                    n.aliases.some((alias) =>
                        spans(toks, alias).some((span) =>
                            frees.some((f) => distance(f, span) <= FREE_NEAR),
                        ),
                    ),
                )
                .map((n) => n.service);
            if (meant.length > 0 && meant.every(priced)) {
                const s = meant[0];
                if (priced(s)) {
                    push(
                        "freeClaim",
                        spot.field,
                        s,
                        `This says free, but ${s.name} costs ${price(s)} in Services.`,
                    );
                }
            }
        }
    }
    return out;
}

/** Every photo in a section with no description, by its path ("images.2"). */
export function photosWithoutDescription(
    value: unknown,
    path: string[] = [],
    out: { path: string; src: string }[] = [],
): { path: string; src: string }[] {
    if (Array.isArray(value)) {
        value.forEach((v, i) =>
            photosWithoutDescription(v, [...path, String(i)], out),
        );
    } else if (typeof value === "object" && value !== null) {
        const o = value as Record<string, unknown>;
        if (typeof o.src === "string" && o.src.trim() !== "") {
            if (typeof o.alt !== "string" || o.alt.trim() === "") {
                out.push({ path: path.join("."), src: o.src });
            }
            return out;
        }
        for (const [key, v] of Object.entries(o)) {
            photosWithoutDescription(v, [...path, key], out);
        }
    }
    return out;
}

export const PHOTO_NO_DESCRIPTION_MESSAGE =
    "This photo has no description, so Google and people using a screen reader can't tell what it shows.";

/**
 * The checks on every visible page's visible sections, in page order.
 * `field` is the section's field; for a photo, the path to it, which
 * "Describe it" writes `alt` under.
 */
export function checkBeforePublish(
    pages: readonly FlagPageInput[],
    services: readonly CheckService[],
): Flag[] {
    const flags: Flag[] = [];
    for (const page of pages) {
        if (page.hidden) continue;
        page.sections.forEach((section, index) => {
            if (section.hidden) return;
            // A block's own words can still say "free"; only its prices
            // are read from Services.
            for (const f of checkSectionPrices(section.content, services, {
                prices: !FROM_YOUR_BUSINESS.has(section.type),
            })) {
                flags.push({
                    type: f.type,
                    message: f.message,
                    pageId: page.id,
                    sectionIndex: index,
                    field: f.field,
                });
            }
            for (const photo of photosWithoutDescription(section.content)) {
                flags.push({
                    type: "photoNoDescription",
                    message: PHOTO_NO_DESCRIPTION_MESSAGE,
                    pageId: page.id,
                    sectionIndex: index,
                    field: photo.path,
                    photoSrc: photo.src,
                });
            }
        });
    }
    return flags;
}

/**
 * Loads the site's draft pages and the business's services, and runs the
 * checks. The caller has already checked the site is this business's and
 * may be read (`getSiteFlags`).
 */
export async function publishCheckFlags(
    organizationId: string,
    siteId: string,
): Promise<Flag[]> {
    const [pages, services] = await Promise.all([
        prisma.page.findMany({
            where: { siteId, site: { organizationId } },
            select: {
                id: true,
                path: true,
                title: true,
                hidden: true,
                versions: {
                    where: { status: "DRAFT" },
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: {
                        sections: {
                            orderBy: { order: "asc" },
                            select: { type: true, content: true, hidden: true },
                        },
                    },
                },
            },
        }),
        prisma.service.findMany({
            where: { organizationId, deletedAt: null, status: "ACTIVE" },
            select: { id: true, name: true, priceCents: true, currency: true },
        }),
    ]);
    return checkBeforePublish(
        pages.map((p) => ({
            id: p.id,
            path: p.path,
            title: p.title,
            hidden: p.hidden,
            sections: p.versions.flatMap((v) => v.sections),
        })),
        services,
    );
}

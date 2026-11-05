import { COMBOS, COUNTRIES, TRADES } from "@/content/templates";
import type {
    CountryFact,
    CountrySlug,
    DocumentSlug,
    TradeSlug,
} from "@/content/templates/types";
import type { DocumentView } from "@/lib/tools/document";
import { canDrawPdf } from "@/lib/tools/pdf";

import type { TemplatePage } from "./pages";
import { downloads, pageText, templatePages, templateView } from "./pages";

export const MIN_ITEMS = 6;
export const TIPS = 3;
export const MIN_FAQS = 3;
export const MAX_FAQS = 5;
export const MIN_UNIQUE_WORDS = 250;
export const MAX_SAME = 0.5;
const SHINGLE = 4;
const RECHECK_DAYS = 183;

/** What the gate reads of a page, so a test can hand it made-up ones. */
export interface GatePage {
    path: string;
    document: string;
    trade?: string;
    country?: string;
    reviewed: boolean;
    itemCount: number;
    rates: string[];
    tipCount: number;
    faqs: readonly { question: string; answer: string }[];
    facts: readonly CountryFact[];
    text: string;
    view: DocumentView | null;
    files: readonly string[];
}

export const gatePageOf = (p: TemplatePage): GatePage => {
    const files = downloads(p);
    return {
        path: p.path,
        document: p.document.slug,
        trade: p.trade?.slug,
        country: p.country?.slug,
        reviewed: p.reviewed,
        itemCount: p.items.length,
        rates: p.items.map((i) => i.rate),
        tipCount: p.tips.length,
        faqs: p.faqs,
        facts: p.facts,
        text: pageText(p),
        view: templateView(p),
        files: [files.pdf, files.word, files.sheets],
    };
};

const wordsOf = (text: string) =>
    text
        .toLowerCase()
        .replace(/[^a-z0-9$£€%.' -]+/g, " ")
        .replace(/[.,'-]+(\s|$)/g, " ")
        .split(/\s+/)
        .filter(Boolean);

const shinglesOf = (words: string[]) => {
    const out = new Set<string>();
    for (let i = 0; i + SHINGLE <= words.length; i++) {
        out.add(words.slice(i, i + SHINGLE).join(" "));
    }
    return out;
};

/** Words in a four-word run that no other page has. Common phrases don't count. */
export function uniqueWords(text: string, others: readonly string[]): number {
    const taken = new Set<string>();
    for (const o of others)
        for (const s of shinglesOf(wordsOf(o))) taken.add(s);
    const words = wordsOf(text);
    const unique = new Set<number>();
    for (let i = 0; i + SHINGLE <= words.length; i++) {
        if (taken.has(words.slice(i, i + SHINGLE).join(" "))) continue;
        for (let j = i; j < i + SHINGLE; j++) unique.add(j);
    }
    return unique.size;
}

/** How much of `a`'s text is also in `b`, 0 to 1. */
export function sameShare(a: string, b: string): number {
    const mine = shinglesOf(wordsOf(a));
    if (!mine.size) return 0;
    const theirs = shinglesOf(wordsOf(b));
    let same = 0;
    for (const s of mine) if (theirs.has(s)) same++;
    return same / mine.size;
}

const siblings = (a: GatePage, b: GatePage) =>
    a !== b &&
    (a.document === b.document ||
        (a.trade !== undefined && a.trade === b.trade) ||
        (a.country !== undefined && a.country === b.country) ||
        (!a.trade && !a.country && !b.trade && !b.country));

const norm = (s: string) => wordsOf(s).join(" ");

const isSourced = (
    f: CountryFact,
): f is Extract<CountryFact, { source: unknown }> => "source" in f;

/** What's wrong with one page, as sentences a writer can act on. */
export function auditPage(
    p: GatePage,
    all: readonly GatePage[],
    fileExists: (publicPath: string) => boolean,
): string[] {
    const problems: string[] = [];
    if (p.itemCount < MIN_ITEMS) {
        problems.push(`${p.itemCount} line items, needs ${MIN_ITEMS}+`);
    }
    if (p.tipCount !== TIPS) {
        problems.push(`${p.tipCount} tips, needs ${TIPS}`);
    }
    if (p.faqs.length < MIN_FAQS || p.faqs.length > MAX_FAQS) {
        problems.push(
            `${p.faqs.length} FAQs, needs ${MIN_FAQS} to ${MAX_FAQS}`,
        );
    }
    if (!p.view?.rows.length) problems.push("no preview to draw");
    if (p.view && !canDrawPdf(p.view)) {
        problems.push("has characters the PDF font can't draw");
    }
    for (const file of p.files) {
        if (!fileExists(file)) problems.push(`download missing: ${file}`);
    }
    for (const rate of p.rates) {
        if (!Number.isInteger(Number(rate) * 2)) {
            problems.push(`amount ${rate} isn't round: use a placeholder`);
        }
    }
    if (/usually charges?|typical rate|average (price|rate)/i.test(p.text)) {
        problems.push('claims what a trade charges ("usually charges")');
    }
    if (p.text.includes("—")) problems.push("has an em dash");

    const others = all.filter((o) => o !== p);
    const unique = uniqueWords(
        p.text,
        others.map((o) => o.text),
    );
    if (unique < MIN_UNIQUE_WORDS) {
        problems.push(`${unique} words of its own, needs ${MIN_UNIQUE_WORDS}+`);
    }

    for (const s of others.filter((o) => siblings(p, o))) {
        const share = sameShare(p.text, s.text);
        if (share > MAX_SAME) {
            problems.push(
                `${Math.round(share * 100)}% the same as ${s.path}, the limit is ${MAX_SAME * 100}%`,
            );
        }
        for (const f of p.faqs) {
            for (const g of s.faqs) {
                if (norm(f.question) === norm(g.question)) {
                    problems.push(
                        `FAQ question also on ${s.path}: "${f.question}"`,
                    );
                }
                if (
                    norm(f.answer) === norm(g.answer) ||
                    sameShare(f.answer, g.answer) > MAX_SAME
                ) {
                    problems.push(
                        `FAQ answer repeats on ${s.path}: "${f.question}"`,
                    );
                }
            }
        }
    }

    for (const f of p.facts) problems.push(...factProblems(f));
    return problems;
}

export function factProblems(f: CountryFact): string[] {
    if (!isSourced(f)) return [];
    const out: string[] = [];
    if (!f.source.url.startsWith("https://")) {
        out.push(`fact "${f.label}" has no source link`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.checkedOn)) {
        out.push(`fact "${f.label}" has no checked-on date`);
    }
    return out;
}

/** Past the 6-month recheck: said out loud, but a date passing mustn't fail a build. */
export function staleFacts(
    facts: readonly CountryFact[],
    today: string,
): string[] {
    return facts
        .filter(isSourced)
        .filter(
            (f) =>
                (Date.parse(today) - Date.parse(f.checkedOn)) / 86_400_000 >
                RECHECK_DAYS,
        )
        .map((f) => f.label);
}

/** A reviewed hub must have data, and a country's every sourced fact a link and a date. */
export function auditHubs(): {
    path: string;
    problems: string[];
    reviewed: boolean;
}[] {
    return [
        ...TRADES.map((t) => ({
            path: `/templates/for/${t.slug}`,
            reviewed: Boolean(t.data?.reviewed),
            problems: t.data ? [] : ["no data file yet: names only"],
        })),
        ...COUNTRIES.map((c) => ({
            path: `/templates/in/${c.slug}`,
            reviewed: Boolean(c.data?.reviewed),
            problems: c.data
                ? c.data.facts.flatMap(factProblems)
                : ["no data file yet: names only"],
        })),
    ];
}

const WAVE_1_DOCS: DocumentSlug[] = ["invoice", "estimate", "quote", "receipt"];
const WAVE_2_COUNTRY_DOCS: DocumentSlug[] = [
    "invoice",
    "quote",
    "estimate",
    "receipt",
    "credit-note",
];
const WAVE_2_TRADE_DOCS: DocumentSlug[] = ["proforma-invoice", "price-list"];
const WAVE_2_TRADES: TradeSlug[] = [
    "contractor",
    "event-planner",
    "salon",
    "personal-trainer",
    "tutor",
    "makeup-artist",
];

/** The Programmatic board's waves, as file names: what isn't written yet. */
export function plannedCombos(): string[] {
    const has = new Set(
        COMBOS.map((c) => `${c.document}-${c.trade ?? c.country}`),
    );
    const trades = TRADES.map((t) => t.slug);
    const countries: CountrySlug[] = COUNTRIES.map((c) => c.slug);
    return [
        ...WAVE_1_DOCS.flatMap((d) => trades.map((t) => `${d}-${t}`)),
        ...WAVE_2_TRADE_DOCS.flatMap((d) =>
            WAVE_2_TRADES.map((t) => `${d}-${t}`),
        ),
        ...WAVE_2_COUNTRY_DOCS.flatMap((d) =>
            countries.map((c) => `${d}-${c}`),
        ),
    ].filter((name) => !has.has(name));
}

export function auditAll(fileExists: (publicPath: string) => boolean) {
    const pages = templatePages.map(gatePageOf);
    return pages.map((p) => ({
        path: p.path,
        reviewed: p.reviewed,
        problems: auditPage(p, pages, fileExists),
    }));
}

/** A reviewed page must pass; an unreviewed one only with `--strict`. */
export const blocking = (
    results: readonly { reviewed: boolean; problems: readonly string[] }[],
    strict: boolean,
) => results.filter((r) => r.problems.length && (r.reviewed || strict));

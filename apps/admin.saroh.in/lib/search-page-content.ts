import type { SearchPageData } from "@saroh/search-pages";
import { PRESETS, smallKeys, starterWords } from "@saroh/search-pages";

/**
 * A search page's words, built from its data for the Overview's "What's on
 * the page" and the Content tab's "Words only". Read on the server only (the
 * package's index draws pages to check them).
 */

export interface WordItem {
    k: string;
    v: string;
    sub?: string;
    /** How the words read on the page: a heading, a title, a quote, plain. */
    look?: "headline" | "title" | "quote";
}

export interface WordBlock {
    label: string;
    items: WordItem[];
}

const START = "Start free · No card needed to start.";

/** Every word on the page, top to bottom, grouped as the page is. */
export function wordBlocks(p: SearchPageData): WordBlock[] {
    const s = p.scene;
    const pre = PRESETS[p.shape];
    const starter = starterWords(p);
    // A key the scene lacks is a failed check, not a crash here.
    const known: Partial<typeof s.tiles> = s.tiles;
    const tile = (k: string) => known[k];
    const tiles = [pre.big, ...smallKeys(p)].flatMap((k) => {
        const t = tile(k);
        if (!t) return [];
        return [
            {
                k: t.title,
                v: t.line,
                sub:
                    t.phoneLine !== t.line
                        ? `On a phone: ${t.phoneLine}`
                        : undefined,
            },
        ];
    });
    return [
        {
            label: "Top of the page",
            items: [
                { k: "Headline", v: p.h1, look: "headline" },
                { k: "Under it (desk)", v: p.lead },
                ...(p.phoneLead
                    ? [{ k: "Under it (phone)", v: p.phoneLead }]
                    : []),
                { k: "Button", v: START, look: "title" },
                ...(p.demo ? [{ k: "Demo link", v: `${p.demo} →` }] : []),
            ],
        },
        {
            label: `The big picture: ${s.business}`,
            items: [
                { k: "Shows", v: `${s.hero.title} · ${s.hero.count}` },
                ...s.hero.rows.map((r) => ({
                    k: r.time,
                    v: `${r.name} · ${r.right}`,
                })),
                { k: "Alt text", v: s.heroAlt },
            ],
        },
        {
            label: p.problemsTitle,
            items: tiles.map((t) => ({ ...t, look: "title" as const })),
        },
        {
            label: "The quote",
            items: [
                { k: "Quote", v: `“${s.quote.text}”`, look: "quote" },
                { k: "Under it", v: s.quote.caption },
            ],
        },
        {
            label: "Also in Saroh",
            items: s.also.map((a) => ({ k: a.title, v: a.line })),
        },
        {
            label: starter.title,
            items: [
                { k: "Line", v: starter.line },
                ...p.services.map((x) => ({ k: x.name, v: x.detail })),
            ],
        },
        {
            label: "Questions",
            items: p.questions.map((q, i) => ({
                k: `Q${i + 1}`,
                v: q.question,
                sub: q.answer.join(" "),
                look: "title" as const,
            })),
        },
        {
            label: `Also for ${p.plural}`,
            items: [
                {
                    k: "Related pages",
                    v: p.related.map((r) => r.name).join(", "),
                },
            ],
        },
        {
            label: "Bottom of the page",
            items: [
                { k: "Closing line", v: p.ctaTitle, look: "headline" },
                { k: "Under it (desk)", v: pre.close },
                { k: "Button", v: START, look: "title" },
            ],
        },
    ];
}

/** The Overview's six facts about what the page holds. */
export function pageSections(p: SearchPageData): { k: string; v: string }[] {
    const s = p.scene;
    const known: Partial<typeof s.tiles> = s.tiles;
    const titles = smallKeys(p).flatMap((k) => {
        const t = known[k];
        return t ? [t.title] : [];
    });
    const first = p.questions[0]?.question;
    return [
        { k: "Headline", v: p.h1 },
        { k: "Big picture", v: `${s.business}: ${s.hero.title}` },
        {
            k: `${titles.length} smaller jobs`,
            v: titles.join(", "),
        },
        {
            k: "Questions answered",
            v: `${p.questions.length}${first ? `, starting with “${first}”` : ""}`,
        },
        { k: "Also in Saroh", v: s.also.map((a) => a.title).join(", ") },
        { k: "Related pages", v: p.related.map((r) => r.name).join(", ") },
    ];
}

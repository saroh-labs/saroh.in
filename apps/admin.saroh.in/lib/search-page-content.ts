import type { SearchPageData, ToolPageData } from "@saroh/search-pages";
import { PRESETS, smallKeys, starterWords } from "@saroh/search-pages";
import type { Block, DocPage } from "@saroh/search-pages/docs";
import { gstCardName } from "@saroh/search-pages/docs";
import { DOC_KINDS } from "@saroh/search-pages/kinds";

import { formatDate } from "./format";

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

/** A free tool's words (#1253), top to bottom; the tool's own words are its component's. */
export function toolWordBlocks(p: ToolPageData): WordBlock[] {
    const blocks: WordBlock[] = [
        {
            label: "Top of the page",
            items: [
                { k: "Breadcrumb", v: `Free tools › ${p.name}` },
                { k: "Headline", v: p.h1, look: "headline" },
                { k: "Under it (desk)", v: p.lead },
                ...(p.phoneLead
                    ? [{ k: "Under it (phone)", v: p.phoneLead }]
                    : []),
            ],
        },
        {
            label: "On the /tools list and in the menus",
            items: [
                { k: "Name", v: p.name, look: "title" },
                { k: "Line", v: p.line },
                { k: "Section", v: p.group },
            ],
        },
    ];
    if (p.how?.length) {
        blocks.push({
            label: p.howTitle,
            items: p.how.map((v, i) => ({ k: `${i + 1}`, v })),
        });
    }
    if (p.questions.length) {
        blocks.push({
            label: "Questions",
            items: p.questions.map((q, i) => ({
                k: `Q${i + 1}`,
                v: q.question,
                sub: q.answer.join(" "),
                look: "title" as const,
            })),
        });
    }
    if (p.ctaTitle) {
        blocks.push({
            label: "Bottom of the page",
            items: [
                { k: "Closing line", v: p.ctaTitle, look: "headline" },
                ...(p.ctaLine ? [{ k: "Under it", v: p.ctaLine }] : []),
                { k: "Button", v: "Start free", look: "title" as const },
            ],
        });
    }
    return blocks;
}

/** The Overview's facts about what a tool page holds. */
export function toolSections(p: ToolPageData): { k: string; v: string }[] {
    const first = p.questions[0]?.question;
    return [
        { k: "Headline", v: p.h1 },
        { k: "On the /tools list", v: `${p.group}: ${p.line}` },
        ...(p.how?.length ? [{ k: p.howTitle, v: p.how.join(" · ") }] : []),
        {
            k: "Questions answered",
            v: `${p.questions.length}${first ? `, starting with “${first}”` : ""}`,
        },
        ...(p.ctaTitle ? [{ k: "Closing line", v: p.ctaTitle }] : []),
    ];
}

/** A parsed body's words: each H2 a title, then its text, a block a line. */
function bodyItems(blocks: readonly Block[]): WordItem[] {
    const run = (xs: readonly { text: string }[]) =>
        xs.map((x) => x.text).join("");
    return blocks.flatMap((b): WordItem[] => {
        switch (b.type) {
            case "h2":
                return [{ k: "Heading", v: b.text, look: "title" }];
            case "p":
                return [{ k: "Text", v: run(b.inline) }];
            case "callout":
                return [{ k: "In Saroh", v: run(b.inline) }];
            case "ul":
            case "ol":
                return b.items.map((it) => ({ k: "•", v: run(it) }));
            case "table":
                return b.rows.map((r) => ({
                    k: "Table row",
                    v: r.map(run).join(" · "),
                }));
            case "image":
                return [{ k: "Picture", v: b.alt }];
        }
    });
}

/** A GST page's, guide's or download's words, top to bottom, as its template draws them. */
export function docWordBlocks(p: DocPage): WordBlock[] {
    const hub = DOC_KINDS.find((k) => k.id === p.kind)?.hubLabel ?? "";
    const top: WordItem[] = [
        { k: "Breadcrumb", v: `Home › ${hub} › ${p.name}` },
        { k: "Headline", v: p.h1, look: "headline" },
    ];
    const blocks: WordBlock[] = [{ label: "Top of the page", items: top }];
    if (p.kind === "gst") {
        top.push(
            { k: "In short", v: p.answer.map((x) => x.text).join("") },
            {
                k: "Checked on",
                v: `${formatDate(p.checkedOn)} against ${p.sources[0]?.label ?? ""}`,
            },
        );
        blocks.push(
            {
                label: "The facts",
                items: p.facts.map((f) => ({
                    k: f.label,
                    v: f.value,
                    sub: f.note,
                })),
            },
            {
                label: p.table.title,
                items: [
                    { k: "Columns", v: p.table.head.join(" · ") },
                    ...p.table.rows.map((r) => ({
                        k: "Row",
                        v: r.join(" · "),
                    })),
                    ...(p.table.foot
                        ? [{ k: "Total", v: p.table.foot.join(" · ") }]
                        : []),
                    ...(p.table.note
                        ? [{ k: "Under it", v: p.table.note }]
                        : []),
                ],
            },
        );
    } else {
        top.push({ k: "Under it", v: p.lead });
        if (p.kind === "downloads")
            top.push(...p.benefits.map((b) => ({ k: "✓", v: b })));
    }
    if (p.body.length)
        blocks.push({ label: "The text", items: bodyItems(p.body) });
    if (p.kind === "gst")
        blocks.push({
            label: "Common mistakes",
            items: p.mistakes.map((m, i) => ({
                k: `${i + 1}`,
                v: m.title,
                sub: m.body,
                look: "title" as const,
            })),
        });
    if (p.questions.length)
        blocks.push({
            label: "Questions",
            items: p.questions.map((q, i) => ({
                k: `Q${i + 1}`,
                v: q.question,
                sub: q.answer.join(" "),
                look: "title" as const,
            })),
        });
    blocks.push({
        label: "On the hub and in lists",
        items: [
            {
                k: "Card",
                v:
                    p.kind === "gst"
                        ? gstCardName(p)
                        : p.kind === "guides"
                          ? p.h1
                          : p.name,
                sub: p.line,
                look: "title",
            },
            { k: "Target search", v: p.search },
        ],
    });
    blocks.push({
        label: "Bottom of the page",
        items: [
            {
                k: "Closing line",
                v: p.band?.title ?? "The kind's own",
                sub: p.band?.line,
                look: "headline",
            },
            {
                k: "Byline",
                v: `${p.author.name}, ${p.author.role} · Last updated ${p.updated}`,
                sub:
                    p.kind === "gst"
                        ? "A guide, not tax advice: check with your CA for your own case."
                        : undefined,
            },
        ],
    });
    return blocks;
}

/** The Overview's facts about a GST page, guide or download. */
export function docSections(p: DocPage): { k: string; v: string }[] {
    const first = p.questions[0]?.question;
    return [
        { k: "Headline", v: p.h1 },
        { k: "On the hub", v: p.line },
        ...(p.kind === "gst"
            ? [{ k: "Checked on", v: formatDate(p.checkedOn) }]
            : [{ k: "Section", v: p.group }]),
        {
            k: "Questions answered",
            v: `${p.questions.length}${first ? `, starting with “${first}”` : ""}`,
        },
        // Facts to confirm are the failing check's list on the same tab (owner, 1 Nov).
    ];
}

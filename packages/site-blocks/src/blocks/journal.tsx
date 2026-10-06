"use client";

import { useCallback, useEffect, useState } from "react";

import type { RenderedJournal } from "@saroh/block-contract";
import { resolveVariant } from "@saroh/block-contract";

import { DEFAULT_API_URL } from "../api-url";
import { cn, trimTrailingSlashes } from "../lib/utils";
import type { ArchiveYear } from "./journal-archive";
import { JournalArchive, JournalArchiveByYear } from "./journal-archive";
import { JournalLead } from "./journal-lead";
import { cardLink, listCard, listPhoto } from "./list-layout";

/**
 * `journal` v1 — the site's latest published posts, read live (G10).
 *
 * The section stores a title, how many posts and two switches. The posts come
 * from the ones this site owns, newest first, in one of two ways:
 *
 * - **`feed`** — handed in by the page that serves the site. saroh.app reads
 *   `GET public/sites/:siteId/posts` on the server (the same read as the
 *   posts index) and, behind a preview token, the draft's posts, as the
 *   preview's index already does. With no posts the block renders NOTHING: a
 *   heading over an empty grid tells a visitor nothing.
 * - **no feed, a `siteId`** — the editor's canvas. The block reads the same
 *   public list itself, so the merchant sees their real posts, and says "No
 *   posts yet" rather than vanishing, because a block that disappears on the
 *   canvas can't be selected or understood.
 *
 * With neither (`siteId` undefined: a past version, no site at all) it says
 * where the posts come from. `siteId` null is a live render that could not
 * tell which site it is on, and draws nothing.
 *
 * Drawn from `--site-*` only; gates G2 and G7 fail the build otherwise.
 */

/** What the block needs of a post: less than the live or preview read has. */
export interface JournalPost {
    title: string;
    slug: string;
    excerpt?: string | null;
    /** The post's body, already sanitized at publish; only read for text. */
    content?: string | null;
    image?: string | null;
    author?: string | null;
    /** Null for a post behind a preview token that has never gone live. */
    publishedAt: string | null;
    /** False only behind a preview token, for a post not published yet. */
    live?: boolean;
}

/** The posts to show and where they live: `/blog` unless the merchant chose. */
export interface JournalFeed {
    posts: JournalPost[];
    /** The posts index; each post is at `${basePath}/${slug}`. */
    basePath: string;
}

/** What the section is called when the merchant left the title empty. */
export const JOURNAL_TITLE = "Journal";

/** How many posts the block shows when the count is not set. */
export const JOURNAL_DEFAULT_COUNT = 3;

/** A value with something in it, else null: an empty string says nothing. */
function said(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed === undefined || trimmed === "" ? null : trimmed;
}

/** How long an excerpt made from the post's body may run. */
const EXCERPT_CHARS = 160;

const ENTITIES: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    "#39": "'",
    apos: "'",
    nbsp: " ",
};

/**
 * The text with every `<script>…</script>` and `<style>…</style>` cut out, by
 * scanning rather than `/<(script|style)[\s\S]*?<\/\1>/`, which is
 * quadratic on a body of many unclosed `<style` (CodeQL js/polynomial-redos).
 * An unclosed one runs to the end, as a browser would read it.
 */
export function withoutScriptsAndStyles(html: string): string {
    const lower = html.toLowerCase();
    let out = "";
    let at = 0;
    for (;;) {
        const s = lower.indexOf("<script", at);
        const t = lower.indexOf("<style", at);
        const open = s === -1 ? t : t === -1 ? s : Math.min(s, t);
        if (open === -1) return out + html.slice(at);
        const close = open === s ? "</script>" : "</style>";
        out += `${html.slice(at, open)} `;
        const end = lower.indexOf(close, open);
        if (end === -1) return out;
        at = end + close.length;
    }
}

/**
 * The text with every tag replaced by a space, by scanning rather than
 * `/<[^>]*>/g`, which is quadratic on a body of many `<` with no `>`
 * (CodeQL js/polynomial-redos). A `<` with no `>` after it is kept as text.
 */
export function withoutTags(html: string): string {
    let out = "";
    let at = 0;
    for (;;) {
        const open = html.indexOf("<", at);
        if (open === -1) return out + html.slice(at);
        const close = html.indexOf(">", open + 1);
        if (close === -1) return out + html.slice(at);
        out += `${html.slice(at, open)} `;
        at = close + 1;
    }
}

const TRAILING = new Set(" \t\n\r,;:.–—-".split(""));

/** The text without trailing spaces and punctuation, as a loop. */
function trimEndPunctuation(text: string): string {
    let end = text.length;
    while (end > 0 && TRAILING.has(text[end - 1] ?? "")) end--;
    return text.slice(0, end);
}

/**
 * The line under a post's title: its excerpt, else the opening of its body as
 * plain text, cut at a word. Drawn as text, never as markup, so a tag the
 * strip misses shows as characters rather than running.
 */
export function postExcerpt(post: JournalPost): string | null {
    const own = post.excerpt?.trim();
    if (own) return own;
    const text = withoutTags(withoutScriptsAndStyles(post.content ?? ""))
        .replace(/&(#39|[a-z]+);/gi, (m, name: string) => {
            return ENTITIES[name.toLowerCase()] ?? m;
        })
        .replace(/\s+/g, " ")
        .trim();
    if (text === "") return null;
    if (text.length <= EXCERPT_CHARS) return text;
    const cut = text.slice(0, EXCERPT_CHARS);
    const space = cut.lastIndexOf(" ");
    return `${trimEndPunctuation(space > 80 ? cut.slice(0, space) : cut)}…`;
}

const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
] as const;

/**
 * One date, "20 Sep 2026", in UTC as the posts index dates it. Spelled out
 * rather than left to `Intl`: engines disagree on September's short name
 * ("Sep" or "Sept"), and a server and browser that disagree is a hydration
 * mismatch.
 */
export function postDay(iso: string): string | null {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** "2 Apr": a day without its year (template polish), in UTC as above. */
export function postDayShort(iso: string): string | null {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

/** A post's year, "2026", in UTC as its date is; null when it has none. */
export function postYear(iso: string | null): string | null {
    if (!iso) return null;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : String(date.getUTCFullYear());
}

/** Text with the common entities a sanitized body carries turned back. */
function decoded(text: string): string {
    return text
        .replace(/&(#39|[a-z]+);/gi, (m, name: string) => {
            return ENTITIES[name.toLowerCase()] ?? m;
        })
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * The first few paragraphs of a post's body as plain text (template
 * polish), for the lead look: each `<p>…</p>` in turn, its tags stripped,
 * empty ones skipped. A scan with `indexOf`, not a regex over the body, so
 * a body of many unclosed tags stays linear (CodeQL js/polynomial-redos).
 */
export function openingParagraphs(
    html: string | null | undefined,
    max = 3,
): string[] {
    const body = withoutScriptsAndStyles(html ?? "");
    const lower = body.toLowerCase();
    const out: string[] = [];
    let at = 0;
    while (out.length < max) {
        let open = lower.indexOf("<p", at);
        // `<pre>` and `<param>` are not paragraphs.
        while (open !== -1 && /[a-z]/.test(lower[open + 2] ?? "")) {
            open = lower.indexOf("<p", open + 2);
        }
        if (open === -1) break;
        const start = lower.indexOf(">", open);
        if (start === -1) break;
        const close = lower.indexOf("</p>", start);
        const end = close === -1 ? body.length : close;
        const text = decoded(inlineText(body.slice(start + 1, end)));
        if (text !== "") out.push(text);
        if (close === -1) break;
        at = close + 4;
    }
    return out;
}

/**
 * A paragraph's text: inline tags removed without a gap, so "<b>two</b>."
 * reads "two.", and a line break as a space. A scan, as `withoutTags`.
 */
function inlineText(html: string): string {
    let out = "";
    let at = 0;
    for (;;) {
        const open = html.indexOf("<", at);
        if (open === -1) return out + html.slice(at);
        const close = html.indexOf(">", open + 1);
        if (close === -1) return out + html.slice(at);
        const tag = html.slice(open + 1, open + 4).toLowerCase();
        out += html.slice(at, open) + (tag.startsWith("br") ? " " : "");
        at = close + 1;
    }
}

/**
 * "About 12 minutes" from a post's body, at 230 words a minute (template
 * polish); null when there is no body to count, so nothing is claimed.
 */
export function readingTime(html: string | null | undefined): string | null {
    const text = decoded(withoutTags(withoutScriptsAndStyles(html ?? "")));
    if (text === "") return null;
    const words = text.split(" ").length;
    const minutes = Math.max(1, Math.round(words / 230));
    return `About ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

/**
 * The small line over a post's title: who wrote it and when. A post behind a
 * preview token that hasn't gone out says so instead of a date.
 */
export function postEyebrow(post: JournalPost): string {
    const when =
        post.live === false || post.publishedAt === null
            ? "Not published"
            : postDay(post.publishedAt);
    return [said(post.author), when]
        .filter((part): part is string => Boolean(part))
        .join(" · ");
}

/** A row of the public posts read, narrowed rather than cast (#264). */
function fromPublicRow(
    row: unknown,
): { post: JournalPost; path: string } | null {
    if (typeof row !== "object" || row === null) return null;
    const r = row as { post?: unknown; path?: unknown };
    const p = r.post as Record<string, unknown> | null | undefined;
    if (typeof p !== "object" || p === null) return null;
    if (typeof p.title !== "string" || typeof p.slug !== "string") return null;
    if (p.slug === "") return null;
    const text = (v: unknown) => (typeof v === "string" ? v : null);
    return {
        post: {
            title: p.title,
            slug: p.slug,
            excerpt: text(p.excerpt),
            content: text(p.content),
            image: text(p.image),
            author: text(p.author),
            publishedAt: text(p.publishedAt),
        },
        path: typeof r.path === "string" ? r.path : "",
    };
}

/**
 * The posts index a post's published path sits under: `/blog/bread` →
 * `/blog`. The canvas has only the paths the API wrote at publish.
 */
function indexOf(path: string): string | null {
    const cut = path.lastIndexOf("/");
    return cut > 0 ? path.slice(0, cut) : null;
}

type LoadState =
    | { kind: "loading" }
    | { kind: "ready"; feed: JournalFeed }
    | { kind: "error" };

export default function JournalSection({
    content,
    feed,
    siteId,
    apiUrl = DEFAULT_API_URL,
    now,
}: {
    content: RenderedJournal;
    /** The posts, read by the page that serves the site (live or preview). */
    feed?: JournalFeed;
    /**
     * The site, when the block reads its posts itself (the editor's canvas).
     * Null: a live render that could not tell, so nothing is drawn.
     * Undefined: no site at all; the block says what will show.
     */
    siteId?: string | null;
    /** Base URL of the public API. See {@link DEFAULT_API_URL}. */
    apiUrl?: string;
    /** The moment "this year" is read against (short dates). Tests pin it. */
    now?: Date;
}) {
    const reads = feed === undefined && typeof siteId === "string";
    const [state, setState] = useState<LoadState>({ kind: "loading" });

    const load = useCallback(async (): Promise<LoadState> => {
        if (typeof siteId !== "string") return { kind: "error" };
        try {
            const res = await fetch(
                `${apiUrl}/public/sites/${encodeURIComponent(siteId)}/posts`,
                { headers: { accept: "application/json" } },
            );
            if (!res.ok) return { kind: "error" };
            const body: unknown = await res.json().catch(() => null);
            const rows = (body as { posts?: unknown } | null)?.posts;
            if (!Array.isArray(rows)) return { kind: "error" };
            const read = rows
                .map(fromPublicRow)
                .filter((row): row is NonNullable<typeof row> => row !== null);
            return {
                kind: "ready",
                feed: {
                    posts: read.map((row) => row.post),
                    basePath:
                        read.map((row) => indexOf(row.path)).find(Boolean) ??
                        "/blog",
                },
            };
        } catch {
            return { kind: "error" };
        }
    }, [apiUrl, siteId]);

    useEffect(() => {
        if (!reads) return;
        let active = true;
        void load().then((next) => {
            if (active) setState(next);
        });
        return () => {
            active = false;
        };
    }, [reads, load]);

    const title = said(content.title) ?? JOURNAL_TITLE;

    if (feed) {
        return (
            <JournalCards
                content={content}
                title={title}
                feed={feed}
                now={now}
            />
        );
    }
    if (siteId === null) return null;
    if (siteId === undefined) {
        return (
            <JournalNote title={title}>
                Your latest posts show here on your live site, newest first.
            </JournalNote>
        );
    }
    if (state.kind === "loading") {
        return (
            <JournalNote title={title} busy>
                Loading your posts…
            </JournalNote>
        );
    }
    if (state.kind === "error") {
        return (
            <JournalNote
                title={title}
                action={
                    <button
                        type="button"
                        onClick={() => {
                            setState({ kind: "loading" });
                            void load().then(setState);
                        }}
                        className={textButton}
                    >
                        Try again
                    </button>
                }
            >
                We couldn&apos;t load your posts just now.
            </JournalNote>
        );
    }
    if (state.feed.posts.length === 0) {
        return (
            <JournalNote title={title}>
                No posts yet. Publish a post and it shows here; until then this
                section is left off your live site.
            </JournalNote>
        );
    }
    return (
        <JournalCards
            content={content}
            title={title}
            feed={state.feed}
            now={now}
        />
    );
}

const focusRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent focus-visible:ring-offset-2 focus-visible:ring-offset-site-bg";

const textButton = cn(
    "cursor-pointer rounded-[var(--site-radius)] text-sm font-semibold text-site-accent underline-offset-4 transition-opacity hover:underline active:opacity-70",
    focusRing,
);

function JournalFrame({
    title,
    more,
    children,
}: {
    title: string;
    more?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <section className="mx-auto w-full max-w-screen-xl px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
            <div className="mb-3.5 flex items-baseline gap-3">
                <h2
                    data-site-title=""
                    className="font-site-heading text-site-fg min-w-0 flex-1 text-[calc(1.625rem*var(--site-heading-scale))] font-semibold tracking-[-0.01em]"
                >
                    {title}
                </h2>
                {more ?? null}
            </div>
            {children}
        </section>
    );
}

/** Said where there is nothing to list: the canvas, never the live site. */
function JournalNote({
    title,
    busy = false,
    action,
    children,
}: {
    title: string;
    busy?: boolean;
    action?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <JournalFrame title={title}>
            <div
                role={action ? "alert" : "status"}
                aria-busy={busy || undefined}
                className="border-site-border text-site-body grid justify-items-start gap-2 rounded-[calc(var(--site-radius)*1.4)] border border-dashed p-5 text-sm leading-relaxed"
            >
                <p>{children}</p>
                {action ?? null}
            </div>
        </JournalFrame>
    );
}

function JournalCards({
    content,
    title,
    feed,
    now,
}: {
    content: RenderedJournal;
    title: string;
    feed: JournalFeed;
    /** The moment "this year" is read against. Tests pin it. */
    now?: Date;
}) {
    const look = resolveVariant("journal", content);
    // The lead look (template polish): the newest post, in depth.
    if (look === "lead") {
        return <LeadSection content={content} feed={feed} />;
    }
    // The archive look (U2): every post, dated, whatever the count says.
    const archive = look === "archive";
    // Under a lead section, the newest is already on the page (polish).
    const pool = content.afterLead ? feed.posts.slice(1) : feed.posts;
    const limit = archive ? content.archiveLimit : undefined;
    const posts = archive
        ? limit
            ? pool.slice(0, limit)
            : pool
        : pool.slice(0, content.count ?? JOURNAL_DEFAULT_COUNT);
    if (posts.length === 0) return null;
    if (archive) {
        const index = trimTrailingSlashes(feed.basePath);
        const thisYear = String((now ?? new Date()).getUTCFullYear());
        const byYear = content.groupByYear === true;
        const rows = posts.map((post) => {
            const live = post.live !== false && post.publishedAt !== null;
            const iso = post.publishedAt ?? "";
            // Under its year, or in this year when asked: no year in the date.
            const short =
                byYear ||
                (content.shortDates === true && postYear(iso) === thisYear);
            return {
                key: post.slug,
                href: `${index}/${encodeURIComponent(post.slug)}`,
                title: post.title,
                date: live
                    ? short
                        ? postDayShort(iso)
                        : postDay(iso)
                    : "Not published",
                dateTime: live ? iso.slice(0, 10) : null,
                excerpt:
                    content.showExcerpts !== false ? postExcerpt(post) : null,
                year: live ? postYear(iso) : null,
            };
        });
        const total = feed.posts.length;
        const more = limit ? (
            <a href={index || "/"} className={cn(textButton, "shrink-0")}>
                All {total} {total === 1 ? "entry" : "entries"}{" "}
                <span aria-hidden="true">→</span>
            </a>
        ) : content.showTotal ? (
            <span
                data-journal-total=""
                className="text-site-muted shrink-0 text-[14px]"
            >
                {total === 1 ? "One piece" : `${total} pieces in all`}
            </span>
        ) : undefined;
        if (byYear) {
            const years: ArchiveYear[] = [];
            for (const row of rows) {
                const year = row.year ?? "Not published";
                const last: ArchiveYear | null =
                    years.length > 0 ? years[years.length - 1] : null;
                if (last?.year === year) last.rows.push(row);
                else years.push({ year, rows: [row] });
            }
            return (
                <JournalFrame title={title} more={more}>
                    <JournalArchiveByYear years={years} />
                </JournalFrame>
            );
        }
        return (
            <JournalFrame title={title} more={more}>
                <JournalArchive rows={rows} />
            </JournalFrame>
        );
    }
    const showImages = content.showImages !== false;
    const showExcerpts = content.showExcerpts !== false;
    const base = trimTrailingSlashes(feed.basePath);
    // "Show as" and "Button" (G16). Absent: cards, and no words of their own.
    const list = content.layout === "list";
    const label = said(content.buttonLabel);

    return (
        <JournalFrame
            title={title}
            more={
                <a href={base || "/"} className={cn(textButton, "shrink-0")}>
                    All posts <span aria-hidden="true">→</span>
                </a>
            }
        >
            <ul
                className={cn(
                    "grid",
                    list
                        ? "grid-cols-1 gap-2.5"
                        : "gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(230px,100%),1fr))]",
                )}
            >
                {posts.map((post) => {
                    const image = showImages ? post.image?.trim() : null;
                    const excerpt = showExcerpts ? postExcerpt(post) : null;
                    const eyebrow = postEyebrow(post);
                    if (list) {
                        return (
                            <li key={post.slug} className="min-w-0">
                                <a
                                    href={`${base}/${encodeURIComponent(post.slug)}`}
                                    className={cn(
                                        listCard(Boolean(image)),
                                        "hover:border-site-fg/40 group cursor-pointer transition-[border-color,transform] active:scale-[0.99]",
                                        focusRing,
                                    )}
                                >
                                    {image ? (
                                        <img
                                            src={image}
                                            alt=""
                                            loading="lazy"
                                            className={listPhoto}
                                        />
                                    ) : null}
                                    <span className="grid min-w-0 content-start gap-1.5 py-4">
                                        {eyebrow ? (
                                            <span className="text-site-muted px-4 text-[11.5px] font-bold uppercase tracking-[0.08em]">
                                                {eyebrow}
                                            </span>
                                        ) : null}
                                        <span className="font-site-heading px-4 text-[calc(1.1875rem*var(--site-heading-scale))] font-semibold leading-tight tracking-[-0.015em] underline-offset-4 group-hover:underline">
                                            {post.title}
                                        </span>
                                        {excerpt ? (
                                            <span className="text-site-body px-4 text-[13.5px] leading-normal [text-wrap:pretty]">
                                                {excerpt}
                                            </span>
                                        ) : null}
                                        {label ? (
                                            <span className={cardLink}>
                                                {label}
                                            </span>
                                        ) : null}
                                    </span>
                                </a>
                            </li>
                        );
                    }
                    return (
                        <li key={post.slug} className="min-w-0">
                            <a
                                href={`${base}/${encodeURIComponent(post.slug)}`}
                                className={cn(
                                    "border-site-border bg-site-surface text-site-fg hover:border-site-fg/40 group grid h-full min-w-0 cursor-pointer content-start gap-1.5 overflow-hidden rounded-[calc(var(--site-radius)*1.4)] border pb-4 transition-[border-color,transform] active:scale-[0.99]",
                                    image ? null : "pt-4",
                                    focusRing,
                                )}
                            >
                                {image ? (
                                    // Remote images from the merchant's media,
                                    // a plain <img> as every block's: next/image
                                    // would need each origin allowlisted.
                                    <img
                                        src={image}
                                        alt=""
                                        loading="lazy"
                                        className="mb-1.5 h-[130px] w-full object-cover"
                                    />
                                ) : null}
                                {eyebrow ? (
                                    <span className="text-site-muted px-4 text-[11.5px] font-bold uppercase tracking-[0.08em]">
                                        {eyebrow}
                                    </span>
                                ) : null}
                                <span className="font-site-heading px-4 text-[calc(1.1875rem*var(--site-heading-scale))] font-semibold leading-tight tracking-[-0.015em] underline-offset-4 group-hover:underline">
                                    {post.title}
                                </span>
                                {excerpt ? (
                                    <span className="text-site-body px-4 text-[13.5px] leading-normal [text-wrap:pretty]">
                                        {excerpt}
                                    </span>
                                ) : null}
                                {label ? (
                                    <span className={cardLink}>{label}</span>
                                ) : null}
                            </a>
                        </li>
                    );
                })}
            </ul>
        </JournalFrame>
    );
}

/**
 * The lead look's section (template polish): the newest post, drawn by
 * `JournalLead`. The section's own title shows only when the merchant set
 * one; the post's title is otherwise the section's heading.
 */
function LeadSection({
    content,
    feed,
}: {
    content: RenderedJournal;
    feed: JournalFeed;
}) {
    if (feed.posts.length === 0) return null;
    const post = feed.posts[0];
    const own = said(content.title);
    const live = post.live !== false && post.publishedAt !== null;
    const index = trimTrailingSlashes(feed.basePath);
    const lead = (
        <JournalLead
            titled={own !== null}
            post={{
                href: `${index}/${encodeURIComponent(post.slug)}`,
                title: post.title,
                date: live ? postDay(post.publishedAt ?? "") : "Not published",
                dateTime: live ? (post.publishedAt ?? "").slice(0, 10) : null,
                dek: said(post.excerpt),
                minutes: readingTime(post.content),
                paragraphs: openingParagraphs(post.content),
            }}
        />
    );
    return own ? (
        <JournalFrame title={own}>{lead}</JournalFrame>
    ) : (
        <section className="mx-auto w-full max-w-screen-xl px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
            {lead}
        </section>
    );
}

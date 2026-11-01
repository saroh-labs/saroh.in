import type { ReactNode } from "react";

import type { OutlineItem } from "../blocks/types";
import { showDate } from "../tools/_documents/logic";

/*
 * The content pages' shared blocks (#1201, DEC-195; the map is BLOCKS.md):
 * the GST, guide and download templates and the hubs draw these and pass
 * props, never their own copy. Every link is a prop: the admin preview
 * passes none, and an `<a>` without an href goes nowhere.
 */

const cls = (...names: (string | false | undefined)[]) =>
    names.filter(Boolean).join(" ");

/** A section and its H2 (28px desk, 22px phone), with an optional muted line under it. */
export function Section({
    title,
    id,
    note,
    tight = false,
    children,
}: {
    title: ReactNode;
    id?: string;
    note?: ReactNode;
    /** 4px under the H2, for a list or the questions that bring their own rules. */
    tight?: boolean;
    children: ReactNode;
}) {
    return (
        <section className={cls("sp-sc", tight && "sp-sc-tight")}>
            <h2 className="sp-h2c" id={id}>
                {title}
            </h2>
            {children}
            {note ? <span className="sp-sc-note">{note}</span> : null}
        </section>
    );
}

/** The amber-edged "In short" box under a GST page's title. */
export function AnswerBox({
    label = "In short:",
    children,
}: {
    label?: string;
    children: ReactNode;
}) {
    return (
        <div className="sp-ans">
            <b>{label}</b> {children}
        </div>
    );
}

export interface Fact {
    label: string;
    value: ReactNode;
    note?: ReactNode;
}

/** Four facts in a row (two on a phone): rate, codes, the split. */
export function FactsStrip({ facts }: { facts: readonly Fact[] }) {
    return (
        <dl className="sp-facts">
            {facts.map((f) => (
                <div key={f.label} className="sp-facts-i">
                    <dt>{f.label}</dt>
                    <dd className="sp-facts-v">{f.value}</dd>
                    {f.note ? <dd className="sp-facts-n">{f.note}</dd> : null}
                </div>
            ))}
        </dl>
    );
}

/** "Common mistakes": numbered rows, each with an optional bold lead. */
export function NumberedList({
    items,
}: {
    items: readonly { lead?: string; text: ReactNode }[];
}) {
    return (
        <ol className="sp-nl">
            {items.map((it, i) => (
                <li key={i}>
                    <span className="sp-nl-n" aria-hidden="true">
                        {i + 1}
                    </span>
                    <span>
                        {it.lead ? <b>{it.lead}</b> : null}
                        {it.lead ? " " : null}
                        {it.text}
                    </span>
                </li>
            ))}
        </ol>
    );
}

export interface Author {
    name: string;
    role?: string;
}

const day = (iso: string) => <time dateTime={iso}>{showDate(iso)}</time>;

/**
 * Who wrote the page and when, from the page's own dates (the sitemap's
 * too), never the build's. `block`: the avatar row under a guide's title;
 * `line`: one muted line at the end of a GST or download page.
 */
export function Byline({
    variant,
    author,
    updated,
    published,
    readMinutes,
    verb = "Written by",
    note,
}: {
    variant: "block" | "line";
    author: Author;
    /** ISO day, e.g. "2026-10-24". */
    updated: string;
    published?: string;
    readMinutes?: number;
    /** "Made by" on a download. */
    verb?: string;
    /** A last part on the line, e.g. the GST pages' "not tax advice" words. */
    note?: ReactNode;
}) {
    const who = author.role ? `${author.name}, ${author.role}` : author.name;
    if (variant === "line") {
        return (
            <p className="sp-by-line">
                <span>
                    {verb} {who}
                </span>
                <span aria-hidden="true">·</span>
                <span>Last updated {day(updated)}</span>
                {note ? (
                    <>
                        <span aria-hidden="true">·</span>
                        <span>{note}</span>
                    </>
                ) : null}
            </p>
        );
    }
    const meta: ReactNode[] = published
        ? [<>Published {day(published)}</>, <>Updated {day(updated)}</>]
        : [<>Last updated {day(updated)}</>];
    if (readMinutes) meta.push(<>{readMinutes} min read</>);
    return (
        <div className="sp-by">
            <span className="sp-by-av" aria-hidden="true">
                {author.name.trim().charAt(0).toUpperCase()}
            </span>
            <span className="sp-by-t">
                <span className="sp-by-who">{who}</span>
                <span className="sp-by-meta">
                    {meta.map((m, i) => (
                        <span key={i}>
                            {i > 0 ? " · " : null}
                            {m}
                        </span>
                    ))}
                </span>
            </span>
        </div>
    );
}

export interface CardItem {
    name: string;
    line?: string;
    href?: string;
    /** Small caps over the title: a trade, "8 min read", "Excel · Word". */
    eyebrow?: string;
    /** The search the page targets: `Related` drops one equal to the page's own. */
    search?: string;
}

/** The white link card of the hubs and of Related's cards. */
export function LinkCard({
    item,
    more = false,
}: {
    item: CardItem;
    /** "Read more →" under the line (Related's cards). */
    more?: boolean;
}) {
    return (
        <a className="sp-lc" href={item.href}>
            {item.eyebrow ? (
                <span className="sp-lc-eye">{item.eyebrow}</span>
            ) : null}
            <span className="sp-lc-t">{item.name}</span>
            {item.line ? <span className="sp-lc-l">{item.line}</span> : null}
            {more ? (
                <span className="sp-lc-more" aria-hidden="true">
                    Read more →
                </span>
            ) : null}
        </a>
    );
}

/**
 * Pages from the same hub (R5): at most `max`, never one that targets the
 * page's own search, and only what exists when there are fewer.
 */
export function pickRelated(
    items: readonly CardItem[],
    search: string | undefined,
    max = 3,
): CardItem[] {
    const own = search?.trim().toLowerCase();
    return items
        .filter((it) => !own || it.search?.trim().toLowerCase() !== own)
        .slice(0, max);
}

/**
 * Related pages. `cards`: a titled row of link cards (guides, downloads);
 * `rail`: the GST aside, the tool cards and then a titled list of links.
 */
export function Related({
    variant,
    items,
    current,
    title,
    tools = [],
    max = 3,
}: {
    variant: "cards" | "rail";
    items: readonly CardItem[];
    current?: { search?: string };
    title: string;
    /** The rail's "Free tool" cards, above the list. */
    tools?: readonly CardItem[];
    max?: number;
}) {
    const picked = pickRelated(items, current?.search, max);
    if (variant === "cards") {
        if (!picked.length) return null;
        return (
            <Section title={title}>
                <div className="sp-rel-cards">
                    {picked.map((it) => (
                        <LinkCard key={it.name} item={it} more />
                    ))}
                </div>
            </Section>
        );
    }
    return (
        <div className="sp-rel-rail">
            {tools.map((t) => (
                <a key={t.name} className="sp-rel-tool" href={t.href}>
                    <span className="sp-rel-eye">
                        {t.eyebrow ?? "Free tool"}
                    </span>
                    <b>{t.name}</b>
                    {t.line ? (
                        <span className="sp-rel-tl">{t.line}</span>
                    ) : null}
                </a>
            ))}
            {picked.length ? (
                <nav aria-label={title}>
                    <span className="sp-rel-eye">{title}</span>
                    {picked.map((it) => (
                        <a key={it.name} className="sp-rel-link" href={it.href}>
                            {it.name} →
                        </a>
                    ))}
                </nav>
            ) : null}
        </div>
    );
}

/** A guide's outline (`outlineOf` its blocks): links to its H2s on the same page. */
export function OnThisPage({ items }: { items: readonly OutlineItem[] }) {
    if (!items.length) return null;
    return (
        <nav aria-label="On this page" className="sp-otp">
            <span className="sp-otp-eye">On this page</span>
            {items.map((it) => (
                <a key={it.id} href={`#${it.id}`}>
                    {it.text}
                </a>
            ))}
        </nav>
    );
}

/** The "In Saroh" note in a guide: how Saroh does what the guide describes. */
export function Callout({
    label = "In Saroh",
    children,
}: {
    label?: string;
    children: ReactNode;
}) {
    return (
        <aside className="sp-call">
            <span className="sp-call-l">{label}</span>
            <span className="sp-call-t">{children}</span>
        </aside>
    );
}

/** A picture with its words. `alt` is required: a picture nobody can read isn't drawn. */
export function Figure({
    src,
    alt,
    width,
    height,
    ratio = "16/8",
    caption,
    srcSet,
    sizes,
    stub = false,
}: {
    src: string;
    alt: string;
    /** The file's size, when known, so the page doesn't jump as it loads. */
    width?: number;
    height?: number;
    /** The box's shape: 16/8 in a guide, 16/7 on a download. */
    ratio?: "16/8" | "16/7";
    caption?: ReactNode;
    /** Narrower copies of the file, and how wide the page draws it. */
    srcSet?: string;
    sizes?: string;
    /** Its words in the frame instead: where the file isn't served (admin's preview). */
    stub?: boolean;
}) {
    if (!alt.trim()) throw new Error(`Figure ${src} has no alt text`);
    const wide = ratio === "16/7" ? "sp-fig-wide" : undefined;
    return (
        <figure className="sp-fig">
            {stub ? (
                <div
                    className={`sp-fig-stub ${wide ?? ""}`}
                    role="img"
                    aria-label={alt}
                >
                    {alt}
                </div>
            ) : (
                <img
                    className={wide}
                    src={src}
                    srcSet={srcSet}
                    sizes={sizes}
                    alt={alt}
                    width={width}
                    height={height}
                    loading="lazy"
                    decoding="async"
                />
            )}
            {caption ? <figcaption>{caption}</figcaption> : null}
        </figure>
    );
}

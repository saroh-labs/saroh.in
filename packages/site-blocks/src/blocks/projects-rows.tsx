import type { RenderedProjects } from "@saroh/block-contract";
import { isSafeHref } from "@saroh/block-contract";

import { cn } from "../lib/utils";

/**
 * The Projects block's `rows` look (template polish), as the developer
 * design lists its work like a CV: hairline rows, no photos and no boxes.
 * Three columns from the tablet width up — the year, then the work (its
 * title, a link where there is one, the line about it and a meta line such
 * as a stack), then the role — stacked on a phone. Years and the meta line
 * are machine facts and take the site's mono face. Drawn from `--site-*`
 * only (gate G2).
 */

type Project = RenderedProjects["items"][number];

function said(value: string | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed === undefined || trimmed === "" ? null : trimmed;
}

const focusRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent focus-visible:ring-offset-2 focus-visible:ring-offset-site-bg";

/** What a link shows: a web address's host, else the block's own words. */
export function linkText(href: string, fallback: string): string {
    if (!/^https?:\/\//i.test(href)) return fallback;
    try {
        return new URL(href).host.replace(/^www\./, "");
    } catch {
        return fallback;
    }
}

export function ProjectRows({
    items,
    linkWords,
}: {
    items: Project[];
    /** The words on a link that is not a web address. */
    linkWords: string;
}) {
    return (
        <ol className="border-site-border border-t">
            {items.map((item, i) => {
                const title = said(item.title) ?? "";
                const year = said(item.year);
                const role = said(item.role);
                const summary = said(item.summary);
                const meta = said(item.meta);
                const href = said(item.link);
                const link = href && isSafeHref(href) ? href : null;
                return (
                    <li
                        key={i}
                        className="border-site-border text-site-fg grid gap-x-6 gap-y-1 border-b py-5 sm:grid-cols-[4.5rem_minmax(0,1fr)_9.5rem]"
                    >
                        <span className="font-site-mono text-site-muted text-[12.5px] tabular-nums sm:pt-1">
                            {year}
                        </span>
                        <div className="grid min-w-0 gap-1">
                            <h3 className="font-site-heading text-[calc(1.03125rem*var(--site-heading-scale))] font-semibold leading-snug [overflow-wrap:anywhere]">
                                {title}
                                {link ? (
                                    <a
                                        href={link}
                                        rel={
                                            /^https?:\/\//i.test(link)
                                                ? "noopener"
                                                : undefined
                                        }
                                        className={cn(
                                            "text-site-body ml-2.5 rounded-[var(--site-radius)] text-[13px] font-normal underline underline-offset-4",
                                            focusRing,
                                        )}
                                    >
                                        {linkText(link, linkWords)}
                                        <span className="sr-only">
                                            : {title}
                                        </span>
                                    </a>
                                ) : null}
                            </h3>
                            {summary ? (
                                <p className="text-site-body whitespace-pre-line text-[15px] leading-relaxed [overflow-wrap:anywhere] [text-wrap:pretty]">
                                    {summary}
                                </p>
                            ) : null}
                            {meta ? (
                                <p className="font-site-mono text-site-muted text-[12.5px] [overflow-wrap:anywhere]">
                                    {meta}
                                </p>
                            ) : null}
                        </div>
                        <span className="text-site-body text-[13.5px] sm:pt-0.5">
                            {role}
                        </span>
                    </li>
                );
            })}
        </ol>
    );
}

/**
 * "5 projects across 8 years": how many, and the span of the four-digit
 * years in their `year` fields when there are two years or more between
 * them. Counted from the projects shown, never typed.
 */
export function projectsCount(items: readonly Project[]): string | null {
    const n = items.length;
    if (n === 0) return null;
    const what = n === 1 ? "One project" : `${n} projects`;
    const years = items.flatMap((item) =>
        Array.from((item.year ?? "").matchAll(/\b(1[89]\d\d|2\d\d\d)\b/g)).map(
            (m) => Number(m[1]),
        ),
    );
    if (years.length === 0) return what;
    const span = Math.max(...years) - Math.min(...years) + 1;
    return span >= 2 ? `${what} across ${span} years` : what;
}

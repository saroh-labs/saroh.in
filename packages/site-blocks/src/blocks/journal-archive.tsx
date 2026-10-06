import { cn } from "../lib/utils";

/**
 * The Journal's `archive` look (industry templates U2): every published post
 * as a dated list — the date in a column on the left, the title and its line
 * beside it — as the blog and developer designs list their writing. One row
 * per post, newest first; on a phone the date sits over the title.
 *
 * The rows are worked out by the Journal block (`journal.tsx`), which owns
 * the date and excerpt rules; this draws them. Drawn from `--site-*` only.
 */

export interface ArchiveRow {
    key: string;
    href: string;
    title: string;
    /** "20 Sep 2026", or "Not published" behind a preview token. */
    date: string | null;
    /** The machine date for `<time>`, when there is one. */
    dateTime: string | null;
    excerpt: string | null;
}

const focusRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent focus-visible:ring-offset-2 focus-visible:ring-offset-site-bg";

export function JournalArchive({ rows }: { rows: ArchiveRow[] }) {
    return (
        <ol className="border-site-border border-t">
            {rows.map((row) => (
                <li key={row.key} className="border-site-border border-b">
                    <a
                        href={row.href}
                        className={cn(
                            "text-site-fg group grid gap-x-6 gap-y-1 py-4 sm:grid-cols-[9rem_minmax(0,1fr)]",
                            focusRing,
                        )}
                    >
                        <span className="text-site-muted text-[13px] tabular-nums sm:pt-1">
                            {row.date ? (
                                row.dateTime ? (
                                    <time dateTime={row.dateTime}>
                                        {row.date}
                                    </time>
                                ) : (
                                    row.date
                                )
                            ) : null}
                        </span>
                        <span className="grid min-w-0 gap-1">
                            <span className="font-site-heading text-[calc(1.25rem*var(--site-heading-scale))] font-semibold leading-snug tracking-[-0.015em] underline-offset-4 [overflow-wrap:anywhere] group-hover:underline">
                                {row.title}
                            </span>
                            {row.excerpt ? (
                                <span className="text-site-body text-[14px] leading-normal [text-wrap:pretty]">
                                    {row.excerpt}
                                </span>
                            ) : null}
                        </span>
                    </a>
                </li>
            ))}
        </ol>
    );
}

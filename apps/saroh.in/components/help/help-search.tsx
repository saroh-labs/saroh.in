"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";

import type { HelpSummary } from "@/content/help";
import { HELP_EMAIL, helpHome, helpHref, searchArticles } from "@/content/help";

/**
 * The Help home's search (design 1a): in the browser, over the published
 * articles' titles, areas and groups (`searchArticles`), up to six results
 * under the field. Nothing typed, nothing shown; no match, the line that
 * says a person will answer.
 */
export function HelpSearch({ articles }: { articles: HelpSummary[] }) {
    const [query, setQuery] = useState("");
    const results = searchArticles(query, articles);
    const resultsId = useId();
    const typed = query.trim().length > 0;
    return (
        <div className="grid gap-3">
            <label className="flex h-16 items-center gap-3.5 rounded-[14px] border border-border-strong bg-card px-[22px] transition-colors duration-fast ease-out focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-500 focus-within:[outline-style:solid] hover:border-foreground/40">
                <Search
                    aria-hidden
                    strokeWidth={2}
                    className="size-5 shrink-0 text-muted-foreground"
                />
                <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={helpHome.searchPlaceholder}
                    aria-label={helpHome.searchLabel}
                    aria-controls={resultsId}
                    className="min-w-0 flex-1 border-none bg-transparent text-[18px] text-foreground outline-none placeholder:text-mk-hint focus:outline-none focus-visible:outline-none focus-visible:ring-0"
                />
            </label>
            <div id={resultsId} aria-live="polite">
                {!typed ? null : results.length > 0 ? (
                    <ul
                        aria-label="Results"
                        className="m-0 list-none overflow-hidden rounded-[14px] border border-border bg-card p-0"
                    >
                        {results.map((a) => (
                            <li
                                key={a.slug}
                                className="border-b border-mk-line-row last:border-b-0"
                            >
                                <Link
                                    href={helpHref(a.slug)}
                                    className="flex min-w-0 cursor-pointer flex-wrap justify-between gap-x-4 gap-y-1 px-5 py-3.5 text-foreground no-underline transition-colors duration-fast ease-out hover:bg-background focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid] active:bg-mk-hover"
                                >
                                    <span className="font-semibold">
                                        {a.title}
                                    </span>
                                    <span className="text-mk-note text-muted-foreground">
                                        {a.area}
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="m-0 rounded-[14px] border border-border bg-card px-5 py-3.5 text-mk-faq text-mk-copy">
                        Nothing matches that yet. Write to{" "}
                        <a
                            href={`mailto:${HELP_EMAIL}`}
                            className="cursor-pointer rounded-sm font-semibold text-brand-700 underline-offset-[3px] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]"
                        >
                            {HELP_EMAIL}
                        </a>{" "}
                        and a person will answer.
                    </p>
                )}
            </div>
        </div>
    );
}

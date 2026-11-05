"use client";

import Link from "next/link";
import { useState } from "react";

import { Chip } from "@/components/shared/chip";
import type { ChangelogEntry } from "@/content/changelog";
import { CHANGELOG, changelogPath } from "@/content/changelog";

import { EntryBody, EntryMeta } from "./changelog-entry";

const FILTERS = ["All", "Global", "Both"] as const;

export function ChangelogList() {
    const [show, setShow] = useState<(typeof FILTERS)[number]>("All");
    const entries: ChangelogEntry[] = CHANGELOG.filter(
        (e) => show === "All" || e.tag === show,
    );
    return (
        <>
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div role="group" aria-label="Show" className="flex gap-2">
                    {FILTERS.map((f) => (
                        <Chip
                            key={f}
                            on={show === f}
                            onClick={() => setShow(f)}
                        >
                            {f}
                        </Chip>
                    ))}
                </div>
                <a
                    href="/changelog/rss.xml"
                    className="inline-flex min-h-11 items-center text-[15px] md:min-h-0"
                >
                    RSS feed
                </a>
            </div>
            {entries.length ? (
                <div className="flex flex-col border-b border-border">
                    {entries.map((e) => (
                        <article
                            key={e.slug}
                            className="grid gap-3 border-t border-border py-7 md:grid-cols-[200px_minmax(0,1fr)] md:gap-10 md:py-9"
                        >
                            <div className="flex flex-row items-center gap-2.5 md:flex-col md:items-start">
                                <EntryMeta entry={e} />
                            </div>
                            <div className="flex flex-col gap-3">
                                <h2 className="m-0 font-display text-mk-h2-xs font-bold [text-wrap:balance]">
                                    <Link
                                        prefetch={false}
                                        href={changelogPath(e)}
                                        className="no-underline hover:underline"
                                    >
                                        {e.title}
                                    </Link>
                                </h2>
                                <EntryBody entry={e} />
                            </div>
                        </article>
                    ))}
                </div>
            ) : (
                <p className="m-0 border-t border-border py-9 text-[17px] text-mk-copy">
                    Nothing tagged {show} yet.
                </p>
            )}
        </>
    );
}

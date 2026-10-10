import Link from "next/link";

import type { ChangelogEntry } from "@/content/changelog";
import {
    CHANGELOG,
    COMING_NEXT,
    changelogHref,
    entryDate,
    entryDayLong,
} from "@/content/changelog";
import { byComingGroup } from "@/content/coming";

import { Arrow } from "../arrow";

/** The design's row: a 140px date column and the text, wrapping on a phone. */
const ROW = "flex flex-wrap gap-x-8 gap-y-2 border-t border-border";
const DATE_COL = "grid flex-[0_0_140px] content-start gap-1";

/** One entry in the list: the whole row goes to its note (design 1a). */
export function EntryRow({ entry }: { entry: ChangelogEntry }) {
    return (
        <Link
            href={changelogHref(entry.slug)}
            className={`${ROW} group cursor-pointer py-8 text-foreground no-underline transition-colors duration-fast ease-out hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]`}
        >
            <span className={DATE_COL}>
                <time
                    dateTime={entry.publishOn}
                    className="font-mono text-[13px] text-brand-700"
                >
                    {entryDate(entry.publishOn)}
                </time>
                <span className="text-[13px] text-muted-foreground">
                    {entry.kind}
                </span>
            </span>
            <span className="grid min-w-0 flex-[1_1_420px] gap-3">
                <span className="font-display text-[32px] font-bold leading-[1.1] tracking-[-0.03em]">
                    {entry.title}
                </span>
                <span className="text-mk-body leading-[1.65] text-mk-prose">
                    {entry.summary}
                </span>
                <span className="font-semibold text-brand-700 underline-offset-[3px] group-hover:underline group-active:text-foreground">
                    {CHANGELOG.readMore}
                    <Arrow />
                </span>
            </span>
        </Link>
    );
}

/**
 * Before the first entry's day (R15, R16): in its place, the day it comes.
 * Nothing links: there is no entry to open yet.
 */
export function FirstEntrySoon({ day }: { day: string }) {
    return (
        <div className={`${ROW} py-8`}>
            <span className={DATE_COL}>
                <time
                    dateTime={day}
                    className="font-mono text-[13px] text-brand-700"
                >
                    {entryDate(day)}
                </time>
                <span className="text-[13px] text-muted-foreground">
                    Early access
                </span>
            </span>
            <span className="grid min-w-0 flex-[1_1_420px] gap-3">
                <span className="font-display text-[32px] font-bold leading-[1.1] tracking-[-0.03em]">
                    First entry on {entryDayLong(day)}
                </span>
                <span className="text-mk-body leading-[1.65] text-mk-prose">
                    Early access opens that day, and the first entry says
                    everything that&apos;s in it.
                </span>
            </span>
        </div>
    );
}

/** The design's 140px "when" column, in JetBrains Mono. */
const WHEN_COL = "flex-[0_0_140px] font-mono text-[13px]";

/**
 * Coming next: planned work, each row marked and never a link (R16).
 *
 * The rows keep the design's layout. The "when" column holds the group's
 * label on a group's first row only (owner, 10 Oct 2026); on the rows after
 * it the column stays as an empty spacer, dropped where the row has wrapped
 * and it would only be a blank line.
 */
export function ComingNextList() {
    return (
        <section
            aria-labelledby="coming-next"
            className="mx-auto grid w-full max-w-[900px] gap-2 px-6 pt-[72px]"
        >
            <h2
                id="coming-next"
                className="m-0 font-display text-[32px] font-bold tracking-[-0.03em]"
            >
                {CHANGELOG.comingTitle}
            </h2>
            <p className="m-0 mb-4 text-mk-faq text-mk-copy">
                {CHANGELOG.comingSub}
            </p>
            <div className="grid">
                {byComingGroup(COMING_NEXT).map((group) => (
                    <ul
                        key={group.key}
                        aria-labelledby={`coming-${group.key}`}
                        className="m-0 grid list-none p-0"
                    >
                        {group.rows.map((item, index) => (
                            <li
                                key={item.name}
                                className="flex flex-wrap items-baseline gap-x-8 gap-y-2 border-t border-border py-5"
                            >
                                {index === 0 ? (
                                    <h3
                                        id={`coming-${group.key}`}
                                        className={`${WHEN_COL} m-0 font-normal text-muted-foreground`}
                                    >
                                        {group.label}
                                    </h3>
                                ) : (
                                    <span
                                        aria-hidden="true"
                                        className={`${WHEN_COL} max-sm:hidden`}
                                    />
                                )}
                                <span className="grid min-w-0 flex-[1_1_380px] gap-1">
                                    <span className="text-[17px] font-semibold">
                                        {item.name}
                                    </span>
                                    <span className="text-[15px] leading-[1.55] text-mk-copy">
                                        {item.line}
                                    </span>
                                </span>
                                <span className="rounded-full border border-border-strong px-2.5 py-1 text-[12.5px] font-semibold text-muted-foreground">
                                    {CHANGELOG.notYet}
                                </span>
                            </li>
                        ))}
                    </ul>
                ))}
            </div>
        </section>
    );
}

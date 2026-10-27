import Link from "next/link";

import type { ChangelogEntry } from "@/content/changelog";
import {
    CHANGELOG,
    changelogHref,
    entryDate,
    entryDayLong,
} from "@/content/changelog";
import { COMING } from "@/content/coming";
import { ring } from "@/lib/ring";

import { Container } from "../shared/layout/container";
import { Arrow } from "../shared/links/arrow";
import { ComingList } from "../shared/sections/coming-list";

/** The design's row: a 140px date column and the text, wrapping on a phone. */
const ROW = "flex flex-wrap gap-x-8 gap-y-2 border-t border-border";
const DATE_COL = "grid flex-[0_0_140px] content-start gap-1";

/** One entry in the list: the whole row goes to its note (design 1a). */
export function EntryRow({ entry }: { entry: ChangelogEntry }) {
    return (
        <Link
            href={changelogHref(entry.slug)}
            className={`${ROW} group cursor-pointer py-8 text-foreground no-underline transition-colors duration-fast ease-out hover:text-foreground ${ring({ offset: 4 })}`}
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

/** Coming next: the one roadmap list, as the changelog draws it. */
export function ComingNextList() {
    return (
        <Container
            as="section"
            width="list"
            aria-labelledby="coming-next"
            className="grid gap-2 pt-[72px]"
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
            <ComingList items={COMING} idPrefix="coming" />
        </Container>
    );
}

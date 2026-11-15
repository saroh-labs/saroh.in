import { Arrow } from "@saroh/marketing/arrow";
import { cn } from "@saroh/marketing/cn";
import { SwipeRow } from "@saroh/marketing/kit/swipe-row";
import { Pill } from "@saroh/marketing/pill";
import { ring } from "@saroh/marketing/ring";
import { TextLink } from "@saroh/marketing/text-link";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Rich } from "./rich";

export interface ChapterLink {
    label: string;
    href: string;
    isNew?: boolean;
}

/** A Read more link: an outline pill with an arrow, the board's chip. */
export function MoreChip({
    link,
    newTag,
    onInk = false,
}: {
    link: ChapterLink;
    newTag: string;
    onInk?: boolean;
}) {
    return (
        <Link
            href={link.href}
            className={cn(
                "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-[10px] border px-4 text-[15px] font-semibold no-underline transition-colors duration-fast ease-out",
                onInk
                    ? "border-mk-ledger-muted/50 text-mk-ledger-fg hover:border-mk-ledger-fg"
                    : "border-border-strong bg-card text-foreground hover:border-foreground",
                ring(),
            )}
        >
            {link.label}
            {link.isNew ? (
                <Pill tone="soon" className="text-[12px]">
                    {newTag}
                </Pill>
            ) : null}
            <Arrow />
        </Link>
    );
}

/**
 * One ownership chapter (board HWDesk): its h2 and lead side by side, three
 * drawn crops each with its caption (a swipe row on a phone), then "Read
 * more" and its links. On a phone the links fold into "Orders and 6 more",
 * a `<details>` that is open from 760px (`mk-fold`), so they stay in the
 * HTML either way.
 */
export function Chapter({
    id,
    title,
    lead,
    panels,
    captions,
    readMore,
    more,
    andMore,
    aside,
    newTag,
    of,
    onInk = false,
    before,
}: {
    id: string;
    title: string;
    lead: string;
    panels: readonly ReactNode[];
    captions: readonly { title: string; body: string }[];
    readMore: string;
    more: readonly ChapterLink[];
    andMore: string;
    aside?: ChapterLink;
    newTag: string;
    of: string;
    /** On the ledger band: light words. */
    onInk?: boolean;
    /** A drawing between the heading and the crops (how money moves). */
    before?: ReactNode;
}) {
    const titleId = `${id}-title`;
    return (
        <div
            id={id}
            className="grid scroll-mt-[calc(var(--mk-nav-h)+16px)] grid-cols-[minmax(0,1fr)] gap-10 min-[760px]:gap-14"
        >
            <div className="grid gap-4 min-[960px]:grid-cols-2 min-[960px]:items-end min-[960px]:gap-12">
                <h2
                    id={titleId}
                    className="m-0 font-display text-mk-kit-h2 font-bold [text-wrap:balance]"
                >
                    {title}
                </h2>
                <p
                    className={cn(
                        "m-0 text-mk-kit-lead [text-wrap:pretty]",
                        onInk
                            ? "text-mk-ledger-fg/90 [&_b]:text-mk-ledger-fg"
                            : "text-mk-copy",
                    )}
                >
                    <Rich text={lead} />
                </p>
            </div>
            {before}
            <SwipeRow
                label={title}
                of={of}
                className={onInk ? "[&>p]:text-mk-ledger-muted" : undefined}
            >
                {panels.map((panel, i) => (
                    <figure key={i} className="m-0 grid gap-5">
                        <div aria-hidden>{panel}</div>
                        <figcaption className="grid gap-1.5">
                            <b className="font-sans text-[18px] font-semibold">
                                {captions[i]?.title}
                            </b>
                            <span
                                className={cn(
                                    "text-[16px] leading-normal",
                                    onInk
                                        ? "text-mk-ledger-fg/85"
                                        : "text-mk-copy",
                                )}
                            >
                                {captions[i]?.body}
                            </span>
                        </figcaption>
                    </figure>
                ))}
            </SwipeRow>
            {more.length || aside ? (
                <div
                    className={cn(
                        "flex flex-wrap items-center justify-between gap-4 min-[760px]:border-t min-[760px]:pt-7",
                        onInk ? "border-mk-ledger-muted/30" : "border-border",
                    )}
                >
                    {more.length === 1 && more[0] ? (
                        <div className="flex flex-wrap items-center gap-2.5">
                            <span
                                className={cn(
                                    "hidden text-[15px] min-[760px]:inline min-[760px]:pr-2",
                                    onInk
                                        ? "text-mk-ledger-muted"
                                        : "text-muted-foreground",
                                )}
                            >
                                {readMore}
                            </span>
                            <MoreChip
                                link={more[0]}
                                newTag={newTag}
                                onInk={onInk}
                            />
                        </div>
                    ) : more.length ? (
                        <details className="mk-fold group min-w-0">
                            <summary
                                className={cn(
                                    "inline-flex min-h-11 cursor-pointer list-none items-center gap-2 font-semibold underline decoration-1 underline-offset-[3px] min-[760px]:hidden [&::-webkit-details-marker]:hidden",
                                    onInk
                                        ? "decoration-mk-ledger-muted"
                                        : "decoration-border-strong",
                                    ring(),
                                )}
                            >
                                {andMore}
                                <ChevronDown
                                    aria-hidden
                                    className="size-4 transition-transform group-open:rotate-180"
                                />
                            </summary>
                            <div className="mt-3 flex flex-wrap items-center gap-2.5 min-[760px]:mt-0">
                                <span
                                    className={cn(
                                        "hidden text-[15px] min-[760px]:inline min-[760px]:pr-2",
                                        onInk
                                            ? "text-mk-ledger-muted"
                                            : "text-muted-foreground",
                                    )}
                                >
                                    {readMore}
                                </span>
                                {more.map((link) => (
                                    <MoreChip
                                        key={link.label}
                                        link={link}
                                        newTag={newTag}
                                        onInk={onInk}
                                    />
                                ))}
                            </div>
                        </details>
                    ) : (
                        <span />
                    )}
                    {aside ? (
                        <TextLink
                            href={aside.href}
                            tone={onInk ? "on-ink" : "ink"}
                            arrow
                        >
                            {aside.label}
                        </TextLink>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

/** A group's line above its chapters: "Your records · What you keep: …". */
export function GroupHead({
    name,
    line,
    onInk = false,
}: {
    name: string;
    line: string;
    onInk?: boolean;
}) {
    return (
        <p
            className={cn(
                "m-0 grid gap-1 border-b pb-5 min-[760px]:flex min-[760px]:items-baseline min-[760px]:gap-5",
                onInk ? "border-mk-ledger-muted/30" : "border-border",
            )}
        >
            <b className="font-display text-[20px] font-bold tracking-[-0.02em]">
                {name}
            </b>
            <span
                className={cn(
                    "text-[15px]",
                    onInk ? "text-mk-ledger-fg/85" : "text-mk-copy",
                )}
            >
                {line}
            </span>
        </p>
    );
}

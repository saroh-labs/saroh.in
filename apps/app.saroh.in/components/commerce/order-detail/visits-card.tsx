"use client";

import { cn } from "@saroh/ui/lib/utils";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { cardAttention } from "@/lib/orders/attention";
import type {
    OrderAttention,
    OrderVisit,
    OrderVisits,
} from "@/lib/orders/read";
import {
    VISIT_STATE,
    visitMeta,
    visitsSummary,
    visitStepLabel,
    visitWhen,
} from "@/lib/orders/visits";

import { FailedRead } from "@/components/shared/failed-read";
import { StatusBadge } from "@/components/shared/status-badge";
import { Notice } from "@saroh/ui/notice";
import { FOCUS, Panel, PanelTitle } from "./parts";

/*
 * A treatment's visits on Order Detail (B14, R16), after the "Saroh Order
 * Detail" design (`?id=D301`): the stepper of visits in place of the
 * kitchen's, the Visits card with each visit's date, who takes it, in person
 * or a video call and how it stands, and the header's one next action —
 * "Mark visit N attended" once it has started, or "Book visit N".
 *
 * Every visit write is an existing one: marking goes through the order
 * (`order:stage`), booking through E9's `bookVisit` in New booking, and a
 * visit is moved or cancelled on its booking, which the row opens. Money on
 * a treatment comes back only through the order's refund.
 */

/**
 * What a treatment shows where an order shows its kitchen: the visits'
 * stepper and the Visits card under it. `visits` null: the API couldn't
 * read them, and the card says so.
 */
export function VisitsSection({
    visits,
    refunded,
    ...card
}: {
    visits: OrderVisits | null;
    refunded: boolean;
    first: string;
    attention: OrderAttention | null | undefined;
    canOpenBooking: boolean;
    now: Date;
}) {
    return (
        <>
            {visits ? (
                <VisitsStepper
                    visits={visits}
                    refunded={refunded}
                    now={card.now}
                />
            ) : null}
            <VisitsCard visits={visits} {...card} />
        </>
    );
}

/** The Visits card. `visits` null: the API couldn't read them. */
export function VisitsCard({
    visits,
    first,
    attention,
    canOpenBooking,
    now,
}: {
    visits: OrderVisits | null;
    first: string;
    /** Their Needs attention, as the API let this viewer see it (B15). */
    attention: OrderAttention | null | undefined;
    /** May read bookings: each booked visit opens its booking. */
    canOpenBooking: boolean;
    now: Date;
}) {
    const card = attention ? cardAttention(attention) : null;
    const details = new Map(
        (attention?.entries ?? []).map((e) => [e.id, e.detail]),
    );
    return (
        <Panel aria-labelledby="od-visits" className="grid gap-2.5">
            <div className="flex items-baseline gap-2">
                <PanelTitle id="od-visits" className="flex-1">
                    Visits
                </PanelTitle>
                {visits ? (
                    <span className="text-[12.5px] text-muted-foreground">
                        {visitsSummary(visits)}
                    </span>
                ) : null}
            </div>
            {card?.entries.map((e) => (
                <Notice
                    key={e.id}
                    tone="error"
                    className={e.sensitive ? "print:hidden" : undefined}
                >
                    <strong>{e.text}.</strong>
                    {details.get(e.id) ? ` ${details.get(e.id)}` : null}
                </Notice>
            ))}
            {card?.hidden ? (
                <p className="text-[12px] text-muted-foreground print:hidden">
                    {card.hidden}
                </p>
            ) : null}
            {attention === null ? (
                <Notice role="status">
                    <span className="font-semibold text-foreground">
                        Needs attention: not available.
                    </span>{" "}
                    Check with {first} before the visit.
                </Notice>
            ) : null}
            {visits ? (
                <ol className="grid gap-2.5" aria-label="Visits">
                    {visits.visits.map((v) => (
                        <li
                            key={v.number}
                            className="border-t border-foreground/10 pt-[5px]"
                        >
                            <VisitRow
                                visit={v}
                                first={first}
                                timeZone={visits.service.timezone}
                                now={now}
                                href={
                                    canOpenBooking && v.bookingId
                                        ? `/bookings/${encodeURIComponent(v.bookingId)}`
                                        : null
                                }
                            />
                        </li>
                    ))}
                </ol>
            ) : (
                <FailedRead
                    things="the visits"
                    className="border-t border-foreground/10 pt-2.5"
                />
            )}
        </Panel>
    );
}

/**
 * One visit: its number, when, who and where, and a pill for how it stands.
 * A booked visit opens its booking — where it is moved or cancelled — for
 * someone who may read bookings.
 */
function VisitRow({
    visit: v,
    first,
    timeZone,
    now,
    href,
}: {
    visit: OrderVisit;
    first: string;
    timeZone: string;
    now: Date;
    href: string | null;
}) {
    const state = VISIT_STATE[v.state];
    const when = visitWhen(v, timeZone, now);
    const body = (
        <>
            <span
                aria-hidden
                className={cn(
                    "flex size-[22px] items-center justify-center rounded-full text-[11px] font-bold",
                    v.state === "ATTENDED"
                        ? "bg-foreground text-background"
                        : "bg-muted text-neutral-700 dark:text-muted-foreground",
                )}
            >
                {v.number}
            </span>
            <span className="min-w-0">
                <span className="sr-only">Visit {v.number}: </span>
                <span className="block text-[13px] font-semibold">{when}</span>
                <span className="mt-0.5 block text-[12px] text-muted-foreground">
                    {visitMeta(v, first)}
                </span>
            </span>
            <span className="flex items-center gap-1">
                <StatusBadge
                    tone={state.tone === "brand" ? "active" : state.tone}
                >
                    {state.label}
                </StatusBadge>
                {href ? (
                    <ChevronRight
                        aria-hidden
                        className="size-3.5 text-muted-foreground"
                    />
                ) : null}
            </span>
        </>
    );
    // The li draws the divider and 5px; the row's own 4px makes the
    // design's 9px, and gives a linked row room for its hover fill.
    const grid =
        "grid grid-cols-[26px_minmax(0,1fr)_auto] items-start gap-2.5 py-1";
    if (!href) return <div className={grid}>{body}</div>;
    return (
        <Link
            href={href}
            aria-label={`Visit ${v.number}, ${when}, ${state.label}. Open the booking to move or cancel it.`}
            className={cn(
                FOCUS,
                grid,
                "-mx-2 cursor-pointer rounded-lg px-2 text-foreground transition-colors duration-100 hover:bg-muted active:bg-muted/70 coarse:min-h-11",
            )}
        >
            {body}
        </Link>
    );
}

/**
 * The visits as the page's progress: "Visit 1 · 12 Sep", done in Ink, the
 * next booked one in Saffron — in place of the kitchen's stepper, which an
 * appointment doesn't have.
 */
export function VisitsStepper({
    visits,
    refunded,
    now,
}: {
    visits: OrderVisits;
    refunded: boolean;
    now: Date;
}) {
    const nextBooked = visits.visits.find((v) => v.state === "BOOKED");
    return (
        <div
            role="group"
            aria-label={
                refunded
                    ? "Visits: refunded"
                    : `Visits: ${visitsSummary(visits)}`
            }
            className="px-0.5 pt-0.5"
        >
            <ol className="flex flex-wrap items-center gap-2">
                {visits.visits.map((v, i) => {
                    const done = v.state === "ATTENDED";
                    const current = !refunded && v === nextBooked;
                    return (
                        <li
                            key={v.number}
                            aria-current={current ? "step" : undefined}
                            className="contents"
                        >
                            <span className="inline-flex items-center gap-[7px]">
                                <span
                                    aria-hidden
                                    className={cn(
                                        "size-2.5 shrink-0 rounded-full",
                                        done && "bg-foreground",
                                        current &&
                                            "bg-highlight ring-[3px] ring-brand-subtle",
                                        !done &&
                                            !current &&
                                            "border-[1.5px] border-border-strong",
                                    )}
                                />
                                <span
                                    className={cn(
                                        "whitespace-nowrap text-[12px]",
                                        current
                                            ? "font-bold text-foreground"
                                            : done
                                              ? "font-medium text-foreground"
                                              : "font-medium text-muted-foreground",
                                    )}
                                >
                                    {visitStepLabel(
                                        v,
                                        visits.service.timezone,
                                        now,
                                    )}
                                </span>
                            </span>
                            {i < visits.visits.length - 1 ? (
                                <span
                                    aria-hidden
                                    className={cn(
                                        "h-0.5 min-w-3 flex-[1_1_12px]",
                                        done ? "bg-foreground" : "bg-border",
                                    )}
                                />
                            ) : null}
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}

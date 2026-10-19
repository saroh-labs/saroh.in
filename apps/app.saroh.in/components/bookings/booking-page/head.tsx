"use client";

import { Button } from "@saroh/ui/button";
import { PageHeader } from "@saroh/ui/page-header";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import type { MoreRow } from "@/components/bookings/calendar/quick-look-more";
import type { StatusTone } from "@/components/shared/status-badge";
import { StatusBadge } from "@/components/shared/status-badge";

import { PageMore } from "./main-action";

/**
 * The top of a booking's page (U12; BKMBookingDetail, BKDBooking): back
 * to All bookings (with "…" for More on a phone), the badge and how it
 * came to be, then the day and time as the page's title, with what and
 * with whom under it, times labelled in the business's zone (Q10). At a
 * desk the actions sit on the title's line: the main one, Move, More.
 */
export function PageHead({
    badge,
    origin,
    day,
    time,
    who,
    what,
    more,
    actions,
}: {
    badge: { label: string; tone: StatusTone };
    /** "Moved once · booked by Meera", or null. */
    origin: string | null;
    /** "Today, Mon 19 Oct". */
    day: string;
    /** "11:30 am to 12:15 pm". */
    time: string;
    who: string;
    /** "Physio assessment with Meera Iyer · 45 min · times in IST". */
    what: string;
    more: { title: string; rows: readonly MoreRow[] };
    /** The desk's: the main action and Move. */
    actions: ReactNode;
}) {
    return (
        <>
            <div className="mb-2.5 flex items-center justify-between gap-2">
                <Link
                    href="/bookings/all"
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-sm text-[12.5px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-[760px]:min-h-0"
                >
                    <ArrowLeft aria-hidden className="size-3.5" />
                    All bookings
                </Link>
                <span className="min-[760px]:hidden">
                    <PageMore
                        title={more.title}
                        rows={more.rows}
                        trigger={
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label="More"
                                className="size-11"
                            >
                                <MoreHorizontal
                                    aria-hidden
                                    className="size-5"
                                />
                            </Button>
                        }
                    />
                </span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
                <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                {origin ? (
                    <span
                        data-ph-mask=""
                        className="text-[12.5px] text-muted-foreground"
                    >
                        {origin}
                    </span>
                ) : null}
            </div>

            <PageHeader
                className="mt-2 min-[760px]:mb-[18px]"
                holdsData
                title={
                    <>
                        <span className="max-[759px]:block max-[759px]:text-[28px] max-[759px]:leading-[1.1]">
                            {day}
                        </span>
                        <span className="max-[759px]:hidden"> · </span>
                        <span className="tabular-nums max-[759px]:block max-[759px]:text-[22px] max-[759px]:font-medium">
                            {time}
                        </span>
                    </>
                }
                description={
                    <>
                        <span className="hidden min-[760px]:inline">
                            {who} ·{" "}
                        </span>
                        {what}
                    </>
                }
                actions={
                    <div
                        data-desk-actions=""
                        className="hidden flex-wrap items-center gap-2 min-[760px]:flex"
                    >
                        {actions}
                        <PageMore title={more.title} rows={more.rows} />
                    </div>
                }
            />
        </>
    );
}

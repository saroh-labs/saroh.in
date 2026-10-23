"use client";

import { Button } from "@saroh/ui/button";
import { TextLink } from "@saroh/ui/text-link";
import Link from "next/link";
import { useId, useState } from "react";

import type { PhoneNext } from "@/lib/home/phone-home";
import { daySheetTitle } from "@/lib/home/phone-home";
import type { HomeToday } from "@/lib/home/service";

import { Today, useTodayMarks } from "@/components/home/dashboard/today";
import { HomeSheet } from "./home-sheet";
import { PhoneNextLine } from "./phone-next-line";

export interface SinceLink {
    key: string;
    label: string;
    href: string;
}

/**
 * The phone Home's Next line and the day it opens (DEC-171, plan U17,
 * board `HPMore` "the day"): "Since yesterday" (the header's Last 24
 * hours, each a link to exactly the rows it counts), the day's bookings,
 * classes and pick-ups in time order with Mark arrived and Didn't come
 * held for Undo (the desk's `Today`, unchanged), "2 more later today",
 * and Open the calendar.
 */
export function DaySheet({
    next,
    today,
    since,
    date,
    now,
    emptyNext,
}: {
    next: PhoneNext;
    today: HomeToday | null;
    since: readonly SinceLink[];
    /** The business's date, "2026-10-19", for the title. */
    date: string | null;
    now: string;
    /** Under "Nothing booked today.": the next booking. */
    emptyNext: string | null;
}) {
    const [open, setOpen] = useState(false);
    // Held here, not in the sheet: closing it within the ten seconds keeps
    // the mark and its Undo, rather than sending it on the way out.
    const marks = useTodayMarks(today?.zone ?? "UTC");
    const calendar =
        today && !today.bookings ? "/commerce/orders" : "/calendar";
    return (
        <HomeSheet
            name="day"
            open={open}
            onOpenChange={setOpen}
            title={daySheetTitle(date)}
            trigger={<PhoneNextLine next={next} />}
            foot={
                <Button asChild variant="outline" className="w-full">
                    <Link href={calendar}>
                        {today && !today.bookings
                            ? "All orders"
                            : "Open the calendar"}
                    </Link>
                </Button>
            }
        >
            <SinceYesterday links={since} />
            {today ? (
                <Today
                    today={today}
                    now={now}
                    layout="sheet"
                    emptyNext={emptyNext}
                    marks={marks}
                />
            ) : (
                <p className="text-sm text-muted-foreground">{next.sub}</p>
            )}
        </HomeSheet>
    );
}

/**
 * "Since yesterday": the header's Last 24 hours on a phone, every figure
 * a link to the rows it counts. Nothing on a quiet day or for a new
 * business, never zeros.
 */
export function SinceYesterday({ links }: { links: readonly SinceLink[] }) {
    const labelId = useId();
    if (links.length === 0) return null;
    return (
        <div
            role="group"
            aria-labelledby={labelId}
            data-since-yesterday=""
            className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1 text-[13px]"
        >
            <span id={labelId} data-ph-unmask="" className="label">
                Since yesterday
            </span>
            {links.map((link) => (
                <TextLink
                    key={link.key}
                    href={link.href}
                    className="coarse:min-h-11"
                >
                    {link.label}
                </TextLink>
            ))}
        </div>
    );
}

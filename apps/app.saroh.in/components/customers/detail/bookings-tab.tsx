"use client";

import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";
import { useState } from "react";

import type { DetailBooking } from "@/lib/customer-workspace/detail";
import type { BookingFilter } from "@/lib/customer-workspace/view";
import {
    BOOKINGS_EMPTY,
    bookingLists,
    bookingRow,
} from "@/lib/customer-workspace/view";

import { Chips, Empty, ROW_LINK, RowPill } from "./parts";

/**
 * Their bookings: upcoming, past, and the no-shows and late cancels on
 * their own — the ones a front desk asks about. Each row opens the booking.
 */
export function BookingsTab({
    bookings,
    now,
}: {
    bookings: { upcoming: DetailBooking[]; past: DetailBooking[] };
    now: Date;
}) {
    const lists = bookingLists(bookings);
    const [filter, setFilter] = useState<BookingFilter>(
        lists.up.list.length ? "up" : "past",
    );
    const { list, upcoming } = lists[filter];
    const chips: { key: BookingFilter; label: string }[] = [
        { key: "up", label: `Upcoming · ${lists.up.list.length}` },
        { key: "past", label: `Past · ${lists.past.list.length}` },
        {
            key: "issue",
            label: `No-shows and late cancels · ${lists.issue.list.length}`,
        },
    ];
    return (
        <>
            <Chips
                label="Which bookings"
                value={filter}
                onChange={setFilter}
                chips={chips}
                height={32}
            />
            {!list.length ? <Empty>{BOOKINGS_EMPTY[filter]}</Empty> : null}
            <div className="flex flex-col gap-2">
                {list.map((b) => {
                    const r = bookingRow(b, upcoming, now);
                    return (
                        <Link
                            key={b.id}
                            href={`/bookings/${b.id}`}
                            className={cn(ROW_LINK, "gap-3.5 py-[11px]")}
                        >
                            <div className="flex-[0_0_92px]">
                                <div className="text-[13px] font-semibold">
                                    {r.day}
                                </div>
                                <div className="text-[12px] tabular-nums text-muted-foreground">
                                    {r.at}
                                </div>
                            </div>
                            <div className="min-w-0 flex-[2_1_180px]">
                                <div className="text-[14px] font-semibold">
                                    {r.what}
                                </div>
                                {r.with ? (
                                    <div className="mt-0.5 text-[12px] text-muted-foreground">
                                        {r.with}
                                    </div>
                                ) : null}
                            </div>
                            <div
                                className={cn(
                                    "min-w-0 flex-[2_1_180px] text-[12.5px]",
                                    r.issue
                                        ? "text-destructive-subtle-foreground"
                                        : "text-foreground/75",
                                )}
                            >
                                {r.pay}
                            </div>
                            <RowPill tone={r.state.tone}>
                                {r.state.label}
                            </RowPill>
                        </Link>
                    );
                })}
            </div>
        </>
    );
}

"use client";

import { Button } from "@saroh/ui/button";
import { MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { OptionsSheet } from "@/components/bookings/calendar/header/options-sheet";
import { useBookingsOpens } from "@/components/bookings/calendar/header/use-bookings-opens";
import type { BookingsOpens, ShowFor } from "@/lib/services/bookings-opens";
import { rememberLastView } from "@/lib/services/bookings-opens";
import { callName } from "@/lib/services/call-name";

/**
 * The "…" of the List (BKVKept: "kept in both views, in the same place"):
 * the calendar's own sheet with the same items, Show cancelled bookings
 * (here: each day's fold open), Hours and time off, Start Bookings on, Show
 * bookings for, and what the colours mean. Being drawn also keeps List as
 * the view Bookings was left on, for "Where I left it" on this device.
 */
export function ListOptions({
    opens: kept,
    me,
    showCancelled,
}: {
    opens: BookingsOpens;
    /** The viewer on the diary, for "Just me"; null when they aren't on it. */
    me: { id: string; name: string } | null;
    showCancelled: boolean;
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const { opens, change } = useBookingsOpens(kept);
    useEffect(() => rememberLastView("list"), []);

    const setCancelled = (on: boolean) => {
        const url = new URL(window.location.href);
        if (on) url.searchParams.set("cancelled", "1");
        else url.searchParams.delete("cancelled");
        router.replace(`${url.pathname}${url.search}`, { scroll: false });
    };

    return (
        <OptionsSheet
            open={open}
            onOpenChange={setOpen}
            trigger={
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="This list: show cancelled, hours, start on, colours"
                    className="shrink-0 max-[759px]:size-11 max-[759px]:rounded-full"
                >
                    <MoreHorizontal aria-hidden className="size-[18px]" />
                </Button>
            }
            title="This list"
            summary="Every booking, by day"
            cancelled={{
                shown: showCancelled,
                onChange: setCancelled,
                line: "Opens each day's cancelled bookings",
            }}
            hours={{
                href: "/bookings/availability",
                label: "Hours and time off",
            }}
            start={opens.start}
            onStart={(start) => void change({ start })}
            showFor={opens.showFor}
            onShowFor={(showFor: ShowFor) => void change({ showFor })}
            me={me ? callName(me.name) : null}
            whoNow="everyone"
        />
    );
}

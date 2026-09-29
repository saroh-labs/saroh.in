"use client";

import { Button } from "@saroh/ui/button";
import { PartialNotice } from "@saroh/ui/data-state";
import { useRouter } from "next/navigation";

import type { CalendarMonth } from "@/lib/calendar/types";

const listed = (labels: string[]) =>
    labels.length < 2
        ? (labels[0] ?? "")
        : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;

/**
 * The layers that couldn't be read, named with a Try again, over a month or
 * a week that shows everything else. A failed layer is a different state
 * from a failed read, which the segment's boundary shows.
 */
export function CalendarMissing({
    data,
    span,
}: {
    data: CalendarMonth;
    /** "month" or "week": what the rest is still here for. */
    span: string;
}) {
    const router = useRouter();
    const missing = data.unavailable.map((u) => u.label);
    if (missing.length === 0) return null;
    const money = data.takings !== undefined;
    return (
        <PartialNotice
            action={
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.refresh()}
                >
                    Try again
                </Button>
            }
        >
            {listed(missing)} couldn&apos;t be loaded, so{" "}
            {missing.length === 1 ? "it is" : "they are"} missing from this{" "}
            {span} — everything else is here.
            {data.money?.total === null ||
            (money && data.takings?.total === null)
                ? " Money is left out while part of it is missing."
                : ""}
        </PartialNotice>
    );
}

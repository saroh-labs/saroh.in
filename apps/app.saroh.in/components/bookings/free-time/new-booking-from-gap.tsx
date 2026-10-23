"use client";

import { FormSheet } from "@/components/shared/forms/form-sheet";
import { formatClock } from "@/lib/format/datetime";
import { useState } from "react";

import type { BookingPeople } from "@/lib/services/booking-pay";
import type { LocalDate } from "@/lib/services/diary";
import {
    extraHoursAt,
    freeLine,
    GAP_STEP_NAME,
    gapDay,
} from "@/lib/services/free-time";
import type { Service } from "@/lib/services/service";

import { useNarrow } from "@/lib/hooks/use-narrow";
import { firstName } from "@/lib/names";
import { GapForm } from "./gap-form";
import type { GapHead, GapTarget } from "./gap-types";

export type { GapHead, GapTarget };

/**
 * A free time on the calendar (U9, BKMNewFromGap, BKDFromGap; Q11 option
 * A). The person and the time are known, so it asks three short things —
 * the service (each says whether it fits), who it is for, then a check and
 * how they pay — and books. A "Book someone · Block this time" switch at
 * the top blocks the time instead, and a quiet "Close these extra hours"
 * at the foot closes one-off extra opening hours again, only when the
 * time is in them. After booking it says so and offers WhatsApp, SMS and
 * Copy message (Q12): Saroh sends nothing itself.
 *
 * A bottom sheet on a phone, a right-hand panel at a desk (U3). Day,
 * Week and List all open it for a free time.
 */
export function NewBookingFromGap({
    target,
    services,
    people,
    timezone,
    today,
    money,
    canHours = true,
    business = null,
    onClose,
}: {
    target: GapTarget | null;
    services: Service[];
    people: BookingPeople;
    timezone: string;
    /** The business's today, for "today" and "tomorrow". */
    today: LocalDate;
    money: boolean;
    /** `hours:write`: may block the time or close extra hours. */
    canHours?: boolean;
    /** The business, as its customers know it, for the message. */
    business?: string | null;
    onClose: () => void;
}) {
    // The last free time opened stays drawn while the sheet slides away.
    const [shown, setShown] = useState(target);
    if (target && target !== shown) setShown(target);
    const narrow = useNarrow();
    const [head, setHead] = useState<GapHead | null>(null);
    const key = shown
        ? `${shown.staff.id}:${shown.date}:${shown.free[0]}:${shown.free[1]}`
        : "none";
    const [headKey, setHeadKey] = useState(key);
    if (headKey !== key) {
        setHeadKey(key);
        setHead(null);
    }

    const words = shown
        ? heading(shown, head, { narrow, today })
        : { eyebrow: "", title: "", line: "" };

    return (
        <FormSheet
            open={target !== null}
            bottomOnPhone
            eyebrow={
                words.eyebrow ? (
                    <span data-ph-mask="">{words.eyebrow}</span>
                ) : undefined
            }
            title={words.title}
            description={
                words.line ? (
                    <span className="font-medium text-success">
                        {words.line}
                    </span>
                ) : (
                    ""
                )
            }
            onClose={onClose}
        >
            {shown ? (
                <GapForm
                    key={key}
                    target={shown}
                    services={services}
                    people={people}
                    timezone={timezone}
                    today={today}
                    money={money}
                    canHours={canHours}
                    business={business}
                    onHead={setHead}
                    onClose={onClose}
                />
            ) : null}
        </FormSheet>
    );
}

/**
 * The heading (BKMNewFromGap on a phone, BKDFromGap at a desk): over the
 * title, the step on a phone and whose time it is at a desk; the title
 * says what pressing the button will do; under it, how long it is free.
 */
export function heading(
    target: GapTarget,
    head: GapHead | null,
    { narrow, today }: { narrow: boolean; today: LocalDate },
): { eyebrow: string; title: string; line: string } {
    const { staff, date, free } = target;
    const mode = head?.mode ?? "book";
    const step = head?.step ?? 1;
    const at = head?.at ?? free[0];
    const first = firstName(staff.name);
    const day = gapDay(date, today);
    const extra = extraHoursAt(staff, date, free[0]) !== null;
    const who = `${staff.name} · ${extra ? "extra opening hours" : "free time"}`;
    if (head?.booked) {
        return { eyebrow: who, title: "Booked", line: "" };
    }
    if (mode === "block") {
        return {
            eyebrow: narrow ? "" : who,
            title: `Block ${first}, ${day} from ${formatClock(free[0])}`,
            line: freeLine(free, extra),
        };
    }
    return {
        eyebrow: narrow ? `Step ${step} of 3 · ${GAP_STEP_NAME[step]}` : who,
        title: `Book ${first}, ${day} at ${formatClock(at)}`,
        line: freeLine(free, extra),
    };
}

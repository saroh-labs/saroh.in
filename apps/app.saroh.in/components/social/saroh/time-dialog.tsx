"use client";

import { DatePicker } from "@saroh/ui/date-picker";
import { FormDialog } from "@saroh/ui/form-dialog";
import { Label } from "@saroh/ui/label";
import { TextLink } from "@saroh/ui/text-link";
import { TimeSelect } from "@saroh/ui/time-select";
import { useId, useState } from "react";

import { useBusinessZone } from "@/components/shared/dates/business-zone";
import { wallClockToIso, ymd } from "@/lib/courses/sessions";
import { clockValue, localDateKey } from "@/lib/format/datetime";
import { whenWords } from "@/lib/social/saroh-social-view";
import { SOCIAL_WORDS } from "@/lib/social/saroh-social-words";

/** The API takes a time at least two minutes ahead; ask for five. */
const LEAD_MS = 5 * 60_000;

/** A calendar day ("2026-11-19") as the date picker's local Date. */
const dayDate = (key: string) => {
    const [y = 1970, m = 1, d = 1] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
};

/**
 * Pick a time, or Move (S4, S5; Sprout's move dialog): a date and a time
 * in the business's zone, with the next good time one tap away. `onPick`
 * gets the instant; answering false keeps the dialog open.
 */
export function TimeDialog({
    open,
    title,
    saveLabel,
    initial,
    goodTimes,
    onClose,
    onPick,
}: {
    open: boolean;
    title: string;
    saveLabel: string;
    /** Where it starts: an instant (ISO), or a day ("2026-11-19"). */
    initial: string | null;
    goodTimes: readonly string[];
    onClose: () => void;
    onPick: (at: string) => Promise<boolean>;
}) {
    const zone = useBusinessZone();
    const ids = { day: useId(), time: useId() };
    const start = () => {
        const at = initial ?? goodTimes.at(0) ?? null;
        if (!at) return { day: undefined, time: "19:30" };
        if (!at.includes("T")) return { day: dayDate(at), time: "19:30" };
        return {
            day: dayDate(localDateKey(at, zone)),
            time: clockValue(at, zone),
        };
    };
    const [day, setDay] = useState<Date | undefined>(() => start().day);
    const [time, setTime] = useState(() => start().time);
    const [problem, setProblem] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    // Each opening starts again from where it was asked to.
    const [wasOpen, setWasOpen] = useState(open);
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) {
            const s = start();
            setDay(s.day);
            setTime(s.time);
            setProblem(null);
        }
    }

    // When it opened: the good time offered is one still ahead of then.
    const [openedAt] = useState(() => Date.now());
    const good = goodTimes.find((g) => Date.parse(g) > openedAt + LEAD_MS);

    async function save() {
        if (!day) return setProblem(SOCIAL_WORDS.pickDate);
        const at = wallClockToIso(ymd(day), time, zone);
        if (Date.parse(at) < Date.now() + LEAD_MS) {
            return setProblem(SOCIAL_WORDS.tooSoon);
        }
        setProblem(null);
        setBusy(true);
        const ok = await onPick(at).finally(() => setBusy(false));
        if (ok) onClose();
    }

    return (
        <FormDialog
            open={open}
            size="md"
            title={title}
            description={SOCIAL_WORDS.pickWhat(zone)}
            pending={busy}
            saveLabel={saveLabel}
            onClose={onClose}
            onSubmit={() => save()}
        >
            <div className="flex flex-wrap gap-4">
                <div className="grid gap-1.5">
                    <Label htmlFor={ids.day}>{SOCIAL_WORDS.date}</Label>
                    <DatePicker
                        id={ids.day}
                        value={day}
                        onValueChange={setDay}
                        disabledDays={{ before: new Date() }}
                        className="w-[11rem]"
                    />
                </div>
                <div className="grid gap-1.5">
                    <Label htmlFor={ids.time}>{SOCIAL_WORDS.time}</Label>
                    <TimeSelect
                        id={ids.time}
                        value={time}
                        onValueChange={setTime}
                        stepMinutes={15}
                    />
                </div>
            </div>
            {good ? (
                <TextLink
                    onClick={() => {
                        setDay(dayDate(localDateKey(good, zone)));
                        setTime(clockValue(good, zone));
                    }}
                    className="w-fit font-semibold"
                    data-use-good-time=""
                >
                    {SOCIAL_WORDS.goodTimeLink(whenWords(good, zone))}
                </TextLink>
            ) : null}
            {problem ? (
                <p
                    role="alert"
                    className="text-[12.5px] font-medium text-destructive-subtle-foreground"
                >
                    {problem}
                </p>
            ) : null}
        </FormDialog>
    );
}

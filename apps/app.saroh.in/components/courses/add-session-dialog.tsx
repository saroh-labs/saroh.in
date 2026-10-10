"use client";

import { DatePicker } from "@saroh/ui/date-picker";
import { Label } from "@saroh/ui/label";
import { TimeSelect } from "@saroh/ui/time-select";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { FormDialog } from "@/components/shared/form-dialog";
import { runAction } from "@/lib/api/run-action";
import { addSession } from "@/lib/courses/actions";
import type { CourseDetail } from "@/lib/courses/service";
import { wallClockToIso, ymd } from "@/lib/courses/sessions";

/** A week after the last session, at the same time; 18:30 with none yet. */
function nextSession(course: CourseDetail): { day?: Date; time: string } {
    const last = course.sessions.at(-1);
    if (!last) return { day: undefined, time: "18:30" };
    return {
        day: new Date(Date.parse(last.startAt) + 7 * 86_400_000),
        time: new Intl.DateTimeFormat("en-GB", {
            timeZone: course.service.timezone,
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
        }).format(new Date(last.startAt)),
    };
}

/**
 * Add a session to a course: a date and a time, in a dialog like the page's
 * Enrol someone, opened from "Add session" by the Sessions heading. It says
 * who it books before anything happens. A refusal keeps it open with what
 * was chosen; a session added closes it, and the list behind shows it.
 */
export function AddSessionDialog({
    open,
    onOpenChange,
    course,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    course: CourseDetail;
}) {
    const router = useRouter();
    const ids = { day: useId(), time: useId() };
    const [day, setDay] = useState(() => nextSession(course).day);
    const [time, setTime] = useState(() => nextSession(course).time);
    const [busy, setBusy] = useState(false);
    const [tried, setTried] = useState(false);
    const on = course.enrolled;
    const tz = course.service.timezone;

    // Each opening starts from the session after the last one.
    const [wasOpen, setWasOpen] = useState(open);
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) {
            const next = nextSession(course);
            setDay(next.day);
            setTime(next.time);
            setTried(false);
        }
    }

    async function add() {
        setTried(true);
        if (!day) return;
        const res = await runAction(
            () => addSession(course.id, wallClockToIso(ymd(day), time, tz)),
            { setBusy },
        );
        if (!res) return;
        if (!res.ok) return showError(res.error);
        showSuccess(
            on > 0
                ? `Session added. ${on} ${on === 1 ? "person is" : "people are"} booked on it.`
                : "Session added.",
        );
        onOpenChange(false);
        router.refresh();
    }

    return (
        <FormDialog
            open={open}
            size="md"
            title="Add session"
            description={
                on > 0
                    ? `It goes on the schedule for ${course.service.name}, and the ${on === 1 ? "1 person" : `${on} people`} on this course ${on === 1 ? "is" : "are"} booked on it. Times are in ${tz}.`
                    : `It goes on the schedule for ${course.service.name}. Times are in ${tz}.`
            }
            pending={busy}
            saveLabel={on > 0 ? `Add and book ${on}` : "Add session"}
            savingLabel="Adding…"
            onClose={() => onOpenChange(false)}
            onSubmit={add}
        >
            <div className="flex flex-wrap gap-4">
                <div className="grid gap-1.5">
                    <Label htmlFor={ids.day}>Date</Label>
                    <DatePicker
                        id={ids.day}
                        value={day}
                        onValueChange={setDay}
                        className="w-[11rem]"
                    />
                </div>
                <div className="grid gap-1.5">
                    <Label htmlFor={ids.time}>Time</Label>
                    <TimeSelect
                        id={ids.time}
                        value={time}
                        onValueChange={setTime}
                        stepMinutes={15}
                    />
                </div>
            </div>
            {tried && !day ? (
                <p
                    role="alert"
                    className="text-[12.5px] font-medium text-destructive-subtle-foreground"
                >
                    Pick a date.
                </p>
            ) : null}
        </FormDialog>
    );
}

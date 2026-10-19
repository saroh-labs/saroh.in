"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { showError, showUndo } from "@saroh/ui/toast";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";

import { runAction } from "@/lib/api/run-action";
import { addMyself, updateStaff } from "@/lib/staff/actions";

import { firstName } from "@/lib/names";
import { openWeekSentence, weekWords } from "@/lib/staff/day-plan";
import type { WeeklyRange } from "@/lib/staff/types";

import { Face } from "./face";

/**
 * Nobody's hours are set yet (U17, BKMHoursV2Empty, BKDHours "nobody set
 * yet"): "When can customers book Meera?" with the week they would start
 * with — the opening hours, or the usual week — then "Set Meera's hours"
 * (it's just me, in one press, with Undo), "Choose different hours" (the
 * several-days sheet) and "Add someone else who takes bookings". Under
 * them, "Until then": the week customers can book today, from each
 * service's own hours. The business's booking rules stay one row away.
 * Someone who may not put people on the diary reads it and is told who can.
 */
export function FirstHours({
    me,
    week,
    serviceHours,
    canStart,
    busy,
    onSet,
    onChoose,
    onAdd,
    rules,
}: {
    /** The signed-in person's name. */
    me: string;
    /** The week they would start with. */
    week: WeeklyRange[];
    /** The services' own hours together, or null when none has any. */
    serviceHours: WeeklyRange[] | null;
    /** May put people on the diary (`service:write`). */
    canStart: boolean;
    busy: boolean;
    onSet: () => void;
    onChoose: () => void;
    onAdd: () => void;
    /** The Booking rules row. */
    rules: ReactNode;
}) {
    const who = firstName(me) || "you";
    const until = serviceHours?.length ? openWeekSentence(serviceHours) : null;

    const start = (
        <section
            aria-labelledby="first-hours"
            className="rounded-[12px] border border-border bg-card px-4 pb-4 pt-[18px] min-[760px]:grid min-[760px]:gap-3.5 min-[760px]:px-6 min-[760px]:py-[22px]"
        >
            <div className="flex items-center gap-3">
                <Face name={me} size={44} />
                <h2
                    id="first-hours"
                    className="font-display text-[18px] font-semibold leading-tight tracking-[-0.02em]"
                >
                    When can customers book {who}?
                </h2>
            </div>
            <p className="mt-2.5 text-[13.5px] leading-normal text-muted-foreground min-[760px]:mt-0">
                {canStart
                    ? "Nobody's hours are set yet. Start with these, then change any day."
                    : "Nobody's hours are set yet. An owner or admin puts people on the diary."}
            </p>
            <dl className="mt-3 border-t border-border min-[760px]:mt-0 min-[760px]:overflow-hidden min-[760px]:rounded-[12px] min-[760px]:border">
                {weekWords(week).map((w) => (
                    <div
                        key={w.days}
                        className="flex min-h-[34px] items-center justify-between gap-3 border-b border-border/70 text-[13.5px] tabular-nums last:border-b-0 min-[760px]:min-h-[58px] min-[760px]:justify-start min-[760px]:gap-4 min-[760px]:px-[18px] min-[760px]:text-[14.5px]"
                    >
                        <dt className="font-medium min-[760px]:w-[140px] min-[760px]:font-semibold">
                            {w.days}
                        </dt>
                        <dd className={cn(w.closed && "text-muted-foreground")}>
                            {w.hours}
                        </dd>
                    </div>
                ))}
            </dl>
            {canStart ? (
                <div className="mt-3.5 grid gap-1 min-[760px]:mt-0 min-[760px]:flex min-[760px]:gap-2">
                    <Button
                        data-ph-mask=""
                        className="h-12 w-full text-[15px] min-[760px]:w-auto"
                        busy={busy}
                        busyLabel="Setting your hours…"
                        onClick={onSet}
                    >
                        Set {who}&apos;s hours
                    </Button>
                    <Button
                        variant="ghost"
                        className="h-12 w-full text-[15px] min-[760px]:w-auto min-[760px]:border-border min-[760px]:bg-card"
                        disabled={busy}
                        onClick={onChoose}
                    >
                        Choose different hours
                    </Button>
                </div>
            ) : null}
        </section>
    );

    const untilThen = (
        <div className="px-3.5 pb-3.5 pt-3 min-[760px]:p-0">
            <div className="text-[13px] font-semibold min-[760px]:text-[14.5px]">
                Until then
            </div>
            <p className="mt-0.5 text-pretty text-[12.5px] leading-normal text-muted-foreground">
                {until
                    ? `Each service is booked in its own hours. Together they cover ${until}.`
                    : "No service on your booking page has hours, so nothing can be booked yet."}
            </p>
        </div>
    );

    const add = canStart ? (
        <button
            type="button"
            onClick={onAdd}
            className="flex min-h-[52px] w-full cursor-pointer items-center gap-3 border-b border-border bg-card px-3.5 py-2 text-left text-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring min-[760px]:rounded-[12px] min-[760px]:border"
        >
            <Face icon={<Plus aria-hidden className="size-[18px]" />} />
            <span className="flex-1">
                <span className="block text-[14.5px] font-semibold">
                    Add someone else who takes bookings
                </span>
                <span className="block text-[12.5px] text-muted-foreground">
                    A trainer, a teacher, a therapist
                </span>
            </span>
        </button>
    ) : null;

    return (
        <div className="mt-4 grid gap-3 min-[760px]:grid-cols-[minmax(0,1fr)_380px] min-[760px]:items-start min-[760px]:gap-5">
            {start}
            <div className="grid gap-3">
                <div className="overflow-hidden rounded-[14px] border border-border bg-card min-[760px]:grid min-[760px]:gap-3 min-[760px]:overflow-visible min-[760px]:rounded-none min-[760px]:border-0 min-[760px]:bg-transparent">
                    {add}
                    <div className="min-[760px]:rounded-[12px] min-[760px]:border min-[760px]:border-border min-[760px]:bg-card min-[760px]:px-4 min-[760px]:py-3.5">
                        {untilThen}
                    </div>
                </div>
                {rules}
            </div>
        </div>
    );
}

/**
 * "Set Meera's hours": the signed-in person on the diary in one press,
 * with the week shown or the one chosen in "Change several days"; Undo
 * takes them off again (archived, the API's one way off the diary).
 * Answers whether it saved; `onAdded` is told who they are now.
 */
export function useSetMine(onAdded: (staffId: string) => void) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    async function setMine(hours?: WeeklyRange[]): Promise<boolean> {
        const res = await runAction(() => addMyself(hours), { setBusy });
        if (!res) return false;
        if (!res.ok) {
            showError(
                "Couldn't set your hours. Nothing has changed.",
                res.error,
            );
            return false;
        }
        const mine = res.data.staff;
        onAdded(mine.id);
        router.refresh();
        showUndo(
            `${firstName(mine.name) || "Your"}'s hours are set: ${openWeekSentence(hours ?? mine.hours)}.`,
            async () => {
                const back = await updateStaff(mine.id, { status: "ARCHIVED" });
                if (!back.ok) return back;
                router.refresh();
                return { ok: true };
            },
        );
        return true;
    }
    return { busy, setMine };
}

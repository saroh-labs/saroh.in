"use client";

import { Avatar, AvatarFallback, avatarInitials } from "@saroh/ui/avatar";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { Notice } from "@saroh/ui/notice";
import { showUndo } from "@saroh/ui/toast";
import { ArrowRightLeft, UserRoundCog } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { TimePicker } from "@/components/bookings/sheets/time-picker";
import { runAction } from "@/lib/api/run-action";
import { formatDay, formatTime } from "@/lib/format/datetime";
import type { NoticeReach } from "@/lib/messages/notice-reach";
import { firstName } from "@/lib/names";
import { rescheduleBooking } from "@/lib/services/actions";
import type { DiaryBooking } from "@/lib/services/booking-calendar";
import { localDateOf, whoFor } from "@/lib/services/diary";

import { QL_BTN, StepBody, StepFoot, StepHead } from "./quick-look-parts";
import {
    changeToldText,
    isTakenRefusal,
    movedToldText,
} from "./quick-look-state";
import type { QuickLookContext } from "./quick-look-types";
import { freeCancelOf } from "./quick-look-types";

/** "Today, 11:30 am" or "Tue 20 Oct, 10:00 am", in the business's zone. */
export function whenWords(startAt: string, ctx: QuickLookContext): string {
    const today = localDateOf(new Date(ctx.now), ctx.timezone);
    const day = formatDay(localDateOf(startAt, ctx.timezone), {
        weekday: "short",
        year: "never",
        relative: true,
        today,
    });
    return `${day}, ${formatTime(startAt, ctx.timezone)}`;
}

/**
 * "Change Kabir's booking?" (BKMQuickLookStep2, BKDQuickLook "move or
 * cancel?"): moving keeps the customer and what they paid; Cancel asks
 * about the money next; Keep it as it is goes back.
 */
export function ChooseStep({
    booking: b,
    when,
    what,
    paid,
    reach,
    onMove,
    onWho,
    onCancel,
    onBack,
    onClose,
}: {
    booking: DiaryBooking;
    /** "Today · 11:30 am to 12:15 pm". */
    when: string;
    /** "Physio assessment with Meera Iyer". */
    what: string;
    /** "Pays at the visit · ₹500", or null. */
    paid: string | null;
    reach: NoticeReach | null | undefined;
    onMove: () => void;
    /** Change who it's with (#1157); left out on a class. */
    onWho?: () => void;
    onCancel: () => void;
    onBack: () => void;
    onClose: () => void;
}) {
    const who = whoFor(b);
    const whoLabel = b.staff ? "Change who it's with" : "Assign someone";
    const first = firstName(who);
    const keepsPaid =
        b.paidWith === "PAID" ||
        b.paidWith === "PACK" ||
        b.paidWith === "MEMBERSHIP";
    return (
        <>
            <StepHead
                title={
                    first
                        ? `Change ${first}'s booking?`
                        : "Change this booking?"
                }
                onBack={onBack}
                onClose={onClose}
            />
            <StepBody className="grid content-start gap-3.5 pt-2">
                <div className="flex items-center gap-3 rounded-[12px] border border-border bg-card px-3.5 py-3">
                    <Avatar size="panel">
                        <AvatarFallback>{avatarInitials(who)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0">
                        <span className="block text-[14.5px] font-semibold">
                            {when}
                        </span>
                        <span className="block text-[12.5px] text-muted-foreground">
                            {what}
                            {paid ? ` · ${paid}` : ""}
                        </span>
                    </span>
                </div>
                <p className="text-pretty text-[14px] leading-[1.55]">
                    If the time doesn&apos;t work any more, moving it keeps{" "}
                    {first || "them"} as your customer
                    {keepsPaid
                        ? " and keeps what they paid on this booking"
                        : ""}
                    .
                </p>
                <p className="text-[12.5px] leading-[1.5] text-muted-foreground">
                    {changeToldText(reach, first)}
                </p>
                <div className="mt-1 hidden gap-2 min-[760px]:grid">
                    <ChoiceButtons
                        onMove={onMove}
                        who={onWho ? { label: whoLabel, run: onWho } : null}
                        onCancel={onCancel}
                        onBack={onBack}
                    />
                </div>
            </StepBody>
            <StepFoot className="min-[760px]:hidden">
                <ChoiceButtons
                    onMove={onMove}
                    who={onWho ? { label: whoLabel, run: onWho } : null}
                    onCancel={onCancel}
                    onBack={onBack}
                />
            </StepFoot>
        </>
    );
}

function ChoiceButtons({
    onMove,
    who,
    onCancel,
    onBack,
}: {
    onMove: () => void;
    who: { label: string; run: () => void } | null;
    onCancel: () => void;
    onBack: () => void;
}) {
    return (
        <>
            <Button
                type="button"
                className={cn(QL_BTN, "w-full gap-2")}
                onClick={onMove}
            >
                <ArrowRightLeft aria-hidden className="size-[18px]" />
                Move to another time
            </Button>
            {who ? (
                <Button
                    type="button"
                    data-ph-mask=""
                    variant="outline"
                    className={cn(QL_BTN, "w-full gap-2")}
                    onClick={who.run}
                >
                    <UserRoundCog aria-hidden className="size-[18px]" />
                    {who.label}
                </Button>
            ) : null}
            <Button
                type="button"
                variant="outline"
                className={cn(
                    QL_BTN,
                    "w-full text-destructive hover:text-destructive",
                )}
                onClick={onCancel}
            >
                Cancel booking
            </Button>
            <Button
                type="button"
                variant="ghost"
                className={cn(QL_BTN, "w-full")}
                onClick={onBack}
            >
                Keep it as it is
            </Button>
        </>
    );
}

/**
 * "Move Kabir's booking" (BKMQuickLookStep2, BKDQuickLook "move: pick a
 * new time"): U3's one time picker with the same person, "From … → …"
 * once a time is picked, and the move. A time taken meanwhile is said in
 * the picker, which reads the times again; the step stays open.
 */
export function MoveStep({
    booking: b,
    ctx,
    reach,
    onBack,
    onMoved,
    onClose,
}: {
    booking: DiaryBooking;
    ctx: QuickLookContext;
    reach: NoticeReach | null | undefined;
    onBack: () => void;
    onMoved: () => void;
    onClose: () => void;
}) {
    const router = useRouter();
    const [picked, setPicked] = useState<string | null>(null);
    const [taken, setTaken] = useState<string | null>(null);
    const [reload, setReload] = useState(0);
    const [busy, setBusy] = useState(false);
    const [refused, setRefused] = useState<string | null>(null);
    const who = whoFor(b);
    const first = firstName(who);
    const tz = ctx.timezone;
    const now = whenWords(b.startAt, ctx);
    const to = picked ? whenWords(picked, ctx) : null;

    async function move() {
        if (!picked || busy) return;
        const res = await runAction(() => rescheduleBooking(b.id, picked), {
            setBusy,
        });
        if (!res) return;
        if (!res.ok) {
            if (isTakenRefusal(res.error)) {
                setTaken(picked);
                setPicked(null);
                setReload((n) => n + 1);
                setRefused(null);
            } else {
                setRefused(res.error);
            }
            return;
        }
        const day = formatDay(localDateOf(picked, tz), {
            weekday: "short",
            year: "never",
        });
        const told = movedToldText(reach, first);
        onMoved();
        router.refresh();
        showUndo(
            `Moved ${first || "the booking"} to ${day} at ${formatTime(picked, tz)}.${told ? ` ${told}` : ""}`,
            async () => {
                const back = await rescheduleBooking(b.id, b.startAt);
                router.refresh();
                return back;
            },
        );
    }

    return (
        <>
            <StepHead
                line={`Now: ${now.charAt(0).toLowerCase()}${now.slice(1)} · ${b.service.name} · ${b.service.durationMinutes} min`}
                title={first ? `Move ${first}'s booking` : "Move this booking"}
                onBack={onBack}
                onClose={onClose}
            />
            <StepBody className="pt-2">
                {refused ? (
                    <Notice tone="error" className="mb-3">
                        {refused}
                    </Notice>
                ) : null}
                <TimePicker
                    serviceId={b.serviceId}
                    timezone={tz}
                    value={picked}
                    onChange={(startAt) => {
                        setPicked(startAt === b.startAt ? null : startAt);
                        if (startAt) setTaken(null);
                        setRefused(null);
                    }}
                    people={b.staff ? [b.staff] : []}
                    withId={b.staff?.id ?? null}
                    taken={taken}
                    reloadKey={reload}
                    initialDay={localDateOf(b.startAt, tz)}
                    now={ctx.now}
                />
                <p className="mt-2 text-[12.5px] leading-[1.5] text-muted-foreground">
                    Only times{" "}
                    {b.staff ? firstName(b.staff.name) : "the service"}{" "}
                    {b.staff ? "is" : "has"} free and nobody has taken.
                    {freeCancelOf(ctx) !== null
                        ? " Moving keeps the free-cancel time from when it was booked."
                        : ""}
                </p>
            </StepBody>
            <StepFoot>
                {to ? (
                    <p className="text-[13px] text-muted-foreground min-[760px]:hidden">
                        From {now.charAt(0).toLowerCase()}
                        {now.slice(1)} <b className="text-foreground">→ {to}</b>
                    </p>
                ) : null}
                <Button
                    type="button"
                    variant="ghost"
                    className="hidden min-[760px]:inline-flex"
                    onClick={onBack}
                >
                    Back
                </Button>
                {to ? (
                    <p className="hidden flex-1 text-[13px] text-muted-foreground min-[760px]:block">
                        From {now.charAt(0).toLowerCase()}
                        {now.slice(1)} <b className="text-foreground">→ {to}</b>
                    </p>
                ) : (
                    <span
                        aria-hidden
                        className="hidden flex-1 min-[760px]:block"
                    />
                )}
                <Button
                    type="button"
                    data-ph-unmask=""
                    className={cn(QL_BTN, "w-full min-[760px]:w-auto")}
                    disabled={!picked || busy}
                    onClick={() => void move()}
                >
                    {busy
                        ? "Moving…"
                        : picked
                          ? `Move to ${formatTime(picked, tz)}`
                          : "Pick a new time"}
                </Button>
            </StepFoot>
        </>
    );
}

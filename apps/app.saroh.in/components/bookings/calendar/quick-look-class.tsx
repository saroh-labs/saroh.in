"use client";

import { ProgressBar } from "@saroh/ui/progress-bar";

import { formatClock } from "@/lib/format/datetime";
import { formatMoney } from "@/lib/format/money";
import { classCancelText } from "@/lib/messages/notice-reach";
import { calendarHref } from "@/lib/services/calendar-href";
import type { Block, LocalDate } from "@/lib/services/diary";
import { liveSeats } from "@/lib/services/diary";

import { ClassSeats } from "./class-seats";
import type { MoreRow } from "./quick-look-more";
import { QuickLookMore } from "./quick-look-more";
import { Help, StepBody, StepFoot } from "./quick-look-parts";
import type {
    HeldFor,
    QuickLookActions,
    QuickLookContext,
} from "./quick-look-types";

/**
 * A class at a glance (BKMQuickLook "group class", BKDQuickLook): how
 * full it is, who is booked and how each paid, with Mark arrived and
 * Cancel a place on each; More holds Edit this class, See the whole day
 * and Cancel the class, last and in red.
 */
export function ClassLook({
    block,
    date,
    ctx,
    act,
    heldFor,
}: {
    block: Extract<Block, { kind: "class" }>;
    date: LocalDate;
    ctx: QuickLookContext;
    act: QuickLookActions;
    heldFor: HeldFor;
}) {
    const s = block.session;
    const live = liveSeats(s);
    const onPrepaid = live.filter(
        (b) => b.paidWith === "PACK" || b.paidWith === "MEMBERSHIP",
    ).length;
    const price = ctx.money
        ? formatMoney(s.service.priceCents ?? null, s.service.currency ?? null)
        : null;
    const full = live.length >= s.capacity;
    // Several places held back at once is the class being cancelled.
    const held = s.bookings.map((b) => heldFor(b.id)).filter(Boolean);
    const classUndo = live.length === 0 && held.length > 1 ? held[0] : null;
    const cancelled = block.state === "cancelled";
    const canCancelClass = ctx.canBook && live.length > 0;
    const at = formatClock(block.start);

    const rows: MoreRow[] = [
        ...(ctx.canEditService
            ? [
                  {
                      key: "edit",
                      label: "Edit this class",
                      icon: "edit" as const,
                      href: `/services/${s.service.id}`,
                  },
              ]
            : []),
        {
            key: "day",
            label: "See the whole day",
            icon: "day",
            href: calendarHref("agenda", date),
        },
        ...(classUndo
            ? [
                  {
                      key: "undo",
                      label: "Undo cancelling the class",
                      icon: "undo" as const,
                      onSelect: classUndo,
                  },
              ]
            : []),
        ...(canCancelClass
            ? [
                  {
                      key: "cancel",
                      label: "Cancel the class",
                      icon: "cancel" as const,
                      danger: true,
                      onSelect: () => act.cancelClass(live, s.service.name),
                  },
              ]
            : []),
    ];

    return (
        <>
            <StepBody className="min-[760px]:grid min-[760px]:content-start min-[760px]:gap-3.5">
                {!cancelled ? (
                    <div>
                        <div className="flex items-center gap-2.5 min-[760px]:justify-between">
                            <ProgressBar
                                className="flex-1 min-[760px]:hidden"
                                value={live.length}
                                max={s.capacity}
                                tone={full ? "danger" : "success"}
                                label={`${live.length} of ${s.capacity} places booked`}
                            />
                            <span className="text-[13px] font-semibold tabular-nums">
                                {live.length} of {s.capacity} ·{" "}
                                {full
                                    ? "full"
                                    : `${s.capacity - live.length} free`}
                            </span>
                            {price ? (
                                <span className="hidden text-[13px] text-muted-foreground min-[760px]:inline">
                                    {price} a place, or 1 class from a pack
                                </span>
                            ) : null}
                        </div>
                        <ProgressBar
                            className="mt-1.5 hidden min-[760px]:block"
                            value={live.length}
                            max={s.capacity}
                            tone={full ? "danger" : "success"}
                            label={`${live.length} of ${s.capacity} places booked`}
                        />
                        <Help>
                            {price ? (
                                <span className="min-[760px]:hidden">
                                    {price} a place, or 1 class from a
                                    pack.{" "}
                                </span>
                            ) : null}
                            {onPrepaid} of {live.length} places are on a pack or
                            membership.
                            {full ? " Cancelling a place frees one." : ""}
                        </Help>
                    </div>
                ) : null}
                <ClassSeats session={s} ctx={ctx} act={act} heldFor={heldFor} />
                {canCancelClass ? (
                    <Help>
                        Cancelling the class gives back every class paid from a
                        pack or membership. Anyone who paid is refunded by you.{" "}
                        {classCancelText(ctx.notices)}
                    </Help>
                ) : null}
            </StepBody>
            <StepFoot>
                <span aria-hidden className="hidden flex-1 min-[760px]:block" />
                <QuickLookMore
                    title={`${s.service.name}, ${at}`}
                    rows={rows}
                    className="w-full min-[760px]:w-auto"
                />
            </StepFoot>
        </>
    );
}

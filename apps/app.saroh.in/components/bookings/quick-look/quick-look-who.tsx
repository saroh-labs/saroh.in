"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";

import type { SendHeld } from "@/components/bookings/sheets/cancel-sheet";
import type { ChangeWhoTarget } from "@/components/bookings/sheets/change-who";
import {
    ChangeWhoFields,
    changeWhoTitle,
    onlyTo,
    useChangeWho,
} from "@/components/bookings/sheets/change-who";
import type { NoticeReach } from "@/lib/messages/notice-reach";
import type { DiaryBooking } from "@/lib/services/booking-calendar";
import { whoFor } from "@/lib/services/diary";

import { whenWords } from "./quick-look-change";
import { QL_BTN, StepBody, StepFoot, StepHead } from "./quick-look-parts";
import type { QuickLookContext } from "./quick-look-types";

/** The quick look's booking as Change who needs it. */
export function whoTarget(b: DiaryBooking): ChangeWhoTarget {
    return {
        id: b.id,
        serviceId: b.serviceId,
        serviceName: b.service.name,
        startAt: b.startAt,
        who: whoFor(b),
        staff: b.staff ?? null,
    };
}

/**
 * "Change who Kabir's booking is with" / "Assign someone" in the quick
 * look (#1157): the list of who is free at its time, "Change the time
 * too", and the change held ten seconds with Undo on the quick look's own
 * hold, so it outlives the sheet closing.
 */
export function WhoStep({
    booking: b,
    ctx,
    reach,
    send,
    onBack,
    onDone,
    onClose,
}: {
    booking: DiaryBooking;
    ctx: QuickLookContext;
    reach: NoticeReach | null | undefined;
    send: SendHeld;
    onBack: () => void;
    /** Held: the quick look closes. */
    onDone: () => void;
    onClose: () => void;
}) {
    const target = whoTarget(b);
    const state = useChangeWho({
        target,
        timezone: ctx.timezone,
        reach,
        send,
        only: onlyTo(ctx.reassign, b.staff?.id ?? null),
        onDone,
    });
    const now = whenWords(b.startAt, ctx);
    return (
        <>
            <StepHead
                line={`Now: ${now.charAt(0).toLowerCase()}${now.slice(1)} · ${b.service.name}${b.staff ? ` with ${b.staff.name}` : ""}`}
                title={changeWhoTitle(target)}
                onBack={onBack}
                onClose={onClose}
            />
            <StepBody className="pt-2">
                <ChangeWhoFields
                    target={target}
                    state={state}
                    timezone={ctx.timezone}
                    now={ctx.now}
                />
            </StepBody>
            <StepFoot>
                <Button
                    type="button"
                    variant="ghost"
                    className="hidden min-[760px]:inline-flex"
                    onClick={onBack}
                >
                    Back
                </Button>
                <span aria-hidden className="hidden flex-1 min-[760px]:block" />
                <Button
                    type="button"
                    className={cn(QL_BTN, "w-full min-[760px]:w-auto")}
                    disabled={!state.canSave}
                    onClick={state.save}
                >
                    {state.saveLabel}
                </Button>
            </StepFoot>
        </>
    );
}

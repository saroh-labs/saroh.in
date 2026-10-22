"use client";

import { FormSheetBody } from "@/components/shared/forms/form-sheet";
import {
    useOverlaySubmit,
    useToastsAboveFoot,
} from "@/components/shared/forms/overlay-form";
import { Refusal } from "@/components/shared/states/refusal";
import { Segmented } from "@saroh/ui/segmented";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { showPlanRefusal } from "@/components/billing/plan-refusal";
import { makePayLink } from "@/components/bookings/booking-page/pay-link-panel";
import {
    CustomerStep,
    useCustomerFinder,
} from "@/components/bookings/sheets/customer-step";
import { PayChoice } from "@/components/bookings/sheets/pay-choice";
import { runAction } from "@/lib/api/run-action";
import type { CustomerPick } from "@/lib/customers/picker";
import { pickName } from "@/lib/customers/picker";
import { formatClock, formatClockRange } from "@/lib/format/datetime";
import { formatMoney } from "@/lib/format/money";
import { useNarrow } from "@/lib/hooks/use-narrow";
import { firstName } from "@/lib/names";
import { bookByHand } from "@/lib/services/actions";
import type {
    BookingPeople,
    PayChoice as Choice,
    PaidBy,
} from "@/lib/services/booking-pay";
import {
    bookerFor,
    linkShown,
    payInput,
    payProblem,
} from "@/lib/services/booking-pay";
import { zonedInstant } from "@/lib/services/diary";
import type { GapStep } from "@/lib/services/free-time";
import {
    extraHoursAt,
    GAP_NEXT,
    GAP_STEP_NAME,
    gapDay,
    gapDayTitle,
    PICK_A_SERVICE,
    PICK_WHO,
    serviceFit,
    servicesFor,
} from "@/lib/services/free-time";
import type { Service } from "@/lib/services/service";
import { zoneShortName } from "@/lib/services/time-picker";

import { isTakenRefusal } from "@/components/bookings/quick-look/quick-look-state";
import { blockGapTime, closeExtraHours, useGapStarts } from "./gap-actions";
import type { GapBookedInfo } from "./gap-booked";
import { GapBooked } from "./gap-booked";
import {
    BlockFields,
    CheckCard,
    GapFoot,
    ServiceList,
    StepBar,
} from "./gap-parts";
import type { GapHead, GapTarget } from "./gap-types";

/**
 * The free-time sheet's draft (U9): Book someone or Block this time, the
 * three steps, the booking and the booked state. Drawn inside the sheet's
 * frame, so Enter (and Cmd/Ctrl+Enter) runs its one button.
 */
export function GapForm({
    target,
    services,
    people,
    timezone,
    today,
    money,
    canHours,
    business,
    onHead,
    onClose,
}: {
    target: GapTarget;
    services: Service[];
    people: BookingPeople;
    timezone: string;
    today: string;
    money: boolean;
    canHours: boolean;
    business: string | null;
    onHead: (head: GapHead) => void;
    onClose: () => void;
}) {
    const router = useRouter();
    const narrow = useNarrow();
    const { staff, date, free } = target;
    const [mode, setMode] = useState<"book" | "block">("book");
    const [step, setStep] = useState<GapStep>(1);
    const [serviceId, setServiceId] = useState<string | null>(null);
    const [pick, setPick] = useState<CustomerPick | null>(null);
    const [pay, setPay] = useState<Choice>("DESK");
    const [paidBy, setPaidBy] = useState<PaidBy | null>(null);
    const [tried, setTried] = useState(false);
    const [saving, setSaving] = useState(false);
    const [attempt, setAttempt] = useState(() => crypto.randomUUID());
    const [refusal, setRefusal] = useState<string | null>(null);
    const [booked, setBooked] = useState<GapBookedInfo | null>(null);
    const [blockLen, setBlockLen] = useState(free[1] - free[0]);

    const offered = servicesFor(services, staff);
    const starts = useGapStarts(offered, target, timezone);
    const fitOf = (s: Service) =>
        serviceFit(
            s,
            free,
            starts === null ? undefined : s.id in starts ? starts[s.id] : null,
        );
    const chosen = offered.find((s) => s.id === serviceId) ?? null;
    const at = (chosen ? fitOf(chosen).at : null) ?? free[0];
    const extra = canHours ? extraHoursAt(staff, date, free[0]) : null;
    const amount =
        chosen && money
            ? formatMoney(chosen.payCents ?? chosen.priceCents, chosen.currency)
            : null;

    const finder = useCustomerFinder({
        value: pick,
        onPick: (next) => {
            setPick(next);
            setTried(false);
            setStep(3);
        },
        canSearch: people.canSearch,
    });

    useEffect(() => {
        onHead({ mode, step, at, booked: booked !== null });
    }, [onHead, mode, step, at, booked]);

    // A new step takes the keyboard to its start: the search on Who, the
    // step's name otherwise (not on opening: the frame focuses then).
    const body = useRef<HTMLDivElement | null>(null);
    const moved = useRef(false);
    useEffect(() => {
        if (!moved.current) {
            moved.current = true;
            return;
        }
        const el = body.current;
        if (!el) return;
        const search = el.querySelector<HTMLInputElement>(
            'input[type="search"]',
        );
        (search ?? el.querySelector<HTMLElement>("[data-step-name]"))?.focus();
    }, [step, mode, booked]);

    const foot = useRef<HTMLDivElement | null>(null);
    useToastsAboveFoot(foot);

    const missing =
        step === 1 && (!chosen || fitOf(chosen).off)
            ? PICK_A_SERVICE
            : step >= 2 && !bookerFor(pick)
              ? PICK_WHO
              : step === 3
                ? payProblem(pay, paidBy)
                : null;

    function go(next: GapStep) {
        setStep(next);
        setTried(false);
        setRefusal(null);
    }

    async function book() {
        const booker = bookerFor(pick);
        if (!chosen || !booker || saving) return;
        setSaving(true);
        setRefusal(null);
        const startAt = zonedInstant(date, at, timezone).toISOString();
        const res = await runAction(
            () =>
                bookByHand(chosen.id, {
                    startAt,
                    idempotencyKey: attempt,
                    staffId: staff.id,
                    ...payInput(pay, paidBy),
                    ...booker,
                }),
            // Said here, where the choice is.
            { quiet: true, onUnreached: setRefusal },
        );
        if (!res) {
            setSaving(false);
            return;
        }
        if (!res.ok) {
            setSaving(false);
            setAttempt(crypto.randomUUID());
            if (res.plan) {
                // At the plan's bookings-a-month limit: its notice.
                showPlanRefusal(res.plan);
                return;
            }
            if (res.field === "startAt" || isTakenRefusal(res.error)) {
                // The time went while this was open: say so here, and read
                // the calendar again behind the sheet.
                setRefusal(
                    `${formatClock(at)} was just booked by someone else. Close this to see the free times again.`,
                );
                router.refresh();
                return;
            }
            setRefusal(res.error);
            return;
        }
        const link = pay === "LINK" ? await makePayLink(res.data.id) : null;
        setSaving(false);
        setBooked({
            bookingId: res.data.id,
            customer: pick ? pickName(pick) : "",
            phone: pick && pick.kind !== "walk-in" ? pick.phone : null,
            service: chosen.name,
            staffName: staff.name,
            startAt,
            timeZone: timezone,
            when: `${gapDay(date, today)}, ${formatClockRange(at, at + chosen.durationMinutes)}`,
            pay,
            paidBy,
            amount,
            link,
            business,
        });
        router.refresh();
    }

    const after = { onClose, refresh: () => router.refresh() };
    function saveBlock() {
        if (saving) return;
        void blockGapTime(
            { target, minutes: blockLen, timezone, setBusy: setSaving },
            after,
        );
    }
    function closeExtra() {
        if (extra) void closeExtraHours({ target, extra, today }, after);
    }

    async function next() {
        if (booked) return onClose();
        if (mode === "block") return saveBlock();
        if (step === 2 && finder.adding) {
            await finder.add();
            return;
        }
        if (missing) {
            setTried(true);
            return;
        }
        if (step < 3) return go((step + 1) as GapStep);
        await book();
    }
    useOverlaySubmit(() => next(), saving);

    if (booked) {
        return <GapBooked booked={booked} onDone={onClose} />;
    }

    const block = mode === "block";
    const showSwitch = canHours && (!narrow || step === 1);

    return (
        <>
            <FormSheetBody className="block">
                <div ref={body} className="grid min-w-0 gap-3.5">
                    {showSwitch ? (
                        <Segmented
                            label="What to do with this free time"
                            block
                            options={[
                                { value: "book", label: "Book someone" },
                                { value: "block", label: "Block this time" },
                            ]}
                            value={mode}
                            onValueChange={(next) => {
                                setMode(next);
                                setTried(false);
                                setRefusal(null);
                                if (next === "block") setStep(1);
                            }}
                        />
                    ) : null}
                    {block ? (
                        <BlockFields
                            target={target}
                            length={blockLen}
                            onLength={setBlockLen}
                        />
                    ) : (
                        <>
                            <StepBar step={step} name={GAP_STEP_NAME[step]} />
                            {step === 1 ? (
                                <ServiceList
                                    staffName={staff.name}
                                    offered={offered}
                                    loading={starts === null}
                                    fitOf={fitOf}
                                    money={money}
                                    value={serviceId}
                                    onChange={(id) => {
                                        setServiceId(id);
                                        setTried(false);
                                    }}
                                />
                            ) : null}
                            {step === 2 ? (
                                <CustomerStep
                                    finder={finder}
                                    addButtons="own"
                                />
                            ) : null}
                            {step === 3 && chosen && pick ? (
                                <>
                                    <CheckCard
                                        customer={pickName(pick)}
                                        phone={
                                            pick.kind === "walk-in"
                                                ? null
                                                : pick.phone
                                        }
                                        service={chosen}
                                        amount={amount}
                                        when={`${gapDay(date, today)}, ${formatClockRange(at, at + chosen.durationMinutes)}`}
                                        staffName={staff.name}
                                        zone={zoneShortName(
                                            timezone,
                                            zonedInstant(date, at, timezone),
                                        )}
                                        attention={finder.attention}
                                        onService={() => go(1)}
                                        onCustomer={() => go(2)}
                                    />
                                    <PayChoice
                                        value={pay}
                                        onChange={setPay}
                                        paidBy={paidBy}
                                        onPaidByChange={setPaidBy}
                                        offerLink={linkShown(
                                            people,
                                            chosen.priceCents,
                                        )}
                                        canTakePayment={
                                            people.canTakePayment !== false
                                        }
                                        amount={amount}
                                        invalid={tried}
                                    />
                                </>
                            ) : null}
                            <Refusal>{refusal}</Refusal>
                        </>
                    )}
                </div>
            </FormSheetBody>
            <GapFoot
                footRef={foot}
                block={block}
                blockLabel={`Block ${formatClockRange(free[0], Math.min(free[0] + blockLen, 1440))}`}
                message={tried && !block ? missing : null}
                onBack={
                    !block && step > 1 ? () => go((step - 1) as GapStep) : null
                }
                label={
                    step < 3
                        ? GAP_NEXT[step as 1 | 2]
                        : narrow && pick
                          ? `Book ${firstName(pickName(pick))} for ${formatClock(at)}`
                          : "Book"
                }
                busy={saving}
                extra={
                    extra && (block || step === 1 || !narrow)
                        ? {
                              range: `${gapDayTitle(date, today)}, ${formatClockRange(extra.startMinute, extra.endMinute)}`,
                              onClose: closeExtra,
                          }
                        : null
                }
            />
        </>
    );
}

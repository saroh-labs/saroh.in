"use client";

import type { LookId } from "@saroh/block-contract";
import { LOOKS } from "@saroh/block-contract";
import { useEffect, useId, useRef, useState } from "react";

import { DEFAULT_API_URL } from "../api-url";
import { NO_CAPTURE_ATTRS, NO_CAPTURE_CLASS } from "../consent-events";
import { cn } from "../lib/utils";
import type { BusinessReach } from "../reach-links";
import { TestReleaseStopSheet } from "../test-release/test-release-stop";
import { useCloseBooking } from "./book-return";
import type { BookingFlowProps } from "./booking-account";
import { headerFacts, testReleaseBookingLine } from "./flow-helpers";
import { BookingHeader, ClosedCard } from "./flow-parts";
import type { FrameProps } from "./frames/frame-parts";
import { PageFrame } from "./frames/page-frame";
import { PanelFrame } from "./frames/panel-frame";
import { SheetsFrame } from "./frames/sheets-frame";
import type { InlineCodeHandle } from "./inline-code";
import { stepBar } from "./look-bar";
import { LookStepBody } from "./look-body";
import { LookBooked } from "./look-booked";
import { ChosenSoFar, LiveAnswered } from "./look-chosen";
import { LookPaying } from "./look-paying";
import { FRAME_PILL, FRAME_RADII, STEP_HEADING } from "./look-styles";
import type { LookStep } from "./look-words";
import {
    lookGstText,
    lookSteps,
    STEP_NAME,
    stepCount,
    stepCountText,
    stepTitle,
} from "./look-words";
import type { BookingStart } from "./model";
import { visitsOf, whereText } from "./model";
import { asksWho } from "./step-url";
import { BookedCard } from "./steps/booked-card";
import { ExpiredCard } from "./steps/expired-card";
import { WaitlistCard } from "./steps/waitlist-card";
import { useBookingFlow } from "./use-booking-flow";

/**
 * The booking route in a look (DEC-172, KD7–KD9, plan U10): the same
 * steps, API calls and words as Classic, one question at a time, framed as
 * the look frames them — Folio's panel, Quiet's page, Live's sheets
 * (`LOOKS[look].booking`). The engine is `useBookingFlow`, unchanged in
 * what it books, holds and charges; this file only draws it.
 *
 * - The step is in the address (U9): each step's button moves on, Back
 *   goes a step back, and the browser's Back and Forward walk the steps.
 * - Sign-in happens inside Your details, with a code for every email and
 *   the same words for everyone (`inline-code.tsx`). Signed in, it reads
 *   "Booking as Asha · Not you?".
 * - How to pay is its own step where there is a way to choose; its button
 *   says what happens and how much.
 * - Paying says only what is known (`look-paying.tsx`); booked is the
 *   ticket first (`look-booked.tsx`).
 * - Escape and Close leave to the page it was opened from, the choices
 *   kept (`book-return.ts`).
 * - One filled button per view: the step's own. On a phone it sits in the
 *   one bar fixed at the foot.
 */
export function LookBookingFlow(props: BookingFlowProps & { look: LookId }) {
    const {
        page,
        account,
        look,
        visit = null,
        soldBy = null,
        reach = null,
    } = props;
    const apiUrl = props.apiUrl ?? DEFAULT_API_URL;
    const ids = useId();
    const rootRef = useRef<HTMLDivElement>(null);
    const headingRef = useRef<HTMLHeadingElement>(null);
    const codeRef = useRef<InlineCodeHandle>(null);
    const flow = useBookingFlow(
        { ...props, apiUrl },
        { root: rootRef, heading: headingRef },
    );
    const { s, times, words, act, pick } = flow;
    const close = useCloseBooking();
    const { service, zone } = times;
    const { phase, customer } = s;
    const frame = LOOKS[look].booking;

    const facts = headerFacts(visit);
    const callReach: BusinessReach = {
        phone: reach?.phone ?? facts.phone,
        whatsapp: reach?.whatsapp ?? null,
    };
    const paused = page.paused === true;
    const bookable = page.open && page.services.length > 0 && !paused;

    const who =
        !!service &&
        asksWho({
            people: service.staff.length,
            isClass: service.kind === "class",
        });
    const steps = lookSteps({ asksWho: who, asksPay: flow.lookPay });
    const view: LookStep | null =
        phase.kind === "choose" && flow.step !== "done" ? flow.step : null;
    // The count starts at the step they arrived on (VD08a).
    const [from] = useState<LookStep>(() =>
        flow.step === "done" ? "what" : flow.step,
    );
    const countStep: LookStep | null =
        view ??
        (phase.kind === "paying" || phase.kind === "expired" ? "pay" : null);
    const count =
        countStep && steps.includes(countStep)
            ? stepCount(steps, countStep, from)
            : null;

    // What a press of a step's button that can't go yet says, on that
    // step only.
    const [nudged, setNudged] = useState<{
        step: LookStep;
        text: string;
    } | null>(null);
    const nudge = nudged?.step === view ? nudged.text : null;
    const setNudge = (text: string) => {
        if (view) setNudged({ step: view, text });
    };

    // Each step, as it opens, puts focus on its question (U9, U10).
    const first = useRef(true);
    useEffect(() => {
        if (!view) return;
        const heading = rootRef.current?.querySelector<HTMLElement>(
            `[data-look-step="${view}"]`,
        );
        // On arrival only into a dialog (Folio's panel), where focus must
        // go in; a page keeps the browser's own start.
        if (first.current) {
            first.current = false;
            if (frame !== "panel") return;
        }
        heading?.focus();
    }, [view, frame]);

    const go = (next: LookStep | null) => {
        if (!next) return;
        s.sayError(null);
        s.setStepState(next);
    };
    const stepAfter = (step: LookStep): LookStep | null =>
        steps[steps.indexOf(step) + 1] ?? null;
    const stepBefore = (step: LookStep) =>
        steps.indexOf(step) > 0
            ? (steps[steps.indexOf(step) - 1] ?? null)
            : null;

    // Choosing on a step stays on it; its button moves on (VA08a–c).
    const choose = {
        service: (id: string) => {
            pick.service(id);
            s.setStepState("what");
        },
        person: (id: string | null) => {
            pick.person(id);
            s.setStepState("who");
        },
        start: (start: BookingStart | null) => {
            pick.start(start);
            s.setStepState("when");
        },
    };

    const people = times.days?.staff ?? [];
    const personName =
        flow.chosenStart?.staffName ??
        people.find((p) => p.id === times.person)?.name ??
        null;

    // The step's one filled button (`look-bar.ts`).
    const step = stepBar({
        view,
        flow,
        next: view ? stepAfter(view) : null,
        nudge,
        onNudge: setNudge,
        go,
    });
    const bar = step.bar && {
        ...step.bar,
        action: step.bar.action && {
            ...step.bar.action,
            onPress: () => step.press(() => codeRef.current?.press()),
        },
    };

    const top = view ? (
        <ChosenSoFar
            frame={frame}
            flow={flow}
            page={page}
            view={view}
            who={who}
            personName={personName}
            go={go}
        />
    ) : null;
    const earlier =
        frame === "sheets" ? (
            <LiveAnswered
                flow={flow}
                view={view}
                who={who}
                personName={personName}
                go={go}
            />
        ) : null;

    const frameBase: FrameProps = {
        look,
        business: page.businessName,
        label: "Book a time",
        countText: count ? stepCountText(count) : null,
        count,
        stepName: countStep ? STEP_NAME[countStep] : null,
        onBack: view && stepBefore(view) ? () => go(stepBefore(view)) : null,
        onClose: close,
        top,
        heading: view ? (
            <h2
                data-look-step={view}
                tabIndex={-1}
                className={cn(STEP_HEADING[look], "text-site-fg outline-none")}
            >
                {stepTitle(view, service)}
            </h2>
        ) : null,
        children: view ? (
            <LookStepBody
                step={view}
                look={look}
                ids={ids}
                flow={flow}
                page={page}
                account={account}
                callReach={callReach}
                codeRef={codeRef}
                choose={choose}
            />
        ) : null,
        bar,
        earlier,
    };
    // Past choosing (paying, a hold run out): the frame, with the screen's
    // own heading and buttons.
    const outcomeFrame = {
        bar: null,
        onBack: null,
        top: null,
        heading: null,
        earlier: null,
    } satisfies Partial<FrameProps>;
    const Frame =
        frame === "panel"
            ? PanelFrame
            : frame === "page"
              ? PageFrame
              : SheetsFrame;

    const plain = (children: React.ReactNode) => (
        <div style={FRAME_PILL} className="bg-site-bg text-site-fg">
            <div
                style={FRAME_RADII}
                className="mx-auto max-w-[720px] px-5 pb-16 pt-10 min-[700px]:pt-16"
            >
                {children}
            </div>
        </div>
    );

    const addressLine = (visit?.address ?? "")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .join(", ");
    const address = addressLine === "" ? null : addressLine;
    let drawn: React.ReactNode;
    if (phase.kind === "done") {
        drawn = plain(
            <LookBooked
                look={look}
                phase={phase}
                headingRef={headingRef}
                business={page.businessName}
                where={
                    service
                        ? whereText(
                              service,
                              phase.booking,
                              page.services,
                              page.businessName,
                          )
                        : null
                }
                address={address}
                rules={page.rules}
                zone={zone}
                now={flow.now}
                visits={visitsOf(service)}
                soldBy={soldBy}
                email={customer?.email ?? null}
                gst={lookGstText(service)}
                onAgain={pick.again}
            />,
        );
    } else if (phase.kind === "waitlisted") {
        drawn = plain(
            <WaitlistCard
                phase={phase}
                headingRef={headingRef}
                onAgain={pick.again}
            />,
        );
    } else if (phase.kind === "booked") {
        drawn = plain(
            <BookedCard
                lookup={phase.lookup}
                headingRef={headingRef}
                onAgain={pick.again}
            />,
        );
    } else if (!bookable) {
        drawn = plain(
            <ClosedCard
                paused={page.open && page.services.length > 0 && paused}
                businessName={page.businessName}
                phone={facts.phone}
                reach={callReach}
            />,
        );
    } else if (phase.kind === "paying") {
        drawn = (
            <Frame {...frameBase} {...outcomeFrame}>
                <LookPaying
                    look={look}
                    phase={phase}
                    now={flow.now}
                    zone={zone}
                    headingRef={headingRef}
                    serviceName={service?.name ?? ""}
                    business={page.businessName}
                    booker={{
                        name: flow.bookerName,
                        email: customer?.email ?? "",
                        ...(s.phoneNo.trim()
                            ? { phone: s.phoneNo.trim() }
                            : {}),
                    }}
                    busy={s.leaving}
                    onDesk={
                        words.deskOffered
                            ? () => void act.leaveHold("desk")
                            : undefined
                    }
                    onBack={() => void act.leaveHold("choose")}
                    onPaid={() => {
                        s.setPhase((p) =>
                            p.kind === "paying"
                                ? { ...p, checkoutPaid: true }
                                : p,
                        );
                        flow.checkHold();
                    }}
                    apiUrl={apiUrl}
                />
            </Frame>
        );
    } else if (phase.kind === "expired") {
        drawn = (
            <Frame {...frameBase} {...outcomeFrame}>
                <ExpiredCard
                    when={phase.when}
                    business={page.businessName}
                    checkoutPaid={phase.checkoutPaid}
                    reach={callReach}
                    headingRef={headingRef}
                    onAgain={act.backToChoosing}
                />
            </Frame>
        );
    } else {
        drawn = <Frame {...frameBase} />;
    }

    return (
        <div
            ref={rootRef}
            {...NO_CAPTURE_ATTRS}
            data-booking-step={flow.step}
            data-booking-look={look}
            className={cn(
                "bg-site-bg text-site-fg min-h-[60vh]",
                NO_CAPTURE_CLASS,
            )}
        >
            {/* Behind Folio's panel: the booking page's own head. */}
            {frame === "panel" &&
            bookable &&
            (view || phase.kind === "paying" || phase.kind === "expired") ? (
                <BookingHeader
                    services={page.services}
                    facts={facts}
                    businessName={page.businessName}
                    timezone={page.timezone}
                />
            ) : null}
            {drawn}
            <TestReleaseStopSheet
                open={s.testStop}
                live={testReleaseBookingLine({
                    serviceName: service?.name ?? "",
                    whenText: flow.whenText,
                    waitlist: flow.waitMode === "join",
                    pay: words.pay,
                    payingNow: words.payingNow,
                })}
                nothing="booked"
                back="Back"
                onClose={() => s.setTestStop(false)}
            />
        </div>
    );
}

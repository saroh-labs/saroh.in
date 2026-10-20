"use client";

import { useId, useRef } from "react";

import { SignInSheet } from "../account/sign-in-sheet";
import { DEFAULT_API_URL } from "../api-url";
import { NO_CAPTURE_ATTRS, NO_CAPTURE_CLASS } from "../consent-events";
import { cn } from "../lib/utils";
import type { BusinessReach } from "../reach-links";
import { SitePageState } from "../shop/page-state";
import { TestReleaseStopSheet } from "../test-release/test-release-stop";
import type { BookingFlowProps } from "./booking-account";
import { ChooseSteps } from "./choose-steps";
import { headerFacts, testReleaseBookingLine } from "./flow-helpers";
import { FlowOutcome } from "./flow-outcome";
import { BookingHeader, ClosedCard } from "./flow-parts";
import type { Phase } from "./flow-state";
import { NAME_LEFT } from "./flow-words";
import { LookBookingFlow } from "./look-flow";
import { visitsOf } from "./model";
import { PhoneBar, SummaryAside } from "./summary";
import { useBookingFlow } from "./use-booking-flow";

export { accountPhone } from "./booking-account";
export type { BookingAccount, BookingFlowProps } from "./booking-account";

/**
 * The customer's booking page on a merchant's site (U19), `/<domain>/book`:
 * what → who (when more than one person takes it) → when → who they are →
 * how they pay → booked, with a summary beside it (a bar pinned to the
 * bottom on a phone).
 *
 * **The step is in the address** (site templates v2 U9, KD7):
 * `?service=…&staff=…&date=…&start=…&step=what|who|when|details|pay|done`,
 * moved with the History API, so Back and Forward walk the steps with no
 * server render, a reload stays where it was, and a link opens on its step
 * — or the earliest one whose choices are missing. Nothing private goes in
 * it (`step-url.ts`). This page keeps its look (Classic): every step it has
 * reached is drawn one under the other, as before.
 *
 * Sign-in is always on (A9, ADR-011): the last step signs in with a code,
 * and the booking is made the moment it checks. Pay now holds the place for
 * 15 minutes while the booker pays through the business's own provider;
 * Back from paying keeps the hold (U9). A class credit is offered first
 * (A10); a full class offers its waitlist (A12).
 *
 * The state lives in hooks beside this file (`use-times`, `use-kept-choice`,
 * `use-hold-watch`, `use-booking-actions`, `use-step-history`); the words
 * about paying are `flow-words.ts`, and the drawing is in `steps/`.
 *
 * Drawn from `--site-*` only (gate G2): the merchant's palette, never
 * Saroh's. Nothing here promises an email or a text — Saroh sends neither.
 */

export default function BookingFlow(props: BookingFlowProps) {
    // A look draws the same steps in its own frame (DEC-172, U10).
    return props.look ? (
        <LookBookingFlow {...props} look={props.look} />
    ) : (
        <ClassicBookingFlow {...props} />
    );
}

/** Classic: today's booking page, every step reached drawn one under another. */
function ClassicBookingFlow(props: BookingFlowProps) {
    const { page, account, visit = null, soldBy = null, reach = null } = props;
    const apiUrl = props.apiUrl ?? DEFAULT_API_URL;
    const ids = useId();
    const rootRef = useRef<HTMLDivElement>(null);
    const headingRef = useRef<HTMLHeadingElement>(null);
    const flow = useBookingFlow(
        { ...props, apiUrl },
        { root: rootRef, heading: headingRef },
    );
    const { s, times, words, act, pick } = flow;
    const { service } = times;
    const { phase, customer } = s;
    const { waiting, pay } = words;
    const services = page.services;

    const summary = {
        dueLabel: words.dueLabel,
        due: words.due,
        // Beside an amount of money only: not a credit, nor the waitlist.
        gstText: waiting || pay === "CREDIT" ? null : words.gstWords,
        block: flow.block,
        // A name not typed yet is a next step until they try to book.
        quiet: !s.touched && flow.block === NAME_LEFT,
        submitError: s.message?.text ?? null,
        submitting: s.submitting,
        onConfirm: () => void act.confirm(),
    };
    const facts = headerFacts(visit);
    // How to get in touch where the page can't help further: the contact
    // read's phone and WhatsApp, else the header's own phone.
    const callReach: BusinessReach = {
        phone: reach?.phone ?? facts.phone,
        whatsapp: reach?.whatsapp ?? null,
    };
    // Online booking paused at the plan's monthly cap (DEC-095): said up
    // front, before any choosing, never after the booker has done the work.
    const paused = page.paused === true;
    const bookable = page.open && services.length > 0 && !paused;
    // The summary is drawn twice, and CSS alone shows one: the aside from
    // 700px, the pinned bar under it. A script that asked the screen's
    // width drew the desk layout first on every phone, then swapped.
    const showSummary = phase.kind === "choose" && bookable;

    const outcome = (shown: Exclude<Phase, { kind: "choose" }>) => (
        <FlowOutcome
            phase={shown}
            page={page}
            service={service}
            headingRef={headingRef}
            soldBy={soldBy}
            email={customer?.email ?? null}
            gst={words.gstWords}
            now={flow.now}
            zone={times.zone}
            booker={{
                name: flow.bookerName,
                email: customer?.email ?? "",
                ...(s.phoneNo.trim() ? { phone: s.phoneNo.trim() } : {}),
            }}
            leaving={s.leaving}
            deskOffered={words.deskOffered}
            reach={callReach}
            on={{
                again: pick.again,
                leaveHold: (then) => void act.leaveHold(then),
                paid: () => {
                    s.setPhase((p) =>
                        p.kind === "paying" ? { ...p, checkoutPaid: true } : p,
                    );
                    flow.checkHold();
                },
                backToChoosing: act.backToChoosing,
            }}
            apiUrl={apiUrl}
        />
    );

    return (
        <div
            ref={rootRef}
            {...NO_CAPTURE_ATTRS}
            data-booking-step={flow.step}
            className={cn(
                "bg-site-bg text-site-fg min-h-screen",
                NO_CAPTURE_CLASS,
                showSummary ? "pb-10 max-[699px]:pb-[150px]" : "pb-10",
            )}
        >
            <BookingHeader
                services={services}
                facts={facts}
                businessName={page.businessName}
                timezone={page.timezone}
            />

            <div className="mx-auto -mt-[18px] flex max-w-[1060px] flex-wrap items-start gap-5 px-5">
                <div className="grid min-w-0 flex-[999_1_460px] grid-cols-[minmax(0,1fr)] gap-3.5">
                    {phase.kind === "booked" ? (
                        outcome(phase)
                    ) : !bookable ? (
                        <ClosedCard
                            paused={page.open && services.length > 0 && paused}
                            businessName={page.businessName}
                            phone={facts.phone}
                            reach={callReach}
                        />
                    ) : phase.kind !== "choose" ? (
                        outcome(phase)
                    ) : (
                        <ChooseSteps
                            ids={ids}
                            page={page}
                            times={times}
                            chosen={flow.chosenStart}
                            reach={callReach}
                            waitlist={
                                flow.waitlistOn
                                    ? { placeOf: flow.placeOf }
                                    : undefined
                            }
                            onService={pick.service}
                            onPerson={pick.person}
                            onStart={pick.start}
                            details={{
                                customer,
                                name: s.name,
                                touched: s.touched,
                                signingOut: s.signingOut,
                                onName: s.setName,
                                onNotYou: () => void act.notYou(),
                                asksWhere: flow.asks,
                                where: flow.whereNow,
                                onlyWhere: flow.onlyWhere,
                                note: s.note,
                                onWhere: pick.where,
                                onNote: s.setNote,
                                phone: s.phoneNo,
                                onPhone: s.setPhoneNo,
                            }}
                            words={words}
                            payChoice={{ pay, onPick: pick.pay }}
                            whoOk={flow.whoOk}
                            message={s.message}
                        />
                    )}
                </div>

                {showSummary ? (
                    <SummaryAside
                        serviceName={service?.name ?? null}
                        visits={visitsOf(service)}
                        whenText={flow.whenText}
                        name={
                            flow.bookerName !== ""
                                ? flow.bookerName
                                : (customer?.email ?? "")
                        }
                        hasService={!!service}
                        confirmLabel={words.confirmLabel}
                        rules={words.rules}
                        {...summary}
                    />
                ) : null}
            </div>

            {showSummary && words.rules ? (
                <p className="text-site-body mx-auto mt-[18px] max-w-[1060px] px-5 text-sm leading-normal min-[700px]:hidden">
                    {words.rules}
                </p>
            ) : null}

            {showSummary ? (
                <PhoneBar
                    hasService={!!service}
                    whenText={flow.whenText}
                    barLabel={words.barLabel}
                    {...summary}
                />
            ) : null}

            <SignInSheet
                open={s.sheetOpen}
                onClose={() => s.setSheetOpen(false)}
                options={account.options}
                api={account.signIn}
                purpose="book"
                onSignedIn={(who) => void act.signedIn(who)}
            />

            <TestReleaseStopSheet
                open={s.testStop}
                live={testReleaseBookingLine({
                    serviceName: service?.name ?? "",
                    whenText: flow.whenText,
                    waitlist: flow.waitMode === "join",
                    pay,
                    payingNow: words.payingNow,
                })}
                nothing="booked"
                back="Back"
                onClose={() => s.setTestStop(false)}
            />
        </div>
    );
}

/**
 * The booking page when its business could not be read: said plainly, in the
 * site's palette, with a way to ask again (the address as it was opened)
 * and the ways to reach the business. Nothing to click that cannot work.
 */
export function BookingUnavailable({
    business,
    retryHref = null,
    reach = null,
}: {
    business: string;
    /** The page's own address: "Try again" asks for it afresh. */
    retryHref?: string | null;
    /** A call and a message, when the site shows them. */
    reach?: BusinessReach | null;
}) {
    return (
        <SitePageState
            title="We couldn't open the booking page"
            failed
            retryHref={retryHref}
            reach={reach}
        >
            Something went wrong on our side. Try again in a moment, or get in
            touch with {business} to book.
        </SitePageState>
    );
}

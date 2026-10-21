"use client";

import type { LookId } from "@saroh/block-contract";
import type { RefObject } from "react";

import { timeWords } from "../lib/clock";
import type { BusinessReach } from "../reach-links";
import { ReachLinks } from "../reach-links";
import type { BookingAccount } from "./booking-account";
import type { InlineCodeHandle } from "./inline-code";
import { LookDetails } from "./look-details";
import { LookPay, LookWhat, LookWho } from "./look-steps";
import type { LookStep } from "./look-words";
import { momentText } from "./look-words";
import type { BookingPageData, BookingStart } from "./model";
import { laterSkip, sessionsOnShow } from "./model";
import { FlowMessageLine } from "./steps/flow-message";
import { WhenBody } from "./steps/when-step";
import type { BookingFlowEngine } from "./use-booking-flow";
import { SESSIONS_SHOWN } from "./use-times";

/**
 * A look's step, under its heading (DEC-172, U10): the same contents in
 * every frame. Choosing on a step stays on it; the frame's button moves
 * on (`choose`).
 */
export function LookStepBody({
    step,
    look,
    ids,
    flow,
    page,
    account,
    callReach,
    codeRef,
    choose,
}: {
    step: LookStep;
    look: LookId;
    ids: string;
    flow: BookingFlowEngine;
    page: BookingPageData;
    account: BookingAccount;
    callReach: BusinessReach;
    codeRef: RefObject<InlineCodeHandle | null>;
    choose: {
        service: (id: string) => void;
        person: (id: string | null) => void;
        start: (start: BookingStart | null) => void;
    };
}) {
    const { s, times, words, act, pick } = flow;
    const { service, zone } = times;
    const { customer } = s;
    const chosen = flow.chosenStart;
    const earliestStart =
        times.person === null
            ? (times.days?.days.flatMap((d) => d.starts).at(0) ?? null)
            : null;
    const message = s.message ? (
        <div className="mb-4">
            <FlowMessageLine message={s.message} />
        </div>
    ) : null;
    switch (step) {
        case "what":
            return (
                <LookWhat
                    services={page.services}
                    serviceId={times.serviceId}
                    onPick={choose.service}
                />
            );
        case "who":
            return (
                <LookWho
                    look={look}
                    times={times}
                    person={times.person}
                    earliest={
                        earliestStart
                            ? `Earliest: ${momentText(earliestStart.startAt, zone)}`
                            : null
                    }
                    onPick={choose.person}
                    onRetry={() => service && times.retry(service.id)}
                />
            );
        case "when":
            return service ? (
                <>
                    {message}
                    <WhenBody
                        daysState={times.daysState}
                        days={times.days}
                        isClass={times.isClass}
                        day={times.day}
                        sessions={times.sessions.slice(
                            0,
                            sessionsOnShow(
                                times.sessions,
                                times.sessionsShown,
                                chosen?.startAt,
                            ),
                        )}
                        more={
                            times.sessions.length >
                            sessionsOnShow(
                                times.sessions,
                                times.sessionsShown,
                                chosen?.startAt,
                            )
                        }
                        zone={zone}
                        service={service}
                        chosen={chosen}
                        business={page.businessName}
                        onRetry={() => times.retry(service.id)}
                        person={times.person}
                        skip={times.skip}
                        later={laterSkip(times.skip, page.rules.bookAheadDays)}
                        onSkip={(next) =>
                            times.showDays(service.id, {
                                skip: next,
                                person: times.person,
                            })
                        }
                        reach={callReach}
                        onDay={(d) => {
                            times.setDate(d);
                            choose.start(null);
                        }}
                        onStart={choose.start}
                        onMore={() =>
                            times.setSessionsShown((n) => n + SESSIONS_SHOWN)
                        }
                        waitlist={
                            flow.waitlistOn
                                ? { placeOf: flow.placeOf }
                                : undefined
                        }
                    />
                    {words.rules ? (
                        <p className="text-site-body mt-4 text-[13.5px]">
                            {words.rules}
                        </p>
                    ) : null}
                </>
            ) : null;
        case "details":
            return (
                <>
                    {message}
                    <LookDetails
                        ids={ids}
                        business={page.businessName}
                        customer={customer}
                        name={s.name}
                        touched={s.touched}
                        signingOut={s.signingOut}
                        onName={s.setName}
                        onNotYou={() => void act.notYou()}
                        signIn={{
                            options: account.options,
                            api: account.signIn,
                        }}
                        codeRef={codeRef}
                        onSignedIn={(who) => void act.signedInHere(who)}
                        phone={s.phoneNo}
                        onPhone={s.setPhoneNo}
                        where={{
                            asksWhere: flow.asks,
                            where: flow.whereNow,
                            onlyWhere: flow.onlyWhere,
                            note: s.note,
                            onWhere: pick.where,
                            onNote: s.setNote,
                        }}
                        forWaitlist={words.waiting}
                    />
                    {words.unpayable ? (
                        <div className="mt-4">
                            <p className="text-site-fg text-[15px]">
                                {words.unpayable}
                            </p>
                            <ReachLinks reach={callReach} />
                        </div>
                    ) : null}
                </>
            );
        case "pay":
            return (
                <>
                    {message}
                    <LookPay
                        choices={words.choices}
                        pay={words.pay}
                        onPick={pick.pay}
                        service={service}
                        time={chosen ? timeWords(chosen.startAt, zone) : ""}
                        rules={words.rules}
                    />
                </>
            );
    }
}

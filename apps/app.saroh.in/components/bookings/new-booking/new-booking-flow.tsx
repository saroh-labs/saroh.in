"use client";

import { Notice } from "@saroh/ui/notice";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { showPlanRefusal } from "@/components/billing/plan-refusal";
import { makePayLink } from "@/components/bookings/booking-page/pay-link-panel";
import {
    CustomerStep,
    useCustomerFinder,
} from "@/components/bookings/sheets/customer-step";
import { TimePicker } from "@/components/bookings/sheets/time-picker";
import {
    useOverlayDirty,
    useOverlaySubmit,
    useToastsAboveFoot,
} from "@/components/shared/forms/overlay-form";
import { runAction } from "@/lib/api/run-action";
import { classesLeft, packOffer, usablePacks } from "@/lib/class-packs/balance";
import type { CustomerPick } from "@/lib/customers/picker";
import { pickName } from "@/lib/customers/picker";
import { formatMoney } from "@/lib/format/money";
import { firstName } from "@/lib/names";
import { bookByHand } from "@/lib/services/actions";
import type { PayChoice as Choice, PaidBy } from "@/lib/services/booking-pay";
import {
    bookerFor,
    linkShown,
    payInput,
    payProblem,
} from "@/lib/services/booking-pay";
import type { LocalDate } from "@/lib/services/diary";
import { localDateOf } from "@/lib/services/diary";
import type { Step } from "@/lib/services/new-booking";
import {
    asksWith,
    bookProblem,
    bookWhen,
    closedWeekdaysOf,
    firstStep,
    isClass,
    nextFreeWords,
    nextLabel,
    nextVisitDays,
    peopleFor,
    placesNote,
    QUESTION,
    RAIL_KEY,
    stepAfter,
    stepBefore,
    stepProblem,
    whenWords,
    withWords,
} from "@/lib/services/new-booking";

import { bookedOf, endWords } from "./booked";
import { CheckStep } from "./check-step";
import type { Booked } from "./done-step";
import { DoneStep } from "./done-step";
import type { Crumb, RailStep } from "./flow-frame";
import { DeskHeader, FlowFoot, PhoneHeader, StepRail } from "./flow-frame";
import type { NewBookingPrefill, NewBookingSetup } from "./setup";
import { NextVisitDay, ServiceStep, serviceSub, WithStep } from "./steps";
import { useHeldPacks, useNextFree } from "./use-flow-reads";

/** The front desk's line, where money is out of their reach (DEC-170). */
export const FRONT_DESK =
    "You're booking as front desk. You can book and mark arrivals. Taking card payments stays with owners and admins.";

/**
 * New booking as a guided journey (U8): Who, What, With, When, Check and
 * book, one question a step, then Booked. The phone draws it full screen
 * with the step in its header and the choices so far as chips; a desk
 * draws it as a wide side panel with the step list on the left, which
 * doubles as the check card (BKMNewBooking…Step6, BKDNewBooking,
 * BKDAddCustomer). The same flow from every way in: each prefills what it
 * knows and starts at the first thing it doesn't.
 *
 * Nothing is written until Book. A time taken meanwhile brings it back to
 * the day and time, saying so; a refusal for any other reason is said on
 * Check and book, where the choice is.
 */
export function NewBookingFlow({
    setup,
    prefill,
    onDirty,
    onAgain,
    onDone,
}: {
    setup: NewBookingSetup;
    prefill: NewBookingPrefill;
    /** Something chosen or typed: closing asks first. */
    onDirty: (dirty: boolean) => void;
    /** Add another booking: a fresh flow. */
    onAgain: () => void;
    onDone: () => void;
}) {
    const router = useRouter();
    const [now] = useState(() => setup.now ?? Date.now());
    const zone = setup.timezone;
    const today = localDateOf(new Date(now), zone);
    const services = setup.services.filter((s) => s.bookableByTeam !== false);
    const hidden = setup.services.length - services.length;
    const staff = setup.staff ?? [];

    const [who, setWho] = useState<CustomerPick | null>(prefill.who ?? null);
    // What the way in said, or the only service there is.
    const [openedOn] = useState<string | null>(
        () =>
            services.find((s) => s.id === prefill.serviceId)?.id ??
            (services.length === 1 ? (services[0]?.id ?? null) : null),
    );
    const [serviceId, setServiceId] = useState<string | null>(openedOn);
    const service = services.find((s) => s.id === serviceId) ?? null;
    const servicePeople = peopleFor(service, staff);
    const asks = asksWith(service, staff);
    const only = servicePeople.length === 1 ? (servicePeople[0] ?? null) : null;
    const [withId, setWithId] = useState<string | null>(
        prefill.staffId &&
            staff.some((p) => p.id === prefill.staffId) &&
            !isClass(service)
            ? prefill.staffId
            : null,
    );
    const [startAt, setStartAt] = useState<string | null>(null);
    const [atPerson, setAtPerson] = useState<{
        id: string;
        name: string;
    } | null>(null);
    const [taken, setTaken] = useState<string | null>(null);
    const [reload, setReload] = useState(0);
    const [visitChoice, setVisitChoice] = useState<
        "tomorrow" | "week" | "pick" | null
    >(null);
    const [visitDay, setVisitDay] = useState<LocalDate | null>(null);
    const [step, setStep] = useState<Step>(() =>
        firstStep({
            who: Boolean(prefill.who),
            service: Boolean(service),
            withChosen: withId !== null,
            asks,
        }),
    );
    const [tried, setTried] = useState(false);
    const [pay, setPay] = useState<Choice>("DESK");
    const [paidBy, setPaidBy] = useState<PaidBy | null>(null);
    const [usePack, setUsePack] = useState(true);
    const [packId, setPackId] = useState("");
    const [packRefusal, setPackRefusal] = useState<string | null>(null);
    const [refusal, setRefusal] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    // One per attempt, so a double press books once (the API replays it).
    const [attempt, setAttempt] = useState(() => crypto.randomUUID());
    const [booked, setBooked] = useState<Booked | null>(null);

    const finder = useCustomerFinder({
        value: who,
        onPick: (pick) => {
            setWho(pick);
            setTried(false);
            if (step === 1) go(2);
        },
        canSearch: setup.people.canSearch,
    });

    // Who it is for, and anything chosen after, is work to lose.
    const dirty =
        !booked &&
        (who !== (prefill.who ?? null) ||
            finder.adding !== null ||
            finder.query !== "" ||
            startAt !== null ||
            serviceId !== openedOn);
    useOverlayDirty(dirty);
    useEffect(() => onDirty(dirty), [dirty, onDirty]);

    // The people who do it, with when each is next free (With).
    const nextSlots = useNextFree(serviceId, step === 3, now);

    // The customer's class packs for this service (ADR-007).
    const contactId = who?.kind === "contact" ? who.id : null;
    const packKey =
        setup.canUsePacks && contactId && serviceId
            ? `${contactId}:${serviceId}`
            : null;
    const { packs: heldPacks, failed: packsFailed } = useHeldPacks(
        packKey,
        reload,
    );
    const usable = startAt ? usablePacks(heldPacks, startAt) : [];
    const pack = usable.find((p) => p.id === packId) ?? usable.at(0);
    const paying = usePack && pack !== undefined;

    // Money, as far as the viewer sees it.
    const price = (s: {
        priceCents: number | null;
        currency: string | null;
    }) => (setup.showMoney ? formatMoney(s.priceCents, s.currency) : null);
    const amount = service ? price(service) : null;
    const offerLink = linkShown(setup.people, service?.priceCents);
    const canTake = setup.people.canTakePayment !== false;
    const payNow: Choice =
        (pay === "LINK" && !offerLink) || (pay !== "DESK" && !canTake)
            ? "DESK"
            : pay;

    // Focus follows the question, once the flow has moved.
    const phoneHeading = useRef<HTMLHeadingElement | null>(null);
    const deskHeading = useRef<HTMLHeadingElement | null>(null);
    const [moves, setMoves] = useState(0);
    useLayoutEffect(() => {
        if (moves === 0) return;
        const visible = [phoneHeading.current, deskHeading.current].find(
            (el) => el && el.getClientRects().length > 0,
        );
        (visible ?? deskHeading.current ?? phoneHeading.current)?.focus();
    }, [moves]);
    function go(next: Step) {
        setMoves((n) => n + 1);
        setStep(next);
        setTried(false);
    }

    const foot = useRef<HTMLDivElement | null>(null);
    useToastsAboveFoot(foot);

    const draft = {
        // Someone the booking can be made for: a customer, or a new one
        // with a phone and name or an email. Anything less is said at Who,
        // never a Book that does nothing.
        who: bookerFor(who) !== null,
        hasServices: services.length > 0,
        serviceId,
        startAt,
        noDay: prefill.nextVisit === true && visitDay === null,
    };
    const problem = stepProblem(step, draft);
    const missing = bookProblem(draft);
    const payGap = paying ? null : payProblem(payNow, paidBy);

    const whoName = who ? pickName(who) : "";
    const first = firstName(whoName);
    const withName = withWords({
        chosen: withId ? (staff.find((p) => p.id === withId) ?? null) : null,
        atTime: atPerson,
        isClass: isClass(service),
        only,
    });

    async function book() {
        setTried(true);
        if (saving || missing || payGap || !service || !startAt) return;
        const booker = bookerFor(who);
        if (!booker) {
            go(1);
            setTried(true);
            return;
        }
        setSaving(true);
        setRefusal(null);
        setPackRefusal(null);
        const staffId = isClass(service) ? undefined : (atPerson?.id ?? withId);
        const res = await runAction(
            () =>
                bookByHand(service.id, {
                    startAt,
                    idempotencyKey: attempt,
                    ...(staffId ? { staffId } : {}),
                    ...(paying ? { packPurchaseId: pack.id } : {}),
                    ...(paying ? {} : payInput(payNow, paidBy)),
                    ...booker,
                }),
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
            if (res.field === "packPurchaseId") {
                // The pack changed while this was open: read it again and
                // say so here, where the choice is.
                setPackRefusal(
                    `${res.error} Nothing has been booked and no class was spent. Book it paid another way, or sell them another pack.`,
                );
                setReload((n) => n + 1);
                return;
            }
            if (res.field === "startAt") {
                // The time went while this was open: back to the times,
                // read again, saying so (BKMNewBookingStep4).
                setTaken(startAt);
                setStartAt(null);
                setAtPerson(null);
                setReload((n) => n + 1);
                go(4);
                return;
            }
            setRefusal(res.error);
            return;
        }
        const linkAsked = !paying && payNow === "LINK";
        const link = linkAsked ? await makePayLink(res.data.id) : null;
        setSaving(false);
        const person = isClass(service)
            ? (atPerson?.name ?? only?.name ?? null)
            : (atPerson?.name ??
              (withId
                  ? (staff.find((p) => p.id === withId)?.name ?? null)
                  : null) ??
              only?.name ??
              null);
        setBooked(
            bookedOf({
                bookingId: res.data.id,
                customer: whoName,
                phone: who?.phone ?? null,
                service,
                person,
                startAt,
                zone,
                now,
                amount,
                pay: paying
                    ? { kind: "pack", left: classesLeft(pack) - 1 }
                    : { kind: payNow, paidBy, link },
                business: setup.business ?? null,
            }),
        );
        router.refresh();
    }

    async function next() {
        if (step === 1 && finder.adding) {
            await finder.add();
            return;
        }
        if (step === 1 && finder.dup) return;
        if (step < 5) {
            if (problem) {
                setTried(true);
                return;
            }
            go(stepAfter(step, asks));
            return;
        }
        await book();
    }
    useOverlaySubmit(() => next(), saving);

    if (booked) {
        return (
            <div className="flex min-h-0 flex-1 flex-col bg-background min-[760px]:bg-card">
                <DeskHeader step={null} />
                <DoneStep booked={booked} onAgain={onAgain} onDone={onDone} />
            </div>
        );
    }

    const back = step > 1 ? () => go(stepBefore(step, asks)) : null;
    // Back to a step; With, where it isn't asked, is the service's.
    function jump(n: Step) {
        go(n === 3 && !asks ? 2 : n);
    }

    const crumbs: Crumb[] = [];
    if (step > 1 && who)
        crumbs.push({ label: whoName, onPress: () => jump(1) });
    if (step > 2 && service)
        crumbs.push({ label: service.name, onPress: () => jump(2) });
    if (step > 3 && service && (asks || isClass(service) || only))
        crumbs.push({ label: firstName(withName), onPress: () => jump(3) });

    const whenValue = startAt ? whenWords(startAt, zone) : "Not picked yet";
    const payValue = paying
        ? "Class pack"
        : payNow === "LINK"
          ? "Send a payment link"
          : payNow === "PAID"
            ? "Paid now"
            : "Pays at the visit";
    const rail: RailStep[] = (
        [
            [1, who ? whoName : "Not picked yet"],
            [
                2,
                service
                    ? service.name
                    : services.length
                      ? "Not picked yet"
                      : "No services yet",
            ],
            [3, service ? withName : "Not picked yet"],
            [4, whenValue],
            [5, payValue],
        ] as const
    ).map(([n, value]) => ({
        n,
        key: RAIL_KEY[n],
        value,
        onPress: n < step ? () => jump(n) : null,
    }));

    const summary =
        step === 5 && !missing && service
            ? [
                  whoName,
                  service.name,
                  `with ${withName}`,
                  paying ? "from the class pack" : payValue.toLowerCase(),
              ].join(" · ")
            : null;
    const message = tried
        ? step === 5
            ? (missing?.message ?? payGap)
            : problem
        : null;

    const frontDesk = canTake ? null : (
        <Notice tone="info" className="mb-3 min-[760px]:hidden">
            {FRONT_DESK}
        </Notice>
    );

    return (
        <div className="flex min-h-0 flex-1 flex-col bg-background min-[760px]:bg-card">
            <PhoneHeader
                step={step}
                onBack={back}
                crumbs={crumbs}
                headingRef={phoneHeading}
            />
            <DeskHeader step={step} />
            <div className="flex min-h-0 flex-1 min-[760px]:grid min-[760px]:grid-cols-[240px_minmax(0,1fr)]">
                <StepRail
                    step={step}
                    steps={rail}
                    note={
                        canTake ? null : (
                            <p className="px-2.5 pt-3 text-[12.5px] leading-[1.5] text-muted-foreground">
                                {FRONT_DESK}
                            </p>
                        )
                    }
                />
                <div
                    data-overlay-body
                    className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 pb-6 pt-4 min-[760px]:px-7 min-[760px]:py-[22px]"
                >
                    <h2
                        ref={deskHeading}
                        tabIndex={-1}
                        className="mb-4 hidden font-display text-[22px] font-semibold tracking-[-0.02em] outline-none min-[760px]:block"
                    >
                        {QUESTION[step]}
                    </h2>
                    {frontDesk}

                    {step === 1 ? (
                        <CustomerStep finder={finder} addButtons="foot" />
                    ) : null}

                    {step === 2 ? (
                        <ServiceStep
                            services={services}
                            hidden={hidden}
                            value={serviceId}
                            invalid={tried}
                            price={price}
                            onChange={(id) => {
                                const s = services.find((x) => x.id === id);
                                setServiceId(id);
                                setStartAt(null);
                                setAtPerson(null);
                                setTaken(null);
                                setTried(false);
                                // Keep the person only if they do it too.
                                if (
                                    withId &&
                                    (isClass(s) ||
                                        !staff
                                            .find((p) => p.id === withId)
                                            ?.serviceIds.includes(id))
                                ) {
                                    setWithId(null);
                                }
                            }}
                        />
                    ) : null}

                    {step === 3 && service ? (
                        <WithStep
                            service={service}
                            people={servicePeople}
                            value={withId}
                            onChange={(id) => {
                                setWithId(id);
                                setStartAt(null);
                                setAtPerson(null);
                            }}
                            nextFree={(id) =>
                                id === null
                                    ? null
                                    : nextFreeWords(id, nextSlots, zone, now)
                            }
                        />
                    ) : null}

                    {step === 4 && service ? (
                        prefill.nextVisit ? (
                            <NextVisitDay
                                quick={nextVisitDays(today, zone)}
                                picked={visitDay}
                                choice={visitChoice}
                                today={today}
                                onChoice={(c) => {
                                    setVisitChoice(c);
                                    setStartAt(null);
                                    setAtPerson(null);
                                    const q = nextVisitDays(today, zone).find(
                                        (d) => d.key === c,
                                    );
                                    setVisitDay(q ? q.date : null);
                                }}
                                onPickDate={(d) => {
                                    setVisitDay(d);
                                    setStartAt(null);
                                }}
                            >
                                {visitDay ? times(visitDay, false) : null}
                            </NextVisitDay>
                        ) : (
                            times(prefill.date ?? null, true)
                        )
                    ) : null}

                    {step === 5 && service ? (
                        <CheckStep
                            rows={[
                                {
                                    key: "Who",
                                    value: who ? whoName : "Nobody yet",
                                    sub: who
                                        ? ([
                                              who.phone,
                                              "email" in who ? who.email : null,
                                          ].find(Boolean) ?? null)
                                        : "Pick who it's for",
                                    missing: !who,
                                    onChange: () => jump(1),
                                },
                                {
                                    key: "What",
                                    value: service.name,
                                    sub: [serviceSub(service), amount]
                                        .filter(Boolean)
                                        .join(" · "),
                                    onChange: () => jump(2),
                                },
                                {
                                    key: "With",
                                    value: withName,
                                    sub: isClass(service)
                                        ? "Teaches this class"
                                        : null,
                                    onChange: () => jump(3),
                                },
                                {
                                    key: "When",
                                    value: startAt
                                        ? whenWords(startAt, zone)
                                        : "No time yet",
                                    sub: startAt
                                        ? `Ends ${endWords(startAt, service.minutes, zone)}`
                                        : "Pick a time",
                                    missing: !startAt,
                                    onChange: () => jump(4),
                                },
                            ]}
                            attention={finder.attention}
                            pay={{
                                value: payNow,
                                onChange: setPay,
                                paidBy,
                                onPaidByChange: setPaidBy,
                                offerLink,
                                canTakePayment: canTake,
                                amount,
                                invalid: tried && payGap !== null,
                                pack: pack
                                    ? {
                                          title: `Use ${first}'s class pack`,
                                          note: `${packOffer(pack, zone)}. ${classesLeft(pack) - 1} after this. Cancelling gives it back.`,
                                          on: usePack,
                                          onChange: setUsePack,
                                      }
                                    : null,
                            }}
                            packs={
                                paying
                                    ? {
                                          value: pack.id,
                                          onChange: setPackId,
                                          options: usable.map((p) => ({
                                              value: p.id,
                                              label: packOffer(p, zone),
                                          })),
                                      }
                                    : null
                            }
                            packRefusal={packRefusal}
                            packsFailed={
                                packsFailed
                                    ? {
                                          first,
                                          onRetry: () =>
                                              setReload((n) => n + 1),
                                      }
                                    : null
                            }
                            refusal={refusal}
                        />
                    ) : null}
                </div>
            </div>
            <FlowFoot
                footRef={foot}
                message={message}
                summary={summary}
                onBack={back}
                busy={saving || finder.checking}
                label={nextLabel(step, {
                    adding: finder.adding !== null,
                    asks,
                    first,
                    when: startAt ? bookWhen(startAt, zone) : "",
                })}
            />
        </div>
    );

    /**
     * The day and time, from the one time picker (U3). A function, not a
     * component, so the picker keeps its state between renders; keyed by
     * the day it opens on, so a new day opens fresh.
     */
    function times(day: LocalDate | null, strip: boolean) {
        if (!service) return null;
        return (
            <TimePicker
                key={`${service.id}|${day ?? ""}`}
                serviceId={service.id}
                timezone={zone}
                value={startAt}
                onChange={(at, person) => {
                    setStartAt(at);
                    setAtPerson(person);
                    if (at) setTaken(null);
                }}
                people={servicePeople}
                withId={isClass(service) ? null : withId}
                withChips={false}
                strip={strip}
                taken={taken}
                reloadKey={reload}
                closedWeekdays={closedWeekdaysOf(
                    servicePeople
                        .map((p) => p.workDays)
                        .filter((d): d is readonly number[] => d !== null),
                )}
                slotNote={
                    isClass(service)
                        ? (slot) => placesNote(slot.placesLeft)
                        : undefined
                }
                initialDay={day && day >= today ? day : undefined}
                now={now}
            />
        );
    }
}

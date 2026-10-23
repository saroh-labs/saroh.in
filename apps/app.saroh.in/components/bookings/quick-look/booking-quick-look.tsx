"use client";

import { Avatar, AvatarFallback, avatarInitials } from "@saroh/ui/avatar";
import { cn } from "@saroh/ui/lib/utils";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetTitle,
} from "@saroh/ui/sheet";
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";

import { TakePayment } from "@/components/bookings/booking-page/take-payment";
import type { SendHeld } from "@/components/bookings/sheets/cancel-sheet";
import { CancelSheet } from "@/components/bookings/sheets/cancel-sheet";
import { mayChangeWho } from "@/components/bookings/sheets/change-who";
import { StatusBadge } from "@/components/shared/lists/status-badge";
import { useHold } from "@/components/shared/undo/use-hold";
import { formatClockRange, formatDay } from "@/lib/format/datetime";
import { useNarrow } from "@/lib/hooks/use-narrow";
import { readBookingPerson } from "@/lib/services/actions";
import type { Block, DiaryState } from "@/lib/services/diary";
import {
    bookingState,
    liveSeats,
    localDateOf,
    STATE_LABEL,
    whoFor,
} from "@/lib/services/diary";
import type { PeekPerson } from "@/lib/services/peek";

import { STATE_TONE } from "@/components/bookings/calendar/parts";
import { ChooseStep, MoveStep } from "./quick-look-change";
import { ClassLook } from "./quick-look-class";
import { NextVisitStep } from "./quick-look-next-visit";
import type { PersonRead } from "./quick-look-one";
import { OneLook, paidWords } from "./quick-look-one";
import { CloseButton } from "./quick-look-parts";
import type { NextDayChoice, QuickLookStep } from "./quick-look-state";
import type {
    HeldFor,
    QuickLookActions,
    QuickLookContext,
} from "./quick-look-types";
import { WhoStep } from "./quick-look-who";

/**
 * The quick look over the calendar (U7, #1023; BKMQuickLook,
 * BKMQuickLookStep2, BKMNextVisit, BKDQuickLook): a bottom sheet on a
 * phone, the right-hand panel at a desk.
 *
 * One main action at a time (Mark arrived, then Take ₹X, then Book their
 * next visit), "Move or cancel" as its own step, and the rest under More,
 * Cancel last and in red. Move uses U3's time picker; Cancel is U3's one
 * cancel sheet, asking about the money as the business's policy says
 * (Q14), its held Undo kept here so it outlives the quick look closing.
 * Book their next visit keeps the service and person and leaves the day
 * to the merchant (Q16). A class lists who is booked, with Cancel a place
 * on each, and Cancel the class under More.
 */
export function BookingQuickLook({
    block,
    onClose,
    ctx,
    act,
    heldFor,
}: {
    block: Block | null;
    onClose: () => void;
    ctx: QuickLookContext;
    act: QuickLookActions;
    heldFor: HeldFor;
}) {
    const [kept, setKept] = useState<Block | null>(block);
    // Keep the last block through the closing slide, so it does not blank.
    if (block && block !== kept) setKept(block);
    const shown = block ?? kept;
    const [step, setStep] = useState<QuickLookStep>("look");
    const [nextChoice, setNextChoice] = useState<NextDayChoice | null>(null);
    const [taking, setTaking] = useState(false);
    // A new booking opened: it starts at its glance.
    const [openFor, setOpenFor] = useState<string | null>(block?.key ?? null);
    if ((block?.key ?? null) !== openFor) {
        setOpenFor(block?.key ?? null);
        setStep("look");
        setTaking(false);
    }
    const narrow = useNarrow();
    // What had the keyboard when it opened (the block on the calendar):
    // it gets it back on close. Read before the sheet takes it.
    const opener = useRef<HTMLElement | null>(null);
    const isOpen = block !== null;
    useLayoutEffect(() => {
        if (!isOpen) return;
        const el = document.activeElement;
        opener.current =
            el instanceof HTMLElement && el !== document.body ? el : null;
    }, [isOpen]);
    // The cancel's ten seconds outlive the sheet: this component stays
    // mounted while the calendar is on screen.
    const { send, pending, undo } = useHold();
    const cancelKey = (id: string) => `cancel-booking:${id}`;
    const held: HeldFor = (id) => {
        const theirs = heldFor(id);
        if (theirs) return theirs;
        return pending.includes(cancelKey(id))
            ? () => undo(cancelKey(id))
            : null;
    };

    const close = () => {
        setStep("look");
        onClose();
    };
    // A plain cancel is held with its Undo: the quick look closes at once.
    const sendAndClose: SendHeld = (key, options) => {
        send(key, options);
        setStep("look");
        onClose();
    };

    const one = shown?.kind === "one" ? shown.booking : null;
    const person = usePerson(one?.contact?.id ?? null);
    const tall = step === "move" || step === "who" || step === "next";

    return (
        <>
            <Sheet
                open={block !== null && step !== "cancel"}
                onOpenChange={(o) => {
                    if (!o) close();
                }}
            >
                <SheetContent
                    side={narrow ? "bottom" : "right"}
                    closeButton={false}
                    data-quick-look=""
                    // No trigger: give the keyboard back to what opened it.
                    onCloseAutoFocus={(event) => {
                        event.preventDefault();
                        if (opener.current?.isConnected) {
                            opener.current.focus();
                        }
                    }}
                    className={cn(
                        "flex flex-col gap-0 bg-card p-0",
                        narrow
                            ? cn(
                                  "rounded-t-[18px] border-0 shadow-xl",
                                  tall
                                      ? "h-[calc(100dvh-30px)]"
                                      : "max-h-[calc(100dvh-40px)]",
                              )
                            : "w-full sm:max-w-[480px]",
                    )}
                >
                    {narrow ? (
                        <span
                            aria-hidden
                            className="mx-auto mt-2 h-[5px] w-10 shrink-0 rounded-full bg-border"
                        />
                    ) : null}
                    {shown ? (
                        <Steps
                            block={shown}
                            step={step}
                            nextChoice={nextChoice}
                            ctx={ctx}
                            act={act}
                            held={held}
                            cancelHeld={
                                one
                                    ? pending.includes(cancelKey(one.id))
                                    : false
                            }
                            person={person}
                            send={send}
                            onStep={(next, choice) => {
                                setNextChoice(choice ?? null);
                                setStep(next);
                            }}
                            onTake={() => setTaking(true)}
                            onClose={close}
                        />
                    ) : null}
                    {one?.take && ctx.desk?.canTake ? (
                        <TakePayment
                            bookingId={one.id}
                            take={one.take}
                            currency={one.service.currency ?? null}
                            who={whoFor(one)}
                            canLink={ctx.desk.canLink}
                            online={ctx.desk.online}
                            open={taking}
                            onOpenChange={setTaking}
                        />
                    ) : null}
                </SheetContent>
            </Sheet>
            {one ? (
                <CancelSheet
                    open={block !== null && step === "cancel"}
                    booking={{
                        id: one.id,
                        who: whoFor(one),
                        when: `${whenLine(one.startAt, shown, ctx)} · ${one.service.name}`,
                        freeCancelUntil: null,
                        timezone: ctx.timezone,
                    }}
                    canRefund={ctx.canRefund ?? false}
                    canReadOrder={ctx.canReadOrder ?? false}
                    send={sendAndClose}
                    onClose={() => setStep("choose")}
                    onCancelled={() => {
                        setStep("look");
                        onClose();
                    }}
                />
            ) : null}
        </>
    );
}

/** "Today · 11:30 am to 12:15 pm", in the business's zone. */
function whenLine(
    startAt: string,
    block: Block | null,
    ctx: QuickLookContext,
): string {
    const today = localDateOf(new Date(ctx.now), ctx.timezone);
    const day = formatDay(localDateOf(startAt, ctx.timezone), {
        weekday: "short",
        year: "never",
        relative: true,
        today,
    });
    return block ? `${day} · ${formatClockRange(block.start, block.end)}` : day;
}

function Steps({
    block,
    step,
    nextChoice,
    ctx,
    act,
    held,
    cancelHeld,
    person,
    send,
    onStep,
    onTake,
    onClose,
}: {
    block: Block;
    step: QuickLookStep;
    nextChoice: NextDayChoice | null;
    ctx: QuickLookContext;
    act: QuickLookActions;
    held: HeldFor;
    cancelHeld: boolean;
    person: PersonRead;
    /** The quick look's hold, for a change that tells the customer. */
    send: SendHeld;
    onStep: (step: QuickLookStep, choice?: NextDayChoice) => void;
    onTake: () => void;
    onClose: () => void;
}) {
    const startAt =
        block.kind === "one" ? block.booking.startAt : block.session.startAt;
    const date = localDateOf(startAt, ctx.timezone);
    const when = whenLine(startAt, block, ctx);
    const back = () => onStep("look");

    if (block.kind === "class") {
        const s = block.session;
        const full = liveSeats(s).length >= s.capacity;
        return (
            <>
                <LookHead
                    title={s.service.name}
                    when={when}
                    what={
                        s.staff
                            ? `Group class with ${s.staff.name}`
                            : "Group class"
                    }
                    badge={
                        full && block.state !== "cancelled"
                            ? { label: "Full", state: "full" }
                            : {
                                  label: STATE_LABEL[block.state],
                                  state: block.state,
                              }
                    }
                    isClass
                    onClose={onClose}
                />
                <ClassLook
                    block={block}
                    date={date}
                    ctx={ctx}
                    act={act}
                    heldFor={held}
                />
            </>
        );
    }

    const b = block.booking;
    // A plain cancel held for its ten seconds reads as done here.
    const state: DiaryState = cancelHeld ? "cancelled" : bookingState(b);
    const what = b.staff
        ? `${b.service.name} with ${b.staff.name}`
        : b.service.name;
    const reach = person.state === "ready" ? person.person?.reach : null;

    switch (step) {
        case "choose":
            return (
                <ChooseStep
                    booking={b}
                    when={when}
                    what={what}
                    paid={b.treatment ? null : paidWords(b, ctx, state)}
                    reach={reach}
                    onMove={() => onStep("move")}
                    onWho={
                        ctx.canBook &&
                        b.service.capacity <= 1 &&
                        mayChangeWho(ctx.reassign, b.staff?.id ?? null)
                            ? () => onStep("who")
                            : undefined
                    }
                    onCancel={() => onStep("cancel")}
                    onBack={back}
                    onClose={onClose}
                />
            );
        case "move":
            return (
                <MoveStep
                    booking={b}
                    ctx={ctx}
                    reach={reach}
                    onBack={() => onStep("choose")}
                    onMoved={onClose}
                    onClose={onClose}
                />
            );
        case "who":
            return (
                <WhoStep
                    booking={b}
                    ctx={ctx}
                    reach={reach}
                    send={send}
                    onBack={() => onStep("look")}
                    onDone={onClose}
                    onClose={onClose}
                />
            );
        case "next":
            return (
                <NextVisitStep
                    booking={b}
                    ctx={ctx}
                    initial={nextChoice}
                    onBack={back}
                    onClose={onClose}
                />
            );
        default:
            return (
                <>
                    <LookHead
                        title={whoFor(b)}
                        when={when}
                        what={what}
                        badge={{ label: STATE_LABEL[state], state }}
                        onClose={onClose}
                    />
                    <OneLook
                        booking={b}
                        state={state}
                        ctx={ctx}
                        act={act}
                        person={person}
                        undo={held(b.id)}
                        onStep={onStep}
                        onTake={onTake}
                    />
                </>
            );
    }
}

/** Who or what, where it stands, when, and with whom. */
function LookHead({
    title,
    when,
    what,
    badge,
    isClass = false,
    onClose,
}: {
    title: string;
    when: string;
    what: string;
    badge: { label: string; state: DiaryState };
    isClass?: boolean;
    onClose: () => void;
}) {
    return (
        <div className="relative flex shrink-0 items-start gap-3 py-3 pl-5 pr-14 min-[760px]:gap-3.5 min-[760px]:border-b min-[760px]:border-border min-[760px]:pb-3.5 min-[760px]:pl-6 min-[760px]:pr-16 min-[760px]:pt-[18px]">
            <Avatar
                size="panel"
                aria-hidden
                className="min-[760px]:size-11 min-[760px]:text-[14px]"
            >
                <AvatarFallback
                    className={cn(
                        isClass &&
                            "bg-[hsl(var(--diary-class)/0.16)] text-diary-class",
                    )}
                >
                    {avatarInitials(title)}
                </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <SheetTitle className="font-display text-[18px] font-semibold leading-tight tracking-[-0.02em] min-[760px]:text-[20px]">
                        {title}
                    </SheetTitle>
                    <StatusBadge tone={STATE_TONE[badge.state]}>
                        {badge.label}
                    </StatusBadge>
                </div>
                <SheetDescription asChild>
                    <div>
                        <span className="mt-0.5 block text-[13.5px] font-medium tabular-nums text-foreground min-[760px]:mt-1.5 min-[760px]:font-display min-[760px]:text-[17px] min-[760px]:font-semibold">
                            {when}
                        </span>
                        <span className="block text-[12.5px] text-muted-foreground min-[760px]:text-[13px]">
                            {what}
                        </span>
                    </div>
                </SheetDescription>
            </div>
            <CloseButton
                onClose={onClose}
                className="absolute right-2 top-1.5 min-[760px]:right-3.5 min-[760px]:top-3.5"
            />
        </div>
    );
}

/**
 * The person behind the booking (their phone, Needs attention and how a
 * change reaches them), read when the quick look opens, with Try again
 * when it can't be read.
 */
function usePerson(contactId: string | null): PersonRead {
    const [attempt, setAttempt] = useState(0);
    const [read, setRead] = useState<{
        key: string;
        person: PeekPerson | null;
        failed: boolean;
    } | null>(null);
    const key = contactId ? `${contactId}:${attempt}` : null;
    const retry = useCallback(() => setAttempt((n) => n + 1), []);
    useEffect(() => {
        if (!contactId || !key) return;
        let live = true;
        void readBookingPerson(contactId)
            // Null is a role that may not read them: not a failure, the
            // rows then say they don't know ("—").
            .then((person) => ({ person, failed: false }))
            .catch(() => ({ person: null, failed: true }))
            .then((found) => {
                if (live) setRead({ key, ...found });
            });
        return () => {
            live = false;
        };
    }, [contactId, key]);
    if (!contactId) return { state: "none" };
    if (read?.key !== key) return { state: "loading" };
    return read.failed
        ? { state: "failed", retry }
        : { state: "ready", person: read.person };
}

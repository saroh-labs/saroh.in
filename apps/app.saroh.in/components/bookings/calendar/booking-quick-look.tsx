"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@saroh/ui/sheet";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { formatMoney } from "@/lib/format/money";
import { listAvailability } from "@/lib/services/actions";
import type { DiaryBooking } from "@/lib/services/booking-calendar";
import { canCheckIn, canMarkNoShow } from "@/lib/services/booking-state";
import type { Block, LocalDate } from "@/lib/services/diary";
import {
    bookingState,
    clock,
    dayLabel,
    liveSeats,
    localDateOf,
    localMinuteOf,
    paidText,
    whoFor,
} from "@/lib/services/diary";
import type { Slot } from "@/lib/services/service";

import { ClassSeats } from "./class-seats";
import { Eyebrow, StatePill } from "./parts";
import type {
    HeldFor,
    QuickLookActions,
    QuickLookContext,
} from "./quick-look-types";
import { btn } from "./quick-look-types";

function Card({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "rounded-[12px] border border-border bg-card px-4 py-[13px]",
                className,
            )}
        >
            {children}
        </div>
    );
}

function Rows({ rows }: { rows: [string, ReactNode][] }) {
    return (
        <Card>
            <dl>
                {rows.map(([k, v]) => (
                    <div key={k} className="flex gap-2.5 py-[5px] text-[13px]">
                        <dt className="w-[90px] shrink-0 text-muted-foreground">
                            {k}
                        </dt>
                        <dd className="min-w-0 flex-1">{v}</dd>
                    </div>
                ))}
            </dl>
        </Card>
    );
}

/**
 * The quick look over the calendar (the design's booking peek): who and
 * when, how it was paid, and what the desk does next — check in, no-show,
 * move, cancel with Undo. A class lists who holds each place and how they
 * paid. The full booking page keeps the history and everything else.
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

    return (
        <Sheet open={block !== null} onOpenChange={(o) => !o && onClose()}>
            <SheetContent className="flex w-full flex-col gap-0 bg-background p-0 sm:max-w-[420px]">
                {shown ? (
                    <Body block={shown} ctx={ctx} act={act} heldFor={heldFor} />
                ) : null}
            </SheetContent>
        </Sheet>
    );
}

function Body({
    block,
    ctx,
    act,
    heldFor,
}: {
    block: Block;
    ctx: QuickLookContext;
    act: QuickLookActions;
    heldFor: HeldFor;
}) {
    const start =
        block.kind === "one" ? block.booking.startAt : block.session.startAt;
    const date = localDateOf(start, ctx.timezone);
    const staff =
        block.kind === "one" ? block.booking.staff : block.session.staff;
    const title =
        block.kind === "one"
            ? whoFor(block.booking)
            : block.session.service.name;
    return (
        <>
            <SheetHeader className="space-y-0 border-b border-border bg-card py-3.5 pl-[18px] pr-14 text-left">
                <div className="flex items-center gap-2.5">
                    <div className="min-w-0 flex-1">
                        <SheetTitle className="font-display text-[17px] font-semibold tracking-[-0.02em]">
                            {title}
                        </SheetTitle>
                        <SheetDescription className="text-[12px] text-muted-foreground">
                            {dayLabel(date)} · {clock(block.start)}–
                            {clock(block.end)}
                            {staff ? ` · ${staff.name}` : ""}
                        </SheetDescription>
                    </div>
                    <StatePill state={block.state} />
                </div>
            </SheetHeader>
            <div className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto px-[18px] py-4">
                {block.kind === "one" ? (
                    <OneToOne
                        booking={block.booking}
                        date={date}
                        ctx={ctx}
                        act={act}
                        undo={heldFor(block.booking.id)}
                    />
                ) : (
                    <ClassLook
                        block={block}
                        ctx={ctx}
                        act={act}
                        heldFor={heldFor}
                    />
                )}
            </div>
        </>
    );
}

function OneToOne({
    booking: b,
    date,
    ctx,
    act,
    undo,
}: {
    booking: DiaryBooking;
    date: LocalDate;
    ctx: QuickLookContext;
    act: QuickLookActions;
    /** Undo for a change still held, beside it (the design's "Undo checked in"). */
    undo: (() => void) | null;
}) {
    const [moving, setMoving] = useState(false);
    const state = bookingState(b);
    const first = whoFor(b).split(" ")[0];
    const price = ctx.money
        ? formatMoney(b.service.priceCents ?? null, b.service.currency ?? null)
        : null;
    const paid =
        b.paidWith === "PAID"
            ? price
                ? `${price} paid`
                : "Paid"
            : b.paidWith === "DESK"
              ? "Not yet — pays at the desk"
              : paidText(b);
    const open = state === "booked" || state === "pending";
    const actions: ReactNode[] = [];
    if (undo) {
        actions.push(
            <Button
                key="undo"
                variant="outline"
                className={btn.ghost}
                onClick={undo}
            >
                {state === "in"
                    ? "Undo check-in"
                    : state === "noshow"
                      ? "Undo no-show"
                      : "Undo cancel"}
            </Button>,
        );
    } else if (ctx.canBook && open) {
        if (canCheckIn(b, ctx.now)) {
            actions.push(
                <Button
                    key="in"
                    className={btn.primary}
                    onClick={() => act.checkIn(b)}
                >
                    Check in
                </Button>,
            );
        }
        if (canMarkNoShow(b, ctx.now)) {
            actions.push(
                <Button
                    key="no"
                    variant="outline"
                    className={btn.ghost}
                    onClick={() => act.noShow(b)}
                >
                    No-show
                </Button>,
            );
        }
        actions.push(
            <Button
                key="mv"
                variant="outline"
                className={btn.ghost}
                aria-expanded={moving}
                onClick={() => setMoving((m) => !m)}
            >
                Move
            </Button>,
            <Button
                key="x"
                variant="outline"
                className={btn.danger}
                onClick={() => act.cancel(b)}
            >
                Cancel
            </Button>,
        );
    }
    if (!undo && ctx.canBook && state === "in" && canMarkNoShow(b, ctx.now)) {
        actions.push(
            <Button
                key="fix"
                variant="outline"
                className={btn.ghost}
                onClick={() => act.noShow(b)}
            >
                Mark no-show instead
            </Button>,
        );
    }
    if (!undo && ctx.canBook && state === "noshow") {
        actions.push(
            <Button
                key="fix"
                variant="outline"
                className={btn.ghost}
                onClick={() => act.checkIn(b)}
            >
                Mark attended instead
            </Button>,
        );
    }
    const rule = ctx.rules?.freeCancelHours;
    const help =
        state === "cancelled"
            ? `Cancelled${b.cancelledLate ? " late" : ""}. To see ${first} again, book a free time.`
            : `${open && rule !== null && rule !== undefined ? `Free to cancel until ${rule} ${rule === 1 ? "hour" : "hours"} before. ` : ""}Saroh doesn't message ${first} — tell them yourself if you move or cancel.`;

    return (
        <>
            <Rows
                rows={[
                    ["Service", b.service.name],
                    ["With", b.staff?.name ?? "Unassigned"],
                    ["Paid", paid],
                    ["Phone", b.bookerPhone ?? "—"],
                    ["Email", b.contact?.email ?? b.bookerEmail ?? "—"],
                ]}
            />
            <Card>
                {actions.length ? (
                    <div className="flex flex-wrap gap-2">{actions}</div>
                ) : null}
                <p
                    className={cn(
                        "text-[11.5px] text-muted-foreground",
                        actions.length && "mt-2",
                    )}
                >
                    {help}
                </p>
                {moving ? (
                    <MovePanel
                        booking={b}
                        date={date}
                        ctx={ctx}
                        onPick={(slot) => {
                            setMoving(false);
                            act.move(b, slot);
                        }}
                        onKeep={() => setMoving(false)}
                    />
                ) : null}
            </Card>
            <Links booking={b} />
        </>
    );
}

function Links({ booking: b }: { booking: DiaryBooking }) {
    const link =
        "flex items-center gap-2 rounded-[11px] border border-border bg-card px-3.5 py-[11px] text-[13px] font-semibold text-foreground hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
    return (
        <>
            {b.contact ? (
                <Link href={`/customers/${b.contact.id}`} className={link}>
                    <span className="flex-1">
                        {whoFor(b)} — their bookings and history
                    </span>
                    <ArrowRight aria-hidden className="size-4" />
                </Link>
            ) : null}
            <Link href={`/bookings/${b.id}`} className={link}>
                <span className="flex-1">
                    The full booking and what happened to it
                </span>
                <ArrowRight aria-hidden className="size-4" />
            </Link>
        </>
    );
}

/** The next free starts with the same person, over a week — pick one. */
function MovePanel({
    booking: b,
    date,
    ctx,
    onPick,
    onKeep,
}: {
    booking: DiaryBooking;
    date: LocalDate;
    ctx: QuickLookContext;
    onPick: (slot: Slot) => void;
    onKeep: () => void;
}) {
    const [slots, setSlots] = useState<Slot[] | null>(null);
    useEffect(() => {
        let live = true;
        const from = new Date(
            Math.max(ctx.now, Date.parse(`${date}T00:00:00Z`) - 86_400_000),
        );
        const to = new Date(from.getTime() + 8 * 86_400_000);
        void listAvailability(
            b.serviceId,
            from.toISOString(),
            to.toISOString(),
            b.staff?.id,
        ).then((found) => {
            if (live)
                setSlots(
                    found.filter((s) => s.startAt !== b.startAt).slice(0, 8),
                );
        });
        return () => {
            live = false;
        };
    }, [b.serviceId, b.staff?.id, b.startAt, ctx.now, date]);

    return (
        <div className="mt-3 border-t border-border/60 pt-3">
            <div className="mb-2 text-[13px] font-semibold">
                Move to another free time
                {b.staff ? ` with ${b.staff.name}` : ""}
            </div>
            {slots === null ? (
                <p
                    role="status"
                    className="text-[12.5px] text-muted-foreground"
                >
                    Finding free times…
                </p>
            ) : slots.length === 0 ? (
                <p className="text-[12.5px] text-muted-foreground">
                    Nothing free in the next week. Open more hours on the
                    calendar, or move it from the full booking.
                </p>
            ) : (
                <div className="flex flex-wrap gap-1.5">
                    {slots.map((s) => {
                        const label = `${dayLabel(localDateOf(s.startAt, ctx.timezone))} · ${clock(localMinuteOf(s.startAt, ctx.timezone))}`;
                        return (
                            <button
                                key={s.startAt}
                                type="button"
                                onClick={() => onPick(s)}
                                className="h-8 rounded-full border border-border bg-card px-3 text-[12.5px] font-medium hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 coarse:h-11"
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
            )}
            <button
                type="button"
                onClick={onKeep}
                className="mt-2 py-1 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground"
            >
                Keep the current time
            </button>
        </div>
    );
}

function ClassLook({
    block,
    ctx,
    act,
    heldFor,
}: {
    block: Extract<Block, { kind: "class" }>;
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
    return (
        <>
            <Rows
                rows={[
                    ["Class", s.service.name],
                    ["Teacher", s.staff?.name ?? "Unassigned"],
                    ...(price
                        ? ([["Price", `${price} or 1 class from a pack`]] as [
                              string,
                              string,
                          ][])
                        : []),
                    [
                        "Prepaid",
                        `${onPrepaid} of ${live.length} ${live.length === 1 ? "place" : "places"} on a pack or membership`,
                    ],
                ]}
            />
            {!cancelled ? (
                <Card>
                    <Eyebrow>Places</Eyebrow>
                    <div
                        role="progressbar"
                        aria-label="Places booked"
                        aria-valuemin={0}
                        aria-valuemax={s.capacity}
                        aria-valuenow={live.length}
                        className="h-2 overflow-hidden rounded-full bg-muted"
                    >
                        <div
                            className={cn(
                                "h-full",
                                full ? "bg-destructive" : "bg-success",
                            )}
                            style={{
                                width: `${Math.min(100, (live.length / Math.max(1, s.capacity)) * 100)}%`,
                            }}
                        />
                    </div>
                    <p className="mt-1.5 text-[12.5px]">
                        {live.length} of {s.capacity} booked
                        {full
                            ? " — full; cancelling a place frees one"
                            : ` · ${s.capacity - live.length} free`}
                    </p>
                </Card>
            ) : null}
            <ClassSeats session={s} ctx={ctx} act={act} heldFor={heldFor} />
            {ctx.canBook && live.length > 0 ? (
                <Card>
                    <Button
                        variant="outline"
                        className={btn.danger}
                        onClick={() => act.cancelClass(live, s.service.name)}
                    >
                        Cancel class
                    </Button>
                    <p className="mt-2 text-[11.5px] text-muted-foreground">
                        Cancelling the class gives back every class paid from a
                        pack or membership. Anyone who paid is refunded by you;
                        Saroh doesn&apos;t message them.
                    </p>
                </Card>
            ) : classUndo ? (
                <Card>
                    <Button
                        variant="outline"
                        className={btn.ghost}
                        onClick={classUndo}
                    >
                        Undo cancelling the class
                    </Button>
                </Card>
            ) : null}
        </>
    );
}

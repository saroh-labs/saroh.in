"use client";

import { ChipGroup, RadioCards } from "@/components/shared/fields/choice-group";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { Notice } from "@saroh/ui/notice";
import { TextLink } from "@saroh/ui/text-link";
import { ArrowLeft, Clock, Scissors } from "lucide-react";
import Link from "next/link";
import type { ReactNode, RefObject } from "react";
import { useId } from "react";

import { initialsOf } from "@/lib/customers/picker";
import { formatClock } from "@/lib/format/datetime";
import { formatMoney } from "@/lib/format/money";
import { firstName } from "@/lib/names";
import type { ServiceFit } from "@/lib/services/free-time";
import {
    blockLengthLabel,
    blockLengths,
    blockRange,
} from "@/lib/services/free-time";
import type { Service } from "@/lib/services/service";

import type { GapTarget } from "./gap-types";

/**
 * "Step 2 of 3 · Who is it for?" and a bar for each step. On a phone the
 * words are in the sheet's heading, so here they are for a screen reader
 * only; the step's start takes the keyboard when the step changes.
 */
export function StepBar({ step, name }: { step: number; name: string }) {
    return (
        <div className="grid gap-2">
            <p
                data-step-name=""
                tabIndex={-1}
                className="text-[12.5px] font-semibold text-muted-foreground outline-none max-[759px]:sr-only"
            >
                Step {step} of 3 · {name}
            </p>
            <div aria-hidden className="flex gap-1">
                {[1, 2, 3].map((n) => (
                    <span
                        key={n}
                        className={cn(
                            "h-1 flex-1 rounded-full",
                            n <= step ? "bg-foreground" : "bg-border",
                        )}
                    />
                ))}
            </div>
        </div>
    );
}

/**
 * Step 1 (BKMNewFromGap): the one-to-one services this person does, each
 * saying whether it fits ("45 min · fits, ends 4:45 pm") or why it is
 * greyed ("90 min · too long for this 60 min gap"). None: they take no
 * one-to-one services yet, and Services is where to choose who does what.
 */
export function ServiceList({
    staffName,
    offered,
    loading,
    fitOf,
    money,
    value,
    onChange,
}: {
    staffName: string;
    offered: readonly Service[];
    loading: boolean;
    fitOf: (s: Service) => ServiceFit;
    money: boolean;
    value: string | null;
    onChange: (id: string) => void;
}) {
    const id = useId();
    if (!offered.length) {
        return (
            <div className="grid justify-items-center gap-2 rounded-[12px] border border-border bg-card px-4 py-6 text-center">
                <p data-ph-mask="" className="text-[15px] font-semibold">
                    {firstName(staffName)} takes no one-to-one services yet
                </p>
                <p className="text-[13px] text-muted-foreground">
                    Choose who takes each service, then come back to this free
                    time.
                </p>
                <Button asChild variant="outline" size="sm" className="mt-1">
                    <Link href="/services">Open Services</Link>
                </Button>
            </div>
        );
    }
    return (
        <div className="grid gap-2">
            <span id={id} className="sr-only">
                Service
            </span>
            <RadioCards
                labelledBy={id}
                value={value}
                onChange={onChange}
                rowClassName="min-h-14 rounded-[12px] px-3.5 py-2.5 text-[14.5px] font-semibold"
                options={offered.map((s) => {
                    const fit = fitOf(s);
                    const price = money
                        ? formatMoney(s.payCents ?? s.priceCents, s.currency)
                        : null;
                    return {
                        value: s.id,
                        label: s.name,
                        note: (
                            <span
                                className={cn(
                                    fit.off &&
                                        "min-[760px]:text-destructive-subtle-foreground",
                                )}
                            >
                                {fit.note}
                            </span>
                        ),
                        aside: price ? (
                            <span className="font-semibold text-foreground">
                                {price}
                            </span>
                        ) : undefined,
                        disabled: fit.off,
                    };
                })}
            />
            {loading ? (
                <p
                    role="status"
                    className="text-[12.5px] text-muted-foreground"
                >
                    Finding when each can start…
                </p>
            ) : null}
        </div>
    );
}

/**
 * Step 3's check (BKMNewFromGap, BKDFromGap): who, what and when, each but
 * the time a tap from changing, and what to know about them first.
 */
export function CheckCard({
    customer,
    phone,
    service,
    amount,
    when,
    staffName,
    zone,
    attention,
    onCustomer,
    onService,
}: {
    customer: string;
    phone: string | null;
    service: Service;
    amount: string | null;
    when: string;
    staffName: string;
    /** "IST": the business's zone, as every time is shown in it (Q10). */
    zone: string;
    attention: string | null;
    onCustomer: () => void;
    onService: () => void;
}) {
    return (
        <div className="grid gap-2.5">
            <ul className="grid rounded-[12px] border border-border bg-card px-3.5">
                <CheckRow
                    icon={
                        <span className="text-[12.5px] font-semibold">
                            {initialsOf(customer)}
                        </span>
                    }
                    title={customer}
                    sub={phone ?? "No phone number"}
                    change={{
                        label: "Change who it’s for",
                        onPress: onCustomer,
                    }}
                />
                <CheckRow
                    icon={<Scissors className="size-[18px]" />}
                    title={service.name}
                    sub={`${service.durationMinutes} min${amount ? ` · ${amount}` : ""}`}
                    change={{ label: "Change the service", onPress: onService }}
                />
                <CheckRow
                    icon={<Clock className="size-[18px]" />}
                    title={when.charAt(0).toUpperCase() + when.slice(1)}
                    sub={`With ${staffName}${zone ? ` · ${zone}` : ""}`}
                />
            </ul>
            {attention ? (
                <Notice tone="warning" role="note">
                    <span data-ph-mask="">Needs attention: {attention}</span>
                </Notice>
            ) : null}
        </div>
    );
}

function CheckRow({
    icon,
    title,
    sub,
    change,
}: {
    icon: ReactNode;
    title: string;
    sub: string;
    change?: { label: string; onPress: () => void };
}) {
    return (
        <li className="flex min-h-14 items-center gap-3 border-b border-border py-2.5 last:border-b-0">
            <span
                aria-hidden
                className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"
            >
                {icon}
            </span>
            <span className="grid min-w-0 flex-1">
                <span
                    data-ph-mask=""
                    className="truncate text-[14.5px] font-semibold"
                >
                    {title}
                </span>
                <span
                    data-ph-mask=""
                    className="truncate text-[12.5px] text-muted-foreground"
                >
                    {sub}
                </span>
            </span>
            {change ? (
                <TextLink
                    onClick={change.onPress}
                    aria-label={change.label}
                    className="shrink-0 text-[13px] coarse:min-h-11"
                >
                    Change
                </TextLink>
            ) : null}
        </li>
    );
}

/**
 * Block this time (Q11, BKMGapOptABlock): how long from the start of the
 * free time, what it will be, and what blocking does.
 */
export function BlockFields({
    target,
    length,
    onLength,
}: {
    target: GapTarget;
    length: number;
    onLength: (minutes: number) => void;
}) {
    const id = useId();
    const { free } = target;
    const room = free[1] - free[0];
    return (
        <div className="grid gap-2.5">
            <span id={id} className="label">
                How long, from {formatClock(free[0])}
            </span>
            <ChipGroup
                labelledBy={id}
                value={String(length)}
                onChange={(m) => onLength(Number(m))}
                choices={blockLengths(room).map((m, i) => ({
                    value: String(m),
                    label: blockLengthLabel(m, i === 0),
                }))}
            />
            <div className="grid gap-1 rounded-[12px] bg-destructive-subtle px-3.5 py-3">
                <p className="text-[15px] font-semibold tabular-nums">
                    Blocked · {blockRange(free[0], length)}
                </p>
                <p className="text-[12.5px] leading-[1.5] text-muted-foreground">
                    Customers won’t be offered this time. It shows as time off
                    on the calendar.
                </p>
            </div>
        </div>
    );
}

/**
 * The foot: what is missing, Back from a later step, the one button, and
 * — only on one-off extra opening hours — the quiet "Close these extra
 * hours" (Q11). Its button is the form's submit, so Enter runs it too.
 */
export function GapFoot({
    footRef,
    block,
    blockLabel,
    message,
    onBack,
    label,
    busy,
    extra,
}: {
    footRef: RefObject<HTMLDivElement | null>;
    block: boolean;
    blockLabel: string;
    message: string | null;
    onBack: (() => void) | null;
    label: string;
    busy: boolean;
    extra: { range: string; onClose: () => void } | null;
}) {
    return (
        <div
            ref={footRef}
            data-overlay-foot
            className="mt-4 grid gap-2.5 border-t border-border pt-4"
        >
            {message ? (
                <p
                    role="alert"
                    className="text-[13px] font-medium text-destructive-subtle-foreground"
                >
                    {message}
                </p>
            ) : null}
            <div className="flex items-center gap-2">
                {onBack ? (
                    <Button
                        type="button"
                        variant="outline"
                        size="lg"
                        aria-label="Back"
                        onClick={onBack}
                        disabled={busy}
                        className="max-[759px]:w-12 max-[759px]:px-0"
                    >
                        <ArrowLeft aria-hidden className="size-4" />
                        <span className="max-[759px]:hidden">Back</span>
                    </Button>
                ) : null}
                <span className="hidden flex-1 min-[760px]:block" />
                <Button
                    type="submit"
                    size="lg"
                    busy={busy}
                    busyLabel={block ? "Blocking…" : "Booking…"}
                    className="flex-1 min-[760px]:flex-none"
                >
                    {block ? blockLabel : label}
                </Button>
            </div>
            {extra ? (
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 min-[760px]:order-first">
                    <TextLink
                        onClick={extra.onClose}
                        className="text-[13px] coarse:min-h-11"
                    >
                        Close these extra hours
                    </TextLink>
                    <span className="flex-1 text-[12px] leading-[1.4] text-muted-foreground">
                        {extra.range}. Bookings already in them are kept.
                    </span>
                </div>
            ) : null}
        </div>
    );
}

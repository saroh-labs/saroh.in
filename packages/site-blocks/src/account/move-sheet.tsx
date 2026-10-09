"use client";

import { useEffect, useId, useState } from "react";

import { destructiveAlertClasses } from "../alert";
import { OneToOne } from "../booking-flow/steps/one-to-one";
import { accentTint, focusRing } from "../booking-flow/styles";
import { phoneText } from "../lib/phone";
import { cn } from "../lib/utils";
import type { TimesResult } from "./bookings-api";
import { OFFLINE } from "./bookings-api";
import type { AccountTimes } from "./bookings-model";
import { timeLabel, timesAsDays } from "./bookings-model";
import { Sheet, sheetButton } from "./sheet";
import { ACCOUNT_TAB_HREF } from "./tab-bar";

/**
 * Picking a new time in a sheet (round-2 plan A, A6; Saroh Customer Site
 * design, the Move sheet): the booking page's two-week day strip and the
 * chosen day's free times with the same person (UX-055), one to choose,
 * and "Move to ‹time›". The same sheet books a
 * treatment's next visit. The times come from the site's server as the
 * sheet opens; a time that went meanwhile is said, and the list read again.
 *
 * And the sheet for a booking inside the free-cancel window, which can't be
 * moved here: "Call ‹business› to change this", with the number when the
 * business shows one.
 */

/** A choice in a sheet: the design's option row, in the site's tokens. */
export function sheetOption(on: boolean): string {
    return cn(
        "text-site-fg flex w-full cursor-pointer items-center gap-2.5 rounded-[calc(var(--site-radius)+10px)] px-3.5 py-3 text-left transition-colors hover:border-site-fg active:opacity-80",
        focusRing,
        on
            ? cn("border-site-accent border-2", accentTint)
            : "border-site-border bg-site-surface border",
    );
}

/** A sheet's second way out ("Keep it"). */
export const altButton = cn(
    "text-site-fg mt-2 block h-11 w-full cursor-pointer rounded-[calc(var(--site-radius)+8px)] text-sm font-semibold underline hover:opacity-80 active:opacity-70",
    focusRing,
);

/** A phone number as a `tel:` link. */
export function telHref(phone: string): string {
    return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

type Load =
    | { kind: "loading" }
    | { kind: "ready"; times: AccountTimes }
    | { kind: "failed"; message: string };

export function TimesSheet(props: TimesSheetProps) {
    // Mounted afresh on each open: it starts loading, with nothing picked.
    return props.open ? <OpenTimesSheet {...props} /> : null;
}

interface TimesSheetProps {
    open: boolean;
    title: string;
    lead: string;
    groupLabel?: string;
    /** Reads the free times; called each time the sheet opens. */
    load: () => Promise<TimesResult>;
    /** The button's words for the chosen time's label. */
    cta: (label: string) => string;
    confirm: (
        startAt: string,
    ) => Promise<{ ok: true; told?: boolean } | { ok: false; message: string }>;
    /**
     * Done: the page says so, with the chosen time's words, and whether the
     * business was told of it (A14).
     */
    onDone: (label: string, told: boolean) => void;
    onClose: () => void;
    businessName: string;
}

function OpenTimesSheet({
    open,
    title,
    lead,
    groupLabel = "New time",
    load,
    cta,
    confirm,
    onDone,
    onClose,
    businessName,
}: TimesSheetProps) {
    const [state, setState] = useState<Load>({ kind: "loading" });
    const [pick, setPick] = useState<string | null>(null);
    const [date, setDate] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);
    const [round, setRound] = useState(0);
    const groupId = useId();

    useEffect(() => {
        let live = true;
        void load()
            .catch((): TimesResult => ({ ok: false, message: OFFLINE }))
            .then((result) => {
                if (!live) return;
                setState(
                    result.ok
                        ? { kind: "ready", times: result.times }
                        : { kind: "failed", message: result.message },
                );
            });
        return () => {
            live = false;
        };
        // `load` is a new function each render; the sheet reads on open,
        // and again after a time went.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [round]);

    const times = state.kind === "ready" ? state.times : null;
    const label = pick && times ? timeLabel(pick, times.timezone) : null;
    const strip = times ? timesAsDays(times) : null;
    // The chosen day, else the first with a free time, as the booking page.
    const day =
        strip?.days.find((d) => d.date === date && d.starts.length > 0) ??
        strip?.days.find((d) => d.starts.length > 0) ??
        null;
    const off = busy || !pick;

    async function go() {
        if (!pick || !label || busy) return;
        setBusy(true);
        setProblem(null);
        const result = await confirm(pick).catch(
            (): { ok: false; message: string } => ({
                ok: false,
                message: OFFLINE,
            }),
        );
        setBusy(false);
        if (result.ok) {
            onDone(label, result.told === true);
            return;
        }
        setProblem(result.message);
        // What was free a moment ago may not be now: read it again.
        setState({ kind: "loading" });
        setPick(null);
        setRound((n) => n + 1);
    }

    return (
        <Sheet open={open} onClose={onClose} title={title} lead={lead}>
            {state.kind === "loading" ? (
                <p role="status" className="text-site-muted mt-3.5 text-sm">
                    Finding free times…
                </p>
            ) : state.kind === "failed" ? (
                <p
                    role="alert"
                    className={cn(destructiveAlertClasses, "mt-3.5")}
                >
                    {state.message}
                </p>
            ) : state.times.times.length === 0 ? (
                <p className="text-site-muted mt-2.5 text-[12.5px] leading-normal">
                    No free times in the next two weeks.{" "}
                    <a
                        href={ACCOUNT_TAB_HREF.messages}
                        className={cn(
                            "text-site-fg rounded-sm font-semibold underline",
                            focusRing,
                        )}
                    >
                        Send a message
                    </a>{" "}
                    and {businessName} will fit you in.
                </p>
            ) : (
                <div role="group" aria-labelledby={groupId} className="mt-3.5">
                    <div
                        id={groupId}
                        className="text-site-muted mb-1.5 text-xs font-bold uppercase tracking-[0.08em]"
                    >
                        {groupLabel}
                    </div>
                    {strip ? (
                        <OneToOne
                            days={strip}
                            day={day}
                            zone={strip.timezone}
                            phone
                            staff={state.times.staff ? [state.times.staff] : []}
                            chosen={
                                pick
                                    ? (day?.starts.find(
                                          (s) => s.startAt === pick,
                                      ) ?? null)
                                    : null
                            }
                            onDay={(d) => {
                                setDate(d);
                                setPick(null);
                            }}
                            onStart={(s) => setPick(s.startAt)}
                            business={businessName}
                        />
                    ) : null}
                </div>
            )}
            {problem ? (
                <p role="alert" className={cn(destructiveAlertClasses, "mt-3")}>
                    {problem}
                </p>
            ) : null}
            <button
                type="button"
                disabled={off}
                onClick={() => void go()}
                className={sheetButton(off)}
            >
                {busy ? "Saving…" : label ? cta(label) : "Pick a time"}
            </button>
        </Sheet>
    );
}

/** A booking inside the free-cancel window: only the business moves it. */
export function CallSheet({
    open,
    title,
    lead,
    businessName,
    phone,
    onClose,
}: {
    open: boolean;
    title: string;
    lead: string;
    businessName: string;
    phone: string | null;
    onClose: () => void;
}) {
    return (
        <Sheet open={open} onClose={onClose} title={title} lead={lead}>
            <p className="text-site-body mt-3 text-sm leading-normal">
                It's too close to the time to move it here. Call {businessName}{" "}
                to change this.
            </p>
            {phone ? (
                <a
                    href={telHref(phone)}
                    className={cn(
                        sheetButton(false),
                        "flex items-center justify-center",
                    )}
                >
                    Call {phoneText(phone)}
                </a>
            ) : (
                <button
                    type="button"
                    onClick={onClose}
                    className={sheetButton(false)}
                >
                    Done
                </button>
            )}
        </Sheet>
    );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { destructiveAlertClasses } from "../alert";
import type { Result } from "../booking-flow/api";
import { fetchDays } from "../booking-flow/api";
import type { BookingDays, BookingStart } from "../booking-flow/model";
import { Sessions } from "../booking-flow/steps/sessions";
import { card, focusRing, quietFill } from "../booking-flow/styles";
import { cn } from "../lib/utils";
import type { MoveResult } from "./bookings-api";
import { OFFLINE } from "./bookings-api";
import type { AccountBookingRow } from "./bookings-model";
import { BOOKINGS_HREF, timeLabel } from "./bookings-model";
import { bookingWhen } from "./model";
import { buttonClasses } from "./parts";

/**
 * Moving a class on the booking page (round-2 plan A, A6; Saroh Customer
 * Site design, "Moving: ‹class›"): `/book?move=‹ref›` shows the class's
 * sessions over the next two weeks, with the one booked now left out, and
 * "Move here" moves the place — and the credit that paid for it — to the
 * session chosen. The free-cancel deadline stays the one it was booked
 * with. A booking that can't be moved here says why and links back.
 */

const SHOWN = 10;

type Days =
    | { kind: "loading" }
    | { kind: "ready"; days: BookingDays }
    | { kind: "failed" };

export function MoveClass({
    row,
    apiUrl,
    businessName,
    move,
}: {
    /** The customer's booking, or null when it isn't theirs to move. */
    row: AccountBookingRow | null;
    apiUrl: string;
    businessName: string;
    move: (ref: string, startAt: string) => Promise<MoveResult>;
}) {
    const [days, setDays] = useState<Days>({ kind: "loading" });
    const [chosen, setChosen] = useState<BookingStart | null>(null);
    const [shown, setShown] = useState(SHOWN);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);
    const [moved, setMoved] = useState<string | null>(null);

    const serviceRef = row?.serviceRef ?? null;
    const read = useCallback(() => {
        if (!serviceRef) return;
        void fetchDays(apiUrl, serviceRef).then((result: Result<BookingDays>) =>
            setDays(
                result.ok
                    ? { kind: "ready", days: result.value }
                    : { kind: "failed" },
            ),
        );
    }, [apiUrl, serviceRef]);
    useEffect(read, [read]);

    const back = (
        <Link href={BOOKINGS_HREF} className={buttonClasses(false)}>
            Back to your bookings
        </Link>
    );

    if (row?.move !== "page") {
        return (
            <main className="mx-auto w-full max-w-[640px] px-[18px] py-6">
                <div className={card}>
                    <h1 className="font-site-heading text-site-fg m-0 text-[22px] font-semibold">
                        This can't be moved here
                    </h1>
                    <p className="text-site-body mt-2 text-sm leading-normal">
                        {row?.move === "call"
                            ? `It's too close to the time. Call ${businessName} to change this.`
                            : "We couldn't find a class of yours to move."}
                    </p>
                    <div className="mt-4">{back}</div>
                </div>
            </main>
        );
    }

    const sessions =
        days.kind === "ready"
            ? days.days.days
                  .flatMap((d) => d.starts)
                  .filter((s) => s.startAt !== row.startAt)
            : [];
    const zone = days.kind === "ready" ? days.days.timezone : row.timezone;
    const duration = Math.round(
        (new Date(row.endAt).getTime() - new Date(row.startAt).getTime()) /
            60_000,
    );

    async function go() {
        if (!row || !chosen || busy) return;
        setBusy(true);
        setProblem(null);
        const result = await move(row.ref, chosen.startAt).catch(
            (): MoveResult => ({ ok: false, message: OFFLINE }),
        );
        setBusy(false);
        if (result.ok) {
            setMoved(timeLabel(chosen.startAt, zone));
            return;
        }
        setProblem(result.message);
        setChosen(null);
        read();
    }

    if (moved) {
        return (
            <main className="mx-auto w-full max-w-[640px] px-[18px] py-6">
                <div className={card} role="status">
                    <h1 className="font-site-heading text-site-fg m-0 text-[22px] font-semibold">
                        Moved to {moved}
                    </h1>
                    <p className="text-site-body mt-2 text-sm leading-normal">
                        Your place and its credit moved with it.
                    </p>
                    <div className="mt-4">{back}</div>
                </div>
            </main>
        );
    }

    return (
        <main className="mx-auto grid w-full max-w-[640px] gap-3.5 px-[18px] py-6">
            <div
                className={cn(
                    "text-site-fg rounded-[calc(var(--site-radius)+12px)] px-4 py-3",
                    quietFill,
                )}
            >
                <div className="text-[15px] font-semibold">
                    Moving: {row.service}
                </div>
                <div className="text-site-muted mt-0.5 text-[12.5px]">
                    Booked now for {bookingWhen(row.startAt, row.timezone)}
                </div>
            </div>
            <div className={card}>
                <h2 className="font-site-heading text-site-fg m-0 mb-3 text-[19px] font-semibold">
                    Pick another session
                </h2>
                {days.kind === "loading" ? (
                    <p role="status" className="text-site-muted text-sm">
                        Finding sessions…
                    </p>
                ) : days.kind === "failed" ? (
                    <p role="alert" className={destructiveAlertClasses}>
                        We couldn't load the sessions. Please try again.
                    </p>
                ) : (
                    <Sessions
                        sessions={sessions.slice(0, shown)}
                        more={sessions.length > shown}
                        onMore={() => setShown((n) => n + SHOWN)}
                        zone={zone}
                        duration={duration}
                        chosen={chosen}
                        onPick={setChosen}
                    />
                )}
                {problem ? (
                    <p
                        role="alert"
                        className={cn(destructiveAlertClasses, "mt-3")}
                    >
                        {problem}
                    </p>
                ) : null}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        disabled={!chosen || busy}
                        onClick={() => void go()}
                        className={cn(
                            buttonClasses(true),
                            "h-12 px-5 text-[15px]",
                            focusRing,
                        )}
                    >
                        {busy ? "Moving…" : "Move here"}
                    </button>
                    {back}
                </div>
            </div>
        </main>
    );
}

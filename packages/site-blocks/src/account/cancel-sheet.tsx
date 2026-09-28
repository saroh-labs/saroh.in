"use client";

import { useState } from "react";

import { destructiveAlertClasses } from "../alert";
import { cn } from "../lib/utils";
import type { CancelResult } from "./bookings-api";
import { OFFLINE } from "./bookings-api";
import type { AccountBookingRow, AccountCancelResult } from "./bookings-model";
import { bookingTitle, cancelNote } from "./bookings-model";
import { altButton } from "./move-sheet";
import { Sheet, sheetButton } from "./sheet";

/**
 * "Cancel this booking?" (round-2 plan A, A6; Saroh Customer Site design,
 * the Cancel sheet): the booking, then what cancelling it now does — free
 * or past the free-cancellation time, what happens to money paid online
 * (the business's policy, DEC-058) and to a class credit — as the API
 * worked it out for this booking. "Keep it" closes the sheet.
 */
export function CancelSheet({
    row,
    cancel,
    onDone,
    onClose,
}: {
    /** The booking to cancel; null closes the sheet. */
    row: AccountBookingRow | null;
    cancel: (ref: string) => Promise<CancelResult>;
    onDone: (result: AccountCancelResult) => void;
    onClose: () => void;
}) {
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);

    async function go() {
        if (!row || busy) return;
        setBusy(true);
        setProblem(null);
        const result = await cancel(row.ref).catch((): CancelResult => ({
            ok: false,
            message: OFFLINE,
        }));
        setBusy(false);
        if (result.ok) onDone(result.result);
        else setProblem(result.message);
    }

    function close() {
        setProblem(null);
        onClose();
    }

    return (
        <Sheet
            open={row !== null}
            onClose={close}
            title="Cancel this booking?"
            lead={row ? bookingTitle(row) : undefined}
        >
            {row?.cancel ? (
                <p className="text-site-muted mt-2.5 text-[12.5px] leading-normal">
                    {cancelNote(row.cancel, row.timezone)}
                </p>
            ) : null}
            {problem ? (
                <p role="alert" className={cn(destructiveAlertClasses, "mt-3")}>
                    {problem}
                </p>
            ) : null}
            <button
                type="button"
                disabled={busy}
                onClick={() => void go()}
                className={sheetButton(busy)}
            >
                {busy ? "Cancelling…" : "Yes, cancel it"}
            </button>
            <button type="button" onClick={close} className={altButton}>
                Keep it
            </button>
        </Sheet>
    );
}

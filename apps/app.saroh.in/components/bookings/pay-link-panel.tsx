"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useId, useState } from "react";

import { createBookingPayLink } from "@/lib/services/actions";

/** The pay link a booking got, or why it couldn't. */
export type PayLinkResult =
    { ok: true; url: string } | { ok: false; error: string };

/** Make a booking's pay link, never throwing. */
export async function makePayLink(bookingId: string): Promise<PayLinkResult> {
    try {
        const res = await createBookingPayLink(bookingId);
        return res.ok
            ? { ok: true, url: res.data.url }
            : { ok: false, error: res.error };
    } catch {
        return { ok: false, error: "Couldn't make the pay link." };
    }
}

/**
 * After "Book it" with "Send a pay link" (E4): the booking is made, and here
 * is its link to copy and send — Saroh doesn't send it yet (A14, D17). The
 * link is shown in full, so it can be copied by hand where the clipboard
 * isn't allowed. When it couldn't be made, the booking still stands, and it
 * can be tried again.
 */
export function PayLinkPanel({
    booked,
    bookingId,
    first,
    onDone,
}: {
    /** "Booked Priya Raman with Asha at 10:00." */
    booked: string;
    bookingId: string;
    first: PayLinkResult;
    onDone: () => void;
}) {
    const id = useId();
    const [link, setLink] = useState(first);
    const [trying, setTrying] = useState(false);

    async function copy(url: string) {
        try {
            await navigator.clipboard.writeText(url);
            showSuccess("Pay link copied. Send it to them.");
        } catch {
            showError("Couldn't copy it — select the link and copy it.");
        }
    }

    return (
        <div className="grid gap-3">
            <p className="text-[13px] font-semibold">{booked}</p>
            {link.ok ? (
                <>
                    <div>
                        <label
                            htmlFor={id}
                            className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
                        >
                            Pay link
                        </label>
                        <Input
                            id={id}
                            readOnly
                            value={link.url}
                            onFocus={(e) => e.currentTarget.select()}
                            className="h-9 rounded-[9px] text-[12.5px]"
                        />
                    </div>
                    <p className="text-[12.5px] leading-[1.5] text-muted-foreground">
                        Send it to them however you talk. The booking shows
                        unpaid until they pay. Cancelling it stops the link; a
                        payment they&apos;d already started shows on Home as one
                        to refund.
                    </p>
                </>
            ) : (
                <p
                    role="alert"
                    className="text-[12.5px] leading-[1.5] text-destructive-subtle-foreground"
                >
                    {link.error} The booking is made — try again, or they can
                    pay at the session.
                </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
                <Button
                    type="button"
                    variant="outline"
                    className="h-[38px] rounded-[9px] px-4 text-[14px]"
                    onClick={onDone}
                >
                    Done
                </Button>
                {link.ok ? (
                    <Button
                        type="button"
                        className="h-[38px] rounded-[9px] px-4 text-[14px]"
                        onClick={() => void copy(link.url)}
                    >
                        Copy link
                    </Button>
                ) : (
                    <Button
                        type="button"
                        disabled={trying}
                        className="h-[38px] rounded-[9px] px-4 text-[14px]"
                        onClick={() => {
                            setTrying(true);
                            void makePayLink(bookingId).then((next) => {
                                setLink(next);
                                setTrying(false);
                            });
                        }}
                    >
                        {trying ? "Trying…" : "Try again"}
                    </Button>
                )}
            </div>
        </div>
    );
}

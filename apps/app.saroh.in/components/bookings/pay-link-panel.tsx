"use client";

import { Refusal } from "@/components/shared/refusal";
import { isRoleRefusal } from "@/lib/api/role-denied";
import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { useId, useState } from "react";

import { showPlanRefusal } from "@/components/billing/plan-refusal";
import { createBookingPayLink } from "@/lib/services/actions";
import { ShareLink } from "@saroh/ui/copy-button";

/** After why the link wasn't made: the booking stands, and what to do. */
const LINK_FAILED =
    "The booking is made. Try again, or they can pay at the session.";
/** The same for a role that can't make one: trying again won't help. */
const LINK_REFUSED = "The booking is made. They can pay at the session.";

/**
 * The pay link a booking got, or why it couldn't. `plan`: the business's
 * plan refused it (no online payments, R33) — trying again won't help.
 */
export type PayLinkResult =
    { ok: true; url: string } | { ok: false; error: string; plan?: boolean };

/**
 * Make a booking's pay link, never throwing. A refusal by the plan is
 * shown as the plan's notice, with the way up (`showPlanRefusal`), as
 * every other screen shows one — not as a plain error.
 */
export async function makePayLink(bookingId: string): Promise<PayLinkResult> {
    try {
        const res = await createBookingPayLink(bookingId);
        if (res.ok) return { ok: true, url: res.data.url };
        if (res.plan) {
            showPlanRefusal(res.plan);
            return { ok: false, error: res.error, plan: true };
        }
        return { ok: false, error: res.error };
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

    return (
        <div className="grid gap-3">
            <p className="text-[13px] font-semibold">{booked}</p>
            {link.ok ? (
                <>
                    <div>
                        <label htmlFor={id} className="label mb-1.5 block">
                            Pay link
                        </label>
                        <Input
                            id={id}
                            readOnly
                            value={link.url}
                            onFocus={(e) => e.currentTarget.select()}
                        />
                    </div>
                    <p className="text-[12.5px] leading-[1.5] text-muted-foreground">
                        Send it to them however you talk. The booking shows
                        unpaid until they pay. Cancelling it stops the link; a
                        payment they&apos;d already started shows on Home as one
                        to refund.
                    </p>
                </>
            ) : link.plan ? (
                <p className="text-[12.5px] leading-[1.5] text-muted-foreground">
                    No pay link — your plan doesn&apos;t take payment online.
                    The booking is made; they can pay at the session.
                </p>
            ) : (
                <Refusal>{`${link.error} ${isRoleRefusal(link.error) ? LINK_REFUSED : LINK_FAILED}`}</Refusal>
            )}
            <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" onClick={onDone}>
                    Done
                </Button>
                {link.ok ? (
                    <ShareLink
                        value={link.url}
                        text="Your link to pay for the booking"
                        variant="default"
                        size="default"
                    />
                ) : link.plan ? null : (
                    <Button
                        type="button"
                        onClick={() => {
                            setTrying(true);
                            void makePayLink(bookingId).then((next) => {
                                setLink(next);
                                setTrying(false);
                            });
                        }}
                        busy={trying}
                        busyLabel="Trying again…"
                    >
                        Try again
                    </Button>
                )}
            </div>
        </div>
    );
}

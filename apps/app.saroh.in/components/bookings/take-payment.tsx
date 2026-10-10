"use client";

import { Button } from "@saroh/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@saroh/ui/dialog";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import type { PayLinkResult } from "@/components/bookings/pay-link-panel";
import {
    makePayLink,
    PayLinkPanel,
} from "@/components/bookings/pay-link-panel";
import { Chip } from "@/components/shared/chip";
import { formatMoney } from "@/lib/format/money";
import { takeDeskPayment } from "@/lib/services/actions";
import type { DeskChoice, DeskTake } from "@/lib/services/desk-pay";
import {
    deskButton,
    deskChange,
    deskChoices,
    deskInput,
    deskNote,
    deskProblem,
    deskTakenText,
} from "@/lib/services/desk-pay";

/**
 * "Take ₹X" at the desk for a booking (round-2 P2): the walk-in's ways to
 * pay (B13) — cash with what was given and the change, UPI at the counter,
 * the card machine — or a pay link to send instead. Taking it marks the
 * booking's invoice paid (the API makes or finds it), and the page reads
 * "Paid at the desk · ‹method›". After a deposit only the rest is taken, and
 * a link isn't offered: a link bills the whole booking.
 *
 * No Undo on the toast: what was taken is an issued invoice, which never
 * changes (DEC-023) — a mistake is corrected on the invoice.
 */
export function TakePayment({
    bookingId,
    take,
    currency,
    who,
    canLink,
    online = true,
    variant = "default",
    triggerClassName,
    onTaken,
}: {
    bookingId: string;
    take: DeskTake;
    currency: string | null;
    /** "Priya Raman", for the pay link's line. */
    who: string;
    /** `booking:write` and `invoice:write`, with a provider connected. */
    canLink: boolean;
    /**
     * The plan takes payment online (R33). When it doesn't, "Send a pay
     * link" isn't offered at all; the counter ways are. Absent: yes.
     */
    online?: boolean;
    /** Outline beside another primary action (the quick look's Check in). */
    variant?: "default" | "outline";
    triggerClassName?: string;
    /** After it's taken or a link is made, beside the page's own refresh. */
    onTaken?: () => void;
}) {
    const router = useRouter();
    const ids = { given: useId(), how: useId(), error: useId() };
    const [open, setOpen] = useState(false);
    const [choice, setChoice] = useState<DeskChoice>("CASH");
    const [given, setGiven] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [link, setLink] = useState<PayLinkResult | null>(null);

    const format = (cents: number) => formatMoney(cents, currency) ?? "";
    const amount = format(take.cents);
    const choices = deskChoices({ take, canLink, online });
    const change = deskChange(given, take.cents);
    const problem = deskProblem(choice, given, take.cents, format);

    function reset() {
        setChoice("CASH");
        setGiven("");
        setError(null);
        setLink(null);
        setBusy(false);
    }

    function close() {
        setOpen(false);
        router.refresh();
        onTaken?.();
    }

    async function save() {
        if (busy || problem) return;
        setBusy(true);
        setError(null);
        if (choice === "LINK") {
            setLink(await makePayLink(bookingId));
            setBusy(false);
            return;
        }
        try {
            const res = await takeDeskPayment(
                bookingId,
                deskInput(choice, take.cents, given),
            );
            if (!res.ok) {
                setError(res.error);
                setBusy(false);
                return;
            }
            showSuccess(deskTakenText(res.data, format));
            close();
        } catch {
            setError(
                "Couldn't record the payment. Nothing was taken — try again.",
            );
            setBusy(false);
        }
    }

    return (
        <>
            <Button
                data-ph-unmask=""
                type="button"
                variant={variant}
                className={cn("cursor-pointer", triggerClassName)}
                onClick={() => {
                    reset();
                    setOpen(true);
                }}
            >
                Take {amount}
            </Button>
            <Dialog
                open={open}
                onOpenChange={(next) =>
                    next ? setOpen(true) : link ? close() : setOpen(false)
                }
            >
                <DialogContent className="sm:max-w-[440px]">
                    <DialogHeader>
                        <DialogTitle className="font-display text-[17px] tracking-[-0.02em]">
                            Take {amount}
                        </DialogTitle>
                        <DialogDescription className="text-[12.5px]">
                            {take.byLink
                                ? `What ${who} pays for this booking.`
                                : `What's left after the deposit ${who} paid online.`}
                        </DialogDescription>
                    </DialogHeader>
                    {link ? (
                        <PayLinkPanel
                            booked={`A pay link for ${amount}.`}
                            bookingId={bookingId}
                            first={link}
                            onDone={close}
                        />
                    ) : (
                        <div className="grid gap-2.5">
                            <div
                                id={ids.how}
                                className="text-[12.5px] font-medium"
                            >
                                How they pay
                            </div>
                            <div
                                role="radiogroup"
                                aria-labelledby={ids.how}
                                className="flex flex-wrap gap-1.5"
                            >
                                {choices.map((c) => (
                                    <Chip
                                        key={c.key}
                                        on={choice === c.key}
                                        disabled={c.off !== null}
                                        title={c.off ?? undefined}
                                        onClick={() => {
                                            setChoice(c.key);
                                            setError(null);
                                        }}
                                        className="cursor-pointer active:scale-[0.97] disabled:cursor-not-allowed"
                                    >
                                        {c.label}
                                    </Chip>
                                ))}
                            </div>
                            {choice === "CASH" ? (
                                <div className="flex flex-wrap items-end gap-2.5">
                                    <label
                                        htmlFor={ids.given}
                                        className="flex-[1_1_140px] text-[12px] font-medium"
                                    >
                                        Cash given
                                        <Input
                                            id={ids.given}
                                            type="text"
                                            inputMode="decimal"
                                            value={given}
                                            onChange={(e) => {
                                                setGiven(e.target.value);
                                                setError(null);
                                            }}
                                            placeholder={amount}
                                            autoComplete="off"
                                            aria-invalid={
                                                problem ? true : undefined
                                            }
                                            aria-describedby={
                                                problem ? ids.error : undefined
                                            }
                                            className="mt-[5px] h-[38px] rounded-lg bg-card px-2.5 text-[13.5px]"
                                        />
                                    </label>
                                    <div
                                        aria-live="polite"
                                        className={cn(
                                            "flex-[1_1_140px] pb-[9px] text-[13px] font-semibold",
                                            change.kind === "short"
                                                ? "text-destructive-subtle-foreground"
                                                : "text-success-subtle-foreground",
                                        )}
                                    >
                                        {change.kind === "change"
                                            ? `Change ${format(change.cents)}`
                                            : change.kind === "short"
                                              ? `Short ${format(change.cents)}`
                                              : ""}
                                    </div>
                                </div>
                            ) : null}
                            <p className="text-pretty text-[12.5px] leading-[1.5] text-muted-foreground">
                                {deskNote(choice, amount)}
                            </p>
                            {problem || error ? (
                                <p
                                    id={ids.error}
                                    role="alert"
                                    className="text-[12.5px] font-medium text-destructive"
                                >
                                    {problem ?? error}
                                </p>
                            ) : null}
                        </div>
                    )}
                    {link ? null : (
                        <DialogFooter className="gap-2 sm:gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                className="cursor-pointer"
                                onClick={() => setOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                data-ph-unmask=""
                                type="button"
                                className="cursor-pointer"
                                disabled={busy || Boolean(problem)}
                                aria-describedby={
                                    problem || error ? ids.error : undefined
                                }
                                onClick={() => void save()}
                            >
                                {busy
                                    ? choice === "LINK"
                                        ? "Making the link…"
                                        : "Recording…"
                                    : deskButton(choice, amount)}
                            </Button>
                        </DialogFooter>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}

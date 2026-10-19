"use client";

import { FormDialog, FormDialogFoot } from "@/components/shared/form-dialog";
import {
    FormSheet,
    FormSheetBody,
    FormSheetFoot,
} from "@/components/shared/form-sheet";
import { Refusal } from "@/components/shared/refusal";
import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import type { PayLinkResult } from "@/components/bookings/pay-link-panel";
import {
    LINK_STEP,
    makePayLink,
    PayLinkPanel,
} from "@/components/bookings/pay-link-panel";
import { useGstRateStep } from "@/components/gst-rates/use-gst-rate-step";
import { Chip } from "@/components/shared/chip";
import { runAction } from "@/lib/api/run-action";
import { UNREACHED } from "@/lib/api/unreached";
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
import { Field } from "@saroh/ui/field";
import { MoneyInput } from "@saroh/ui/money-input";
import { Segmented } from "@saroh/ui/segmented";
import { Tip } from "@saroh/ui/tooltip";
import { Link2 } from "lucide-react";

/**
 * "Take ₹X" at the desk for a booking (round-2 P2): the walk-in's ways to
 * pay (B13) — cash with what was given and the change, UPI at the counter,
 * the card machine — or a payment link to send instead. Taking it marks the
 * booking's invoice paid (the API makes or finds it), and the page reads
 * "Paid at the desk · ‹method›". After a deposit only the rest is taken, and
 * a link isn't offered: a link bills the whole booking.
 *
 * No Undo on the toast: what was taken is an issued invoice, which never
 * changes (DEC-023) — a mistake is corrected on the invoice.
 *
 * `panel` (a booking's page, U12; BKMBookingDetail, BKDBooking): a bottom
 * sheet on a phone and the right-hand panel at a desk, with "How are
 * they paying?" as Cash · UPI · Card and "Send a payment link instead"
 * under them. Left out, the dialog with the four as chips (the calendar's
 * quick look and All bookings).
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
    open: openProp,
    onOpenChange,
    panel = false,
}: {
    bookingId: string;
    take: DeskTake;
    currency: string | null;
    /** "Priya Raman", for the payment link's line. */
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
    /**
     * Opened from elsewhere (the quick look's main button or its More):
     * no trigger is drawn, and the screen holds whether it is open.
     */
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    /** A sheet with Cash · UPI · Card, not the dialog (U12). */
    panel?: boolean;
}) {
    const router = useRouter();
    const ids = { given: useId(), how: useId(), error: useId() };
    const [ownOpen, setOwnOpen] = useState(false);
    const controlled = openProp !== undefined;
    const open = controlled ? openProp : ownOpen;
    const setOpen = (next: boolean) =>
        controlled ? onOpenChange?.(next) : setOwnOpen(next);
    const [choice, setChoice] = useState<DeskChoice>("CASH");
    const [given, setGiven] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [link, setLink] = useState<PayLinkResult | null>(null);
    // What is wrong with the cash given is said once the button is pressed.
    const [tried, setTried] = useState(false);
    const rates = useGstRateStep({
        then: "take this payment",
        continueLabel: "Save and take payment",
    });

    const format = (cents: number) => formatMoney(cents, currency);
    const amount = format(take.cents);
    const choices = deskChoices({ take, canLink, online });
    const change = deskChange(given, take.cents);
    const problem = deskProblem(choice, given, take.cents, format);

    // Opened from elsewhere: each opening starts fresh, as the trigger's.
    const [wasOpen, setWasOpen] = useState(open);
    if (wasOpen !== open) {
        setWasOpen(open);
        if (open && controlled) reset();
    }

    function reset() {
        setChoice("CASH");
        setGiven("");
        setError(null);
        setLink(null);
        setBusy(false);
        setTried(false);
    }

    function close() {
        setOpen(false);
        router.refresh();
        onTaken?.();
    }

    async function save() {
        setTried(true);
        if (busy || problem) return;
        setBusy(true);
        setError(null);
        if (choice === "LINK") {
            // No GST rate on the service: chosen here, then the link.
            const made = await runAction(
                () => rates.run(() => makePayLink(bookingId), LINK_STEP),
                { setBusy },
            );
            if (made) setLink(made);
            return;
        }
        try {
            // The same for the desk: the rate is chosen in place, saved to
            // the service, and the payment is taken as it was asked.
            const res = await rates.run(() =>
                takeDeskPayment(
                    bookingId,
                    deskInput(choice, take.cents, given),
                ),
            );
            // Closed without choosing: nothing was taken, nothing to say.
            if (!res) {
                setBusy(false);
                return;
            }
            if (!res.ok) {
                setError(res.error);
                setBusy(false);
                return;
            }
            showSuccess(deskTakenText(res.data, format));
            close();
        } catch {
            setError(UNREACHED);
            setBusy(false);
        }
    }

    const title = `Take ${amount}`;
    const description = take.byLink
        ? `What ${who} pays for this booking.`
        : `What's left after the deposit ${who} paid online.`;
    const pick = (next: DeskChoice) => {
        setChoice(next);
        setError(null);
    };
    const counter = choices.filter((c) => c.key !== "LINK");
    const linkChoice = choices.find((c) => c.key === "LINK");

    const how = panel ? (
        <>
            <div id={ids.how} className="label">
                How are they paying?
            </div>
            <Segmented
                label="How are they paying?"
                aria-labelledby={ids.how}
                block
                size="md"
                value={choice}
                onValueChange={(v) => pick(v)}
                options={counter.map((c) => ({
                    value: c.key,
                    label: c.label,
                }))}
            />
        </>
    ) : (
        <>
            <div id={ids.how} className="text-[12.5px] font-medium">
                How they pay
            </div>
            <div
                role="radiogroup"
                aria-labelledby={ids.how}
                className="flex flex-wrap gap-1.5"
            >
                {choices.map((c) => (
                    <Tip key={c.key} label={c.off ?? undefined}>
                        <Chip
                            on={choice === c.key}
                            disabled={c.off !== null}
                            onClick={() => pick(c.key)}
                            className="cursor-pointer active:scale-[0.97] disabled:cursor-not-allowed"
                        >
                            {c.label}
                        </Chip>
                    </Tip>
                ))}
            </div>
        </>
    );

    const fields = (
        <div className="grid gap-2.5">
            {how}
            {choice === "CASH" ? (
                <div className="flex flex-wrap items-end gap-2.5">
                    <Field label="Cash given" className="flex-[1_1_140px]">
                        {currency ? (
                            <MoneyInput
                                currency={currency}
                                value={given}
                                onValueChange={(next) => {
                                    setGiven(next);
                                    setError(null);
                                }}
                                placeholder={amount}
                                aria-invalid={problem ? true : undefined}
                                aria-describedby={
                                    problem ? ids.error : undefined
                                }
                                className="bg-card"
                            />
                        ) : (
                            <Input
                                type="text"
                                inputMode="decimal"
                                value={given}
                                onChange={(e) => {
                                    setGiven(e.target.value);
                                    setError(null);
                                }}
                                placeholder={amount}
                                autoComplete="off"
                                aria-invalid={problem ? true : undefined}
                                aria-describedby={
                                    problem ? ids.error : undefined
                                }
                                className="bg-card"
                            />
                        )}
                    </Field>
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
            {/* A link bills the whole booking and needs a provider: offered
                here only when it can be made (the dialog's chip says why
                it can't). */}
            {panel && linkChoice?.off === null ? (
                <Button
                    type="button"
                    variant="link"
                    size="inline"
                    aria-pressed={choice === "LINK"}
                    className="gap-1.5 justify-self-start"
                    onClick={() => pick("LINK")}
                >
                    <Link2 aria-hidden className="size-4" />
                    Send a payment link instead
                </Button>
            ) : null}
            {/* What is wrong with the amount is the field's own line. Why
                the payment wasn't taken is the save's: calm when the role
                refused it. */}
            {problem && (tried || given !== "" || error) ? (
                <p
                    id={ids.error}
                    role="alert"
                    className="text-[12.5px] font-medium text-destructive-subtle-foreground"
                >
                    {problem}
                </p>
            ) : (
                <Refusal>{error}</Refusal>
            )}
        </div>
    );
    const linkPanel = link ? (
        <PayLinkPanel
            booked={`A payment link for ${amount}.`}
            bookingId={bookingId}
            first={link}
            onDone={close}
        />
    ) : null;
    const foot = {
        saveLabel: deskButton(choice, amount),
        savingLabel: choice === "LINK" ? "Making the link…" : "Recording…",
        onSubmit: save,
    };
    const onClose = () => (link ? close() : setOpen(false));

    return (
        <>
            {controlled ? null : (
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
            )}
            {panel ? (
                <FormSheet
                    open={open}
                    bottomOnPhone
                    title={title}
                    description={description}
                    pending={busy}
                    onClose={onClose}
                >
                    <FormSheetBody>{linkPanel ?? fields}</FormSheetBody>
                    {link ? null : <FormSheetFoot {...foot} />}
                </FormSheet>
            ) : (
                <FormDialog
                    open={open}
                    size="md"
                    title={title}
                    description={description}
                    pending={busy}
                    onClose={onClose}
                >
                    {linkPanel ?? fields}
                    {link ? null : <FormDialogFoot {...foot} />}
                </FormDialog>
            )}
            {rates.step}
        </>
    );
}

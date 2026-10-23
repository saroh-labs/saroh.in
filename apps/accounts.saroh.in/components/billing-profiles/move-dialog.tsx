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
import { cn } from "@saroh/ui/lib/utils";
import { RadioGroup, RadioGroupItem } from "@saroh/ui/radio-group";
import { textLinkClass } from "@saroh/ui/text-link";
import { showError, showSuccess } from "@saroh/ui/toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import type { MoveDone } from "@/lib/billing-profile-actions";
import { moveBusinessAction } from "@/lib/billing-profile-actions";
import type { BillingProfile, ProfileBusiness } from "@/lib/billing-profiles";
import {
    moveBusinessLine,
    moveConfirm,
    moveNote,
    moveTarget,
    shortDate,
} from "@/lib/billing-profiles";

/**
 * Move a business to another of the owner's profiles (F5). A free business
 * moves now; a paid one at its next renewal, and only to a profile Razorpay
 * has linked (the others are shown, off, with why). A paid move then asks
 * for the plan to be authorised on the new profile: Razorpay's page when it
 * gave one, else the business's Plan & billing, where Your plan continues
 * the same payment.
 */
export function MoveDialog({
    business,
    from,
    profiles,
    appUrl,
    open,
    onClose,
}: {
    business: ProfileBusiness;
    /** The profile it is billed to now. */
    from: BillingProfile;
    profiles: readonly BillingProfile[];
    /** Saroh itself, for the business's Plan & billing. */
    appUrl: string;
    open: boolean;
    onClose: () => void;
}) {
    const router = useRouter();
    const titleId = useId();
    const choices = profiles.map((p) => ({
        profile: p,
        ...moveTarget(p, business, from.id),
    }));
    const first = choices.find((c) => !c.disabled)?.profile.id ?? "";
    const [target, setTarget] = useState(first);
    const [refusal, setRefusal] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [started, setStarted] = useState<MoveDone["authorise"]>(null);
    const chosen = profiles.find((p) => p.id === target);
    const note = moveNote(business, from.legalName, chosen?.legalName ?? "");

    async function move() {
        if (!chosen) return;
        setRefusal(null);
        setBusy(true);
        const res = await moveBusinessAction(chosen.id, business.id).catch(
            () => null,
        );
        setBusy(false);
        if (!res) {
            showError("That couldn't be saved just now. Try again.");
            return;
        }
        if (!res.ok) {
            if (res.field === "billingProfile" || res.code) {
                setRefusal(res.error);
            } else showError(res.error);
            return;
        }
        if (res.data.outcome === "scheduled" && res.data.authorise) {
            setStarted(res.data.authorise);
            router.refresh();
            return;
        }
        if (res.data.outcome === "applied") {
            showSuccess(
                `Saroh bills ${chosen.legalName} for ${business.name} from now on.`,
            );
        }
        onClose();
        router.refresh();
    }

    const planAndBilling = `${appUrl}/open/${encodeURIComponent(business.id)}?to=${encodeURIComponent("/settings/billing")}`;

    return (
        <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
            <DialogContent
                size="md"
                aria-labelledby={titleId}
                className="gap-0 p-0"
            >
                {started ? (
                    <div className="flex flex-col gap-3 px-[22px] py-5">
                        <DialogHeader>
                            <DialogTitle id={titleId} className="text-lg">
                                Authorise the payment
                            </DialogTitle>
                            <DialogDescription className="text-[13px] leading-normal">
                                From {shortDate(started.at)}, Saroh bills{" "}
                                {started.legalName}. Authorise the payment to
                                finish.
                            </DialogDescription>
                        </DialogHeader>
                        <p className="text-muted-foreground text-[13px] leading-[1.55]">
                            Razorpay sets up the autopay for {started.legalName}
                            . Until {shortDate(started.at)}, {business.name}{" "}
                            stays billed as it is now. If you don&apos;t
                            authorise it within a day, nothing changes.
                        </p>
                        <DialogFooter className="mt-1">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={onClose}
                            >
                                Not now
                            </Button>
                            {started.authorisationUrl ? (
                                <Button asChild>
                                    <a href={started.authorisationUrl}>
                                        Authorise payment
                                    </a>
                                </Button>
                            ) : (
                                <Button asChild>
                                    <a href={planAndBilling}>
                                        Authorise in Plan &amp; billing
                                    </a>
                                </Button>
                            )}
                        </DialogFooter>
                    </div>
                ) : (
                    <>
                        <DialogHeader className="px-[22px] pb-1 pt-5">
                            <DialogTitle id={titleId} className="text-lg">
                                Move {business.name}
                            </DialogTitle>
                            <DialogDescription className="text-[13px] leading-normal">
                                {moveBusinessLine(business, from.legalName)}
                            </DialogDescription>
                        </DialogHeader>
                        <fieldset className="m-0 flex flex-col gap-2 border-0 px-[22px] py-3.5">
                            <legend className="mb-0.5 text-[12.5px] font-medium">
                                Bill it to
                            </legend>
                            <RadioGroup
                                value={target}
                                onValueChange={(v) => {
                                    setTarget(v);
                                    setRefusal(null);
                                }}
                                aria-label="Bill it to"
                                className="flex flex-col gap-2"
                            >
                                {choices.map(({ profile, line, disabled }) => (
                                    <label
                                        key={profile.id}
                                        className={cn(
                                            "duration-fast flex items-start gap-2.5 rounded-[9px] border px-[13px] py-[11px] transition-colors",
                                            disabled
                                                ? "bg-muted/60 text-muted-foreground cursor-default"
                                                : "bg-card hover:border-border-strong cursor-pointer",
                                            profile.id === target
                                                ? "border-foreground"
                                                : "border-border",
                                        )}
                                    >
                                        <RadioGroupItem
                                            value={profile.id}
                                            disabled={disabled}
                                            className="mt-0.5"
                                        />
                                        <span className="flex min-w-0 flex-col gap-px">
                                            <span className="text-[13.5px] font-medium [overflow-wrap:anywhere]">
                                                {profile.legalName}
                                            </span>
                                            <span className="text-muted-foreground text-[11.5px]">
                                                {line}
                                            </span>
                                        </span>
                                    </label>
                                ))}
                            </RadioGroup>
                            <Link
                                href={`/account/billing-profiles?add=1&bill=${encodeURIComponent(business.id)}`}
                                className={cn(
                                    textLinkClass(),
                                    "w-fit py-1.5 text-[12.5px]",
                                )}
                            >
                                + A new billing profile
                            </Link>
                            {!first ? (
                                <p className="text-muted-foreground text-[12.5px]">
                                    None of your other profiles can take it yet.
                                    Add a new one to move it to.
                                </p>
                            ) : null}
                            {refusal ? (
                                <p
                                    role="alert"
                                    className="text-destructive-hover text-[12.5px]"
                                >
                                    {refusal}
                                </p>
                            ) : null}
                            {chosen ? (
                                <div
                                    className="bg-muted/60 dark:text-muted-foreground mt-1 rounded-[10px] px-3.5 py-[13px] text-[12.5px] leading-[1.55] text-neutral-700"
                                    data-move-note={
                                        business.paid ? "paid" : "free"
                                    }
                                >
                                    <strong className="text-foreground">
                                        {note.strong}
                                    </strong>{" "}
                                    {note.rest}
                                </div>
                            ) : null}
                        </fieldset>
                        <DialogFooter className="px-[22px] pb-5 pt-1">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={onClose}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                disabled={!chosen}
                                busy={busy}
                                busyLabel="Moving…"
                                onClick={() => void move()}
                            >
                                {moveConfirm(business)}
                            </Button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}

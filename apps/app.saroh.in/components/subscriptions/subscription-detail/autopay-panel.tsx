"use client";

import { Button } from "@saroh/ui/button";
import { Checkbox } from "@saroh/ui/checkbox";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import type { ConfirmResult } from "@/components/shared/confirm-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormDialog } from "@/components/shared/form-dialog";
import { cancelAutopay, sendAutopayLink } from "@/lib/subscriptions/actions";
import type { AutopayPanel } from "@/lib/subscriptions/autopay";
import {
    AUTOPAY_METHOD_LABEL,
    cancelledText,
    methodNote,
} from "@/lib/subscriptions/autopay";
import type {
    AutopayCard,
    AutopayLink,
    AutopayMethod,
} from "@/lib/subscriptions/service";
import { dayText, money } from "@/lib/subscriptions/view";
/**
 * Autopay under the Plan card's "Pays by" line (D14): how it came to be,
 * what needs attention, and — for someone with `subscription:write` —
 * "Send a set-up link" and "Cancel autopay", each asked before it acts.
 * `openSend` opens the set-up sheet straight away (Home's "Send a set-up
 * link", D14), only when it is offered here.
 */
export function AutopayActions({
    subscriptionId,
    panel,
    card,
    firstName,
    timeZone,
    now,
    openSend = false,
}: {
    subscriptionId: string;
    panel: AutopayPanel;
    card: AutopayCard | null;
    openSend?: boolean;
    firstName: string;
    timeZone: string;
    now: Date;
}) {
    const [open, setOpen] = useState<"send" | "cancel" | null>(() =>
        openSend && panel.sendLabel !== null && card ? "send" : null,
    );
    const showsActions = panel.sendLabel !== null || panel.canCancel;
    if (!panel.detail && !panel.notice && !showsActions) return null;
    return (
        <>
            {panel.detail ? (
                <div className="mt-1 text-[12px] text-muted-foreground">
                    {panel.detail}
                </div>
            ) : null}
            {panel.notice ? (
                <p
                    role={panel.notice.tone === "warn" ? "alert" : "status"}
                    className={cn(
                        "mt-2 rounded-[8px] px-2.5 py-2 text-[12.5px] font-semibold",
                        panel.notice.tone === "warn"
                            ? "bg-destructive-subtle text-destructive-subtle-foreground"
                            : "bg-muted text-foreground/80",
                    )}
                >
                    {panel.notice.text}
                </p>
            ) : null}
            {showsActions ? (
                <div className="mt-2.5 flex flex-wrap gap-2">
                    {panel.sendLabel ? (
                        <Button
                            size="sm"
                            variant={
                                panel.notice?.tone === "warn"
                                    ? "default"
                                    : "outline"
                            }
                            onClick={() => setOpen("send")}
                        >
                            {panel.sendLabel}
                        </Button>
                    ) : null}
                    {panel.canCancel ? (
                        <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive-subtle-foreground hover:text-destructive-subtle-foreground"
                            onClick={() => setOpen("cancel")}
                        >
                            Cancel autopay
                        </Button>
                    ) : null}
                </div>
            ) : null}
            {open === "send" && card ? (
                <SendLinkDialog
                    subscriptionId={subscriptionId}
                    card={card}
                    firstName={firstName}
                    timeZone={timeZone}
                    now={now}
                    onClose={() => setOpen(null)}
                />
            ) : null}
            <CancelAutopay
                open={open === "cancel"}
                subscriptionId={subscriptionId}
                firstName={firstName}
                provider={card?.provider ?? null}
                emailTo={card?.emailTo ?? null}
                onClose={() => setOpen(null)}
            />
        </>
    );
}

/**
 * Pick the method — the provider's page is for one — and whether Saroh
 * emails it; then the link, shown once, to copy.
 */
function SendLinkDialog({
    subscriptionId,
    card,
    firstName,
    timeZone,
    now,
    onClose,
}: {
    subscriptionId: string;
    card: AutopayCard;
    firstName: string;
    timeZone: string;
    now: Date;
    onClose: () => void;
}) {
    const router = useRouter();
    const emailId = useId();
    const [method, setMethod] = useState<AutopayMethod | null>(
        card.methods.length === 1 ? (card.methods[0] ?? null) : null,
    );
    const [email, setEmail] = useState(card.emailTo !== null);
    const [busy, setBusy] = useState(false);
    const [tried, setTried] = useState(false);
    const [made, setMade] = useState<AutopayLink | null>(null);
    const provider = card.provider ?? "your payment provider";

    async function make() {
        setTried(true);
        if (!method) return;
        setBusy(true);
        const res = await sendAutopayLink(
            subscriptionId,
            method,
            email && card.emailTo !== null,
        ).catch((): { ok: false; error: string } => ({
            ok: false,
            error: "Saroh couldn't be reached. Nothing was sent. Try again.",
        }));
        setBusy(false);
        if (!res.ok) {
            showError(res.error);
            router.refresh();
            return;
        }
        setMade(res.data);
        router.refresh();
    }

    if (made) {
        return (
            <FormDialog
                open
                size="md"
                title="Set-up link ready"
                description={`${
                    made.emailed?.status === "QUEUED"
                        ? `Emailed to ${made.emailed.to}. You can copy it too.`
                        : made.emailed?.status === "SUPPRESSED"
                          ? `${firstName} has turned off email, so it wasn't sent. Copy it and send it to them yourself.`
                          : `Copy it and send it to ${firstName} yourself.`
                } It covers renewals up to ${money(made.limit, made.currency)} and works until ${dayText(made.expiresAt, timeZone, now)}.`}
                doneOnly
                fieldsClassName="gap-0"
                onClose={onClose}
            >
                {made.emailProblem ? (
                    <p className="mt-2 text-[12.5px] text-muted-foreground">
                        Not emailed: {made.emailProblem}
                    </p>
                ) : null}
                <LinkBox url={made.url} />
            </FormDialog>
        );
    }

    const limitLow = card.limitLow;
    return (
        <FormDialog
            open
            size="md"
            title="Send a set-up link"
            description={`${firstName} approves autopay on ${provider}'s page. The link is for one way to pay. Pick the one they'll use.${
                limitLow
                    ? ` Its limit covers this renewal of ${money(limitLow.amount, limitLow.currency)}. Once they approve it, it replaces their current autopay.`
                    : ""
            }`}
            pending={busy}
            saveLabel="Make link"
            savingLabel="Making…"
            fieldsClassName="gap-0"
            onClose={onClose}
            onSubmit={make}
        >
            <div
                role="radiogroup"
                aria-label="Way to pay"
                className="flex flex-col gap-1.5"
            >
                {card.methods.map((m) => {
                    const on = method === m;
                    return (
                        <button
                            key={m}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() => setMethod(m)}
                            className={cn(
                                "flex w-full cursor-pointer flex-col rounded-[9px] px-3 py-2.5 text-left text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-muted coarse:min-h-11",
                                on
                                    ? "border-[1.5px] border-foreground bg-muted/50 font-semibold"
                                    : "border border-border bg-card font-medium hover:border-border-strong",
                            )}
                        >
                            {AUTOPAY_METHOD_LABEL[m]}
                            <span className="text-[12px] font-normal text-muted-foreground">
                                {methodNote(card, m)}
                            </span>
                        </button>
                    );
                })}
            </div>
            {tried && !method ? (
                <p
                    role="alert"
                    className="mt-2 text-[12.5px] font-medium text-destructive-subtle-foreground"
                >
                    Pick the way they&apos;ll pay.
                </p>
            ) : null}
            {card.emailTo ? (
                <div className="mt-3 flex items-start gap-2.5">
                    <Checkbox
                        id={emailId}
                        checked={email}
                        onCheckedChange={(c) => setEmail(c === true)}
                        className="mt-0.5"
                    />
                    <Label
                        htmlFor={emailId}
                        className="text-[13px] font-normal leading-[1.5]"
                    >
                        Email it to {card.emailTo}
                        <span className="block text-[12px] text-muted-foreground">
                            You can copy the link either way.
                        </span>
                    </Label>
                </div>
            ) : (
                <p className="mt-3 text-[12.5px] text-muted-foreground">
                    You&apos;ll copy the link and send it to {firstName}{" "}
                    yourself.
                </p>
            )}
        </FormDialog>
    );
}

/** The link, shown once: Saroh keeps no copy of it. */
function LinkBox({ url }: { url: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-[1_1_220px] truncate rounded-[8px] border border-border bg-card px-2.5 py-1.5 font-mono text-[12px]">
                {url}
            </span>
            <Button
                size="sm"
                variant="outline"
                onClick={() => {
                    void navigator.clipboard.writeText(url).then(
                        () => setCopied(true),
                        () =>
                            showError(
                                "Couldn't copy it. Select the link and copy it by hand.",
                            ),
                    );
                }}
            >
                {copied ? "Copied" : "Copy link"}
            </Button>
            <span className="basis-full text-[12px] text-muted-foreground">
                Shown once. Saroh doesn&apos;t keep it. Make another if
                it&apos;s lost.
            </span>
        </div>
    );
}

/**
 * Cancelling autopay can't be taken back: their bank is told, and they
 * would have to approve it again. So the one confirm asks first.
 */
function CancelAutopay({
    open,
    subscriptionId,
    firstName,
    provider,
    emailTo,
    onClose,
}: {
    open: boolean;
    subscriptionId: string;
    firstName: string;
    provider: string | null;
    /** Where Saroh emails them to say so (D14); null: not emailed. */
    emailTo: string | null;
    onClose: () => void;
}) {
    const router = useRouter();
    const at = provider ?? "your payment provider";

    async function go(): Promise<ConfirmResult> {
        const res = await cancelAutopay(subscriptionId).catch(
            (): { ok: false; error: string } => ({
                ok: false,
                error: "Saroh couldn't be reached. Nothing changed. Try again.",
            }),
        );
        if (!res.ok) {
            router.refresh();
            return { ok: false, error: res.error };
        }
        const said = cancelledText(res.data, firstName);
        showSuccess(said.title, said.detail);
        router.refresh();
    }

    return (
        <ConfirmDialog
            open={open}
            onOpenChange={(o) => (o ? null : onClose())}
            title="Cancel autopay?"
            description={`${firstName}'s autopay stops now and ${at} is asked to cancel it. The subscription carries on: the next renewal is invoiced with a pay link.${
                emailTo
                    ? ` Saroh emails ${firstName} at ${emailTo} to say so.`
                    : ""
            } This cannot be undone.`}
            confirmLabel="Cancel autopay"
            keepLabel="Keep autopay"
            onConfirm={go}
        />
    );
}

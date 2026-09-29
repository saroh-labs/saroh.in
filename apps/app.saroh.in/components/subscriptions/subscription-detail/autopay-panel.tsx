"use client";

import { Button } from "@saroh/ui/button";
import { Checkbox } from "@saroh/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "@saroh/ui/dialog";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

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

const BTN = "h-[38px] rounded-[9px] px-4 text-[14px] font-semibold";
/** The Plan card's own small actions, 44px on touch. */
const SMALL = "h-8 rounded-[8px] px-3 text-[12.5px] font-semibold coarse:h-11";

/**
 * Autopay under the Plan card's "Pays by" line (D14): how it came to be,
 * what needs attention, and — for someone with `subscription:write` —
 * "Send a set-up link" and "Cancel autopay", each asked before it acts.
 */
export function AutopayActions({
    subscriptionId,
    panel,
    card,
    firstName,
    timeZone,
    now,
}: {
    subscriptionId: string;
    panel: AutopayPanel;
    card: AutopayCard | null;
    firstName: string;
    timeZone: string;
    now: Date;
}) {
    const [open, setOpen] = useState<"send" | "cancel" | null>(null);
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
                            variant={
                                panel.notice?.tone === "warn"
                                    ? "default"
                                    : "outline"
                            }
                            className={SMALL}
                            onClick={() => setOpen("send")}
                        >
                            {panel.sendLabel}
                        </Button>
                    ) : null}
                    {panel.canCancel ? (
                        <Button
                            variant="outline"
                            className={cn(
                                SMALL,
                                "text-destructive-subtle-foreground hover:text-destructive-subtle-foreground",
                            )}
                            onClick={() => setOpen("cancel")}
                        >
                            Cancel autopay
                        </Button>
                    ) : null}
                </div>
            ) : null}
            <Dialog
                open={open !== null}
                onOpenChange={(o) => (!o ? setOpen(null) : null)}
            >
                <DialogContent className="w-[calc(100%-40px)] max-w-[440px] gap-0 rounded-[14px] border-0 px-5 py-[18px] sm:rounded-[14px] [&>button:last-child]:hidden">
                    {open === "send" && card ? (
                        <SendLinkBody
                            subscriptionId={subscriptionId}
                            card={card}
                            firstName={firstName}
                            timeZone={timeZone}
                            now={now}
                            onClose={() => setOpen(null)}
                        />
                    ) : open === "cancel" ? (
                        <CancelBody
                            subscriptionId={subscriptionId}
                            firstName={firstName}
                            provider={card?.provider ?? null}
                            onClose={() => setOpen(null)}
                        />
                    ) : null}
                </DialogContent>
            </Dialog>
        </>
    );
}

function Footer({ children }: { children: React.ReactNode }) {
    return (
        <div className="mt-3.5 flex flex-wrap justify-end gap-2">
            {children}
        </div>
    );
}

/**
 * Pick the method — the provider's page is for one — and whether Saroh
 * emails it; then the link, shown once, to copy.
 */
function SendLinkBody({
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
    const [made, setMade] = useState<AutopayLink | null>(null);
    const provider = card.provider ?? "your payment provider";

    async function make() {
        if (!method) return;
        setBusy(true);
        const res = await sendAutopayLink(
            subscriptionId,
            method,
            email && card.emailTo !== null,
        ).catch((): { ok: false; error: string } => ({
            ok: false,
            error: "Saroh couldn't be reached. Nothing was sent — try again.",
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
            <>
                <DialogTitle className="mb-2.5 font-display text-[17px] font-semibold tracking-[-0.02em]">
                    Set-up link ready
                </DialogTitle>
                <DialogDescription className="text-pretty text-[13px] leading-[1.55] text-foreground/75">
                    {made.emailed?.status === "QUEUED"
                        ? `Emailed to ${made.emailed.to}. You can copy it too.`
                        : made.emailed?.status === "SUPPRESSED"
                          ? `${firstName} has turned off email, so it wasn't sent. Copy it and send it to them yourself.`
                          : `Copy it and send it to ${firstName} yourself.`}{" "}
                    It covers renewals up to {money(made.limit, made.currency)}{" "}
                    and works until {dayText(made.expiresAt, timeZone, now)}.
                </DialogDescription>
                {made.emailProblem ? (
                    <p className="mt-2 text-[12.5px] text-muted-foreground">
                        Not emailed: {made.emailProblem}
                    </p>
                ) : null}
                <LinkBox url={made.url} />
                <Footer>
                    <Button className={BTN} onClick={onClose}>
                        Done
                    </Button>
                </Footer>
            </>
        );
    }

    const limitLow = card.limitLow;
    return (
        <>
            <DialogTitle className="mb-2.5 font-display text-[17px] font-semibold tracking-[-0.02em]">
                Send a set-up link
            </DialogTitle>
            <DialogDescription className="text-pretty text-[13px] leading-[1.55] text-foreground/75">
                {firstName} approves autopay on {provider}&apos;s page. The link
                is for one way to pay — pick the one they&apos;ll use.
                {limitLow
                    ? ` Its limit covers this renewal of ${money(limitLow.amount, limitLow.currency)}; once they approve it, it replaces their current autopay.`
                    : ""}
            </DialogDescription>
            <div
                role="radiogroup"
                aria-label="Way to pay"
                className="mt-3 flex flex-col gap-1.5"
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
            <Footer>
                <Button variant="outline" className={BTN} onClick={onClose}>
                    Cancel
                </Button>
                <Button
                    className={BTN}
                    disabled={!method || busy}
                    onClick={() => void make()}
                >
                    {busy ? "Making…" : "Make the link"}
                </Button>
            </Footer>
        </>
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
                variant="outline"
                className={SMALL}
                onClick={() => {
                    void navigator.clipboard.writeText(url).then(
                        () => setCopied(true),
                        () =>
                            showError(
                                "Couldn't copy it — select the link and copy it by hand.",
                            ),
                    );
                }}
            >
                {copied ? "Copied" : "Copy link"}
            </Button>
            <span className="basis-full text-[12px] text-muted-foreground">
                Shown once — Saroh doesn&apos;t keep it. Make another if
                it&apos;s lost.
            </span>
        </div>
    );
}

function CancelBody({
    subscriptionId,
    firstName,
    provider,
    onClose,
}: {
    subscriptionId: string;
    firstName: string;
    provider: string | null;
    onClose: () => void;
}) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const at = provider ?? "your payment provider";

    async function go() {
        setBusy(true);
        const res = await cancelAutopay(subscriptionId).catch(
            (): { ok: false; error: string } => ({
                ok: false,
                error: "Saroh couldn't be reached. Nothing changed — try again.",
            }),
        );
        setBusy(false);
        if (!res.ok) {
            showError(res.error);
            router.refresh();
            return;
        }
        const said = cancelledText(res.data);
        showSuccess(said.title, said.detail);
        onClose();
        router.refresh();
    }

    return (
        <>
            <DialogTitle className="mb-2.5 font-display text-[17px] font-semibold tracking-[-0.02em]">
                Cancel autopay
            </DialogTitle>
            <DialogDescription className="text-pretty text-[13px] leading-[1.55] text-foreground/75">
                {firstName}&apos;s autopay stops now and {at} is asked to cancel
                it. The subscription carries on: the next renewal is invoiced
                with a pay link.
            </DialogDescription>
            <Footer>
                <Button variant="outline" className={BTN} onClick={onClose}>
                    Keep autopay
                </Button>
                <Button
                    variant="destructive"
                    className={BTN}
                    disabled={busy}
                    onClick={() => void go()}
                >
                    {busy ? "Cancelling…" : "Cancel autopay"}
                </Button>
            </Footer>
        </>
    );
}

"use client";

import {
    phoneLabel,
    phoneNumberProblem,
    whatsappChatLink,
} from "@saroh/block-contract";
import { Button } from "@saroh/ui/button";
import { copyFailedMessage, copyText } from "@saroh/ui/copy-button";
import { Field } from "@saroh/ui/field";
import { Notice } from "@saroh/ui/notice";
import { PhoneInput } from "@saroh/ui/phone-input";
import { Segmented } from "@saroh/ui/segmented";
import { TabStrip } from "@saroh/ui/tabs";
import { showError } from "@saroh/ui/toast";
import { Copy, Download, Printer } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";

import { refusedResult } from "@/components/billing/plan-refusal";
import { EmailNoteText } from "@/components/communications/email-note";
import { useInvoiceSend } from "@/components/invoices/send-dialog";
import {
    NewLinkConfirm,
    UnseenLinkNote,
} from "@/components/invoices/unseen-link";
import { useBusinessDetailsStep } from "@/components/organizations/business-details/use-business-details-step";
import { QrButton } from "@/components/qr/qr-button";
import type { ConfirmResult } from "@/components/shared/confirm-dialog";
import { sayRefusal } from "@/components/shared/confirm-dialog";
import { FormSheet } from "@/components/shared/form-sheet";
import { useHold } from "@/components/shared/use-hold";
import { ViewerDate } from "@/components/shared/viewer-date";
import { runAction } from "@/lib/api/run-action";
import type { EmailNote } from "@/lib/communications/email-setup";
import { CONNECT_EMAIL_HREF } from "@/lib/communications/email-setup";
import { formatMoneyMajor } from "@/lib/format/money";
import { shareInvoice } from "@/lib/invoices/actions";
import { shareWithLink } from "@/lib/invoices/link-actions";
import { mintedLink } from "@/lib/invoices/minted-links";
import { downloadInvoicePdf } from "@/lib/invoices/pdf";
import type { ShareResult } from "@/lib/invoices/service";
import type {
    ShareCan,
    ShareInvoice,
    ShareKind,
    ShareOff,
    ShareTab,
} from "@/lib/invoices/share";
import {
    emailView,
    kindChoices,
    LINK_SLOT,
    linkOff,
    logsPaper,
    pdfOffered,
    previewMessage,
    shareLine,
    shareRefusal,
    startKind,
    whatsappOff,
} from "@/lib/invoices/share";
import { billedTo } from "@/lib/invoices/status";
import {
    COPY_MESSAGE,
    EMAIL_OWN_PROVIDER,
    needsNumber,
    NEXT_REMINDER_AFTER,
    OPEN_WHATSAPP,
    WHATSAPP_HOW,
} from "@/lib/invoices/words";

const TABS: { value: ShareTab; label: string }[] = [
    { value: "whatsapp", label: "WhatsApp" },
    { value: "email", label: "Email" },
    { value: "link", label: "Link" },
    { value: "pdf", label: "PDF" },
];

/** How long a copy button says "Copied". */
const COPIED_MS = 2000;

/**
 * Share one invoice (DEC-173, INVShareA and INVShareAPhone with
 * INVChannels' rules, U11 #1123): a side sheet titled "Share
 * RC/26-27/0106", the line "Vivek Nair · ₹8,400 · 13 days late", and four
 * tabs.
 *
 * - **WhatsApp:** the message (New invoice, Reminder, Thank you, paid),
 *   its preview, who it goes to (typed in when the invoice has no number),
 *   Copy message and Open WhatsApp. The API words it, makes a fresh link
 *   and logs the share; WhatsApp opens on this device with it filled in.
 *   Saroh sends nothing. A reminder counts towards one a day.
 * - **Email:** send or remind as today (held ten seconds with Undo), or
 *   the receipt once paid, through the business's own email only. With
 *   none: one message and Connect email.
 * - **Link:** the link with Copy and its QR code; a link out that this tab
 *   can't show is replaced only after the one confirm (UX-048).
 * - **PDF:** Download and Print, for anyone who can read it.
 *
 * Every share that makes a link ends the one before (DEC-110), so a link
 * made here is reused by the other tabs while the sheet is open: Copy
 * message then Open WhatsApp sends one link, not two. A copy is said by
 * its button ("Copied"), not a toast. The business-details step runs
 * before any link is made, as today.
 *
 * Self-contained: the details (U9) and Record payment (U10) open it with
 * the invoice's detail read and the message to start on.
 */
export function ShareSheet({
    open,
    onOpenChange,
    invoice,
    kind: askedKind,
    tab: askedTab,
    business,
    can,
    timeZone,
    emailNote = null,
    emailConnected,
    onPrint,
    onDone,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    invoice: ShareInvoice;
    /** The message to start on; the invoice's own when left out. */
    kind?: ShareKind;
    /** The tab to start on; WhatsApp when left out. */
    tab?: ShareTab;
    /** The business's name as it signs its messages, for the preview. */
    business: string;
    can: ShareCan;
    /** The business's zone: the due date as the paper prints it. */
    timeZone: string;
    /** Why it can't be emailed, with the way to fix it for this person. */
    emailNote?: EmailNote | null;
    /**
     * The business's own email is connected. Left out, read from the
     * invoice's send flag where it says, else offered and the API decides.
     */
    emailConnected?: boolean;
    /** Prints the paper, and only the paper. */
    onPrint?: () => void;
    /** Something was shared or sent: the caller reads the invoice again. */
    onDone?: () => void;
}) {
    const ids = { panel: useId(), kind: useId(), to: useId() };
    const who = billedTo(invoice).name;
    const first = who.split(" ")[0] || who;
    const refused = shareRefusal(invoice);
    const firstTab: ShareTab =
        askedTab ?? (refused || !can.write ? "pdf" : "whatsapp");

    const [tab, setTab] = useState<ShareTab>(firstTab);
    const [kind, setKind] = useState<ShareKind>(() =>
        startKind(invoice, askedKind),
    );
    const [typed, setTyped] = useState("");
    // The last share that made a link, for the kind it was made for.
    const [shared, setShared] = useState<ShareResult | null>(null);
    // The link made in this sheet: every tab reuses it.
    const [made, setMade] = useState<string | null>(null);
    const [retryAt, setRetryAt] = useState<string | null>(null);
    const [copied, setCopied] = useState<"message" | "link" | null>(null);
    const [busy, setBusy] = useState(false);
    const [asking, setAsking] = useState(false);

    // Each opening starts fresh, on the tab and message it was opened for.
    const [wasOpen, setWasOpen] = useState(open);
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) {
            setTab(firstTab);
            setKind(startKind(invoice, askedKind));
            setTyped("");
            setShared(null);
            setMade(null);
            setRetryAt(null);
            setCopied(null);
        }
    }

    const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(
        () => () => {
            if (copiedTimer.current) clearTimeout(copiedTimer.current);
        },
        [],
    );
    function sayCopied(what: "message" | "link") {
        setCopied(what);
        if (copiedTimer.current) clearTimeout(copiedTimer.current);
        copiedTimer.current = setTimeout(() => setCopied(null), COPIED_MS);
    }

    // A link asks to be paid: the registered address first (DEC-068).
    const detailsStep = useBusinessDetailsStep({
        then: "share it",
        continueLabel: "Save and share",
    });
    const ref = {
        id: invoice.id,
        number: invoice.number,
        standing: invoice.standing,
        who,
        total: formatMoneyMajor(invoice.total, invoice.currency),
    };
    const sending = useInvoiceSend({
        invoice: ref,
        send: can.write ? (invoice.send ?? null) : null,
        onSent: () => setMade(null),
        onDone,
    });
    const { send: hold } = useHold();

    const close = () => onOpenChange(false);
    const phone = invoice.send?.phone ?? shared?.phone ?? null;
    const typedProblem = typed ? phoneNumberProblem(typed) : null;
    const waOff = whatsappOff(invoice, kind, can, retryAt);
    const shownUrl =
        made ??
        mintedLink(invoice.id, {
            standing: invoice.standing,
            updatedAt: invoice.updatedAt,
            payLinkMadeAt: invoice.online?.payLinkMadeAt,
        });
    const linkOut = !!invoice.online?.payLinkActive;

    /**
     * Share it on WhatsApp for `kind`, or reuse what this sheet already
     * shared for it. Null: refused (said here) or the details step closed.
     */
    async function shareFor(k: ShareKind): Promise<ShareResult | null> {
        if (shared?.kind === k && shared.channel === "WHATSAPP") {
            return shared;
        }
        const res = await runAction(
            () =>
                detailsStep.run(() =>
                    shareWithLink(
                        invoice.id,
                        { channel: "WHATSAPP", kind: k },
                        invoice.updatedAt,
                    ),
                ),
            { setBusy },
        );
        if (!res) return null;
        if (!res.ok) {
            if (res.retryAt) setRetryAt(res.retryAt);
            else showError(res.error);
            return null;
        }
        setShared(res.data);
        setMade(res.data.url);
        onDone?.();
        return res.data;
    }

    async function openWhatsApp() {
        if (waOff) return;
        const to = typed && !typedProblem ? typed : phone;
        if (!to) return;
        // Opened inside the press, so no popup blocker stops it; pointed
        // at WhatsApp once the message is back.
        const opened =
            typeof window === "undefined"
                ? null
                : window.open("about:blank", "_blank");
        const data = await shareFor(kind);
        const url = data?.text
            ? typed && !typedProblem
                ? whatsappChatLink(typed, data.text)
                : (data.whatsappUrl ?? whatsappChatLink(to, data.text))
            : null;
        if (!url) {
            opened?.close();
            if (data) showError("Couldn't open WhatsApp. Try again.");
            return;
        }
        if (opened) {
            opened.opener = null;
            opened.location.href = url;
        } else {
            window.open(url, "_blank", "noopener");
        }
        close();
    }

    async function copyMessage() {
        if (waOff) return;
        const data = await shareFor(kind);
        if (!data?.text) return;
        if (await copyText(data.text)) sayCopied("message");
        else showError(copyFailedMessage());
    }

    /** A fresh link: it ends the one before, and the message made with it. */
    async function makeLink(): Promise<ConfirmResult> {
        const res = await runAction(
            () =>
                detailsStep.run(() =>
                    shareWithLink(
                        invoice.id,
                        { channel: "LINK", kind },
                        invoice.updatedAt,
                    ),
                ),
            { setBusy },
        );
        if (!res) return;
        if (!res.ok) return refusedResult(res);
        setShared(null);
        setMade(res.data.url);
        onDone?.();
        if (res.data.url && (await copyText(res.data.url))) {
            sayCopied("link");
        }
    }

    async function copyLink() {
        if (linkOff(invoice, can)) return;
        if (shownUrl) {
            if (await copyText(shownUrl)) sayCopied("link");
            else showError(copyFailedMessage());
            return;
        }
        // A link is out whose address this tab doesn't have: a new one
        // ends it, so that is asked first (UX-048).
        if (linkOut) return setAsking(true);
        sayRefusal(await makeLink());
    }

    function emailReceipt() {
        hold(`invoice-receipt:${invoice.id}`, {
            description: `The receipt goes to ${first} from your own email.`,
            run: async () => {
                const res = await shareInvoice(invoice.id, {
                    channel: "EMAIL",
                    kind: "RECEIPT",
                });
                if (!res.ok) return { ok: false, error: res.error };
                onDone?.();
                return { ok: true };
            },
            sent: `Receipt sent to ${first}.`,
        });
        close();
    }

    /** PDF and print are logged where a share could be; quietly. */
    function logPaper(channel: "PDF" | "PRINT") {
        if (!logsPaper(invoice, can)) return;
        void shareInvoice(invoice.id, { channel, kind })
            .then((res) => {
                if (res.ok) onDone?.();
            })
            .catch(() => undefined);
    }

    async function downloadPdf() {
        const res = await runAction(() => downloadInvoicePdf(invoice), {
            setBusy,
        });
        if (!res) return;
        if (!res.ok) return showError(res.error);
        logPaper("PDF");
    }

    function print() {
        logPaper("PRINT");
        close();
        (onPrint ?? (() => window.print()))();
    }

    const email = emailView(
        invoice,
        can,
        retryAt,
        emailConnected ??
            (invoice.send?.reason === "NO_EMAIL_PROVIDER" ? false : undefined),
    );
    const linkStop = linkOff(invoice, can);
    const toUsable = !!phone || (!!typed && !typedProblem);

    // The foot: the tab's own button, with what stops it said above it.
    let foot: {
        saveLabel: string;
        saveOff: boolean;
        note: ReactNode;
        extra?: ReactNode;
        submit: () => void | Promise<void>;
    };
    switch (tab) {
        case "whatsapp":
            foot = {
                saveLabel: OPEN_WHATSAPP,
                saveOff: !!waOff || !toUsable,
                note: waOff ? (
                    <OffLine off={waOff} />
                ) : !toUsable ? (
                    <FootLine>{needsNumber(first)}</FootLine>
                ) : null,
                extra: (
                    <Button
                        type="button"
                        variant="outline"
                        disabled={!!waOff || busy}
                        onClick={() => void copyMessage()}
                        data-action="copyMessage"
                    >
                        <Copy aria-hidden className="size-4" />
                        {copied === "message" ? "Copied" : COPY_MESSAGE}
                    </Button>
                ),
                submit: openWhatsApp,
            };
            break;
        case "email":
            foot = emailFoot(email, {
                send: () => {
                    sending.start(false);
                    close();
                },
                remind: () => {
                    sending.start(true);
                    close();
                },
                receipt: emailReceipt,
            });
            break;
        case "link":
            foot = {
                saveLabel:
                    copied === "link"
                        ? "Copied"
                        : !shownUrl && linkOut
                          ? "Make a new link"
                          : "Copy link",
                saveOff: !!linkStop,
                note: linkStop ? <OffLine off={linkStop} /> : null,
                extra:
                    shownUrl && !linkStop ? (
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setAsking(true)}
                        >
                            Make a new link
                        </Button>
                    ) : undefined,
                submit: copyLink,
            };
            break;
        case "pdf":
            foot = {
                saveLabel: "Download PDF",
                saveOff: !pdfOffered(invoice),
                note: pdfOffered(invoice) ? null : (
                    <FootLine>A draft has no PDF yet. Issue it first.</FootLine>
                ),
                extra: (
                    <Button type="button" variant="outline" onClick={print}>
                        <Printer aria-hidden className="size-4" />
                        Print
                    </Button>
                ),
                submit: downloadPdf,
            };
            break;
    }

    const preview = shared?.text
        ? shared.kind === kind
            ? shared.text
            : null
        : null;
    const choices = kindChoices(invoice);
    const offChoice = choices.find((c) => c.disabled && c.reason);

    return (
        <>
            <FormSheet
                open={open}
                title={`Share ${invoice.number ?? "this invoice"}`}
                description={shareLine(invoice, timeZone)}
                pending={busy}
                cancelLabel="Close"
                saveLabel={foot.saveLabel}
                saveOff={foot.saveOff}
                extra={foot.extra}
                footNote={foot.note}
                fieldsClassName="gap-4"
                onClose={close}
                onSubmit={() => foot.submit()}
            >
                <TabStrip
                    label="Share by"
                    tabs={TABS.map((t) => ({ ...t, controls: ids.panel }))}
                    value={tab}
                    onValueChange={setTab}
                    idPrefix={ids.panel}
                    className="-mx-1"
                />
                <div
                    id={ids.panel}
                    role="tabpanel"
                    aria-labelledby={`${ids.panel}-${tab}`}
                    className="grid gap-4"
                >
                    {refused ? (
                        <Notice tone="neutral" role="note">
                            {refused} You can still download or print it.
                        </Notice>
                    ) : null}

                    {tab === "whatsapp" && !refused ? (
                        <>
                            <div className="grid gap-1.5">
                                <span
                                    id={ids.kind}
                                    className="text-sm font-medium"
                                >
                                    Message
                                </span>
                                <Segmented
                                    label="Message"
                                    aria-labelledby={ids.kind}
                                    options={choices.map((c) => ({
                                        value: c.value,
                                        label: c.label,
                                        disabled: c.disabled,
                                    }))}
                                    value={kind}
                                    onValueChange={setKind}
                                    disabled={!can.write}
                                />
                                {offChoice ? (
                                    <p className="text-[12px] text-muted-foreground">
                                        {offChoice.reason}
                                    </p>
                                ) : null}
                            </div>
                            <MessagePreview
                                text={
                                    preview ??
                                    previewMessage({
                                        invoice,
                                        kind,
                                        business,
                                        timeZone,
                                    })
                                }
                            />
                            <p className="text-[12.5px] leading-[1.5] text-muted-foreground">
                                {WHATSAPP_HOW}
                            </p>
                            {phone ? (
                                <div className="grid gap-1.5">
                                    <span className="text-sm font-medium">
                                        To
                                    </span>
                                    <p
                                        className="rounded-[8px] border border-border bg-muted px-3 py-2 text-[13.5px]"
                                        data-to
                                    >
                                        <span className="font-mono tabular-nums">
                                            {phoneLabel(phone)}
                                        </span>{" "}
                                        · {who}
                                    </p>
                                </div>
                            ) : (
                                <Field
                                    label="To"
                                    holdsData
                                    hint={`No number for ${first} on this invoice. It's used for this message only.`}
                                    error={typedProblem}
                                >
                                    <PhoneInput
                                        id={ids.to}
                                        value={typed}
                                        onValueChange={setTyped}
                                        disabled={!!waOff}
                                    />
                                </Field>
                            )}
                        </>
                    ) : null}

                    {tab === "email" && !refused ? (
                        <EmailPanel
                            view={email}
                            first={first}
                            emailNote={emailNote}
                        />
                    ) : null}

                    {tab === "link" && !refused ? (
                        shownUrl ? (
                            <div
                                className="flex min-w-0 items-center gap-2"
                                data-link-box
                            >
                                <code className="min-w-0 flex-1 select-all break-all rounded-[7px] bg-muted px-[9px] py-[7px] font-mono text-[12px]">
                                    {shownUrl}
                                </code>
                                <QrButton
                                    compact="always"
                                    link={{
                                        mode: "instant",
                                        url: shownUrl,
                                        what: "this invoice's link",
                                        opens:
                                            invoice.standing === "PAID"
                                                ? "invoice"
                                                : "pay",
                                        fileName: "invoice-link-qr",
                                    }}
                                />
                            </div>
                        ) : linkOut ? (
                            <UnseenLinkNote
                                sendable={
                                    (invoice.send?.channels.length ?? 0) > 0
                                }
                                madeAt={invoice.online?.payLinkMadeAt}
                            />
                        ) : (
                            <p className="text-[13px] leading-[1.5] text-muted-foreground">
                                Copy link makes a link to this invoice for{" "}
                                {first} and copies it. Paste it in any app.
                            </p>
                        )
                    ) : null}

                    {tab === "pdf" ? (
                        <p className="text-[13px] leading-[1.5] text-muted-foreground">
                            <Download
                                aria-hidden
                                className="mr-1 inline size-4 align-[-3px]"
                            />
                            The paper as {first} gets it, to save, attach or
                            print.
                        </p>
                    ) : null}
                </div>
            </FormSheet>
            {detailsStep.step}
            {sending.overlays}
            <NewLinkConfirm
                open={asking}
                onOpenChange={setAsking}
                who={who}
                onConfirm={makeLink}
            />
        </>
    );
}

/**
 * The preview bubble, with the link drawn as a chip until it is made. Remind
 * many's WhatsApp step (U12) draws the same one.
 */
export function MessagePreview({ text }: { text: string }) {
    const [before, after] = text.includes(LINK_SLOT)
        ? text.split(LINK_SLOT)
        : [text, null];
    return (
        <figure className="rounded-[12px] bg-muted p-3">
            <blockquote
                className="max-w-[92%] whitespace-pre-wrap break-words rounded-[10px] rounded-tl-[3px] border border-border bg-card px-3 py-2 text-[13.5px] leading-[1.5]"
                data-preview
            >
                {before}
                {after !== null ? (
                    <>
                        <span className="rounded bg-muted px-1 font-mono text-[12px] text-muted-foreground">
                            link made when you share
                        </span>
                        {after}
                    </>
                ) : null}
            </blockquote>
            <figcaption className="mt-1.5 text-[11.5px] text-muted-foreground">
                Preview
            </figcaption>
        </figure>
    );
}

function FootLine({ children }: { children: ReactNode }) {
    return (
        <p className="text-[12.5px] leading-[1.55] text-muted-foreground">
            {children}
        </p>
    );
}

/** Why the tab's button is off; one reminder a day says when the next can go. */
function OffLine({ off }: { off: ShareOff }) {
    return (
        <FootLine>
            {off.retryAt ? (
                <>
                    {NEXT_REMINDER_AFTER}{" "}
                    <ViewerDate iso={off.retryAt} variant="datetime" />.
                </>
            ) : (
                off.reason
            )}
        </FootLine>
    );
}

interface EmailFoot {
    saveLabel: string;
    saveOff: boolean;
    note: ReactNode;
    extra?: ReactNode;
    submit: () => void | Promise<void>;
}

function emailFoot(
    view: ReturnType<typeof emailView>,
    run: { send: () => void; remind: () => void; receipt: () => void },
): EmailFoot {
    switch (view.kind) {
        case "receipt":
            return {
                saveLabel: "Email the receipt",
                saveOff: !!view.off,
                note: view.off ? <OffLine off={view.off} /> : null,
                submit: run.receipt,
            };
        case "send":
        case "remind": {
            const reminder = view.kind === "remind";
            return {
                saveLabel: reminder
                    ? view.threadOnly
                        ? "Send a reminder"
                        : "Email a reminder"
                    : view.threadOnly
                      ? "Send it"
                      : "Email it",
                saveOff: !!view.off,
                note: view.off ? <OffLine off={view.off} /> : null,
                submit: reminder ? run.remind : run.send,
            };
        }
        case "noProvider":
            return {
                saveLabel: "Email it",
                saveOff: true,
                note: null,
                submit: () => undefined,
            };
        case "off":
            return {
                saveLabel: "Email it",
                saveOff: true,
                note: <FootLine>{view.reason}</FootLine>,
                submit: () => undefined,
            };
    }
}

function EmailPanel({
    view,
    first,
    emailNote,
}: {
    view: ReturnType<typeof emailView>;
    first: string;
    emailNote: EmailNote | null;
}) {
    switch (view.kind) {
        case "noProvider":
            return (
                <Notice tone="neutral" role="note" data-no-provider>
                    <EmailNoteText
                        note={{
                            text: EMAIL_OWN_PROVIDER,
                            action:
                                emailNote === null
                                    ? {
                                          href: CONNECT_EMAIL_HREF,
                                          label: "Connect email",
                                      }
                                    : emailNote.action,
                        }}
                    />
                </Notice>
            );
        case "receipt":
            return (
                <p className="text-[13px] leading-[1.5] text-muted-foreground">
                    The receipt for the last payment goes to {first} from your
                    own email. It waits ten seconds, so you can undo it.
                </p>
            );
        case "send":
        case "remind":
            return (
                <p className="text-[13px] leading-[1.5] text-muted-foreground">
                    {view.kind === "remind" ? "A reminder" : "The invoice"} with
                    its link goes to {first}
                    {view.to ? (
                        <>
                            {" "}
                            at <span className="font-medium">{view.to}</span>
                        </>
                    ) : null}{" "}
                    from your own email. It waits ten seconds, so you can undo
                    it. Sending makes a new link and ends the one before.
                </p>
            );
        case "off":
            return null;
    }
}

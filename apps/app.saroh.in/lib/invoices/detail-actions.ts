import { permits } from "@/lib/organizations/permits";

import { UNSEEN_LINK } from "./minted-links";
import { hasPdf } from "./pdf";
import { paysOnline, sendLabel, wasSent } from "./send";
import type { Invoice, InvoiceStanding } from "./service";
import type { InvoiceState } from "./status";
import { invoiceState, waitingCheque } from "./status";
import {
    AUTOPAY_HOLD,
    BOUNCED,
    CANCEL_OR_CORRECT,
    CANT_RECORD_PAYMENT,
    ISSUE_AND_SHARE,
    ISSUE_IT,
    MARK_IN_BANK,
    NO_EMAIL_ADDRESS,
    NO_EMAIL_PROVIDER,
    PAID_IN_PART_NO_CANCEL,
    RECORD_PAYMENT,
    RECORD_THE_REST,
    REMINDED_TODAY,
    REMOVE_PAYMENT,
    SEND_BY_EMAIL,
    SHARE_ON_WHATSAPP,
    SHARE_RECEIPT,
    WRITE_AGAIN,
} from "./words";

/**
 * Today's Invoice Detail page's buttons, by status (after "Saroh Invoice
 * Detail"), kept until the details view (U9, #1121) draws `actionsFor`
 * below instead. Pure,
 * so which buttons a state gets is tested rather than read off a page; the
 * screen maps each `id` to what it does.
 *
 * A draft is sent, issued, edited or deleted; an unpaid one is sent or
 * reminded, gets its payment link copied, is marked paid, printed or
 * cancelled; a paid one is printed or refunded. "Copy payment link" is offered
 * only where the link takes payment (`payOnline`, DEC-070): without it the
 * link only shows the invoice, Send says "Send invoice", and "Copy view
 * link" hands the merchant that link to send themselves (#833).
 */
export type DetailActionId =
    | "draftSend"
    | "issue"
    | "edit"
    | "delete"
    | "send"
    | "remind"
    | "copyLink"
    | "copyViewLink"
    | "pay"
    | "print"
    | "pdf"
    | "cancel"
    | "refund"
    | "refundOrder"
    | "writeAgain";

export interface DetailAction {
    id: DetailActionId;
    label: string;
    primary?: boolean;
    danger?: boolean;
    disabled?: boolean;
    /** Why it is disabled, said beside it (FB-1). */
    reason?: string;
}

export interface DetailActionState {
    standing: InvoiceStanding;
    /** A credit note: nothing is owed on it. */
    credit: boolean;
    /** An order's paper: its money moves on the order. */
    fromOrder: boolean;
    canWrite: boolean;
    /** The API names a channel to send it by (D17). */
    sendable: boolean;
    /** It went once already, so the next is a reminder. */
    reminding: boolean;
    /** One reminder a day: the next can't go yet. */
    reminderWaits: boolean;
    /** Its link takes payment (`payOnline`). */
    payOnline: boolean;
    /** An autopay charge is under way (D13): no link. */
    charging: boolean;
    /** Issued paper has a PDF; a draft has none. */
    hasPdf: boolean;
    /** A payment link is being made. */
    linkBusy: boolean;
    /**
     * A payment link is out that this tab can't show (UX-048): the button makes
     * a new one, which ends the old one, so it says "Make a new link".
     */
    linkUnseen?: boolean;
    /** The PDF is being made. */
    pdfBusy: boolean;
    /**
     * A void invoice of its own that nobody wrote again (`reissuedAsId`
     * null, not an order's): "Write again" opens a draft with its lines
     * (DEC-173, U13).
     */
    writeAgain?: boolean;
}

/** Whether money is owed on it here, rather than on an order. */
export function owedHere(
    s: Pick<DetailActionState, "standing" | "credit" | "fromOrder">,
): boolean {
    return (
        (s.standing === "ISSUED" || s.standing === "OVERDUE") &&
        !s.credit &&
        !s.fromOrder
    );
}

export function detailActions(s: DetailActionState): DetailAction[] {
    const send = sendLabel(s.payOnline);
    const pdf: DetailAction[] = s.hasPdf
        ? [
              {
                  id: "pdf",
                  label: s.pdfBusy ? "Making…" : "Download PDF",
                  disabled: s.pdfBusy,
              },
          ]
        : [];
    const owed = owedHere(s);

    if (s.canWrite && s.standing === "DRAFT") {
        return [
            ...(s.sendable
                ? [{ id: "draftSend", label: send, primary: true } as const]
                : []),
            { id: "issue", label: "Issue it", primary: !s.sendable },
            { id: "edit", label: "Edit" },
            { id: "delete", label: "Delete draft", danger: true },
        ];
    }
    if (s.canWrite && owed) {
        const canLink = s.payOnline && !s.charging;
        const actions: DetailAction[] = [];
        if (s.sendable) {
            actions.push(
                s.reminding
                    ? {
                          id: "remind",
                          label: "Send reminder",
                          primary: true,
                          disabled: s.reminderWaits,
                      }
                    : { id: "send", label: send, primary: true },
            );
        }
        if (canLink) {
            actions.push({
                id: "copyLink",
                label: s.linkBusy
                    ? "Making…"
                    : s.linkUnseen
                      ? UNSEEN_LINK.action
                      : "Copy payment link",
                primary: !s.sendable,
                disabled: s.linkBusy,
            });
        } else if (!s.payOnline && !s.charging) {
            // No payment link can be made (#833): a link that shows the
            // invoice and how to pay, for the merchant to send themselves.
            actions.push({
                id: "copyViewLink",
                label: s.linkBusy ? "Making…" : "Copy view link",
                disabled: s.linkBusy,
            });
        }
        return [
            ...actions,
            {
                id: "pay",
                label: RECORD_PAYMENT,
                primary: !canLink && !s.sendable,
            },
            { id: "print", label: "Print" },
            ...pdf,
            { id: "cancel", label: CANCEL_OR_CORRECT, danger: true },
        ];
    }
    // Owed, and this role can't record it (DEC-098): Record payment is
    // shown, disabled, with why — the permission decides, never the role's name.
    const locked: DetailAction[] =
        !s.canWrite && owed
            ? [
                  {
                      id: "pay",
                      label: RECORD_PAYMENT,
                      disabled: true,
                      reason: CANT_RECORD_PAYMENT,
                  },
              ]
            : [];
    // A paid invoice keeps its view link (UX-080): the customer's copy,
    // paid, for the merchant to hand over. An order's paper is the order's.
    const paidView: DetailAction[] =
        s.canWrite && s.standing === "PAID" && !s.credit && !s.fromOrder
            ? [
                  {
                      id: "copyViewLink",
                      label: s.linkBusy ? "Making…" : "Copy view link",
                      disabled: s.linkBusy,
                  },
              ]
            : [];
    const actions: DetailAction[] = [
        ...locked,
        { id: "print", label: "Print", primary: true },
        ...paidView,
        ...pdf,
    ];
    if (s.canWrite && s.standing === "VOID" && s.writeAgain && !s.fromOrder) {
        actions.push({ id: "writeAgain", label: WRITE_AGAIN });
    }
    if (s.canWrite && s.standing === "PAID" && !s.credit) {
        actions.push(
            s.fromOrder
                ? {
                      id: "refundOrder",
                      label: "Refund on the order",
                      danger: true,
                  }
                : { id: "refund", label: "Refund…", danger: true },
        );
    }
    return actions;
}

/* ------------------------------------------------------------------------
 * The rebuilt details (DEC-173, INVPageA, INVPageA2, INVRecordPlus): one
 * main button per state, then Share, then More, which holds Cancel and every
 * other action today's page has (`00-universal.md` §15). The sheet, the page
 * and the phone all draw this, so they can't disagree. Each `id` is mapped
 * to what it does by the screen; `kind` and `paymentId` say what it opens on.
 * ---------------------------------------------------------------------- */

export type InvoiceActionId =
    | "issueAndShare"
    | "issue"
    | "edit"
    | "delete"
    | "recordPayment"
    | "whatsapp"
    | "send"
    | "remind"
    | "emailReceipt"
    | "copyLink"
    | "copyViewLink"
    | "newLink"
    | "pdf"
    | "print"
    | "cancel"
    | "shareReceipt"
    | "markCleared"
    | "markBounced"
    | "removePayment"
    | "refund"
    | "refundOrder"
    | "writeAgain";

/** The message the share sheet opens on (the API's share kinds). */
export type ShareMessageKind = "NEW" | "REMINDER" | "RECEIPT";

export interface InvoiceAction {
    id: InvoiceActionId;
    label: string;
    danger?: boolean;
    disabled?: boolean;
    /** Why it is off, said beside it (FB-1). */
    reason?: string;
    /** The share sheet's message: new invoice, reminder or receipt. */
    kind?: ShareMessageKind;
    /** The ledger payment a cheque or Remove action is about. */
    paymentId?: string;
}

export interface InvoiceActions {
    state: InvoiceState;
    /** The one main button, or none (a draft for a role that only reads). */
    main: InvoiceAction | null;
    /** Buttons beside the main one, before Share. */
    beside: InvoiceAction[];
    /** The Share menu; empty means no Share button. */
    share: InvoiceAction[];
    /** The More menu; empty means no More button. */
    more: InvoiceAction[];
}

/** What this person may do with invoices (DEC-098: permissions, never role names). */
export interface InvoiceCan {
    /** `invoice:read`: sees invoices at all. */
    read: boolean;
    /** `invoice:write`: issues, shares, records and cancels them. */
    write: boolean;
}

export function invoiceCan(
    organization: { actions?: readonly string[] } | null | undefined,
): InvoiceCan {
    return {
        read: permits(organization, "invoice:read"),
        write: permits(organization, "invoice:write"),
    };
}

/** What the rules read from an invoice: a list row or the detail read. */
export type ActionsInvoice = Pick<
    Invoice,
    "standing" | "kind" | "source" | "number" | "reissuedAsId"
> &
    Partial<
        Pick<
            Invoice,
            | "order"
            | "partlyPaid"
            | "chequeWaiting"
            | "payments"
            | "send"
            | "sent"
            | "online"
        >
    >;

/** What the screen knows that the invoice read doesn't say. */
export interface ActionsContext {
    /**
     * Whether the customer has a phone for WhatsApp. Unknown (undefined):
     * WhatsApp leads anyway, and the share sheet asks for a number.
     */
    phone?: boolean;
    /** The business's own email provider is connected (a receipt by email). */
    emailConnected?: boolean;
    /** A link is being made. */
    linkBusy?: boolean;
    /** The PDF is being made. */
    pdfBusy?: boolean;
    /** A link is out that this tab can't show (UX-048): it says Make a new link. */
    linkUnseen?: boolean;
}

const NONE = (state: InvoiceState): InvoiceActions => ({
    state,
    main: null,
    beside: [],
    share: [],
    more: [],
});

export function actionsFor(
    invoice: ActionsInvoice,
    can: InvoiceCan,
    ctx: ActionsContext = {},
): InvoiceActions {
    const state = invoiceState(invoice);
    if (!can.read) return NONE(state);

    const fromOrder = !!invoice.order || invoice.source === "ORDER";
    const pdf: InvoiceAction | null = hasPdf(invoice)
        ? {
              id: "pdf",
              label: ctx.pdfBusy ? "Making…" : "Download PDF",
              disabled: ctx.pdfBusy ? true : undefined,
          }
        : null;
    const print: InvoiceAction = { id: "print", label: "Print" };
    const paper = [pdf, print].filter((a): a is InvoiceAction => a !== null);
    const owed =
        state === "due" || state === "overdue" || state === "partlyPaid";
    const cheque = waitingCheque(invoice.payments);

    // Reading is enough to print or download the paper the page shows.
    if (!can.write) {
        if (owed && !fromOrder) {
            return {
                state,
                main: {
                    id: "recordPayment",
                    label:
                        state === "partlyPaid"
                            ? RECORD_THE_REST
                            : RECORD_PAYMENT,
                    disabled: true,
                    reason: CANT_RECORD_PAYMENT,
                },
                beside: [],
                share: paper,
                more: [],
            };
        }
        if (state === "paidChequeWaiting" && !fromOrder) {
            return {
                state,
                main: {
                    id: "markCleared",
                    label: MARK_IN_BANK,
                    disabled: true,
                    reason: CANT_RECORD_PAYMENT,
                    paymentId: cheque?.id,
                },
                beside: [],
                share: paper,
                more: [],
            };
        }
        return { state, main: pdf, beside: [], share: [print], more: [] };
    }

    // An order's paper: its money moves on the order, never here (ADR-008).
    if (fromOrder) {
        return {
            state,
            main: pdf,
            beside: [],
            share: [print],
            more:
                invoice.standing === "PAID"
                    ? [
                          {
                              id: "refundOrder",
                              label: "Refund on the order",
                              danger: true,
                          },
                      ]
                    : [],
        };
    }

    switch (state) {
        case "draft":
            return draftActions(invoice, ctx);
        case "due":
        case "overdue":
        case "partlyPaid":
            return owedActions(invoice, state, ctx, paper, cheque);
        case "paidChequeWaiting":
            return {
                state,
                main: {
                    id: "markCleared",
                    label: MARK_IN_BANK,
                    paymentId: cheque?.id,
                },
                beside: [
                    {
                        id: "markBounced",
                        label: BOUNCED,
                        danger: true,
                        paymentId: cheque?.id,
                    },
                ],
                share: [...receiptChannels(ctx), viewLink(ctx), ...paper],
                more: [
                    { id: "refund", label: "Refund…", danger: true },
                    {
                        id: "removePayment",
                        label: REMOVE_PAYMENT,
                        danger: true,
                        paymentId: cheque?.id,
                    },
                ],
            };
        case "paid":
            return {
                state,
                // Opens the share sheet on the receipt: WhatsApp, or email.
                main: {
                    id: "shareReceipt",
                    label: SHARE_RECEIPT,
                    kind: "RECEIPT",
                },
                beside: pdf ? [pdf] : [],
                share: [],
                more: [
                    { id: "refund", label: "Refund…", danger: true },
                    viewLink(ctx),
                    print,
                ],
            };
        case "void":
            return {
                state,
                main: pdf,
                beside: [],
                share: [print],
                more: invoice.reissuedAsId
                    ? []
                    : [{ id: "writeAgain", label: WRITE_AGAIN }],
            };
        case "credited":
        case "creditNote":
            return { state, main: pdf, beside: [], share: [print], more: [] };
    }
}

function viewLink(ctx: ActionsContext): InvoiceAction {
    return {
        id: "copyViewLink",
        label: ctx.linkBusy ? "Making…" : "Copy view link",
        disabled: ctx.linkBusy ? true : undefined,
    };
}

/** A receipt goes on WhatsApp, or by email through the business's own provider. */
function receiptChannels(ctx: ActionsContext): InvoiceAction[] {
    return [
        {
            id: "whatsapp",
            label: SHARE_ON_WHATSAPP,
            kind: "RECEIPT",
        },
        ctx.emailConnected === false
            ? {
                  id: "emailReceipt",
                  label: "Email the receipt",
                  kind: "RECEIPT",
                  disabled: true,
                  reason: NO_EMAIL_PROVIDER,
              }
            : {
                  id: "emailReceipt",
                  label: "Email the receipt",
                  kind: "RECEIPT",
              },
    ];
}

/**
 * A draft is issued (and shared, when there is a way to), edited or
 * deleted. "Issue it" stays in More beside "Issue and share", as today's
 * page offered both.
 */
function draftActions(
    invoice: ActionsInvoice,
    ctx: ActionsContext,
): InvoiceActions {
    const canShare =
        (invoice.send?.channels.length ?? 0) > 0 || ctx.phone === true;
    const del: InvoiceAction = {
        id: "delete",
        label: "Delete draft",
        danger: true,
    };
    return {
        state: "draft",
        main: canShare
            ? { id: "issueAndShare", label: ISSUE_AND_SHARE, kind: "NEW" }
            : { id: "issue", label: ISSUE_IT },
        beside: [{ id: "edit", label: "Edit" }],
        share: [],
        more: canShare ? [{ id: "issue", label: ISSUE_IT }, del] : [del],
    };
}

/** Why email can't carry it, in the API's terms. */
function emailBlocked(invoice: ActionsInvoice): string | null {
    switch (invoice.send?.reason) {
        case "NO_EMAIL_PROVIDER":
            return NO_EMAIL_PROVIDER;
        case "NO_EMAIL_ADDRESS":
            return NO_EMAIL_ADDRESS;
        case "AUTOPAY_PENDING":
            return AUTOPAY_HOLD;
        default:
            return null;
    }
}

function owedActions(
    invoice: ActionsInvoice,
    state: "due" | "overdue" | "partlyPaid",
    ctx: ActionsContext,
    paper: InvoiceAction[],
    cheque: { id: string } | null,
): InvoiceActions {
    const send = invoice.send;
    // While autopay is charging it (D13), nothing goes out: the customer
    // could pay twice. The buttons stay, off, with why.
    const charging =
        !!invoice.online?.autopayCharge || send?.reason === "AUTOPAY_PENDING";
    const payOnline = paysOnline(send, invoice.online);
    const reminding = wasSent(invoice.sent);
    const waits = (send?.nextReminderAt ?? null) !== null;
    const late = invoice.standing === "OVERDUE";
    const off = (reason: string) => ({ disabled: true, reason });

    const whatsappKind: ShareMessageKind =
        late || reminding ? "REMINDER" : "NEW";
    const whatsapp: InvoiceAction = {
        id: "whatsapp",
        label: SHARE_ON_WHATSAPP,
        kind: whatsappKind,
        // One reminder a day, by email or WhatsApp (DEC-173).
        ...(charging
            ? off(AUTOPAY_HOLD)
            : whatsappKind === "REMINDER" && waits
              ? off(REMINDED_TODAY)
              : {}),
    };

    // Email, or the customer's account thread: whichever the API names.
    const channels = send?.channels ?? [];
    const byEmail = channels.includes("email");
    // Only the account thread, no email: it is sent there, not emailed.
    const threadOnly = channels.length > 0 && !byEmail;
    let email: InvoiceAction | null = null;
    // No send view (an API before D17), or nothing owed: no Send, as today.
    if (send && send.reason !== "NOT_OWED") {
        const why = charging
            ? AUTOPAY_HOLD
            : channels.length === 0
              ? (emailBlocked(invoice) ?? NO_EMAIL_PROVIDER)
              : reminding && waits
                ? REMINDED_TODAY
                : null;
        email = {
            id: reminding ? "remind" : "send",
            label: reminding
                ? threadOnly
                    ? "Send a reminder"
                    : "Email a reminder"
                : threadOnly
                  ? "Send it"
                  : "Email it",
            kind: reminding ? "REMINDER" : "NEW",
            ...(why ? off(why) : {}),
        };
    }

    const link: InvoiceAction = charging
        ? {
              id: payOnline ? "copyLink" : "copyViewLink",
              label: "Copy link",
              ...off(AUTOPAY_HOLD),
          }
        : {
              id: payOnline ? "copyLink" : "copyViewLink",
              label: ctx.linkBusy
                  ? "Making…"
                  : ctx.linkUnseen
                    ? UNSEEN_LINK.action
                    : "Copy link",
              disabled: ctx.linkBusy ? true : undefined,
          };

    // Beside the main button: WhatsApp, or email when there's no phone and
    // email can go (INVPageA's money card).
    const emailLeads = ctx.phone === false && !!email && !email.disabled;
    const lead: InvoiceAction | null =
        state === "partlyPaid"
            ? null
            : emailLeads && email
              ? { ...email, label: SEND_BY_EMAIL }
              : whatsapp;
    const channelItems = [whatsapp, email].filter(
        (a): a is InvoiceAction => a !== null && a.id !== lead?.id,
    );

    const more: InvoiceAction[] = [
        {
            id: "cancel",
            label: CANCEL_OR_CORRECT,
            danger: true,
            // A partly paid invoice can't be cancelled until its payments
            // are removed (DEC-173): said before anyone presses.
            ...(state === "partlyPaid" ? off(PAID_IN_PART_NO_CANCEL) : {}),
        },
    ];
    if (!charging && !ctx.linkUnseen) {
        more.push({ id: "newLink", label: UNSEEN_LINK.action });
    }
    // A part paid by a cheque still waiting: its bank status from here.
    if (cheque) {
        more.push(
            { id: "markCleared", label: MARK_IN_BANK, paymentId: cheque.id },
            {
                id: "markBounced",
                label: BOUNCED,
                danger: true,
                paymentId: cheque.id,
            },
        );
    }

    return {
        state,
        main: {
            id: "recordPayment",
            label: state === "partlyPaid" ? RECORD_THE_REST : RECORD_PAYMENT,
        },
        beside: lead ? [lead] : [],
        share: [...channelItems, link, ...paper],
        more,
    };
}

/** Every action in a set, in the order it is drawn: main, beside, share, more. */
export function allActions(a: InvoiceActions): InvoiceAction[] {
    return [...(a.main ? [a.main] : []), ...a.beside, ...a.share, ...a.more];
}

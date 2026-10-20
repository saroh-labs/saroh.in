import type { PaperStyle } from "@saroh/block-contract";

import { apiFetch, getJson, orgBase } from "@/lib/api/http";

import type { ApiResult } from "@/lib/api/failure";
import { toFailure } from "@/lib/api/failure";
import type { CappedList } from "@/lib/lists/capped";
import { LIST_LIMIT, withLive } from "@/lib/lists/capped";
import type { PayInstructionsSettings } from "@/lib/organizations/pay-instructions";
import type { OnlineBlocker } from "@/lib/staff/types";

import type {
    ReminderAsk,
    ReminderPreview,
    ReminderSendResult,
} from "./remind-all";
import type { InvoiceSummary } from "./summary-types";

/**
 * Invoices a business issues (ADR-007) — read and written through the
 * org-nested `/organizations/:id/invoices` routes. Server-only: `orgBase`
 * reads the active organization.
 *
 * Money arrives as decimal strings ("2596.00"); the API priced it in minor
 * units and the screens only display it.
 */

export type InvoiceStatus = "DRAFT" | "ISSUED" | "PAID" | "VOID";
/** The status as the merchant reads it; Overdue is derived by the API. */
/** CREDITED: cancelled in full by a credit note (ADR-008). */
export type InvoiceStanding =
    "DRAFT" | "ISSUED" | "OVERDUE" | "PAID" | "VOID" | "CREDITED";
/** ORDER: an order's own invoice or a correction to it (ADR-008). */
export type InvoiceSource =
    "MANUAL" | "SUBSCRIPTION" | "COURSE" | "PACK" | "ORDER" | "BOOKING";
export type PaymentMethod = "CASH" | "UPI" | "BANK_TRANSFER" | "CARD" | "OTHER";
/**
 * The ways an invoice's payment is recorded by hand (DEC-173): an order's
 * five, and a cheque, which only an invoice takes.
 */
export type InvoicePaymentMethod = PaymentMethod | "CHEQUE";
/**
 * How a payment is stored: one of the ways it is recorded by hand, or ONLINE
 * — paid through the invoice's payment link, written by the payment webhook and
 * never offered in Record payment.
 */
export type StoredPaymentMethod = InvoicePaymentMethod | "ONLINE";

/** A cheque's place on its way to the bank (DEC-173). */
export type ChequeBankStatus = "WAITING" | "CLEARED" | "BOUNCED";

/**
 * One payment in the invoice's ledger (DEC-173), on the detail read only:
 * every one, removed and bounced too, so the history keeps the line.
 */
export interface InvoicePayment {
    id: string;
    /** Major units, as a string ("4000.00"). */
    amount: string;
    currency: string;
    method: StoredPaymentMethod;
    reference: string | null;
    note: string | null;
    /** When the money came in. */
    receivedAt: string;
    /** When it was written down. */
    recordedAt: string;
    /** A cheque's number and bank; null for anything else. */
    cheque: { number: string | null; bank: string | null } | null;
    /** On a cheque only; null otherwise. */
    bankStatus: ChequeBankStatus | null;
    clearedAt: string | null;
    bouncedAt: string | null;
    bounceReason: string | null;
    /** Removed by mistake: when and why. It no longer counts. */
    removed: { at: string; reason: string | null } | null;
    /**
     * Whether Remove is offered: not removed already, not an online payment
     * (that is refunded instead), and the invoice issued or paid.
     */
    canRemove: boolean;
}

/**
 * One time the invoice was shared by hand (DEC-173): opened on WhatsApp,
 * its link copied, its PDF downloaded or printed. On WhatsApp Saroh only
 * knows it was opened, never that it was sent.
 */
export interface InvoiceShared {
    id: string;
    channel: "WHATSAPP" | "LINK" | "PDF" | "PRINT";
    kind: "NEW" | "REMINDER" | "RECEIPT";
    /** Who shared it; null once they have left the business. */
    byUserId: string | null;
    at: string;
}

/** One payment taken online through the invoice's payment link. */
export interface InvoiceOnlinePayment {
    id: string;
    provider: string;
    amount: string;
    currency: string;
    at: string;
    /**
     * False when it came in after the invoice was already paid or void: the
     * money was taken but not applied, and is owed back to the customer.
     */
    applied: boolean;
    refund: "NONE" | "PENDING" | "REFUNDED";
}

/** On the detail read: can a payment link take payment, and is one out. */
export interface InvoiceOnline {
    providerConnected: boolean;
    payLinkActive: boolean;
    /**
     * When the link that is out was made (#870); null when none is out or
     * its date wasn't kept; absent from an older API.
     */
    payLinkMadeAt?: string | null;
    payments: InvoiceOnlinePayment[];
    /**
     * An autopay charge is under way on it (D13), `at` being when the debit
     * is asked for: the payment link and sends are held until the bank answers.
     * Null or absent (an API older than D13): none.
     */
    autopayCharge?: { at: string } | null;
    /**
     * Why its link can't take payment, or null when it can (#835): the
     * plan (connecting a provider changes nothing), Payments off, or no
     * provider. Absent from an older API.
     */
    onlineBlocker?: OnlineBlocker | null;
}

/** Where an invoice can be sent (D17): the business's email, the account thread. */
export type SendChannel = "email" | "thread";

/**
 * Whether it can be sent, and how (D17) — the one flag Invoice Detail and
 * Home both read. No channels: no Send, and "Copy payment link" only where it
 * can be paid online (`payOnline`).
 */
export interface InvoiceSend {
    channels: SendChannel[];
    reason?:
        | "NOT_OWED"
        | "NO_EMAIL_PROVIDER"
        | "NO_EMAIL_ADDRESS"
        /** An autopay charge is under way on it (D13). */
        | "AUTOPAY_PENDING";
    /** Where the email would go. */
    emailTo?: string;
    /**
     * The link it sends is a payment link: Payments is on and a provider can
     * take the money (DEC-070). False: a link to view the invoice, with no
     * Pay button. Absent from an API before DEC-070, which read a connected
     * provider instead. The workspace reads it and never guesses.
     */
    payOnline?: boolean;
    /** Something went in the last day: the next reminder can go from here. */
    nextReminderAt: string | null;
    /**
     * The contact's phone (E.164), for Share's WhatsApp tab (U11); absent
     * when there is none, or from an older API.
     */
    phone?: string;
}

/** One send or reminder, newest first. */
export interface InvoiceSent {
    id: string;
    channel: "email";
    to: string;
    at: string;
    reminder: boolean;
    /** QUEUED | SENT | FAILED | SUPPRESSED (they turned email off). */
    status: string;
}

/** What a send did. */
export interface SendResult {
    channels: SendChannel[];
    email: { status: "QUEUED" | "SUPPRESSED"; to: string } | null;
    thread: boolean;
}

/** INVOICE, or a correction to one: a credit note (down) or a supplementary invoice (up). */
export type InvoiceKind = "INVOICE" | "CREDIT_NOTE" | "SUPPLEMENTARY";

/** What a paper is called (D15, the API's `invoice-title.ts`). */
export type InvoiceTitle =
    "Tax invoice" | "Bill of supply" | "Credit note" | "Receipt" | "Invoice";

export interface InvoiceLine {
    id: string;
    description: string;
    quantity: number;
    unitPrice: string;
    amount: string;
    /** The order discount's share of this line (ADR-008). */
    discount?: string;
    /** On a tax invoice; null on a receipt. */
    gst?: {
        hsnSac: string | null;
        rate: string | null;
        taxableValue: string | null;
        cgst: string;
        sgst: string;
        igst: string;
    } | null;
    /**
     * How the paper prints a line GST was added to (the API's
     * `invoices/added-line.ts`): its rate before GST, its taxable value as
     * the amount, its GST, its discount before GST, and, only where the
     * units do not multiply out to the amount, what one comes to with GST.
     * Null or absent for every other line, which prints `unitPrice` and
     * `amount` as they are.
     */
    addedGst?: {
        unitPrice: string;
        amount: string;
        gst: string;
        discount: string;
        unitPay: string | null;
    } | null;
    orderItemId?: string | null;
}

/** A tax invoice's GST, frozen when it was issued. Null on a receipt. */
export interface InvoiceGst {
    sellerGstin: string;
    sellerState: string | null;
    placeOfSupply: { code: string; name: string | null } | null;
    taxType: "INTRA" | "INTER";
    cgst: string;
    sgst: string;
    igst: string;
}

/** A credit note or supplementary invoice against this one. */
export interface InvoiceCorrection {
    id: string;
    number: string | null;
    kind: InvoiceKind;
    total: string;
}

export interface Invoice {
    id: string;
    number: string | null;
    status: InvoiceStatus;
    standing: InvoiceStanding;
    /** Null once the contact is deleted; the bill-to keeps who it was for. */
    contact: { id: string; name: string; email: string } | null;
    /** Copied on issue; null on a draft. */
    billTo: {
        name: string | null;
        email: string | null;
        gstin?: string | null;
        state?: string | null;
        address?: string | null;
    } | null;
    /** Draft or issued, the bill-to GST details typed on it. */
    billToGst?: {
        gstin: string | null;
        state: string | null;
        address: string | null;
    };
    /** Absent from an API older than ADR-008: read it as INVOICE. */
    kind?: InvoiceKind;
    /**
     * What the paper is called, worked out by the API from what was frozen
     * on it (D15). Absent from an older API: `paperTitle` falls back.
     */
    title?: InvoiceTitle;
    /**
     * A GST-registered business's paper with every line at 0% — a bill of
     * supply, or a credit note against one: no tax columns (D15).
     */
    exempt?: boolean;
    /** The invoice a credit note or supplementary invoice corrects. */
    related?: { id: string; number: string | null } | null;
    corrections?: InvoiceCorrection[];
    /** The order it bills: the order is the ledger, so it has no payment link. */
    order?: { id: string; number: string } | null;
    bookingId?: string | null;
    gst?: InvoiceGst | null;
    /**
     * The business's registered address as it was on issue (CGST rule 46);
     * null on a draft, which prints today's.
     */
    sellerAddress?: string | null;
    /**
     * The business's name, legal name and contact email as they were on
     * issue (DEC-082); null on a draft, which prints today's.
     */
    sellerName?: string | null;
    sellerLegalName?: string | null;
    sellerEmail?: string | null;
    /**
     * How the paper looks (DEC-173, U6 #1118): a draft's own choice, else
     * the business's default as it is today; issued paper's frozen look.
     * Absent from an API older than styles: Classic in ink.
     */
    paper?: { style: PaperStyle; colour: string | null };
    /** What this invoice chose itself; null follows the business's. */
    paperChoice?: { style: PaperStyle | null; colour: string | null };
    currency: string;
    subtotal: string;
    tax: string;
    total: string;
    /**
     * What is left to pay (DEC-173): the total less the payments recorded
     * so far while it is owed, "0.00" once paid or void. Absent from an API
     * older than the payments ledger: read the total.
     */
    leftToPay?: string;
    /**
     * What has come in so far (DEC-173): live payments, a waiting cheque
     * included, a removed or bounced one not. Absent from an older API:
     * read "0.00", or the total once paid.
     */
    paidSoFar?: string;
    /** Issued, with some paid and some left: derived, never a status. */
    partlyPaid?: boolean;
    /** A live cheque on it is waiting for the bank. */
    chequeWaiting?: boolean;
    /** On the detail read only: the ledger, oldest first as the API sends it. */
    payments?: InvoicePayment[];
    issuedAt: string | null;
    dueAt: string | null;
    paidAt: string | null;
    voidedAt: string | null;
    voidReason: string | null;
    payment: {
        method: StoredPaymentMethod;
        reference: string | null;
        note: string | null;
    } | null;
    source: InvoiceSource;
    subscriptionId: string | null;
    periodStart: string | null;
    periodEnd: string | null;
    courseEnrollmentId: string | null;
    packPurchaseId: string | null;
    reissuedFromId: string | null;
    reissuedAsId: string | null;
    /** Issued by Saroh, not a person: a subscription renewal. */
    issuedAutomatically: boolean;
    createdAt: string;
    updatedAt: string;
    /** Its first line and how many there are: what it is for, in a list. */
    summary: {
        description: string;
        quantity: number;
        lineCount: number;
    } | null;
    /** On a detail read only. */
    lines?: InvoiceLine[];
    /** On the detail read only; absent from an API that predates payment links. */
    online?: InvoiceOnline;
    /** On the detail read only; absent from an API before D17: no Send. */
    send?: InvoiceSend;
    sent?: InvoiceSent[];
    /** On the detail read only: every share by hand, newest first. */
    shared?: InvoiceShared[];
    /**
     * "How to pay us" (R32, #833), on the detail read of an unpaid invoice:
     * the paper prints it, as the PDF does. Null when none is set; absent
     * otherwise.
     */
    payInstructions?: PayInstructionsSettings | null;
}

export interface InvoiceInput {
    contactId?: string;
    currency?: string;
    lines?: {
        description: string;
        quantity: number;
        unitPrice: string;
        /** Percent the price includes, on a registered business's invoice. */
        gstRate?: string;
        hsnSac?: string;
    }[];
    tax?: string;
    dueAt?: string | null;
    /** A registered buyer's GSTIN; "" clears it. */
    billToGstin?: string;
    /** The buyer's GST state code — the place of supply. "" clears it. */
    billToState?: string;
    billToAddress?: string;
    /** The draft's own style (DEC-173); "" follows the business's. */
    paperStyle?: PaperStyle | "";
    /** The draft's own colour, `#RRGGBB`; "" follows the business's. */
    paperColour?: string;
}

export interface PaymentInput {
    method: InvoicePaymentMethod;
    /**
     * How much came in, as a Decimal string (DEC-173). Left out, it is
     * everything left to pay.
     */
    amount?: string;
    reference?: string;
    note?: string;
    /** The name before the ledger; `receivedAt` from DEC-173. */
    paidAt?: string;
    /** When the money came in (ISO). */
    receivedAt?: string;
    /** A cheque only. */
    chequeNumber?: string;
    chequeBank?: string;
}

/** What recording a payment answers (DEC-173): the invoice, and what Undo removes. */
export type RecordedPayment = Invoice & { recorded?: { paymentId: string } };

/** How an invoice is shared by hand (DEC-173, `POST :id/share`). */
export interface ShareAsk {
    channel: "WHATSAPP" | "LINK" | "PDF" | "PRINT" | "EMAIL";
    kind?: "NEW" | "REMINDER" | "RECEIPT";
}

/** What a share answers: the link minted, the message, and WhatsApp's link. */
export interface ShareResult {
    channel: ShareAsk["channel"];
    kind: "NEW" | "REMINDER" | "RECEIPT";
    url: string | null;
    text: string | null;
    phone: string | null;
    /** `wa.me` with the message filled in; null without a phone. */
    whatsappUrl: string | null;
    payOnline: boolean;
    email: { status: string; to: string } | null;
    sharedAt: string;
}

/** The same, by the name Record payment (U10) reads it. */
export type InvoiceShareResult = ShareResult;

/** The newest invoices, and every unpaid one however old (see `withLive`). */
export async function listInvoices(): Promise<CappedList<Invoice>> {
    const base = await orgBase();
    if (!base) return { rows: [], truncated: false };
    const [newest, issued, overdue] = await Promise.all([
        getJson<Invoice[]>(`${base}/invoices`),
        getJson<Invoice[]>(`${base}/invoices?view=issued`),
        getJson<Invoice[]>(`${base}/invoices?view=overdue`),
    ]);
    return withLive(newest ?? [], issued ?? [], overdue ?? []);
}

/** What the API narrows the list by (DEC-173, U4): `GET invoices?…`. */
export interface InvoiceListAsk {
    /** A name, part of a number, or an amount. */
    q?: string;
    /** Only a cheque not in the bank: the cheques line. */
    view?: "cheques";
    /** Money received from this day on: the strip's Paid this month. */
    paidFrom?: string;
    /** One pack's or course's, as `listInvoicesIn` reads them (D18). */
    packId?: string;
    courseId?: string;
}

/**
 * The list as the API narrows it (DEC-173, U8): a search, the cheques
 * waiting, or what was paid this month, found on the server however old,
 * where the newest page would miss them. A failed read throws, as every
 * list read does: never an empty list.
 */
export async function listInvoicesBy(
    ask: InvoiceListAsk,
): Promise<CappedList<Invoice>> {
    const base = await orgBase();
    if (!base) return { rows: [], truncated: false };
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(ask)) {
        if (typeof value === "string" && value !== "") query.set(key, value);
    }
    const rows = (await getJson<Invoice[]>(`${base}/invoices?${query}`)) ?? [];
    return { rows, truncated: rows.length >= LIST_LIMIT };
}

/**
 * The money strip's one read (`GET invoices/summary`, DEC-173 U4). Null
 * when it couldn't be read: the strip then says "Couldn't load totals"
 * with Try again, and the list below still loads. Never a row of zeros.
 */
export async function readInvoiceSummary(): Promise<InvoiceSummary | null> {
    const base = await orgBase();
    if (!base) return null;
    try {
        const res = await apiFetch(`${base}/invoices/summary`);
        if (!res.ok) return null;
        return (await res.json()) as InvoiceSummary;
    } catch {
        // Logged by the API; here it is the strip's own failed state.
        return null;
    }
}

/**
 * Whether the business has made any invoice yet: Home's "Invoice a client"
 * (DEC-070) goes once it has. Null when the API couldn't answer — a refusal
 * or a failure — so the caller decides what an unknown means; nothing here
 * throws, since Home must not break over a first-run card.
 */
export async function hasAnyInvoice(): Promise<boolean | null> {
    const base = await orgBase();
    if (!base) return null;
    const res = await apiFetch(`${base}/invoices`).catch(() => null);
    if (!res?.ok) return null;
    const rows = (await res.json().catch(() => null)) as unknown;
    return Array.isArray(rows) ? rows.length > 0 : null;
}

/**
 * The invoices paid from `since` on, credit notes never — Home's "Last 24
 * hours" money, filtered by the API (H-7) rather than over the capped
 * newest page, where an invoice made months ago and paid this morning is
 * missing. Null when the API can't answer it (one from before `paidSince`
 * refuses the unknown parameter): the screen then filters what it has.
 */
export async function listInvoicesPaidSince(
    since: Date,
): Promise<Invoice[] | null> {
    const base = await orgBase();
    if (!base) return [];
    const res = await apiFetch(
        `${base}/invoices?paidSince=${encodeURIComponent(since.toISOString())}`,
    );
    if (!res.ok) return null;
    return (await res.json()) as Invoice[];
}

/** One contact's invoices, newest first: the Connected panel's "N more". */
export async function listInvoicesFor(contactId: string): Promise<Invoice[]> {
    const base = await orgBase();
    if (!base) return [];
    return (
        (await getJson<Invoice[]>(
            `${base}/invoices?contactId=${encodeURIComponent(contactId)}`,
        )) ?? []
    );
}

export async function getInvoice(id: string): Promise<Invoice | null> {
    const base = await orgBase();
    if (!base) return null;
    return getJson<Invoice>(`${base}/invoices/${encodeURIComponent(id)}`);
}

async function send<T>(
    path: string,
    method: "GET" | "POST" | "PATCH" | "DELETE",
    body: unknown,
    fallback: string,
): Promise<ApiResult<T>> {
    const base = await orgBase();
    if (!base) return { ok: false, error: "No active business." };
    const res = await apiFetch(`${base}/invoices${path}`, {
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: (data ?? {}) as T };
    return toFailure(data, fallback);
}

const at = (id: string) => `/${encodeURIComponent(id)}`;

export function createInvoice(input: InvoiceInput) {
    return send<Invoice>("", "POST", input, "Couldn't save that invoice.");
}

export function updateInvoice(id: string, input: InvoiceInput) {
    return send<Invoice>(at(id), "PATCH", input, "Couldn't save that invoice.");
}

export function deleteInvoice(id: string) {
    return send<Record<string, never>>(
        at(id),
        "DELETE",
        undefined,
        "Couldn't delete that draft.",
    );
}

export function issueInvoice(id: string) {
    return send<Invoice>(
        `${at(id)}/issue`,
        "POST",
        {},
        "Couldn't issue that invoice.",
    );
}

/**
 * Cancel an issued or paid invoice with a credit note for all of it
 * (ADR-008) — how a GST-registered business undoes one. Answers with the
 * credit note.
 */
export function creditInvoice(id: string, reason: string) {
    return send<Invoice>(
        `${at(id)}/credit`,
        "POST",
        { reason },
        "Couldn't cancel that invoice.",
    );
}

/** The credit note "Cancel all of it" would issue (DEC-173, U13); nothing is taken. */
export interface CreditPreview {
    /** Most likely its number: a credit note issued meanwhile moves it on. */
    number: string;
    amount: string;
    currency: string;
}

/**
 * What "Cancel all of it" would issue, read when the sheet opens: the
 * credit note's likely number and amount. Refused as the credit would be
 * (a partly paid invoice, one already credited), with the API's words.
 */
export function readCreditPreview(id: string) {
    return send<CreditPreview>(
        `${at(id)}/credit-preview`,
        "GET",
        undefined,
        "Couldn't load the credit note.",
    );
}

/** "Cancel and write a correct one" (U13): what was made, in one step. */
export interface CreditAndRewrite {
    creditNote: { id: string; number: string | null };
    draft: Invoice;
}

/**
 * The credit note for all of it and a draft with the same lines, in one
 * transaction on the API: a failure leaves neither.
 */
export function creditAndRewriteInvoice(id: string, reason: string) {
    return send<CreditAndRewrite>(
        `${at(id)}/credit-and-rewrite`,
        "POST",
        { reason },
        "Couldn't cancel that invoice.",
    );
}

/** "Write again" on a void invoice nobody wrote again (U13): the draft. */
export function writeInvoiceAgain(id: string) {
    return send<Invoice>(
        `${at(id)}/write-again`,
        "POST",
        {},
        "Couldn't write that invoice again.",
    );
}

export function voidInvoice(id: string, reason: string) {
    return send<Invoice>(
        `${at(id)}/void`,
        "POST",
        { reason },
        "Couldn't void that invoice.",
    );
}

/** Void it and open a corrected draft; answers with the draft. */
export function reissueInvoice(id: string, reason: string) {
    return send<Invoice>(
        `${at(id)}/reissue`,
        "POST",
        { reason },
        "Couldn't reissue that invoice.",
    );
}

export function recordPayment(id: string, input: PaymentInput) {
    return send<RecordedPayment>(
        `${at(id)}/payments`,
        "POST",
        input,
        "Couldn't record that payment.",
    );
}

const payment = (id: string, paymentId: string) =>
    `${at(id)}/payments/${encodeURIComponent(paymentId)}`;

/**
 * Remove a payment recorded by mistake (DEC-173): soft, kept in the
 * history with the reason. Answers with the invoice, owed again by it.
 */
export function removePayment(id: string, paymentId: string, reason?: string) {
    return send<Invoice>(
        payment(id, paymentId),
        "DELETE",
        reason ? { reason } : {},
        "Couldn't remove that payment.",
    );
}

/** A waiting cheque is in the bank; its receipt goes then. */
export function chequeCleared(
    id: string,
    paymentId: string,
    clearedAt?: string,
) {
    return send<Invoice>(
        `${payment(id, paymentId)}/cleared`,
        "POST",
        clearedAt ? { clearedAt } : {},
        "Couldn't mark that cheque as in the bank.",
    );
}

/** A waiting cheque bounced: what it paid is owed again, with no charge. */
export function chequeBounced(
    id: string,
    paymentId: string,
    input: { bouncedAt?: string; reason?: string } = {},
) {
    return send<Invoice>(
        `${payment(id, paymentId)}/bounced`,
        "POST",
        input,
        "Couldn't mark that cheque as bounced.",
    );
}

/**
 * Share it by hand (DEC-173): on WhatsApp (a fresh link and the message;
 * Saroh sends nothing), as a link, a PDF or printed, each logged; or a
 * receipt by the business's own email.
 */
export function shareInvoice(id: string, ask: ShareAsk) {
    return send<ShareResult>(
        `${at(id)}/share`,
        "POST",
        ask,
        "Couldn't share that invoice.",
    );
}

/**
 * Make the invoice's payment link. The answer is the only time the link is seen —
 * the API keeps only a hash of it — so asking again makes a new one and the
 * one shared before stops working.
 */
export function createPayLink(id: string) {
    return send<{ url: string; payLinkMadeAt?: string }>(
        `${at(id)}/pay-link`,
        "POST",
        {},
        "Couldn't make a payment link.",
    );
}

/**
 * A link that only shows the invoice (#833, DEC-070): no Pay button, with
 * "How to pay us". For a business whose invoices can't be paid online; like
 * a payment link it is seen once, and replaces the one before.
 */
export function createViewLink(id: string) {
    return send<{ url: string; payLinkMadeAt?: string }>(
        `${at(id)}/view-link`,
        "POST",
        {},
        "Couldn't make a link to the invoice.",
    );
}

/**
 * Send it with a fresh payment link (D17), through the business's own email
 * and, once it is live, the customer's account thread. The link itself
 * never comes back here: it goes only to the customer.
 */
export function sendInvoice(id: string) {
    return send<SendResult>(
        `${at(id)}/send`,
        "POST",
        {},
        "Couldn't send that invoice.",
    );
}

/** The same, as a reminder: one a day. */
export function remindInvoice(id: string) {
    return send<SendResult>(
        `${at(id)}/remind`,
        "POST",
        {},
        "Couldn't send that reminder.",
    );
}

/**
 * Remind many (DEC-173, U5): how each picked invoice's reminder would go,
 * and the words the first email one gets. Home's Remind all asks it with
 * `quietDays` (DEC-171, U8).
 */
export function previewReminders(ask: ReminderAsk) {
    return send<ReminderPreview>(
        "/reminders/preview",
        "POST",
        ask,
        "Couldn't read who owes you.",
    );
}

/** Send them: the email ones go, each read again as Send reminder does. */
export function sendReminders(ask: ReminderAsk) {
    return send<ReminderSendResult>(
        "/reminders",
        "POST",
        ask,
        "Couldn't send those reminders.",
    );
}

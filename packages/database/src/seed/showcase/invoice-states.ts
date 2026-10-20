import type { Prisma } from "@prisma/client";

import type { Db } from "../helpers";

/**
 * What happened to an invoice after it went out (DEC-173, #1129): the
 * payments on it, how it was shared and the emails that sent or reminded
 * about it, and the look it went out in. Rye & Co. (`bakery.ts`) and Pulse
 * Fitness (`pulse.ts`) plan these so the rebuilt invoice screens have every
 * state to show: part paid, a cheque waiting for the bank, one that
 * bounced, overdue by different ages, shared on WhatsApp, reminded, credited
 * and void and written again, and paper in each style.
 *
 * Every row is the one the API would have left behind:
 *
 * - **payments** are the ledger (`InvoicePayment`), in integer paise. A
 *   cheque is received WAITING and later CLEARED or BOUNCED; a bounced one
 *   no longer counts. The invoice's `paidCents`, status and legacy payment
 *   columns are worked out from the rows by {@link settleLedger}, the
 *   API's `settle` (`invoice-ledger.ts`): PAID once the live sum reaches the
 *   total, `paidAt` and the method the last live payment's; anything less
 *   is ISSUED, and "Partly paid" is ISSUED with `paidCents > 0`.
 * - **shares** are `InvoiceShare` rows: WhatsApp click-to-chat, a copied
 *   link, a PDF. Saroh never sends a WhatsApp message itself.
 * - **emails** are the `Message` rows the send and remind paths write
 *   (`INVOICE_SENT`, `INVOICE_REMINDER`), as sent through the business's
 *   own provider.
 *
 * Ids are seeded (`idFor`), so a re-run clears and writes them again.
 */

export type LedgerMethod =
    "CASH" | "UPI" | "BANK_TRANSFER" | "CARD" | "OTHER" | "CHEQUE";

export interface ChequeSpec {
    number: string;
    bank: string;
    status: "WAITING" | "CLEARED" | "BOUNCED";
    /** When it cleared or bounced; absent while it waits. */
    settledAt?: Date;
    /** Why it bounced. */
    reason?: string;
}

export interface LedgerSpec {
    /** Integer paise, above 0. */
    amountPaise: number;
    method: LedgerMethod;
    receivedAt: Date;
    reference?: string | null;
    note?: string | null;
    cheque?: ChequeSpec;
    recordedById: string | null;
}

export interface ShareSpec {
    channel: "WHATSAPP" | "LINK" | "PDF" | "PRINT";
    kind: "NEW" | "REMINDER" | "RECEIPT";
    at: Date;
    byUserId: string | null;
}

export interface EmailSpec {
    template: "INVOICE_SENT" | "INVOICE_REMINDER";
    at: Date;
    byUserId: string | null;
}

/** An invoice's trail after issue: its payments, shares and emails. */
export interface InvoiceTrail {
    ledger?: LedgerSpec[];
    shares?: ShareSpec[];
    emails?: EmailSpec[];
}

export const PAPER_STYLES = ["CLASSIC", "BAND", "COMPACT"] as const;

/** The look a paper went out in (`Invoice.paperStyle`, `.paperColour`). */
export interface PaperSpec {
    style: (typeof PAPER_STYLES)[number];
    /** `#RRGGBB` in capitals, as the API stores it, or null for ink. */
    colour: string | null;
}

/** Rye & Co.'s colour: the crust of a rye loaf. */
export const RYE_COLOUR = "#6B3F1D";
/** Pulse Fitness's colour. */
export const PULSE_COLOUR = "#2F5D50";

/** A payment that counts: not a bounced cheque. */
const isLive = (p: LedgerSpec) => p.cheque?.status !== "BOUNCED";

export interface Settled {
    paidCents: number;
    paid: boolean;
    /** The last live payment, by when it came in. */
    last: LedgerSpec | null;
}

/** The API's settle rules (`invoice-ledger.ts` `settle`), on planned rows. */
export function settleLedger(
    totalPaise: number,
    ledger: readonly LedgerSpec[],
): Settled {
    const live = ledger.filter(isLive);
    const paidCents = live.reduce((sum, p) => sum + p.amountPaise, 0);
    const last = live.reduce<LedgerSpec | null>(
        (latest, p) =>
            !latest || p.receivedAt.getTime() >= latest.receivedAt.getTime()
                ? p
                : latest,
        null,
    );
    return {
        paidCents,
        paid: totalPaise > 0 && paidCents >= totalPaise,
        last,
    };
}

/**
 * The invoice's own columns from its ledger, for an issued invoice that
 * has one: status, `paidCents` and the legacy payment columns (set while
 * PAID, null while owed). Refuses an overpayment, as the API does.
 */
export function ledgerColumns(
    id: string,
    totalPaise: number,
    ledger: readonly LedgerSpec[],
): {
    status: "ISSUED" | "PAID";
    paidCents: number;
    paidAt: Date | null;
    paymentMethod: string | null;
    paymentReference: string | null;
    paymentNote: string | null;
} {
    const s = settleLedger(totalPaise, ledger);
    if (s.paidCents > totalPaise) {
        throw new Error(
            `Invoice ${id}: its payments (${s.paidCents}) are more than its total (${totalPaise})`,
        );
    }
    const last = s.paid ? s.last : null;
    return {
        status: s.paid ? "PAID" : "ISSUED",
        paidCents: s.paidCents,
        paidAt: last?.receivedAt ?? null,
        paymentMethod: last?.method ?? null,
        paymentReference: last?.reference ?? null,
        paymentNote: last?.note ?? null,
    };
}

export interface TrailRows {
    payments: Prisma.InvoicePaymentCreateManyInput[];
    shares: Prisma.InvoiceShareCreateManyInput[];
    messages: Prisma.MessageCreateManyInput[];
}

export const emptyTrailRows = (): TrailRows => ({
    payments: [],
    shares: [],
    messages: [],
});

/** One invoice's trail as rows, added to `out`. */
export function addTrailRows(
    out: TrailRows,
    input: {
        orgId: string;
        invoiceId: string;
        currency: string;
        trail: InvoiceTrail;
        /** The invoice as it went out: its number and who it is billed to. */
        number: string;
        business: string;
        to: { name: string; email: string; contactId: string | null };
        /** A seeded id for a row of this trail. */
        idFor: (...parts: (string | number)[]) => string;
    },
): void {
    const { orgId, invoiceId, trail } = input;
    (trail.ledger ?? []).forEach((p, k) => {
        const cheque = p.cheque;
        out.payments.push({
            id: input.idFor("payment", k),
            organizationId: orgId,
            invoiceId,
            amountCents: p.amountPaise,
            currency: input.currency,
            method: p.method,
            reference: p.reference ?? null,
            note: p.note ?? null,
            receivedAt: p.receivedAt,
            chequeNumber: cheque?.number ?? null,
            chequeBank: cheque?.bank ?? null,
            bankStatus: cheque?.status ?? null,
            clearedAt:
                cheque?.status === "CLEARED"
                    ? (cheque.settledAt ?? null)
                    : null,
            bouncedAt:
                cheque?.status === "BOUNCED"
                    ? (cheque.settledAt ?? null)
                    : null,
            bounceReason:
                cheque?.status === "BOUNCED" ? (cheque.reason ?? null) : null,
            recordedById: p.recordedById,
            createdAt: p.receivedAt,
        });
    });
    (trail.shares ?? []).forEach((s, k) => {
        out.shares.push({
            id: input.idFor("share", k),
            organizationId: orgId,
            invoiceId,
            channel: s.channel,
            kind: s.kind,
            byUserId: s.byUserId,
            createdAt: s.at,
        });
    });
    const first = input.to.name.split(" ")[0] ?? input.to.name;
    (trail.emails ?? []).forEach((e, k) => {
        const reminder = e.template === "INVOICE_REMINDER";
        out.messages.push({
            id: input.idFor("message", k),
            organizationId: orgId,
            channel: "EMAIL",
            contactId: input.to.contactId,
            toAddress: input.to.email,
            subject: reminder
                ? `Reminder: invoice ${input.number} from ${input.business}`
                : `Invoice ${input.number} from ${input.business}`,
            body: reminder
                ? `Hi ${first}, a reminder that invoice ${input.number} is waiting to be paid.`
                : `Hi ${first}, here is invoice ${input.number}.`,
            status: "SENT",
            createdByUserId: e.byUserId,
            invoiceId,
            template: e.template,
            createdAt: e.at,
            updatedAt: e.at,
        });
    });
}

/** Write the trails' rows: after their invoices. */
export async function writeTrailRows(prisma: Db, rows: TrailRows) {
    await prisma.invoicePayment.createMany({ data: rows.payments });
    await prisma.invoiceShare.createMany({ data: rows.shares });
    await prisma.message.createMany({ data: rows.messages });
}

// --- Checks -----------------------------------------------------------------------

type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v ?? 0);

/** What a business's invoices show, by the states the new screens draw. */
export interface InvoiceStateCounts {
    partlyPaid: number;
    partlyPaidRenewals: number;
    /** Each waiting cheque's amount in rupees, smallest first. */
    chequesWaiting: number[];
    chequesCleared: number;
    bouncedOwedAgain: number;
    /** Overdue invoices by how late: up to a week, up to a month, more. */
    overdueAges: { week: number; month: number; older: number };
    sharedOnWhatsApp: number;
    remindedByEmail: number;
    remindedOnWhatsApp: number;
    receiptsShared: number;
    creditedAndWrittenAgain: number;
    voidAndWrittenAgain: number;
    /** Issued paper's styles, in order, "CLASSIC" for none chosen. */
    styles: string[];
    /** The business's default look: "BAND #6B3F1D", or "" for none. */
    defaultLook: string;
}

export async function invoiceStateCounts(
    prisma: Db,
    orgId: string,
    now: Date,
): Promise<InvoiceStateCounts> {
    const at = now.toISOString();
    const one = async (rows: Promise<Row[]>) => n((await rows)[0]?.n);
    const waiting = await prisma.invoicePayment.findMany({
        where: {
            organizationId: orgId,
            bankStatus: "WAITING",
            removedAt: null,
        },
        select: { amountCents: true },
        orderBy: { amountCents: "asc" },
    });
    const ages = await prisma.$queryRaw<Row[]>`
        SELECT
            COUNT(*) FILTER (WHERE "dueAt" >= ${at}::timestamp - interval '7 days') AS week,
            COUNT(*) FILTER (WHERE "dueAt" < ${at}::timestamp - interval '7 days'
                AND "dueAt" >= ${at}::timestamp - interval '30 days') AS month,
            COUNT(*) FILTER (WHERE "dueAt" < ${at}::timestamp - interval '30 days') AS older
        FROM "Invoice"
        WHERE "organizationId" = ${orgId} AND status = 'ISSUED'
          AND kind = 'INVOICE' AND "dueAt" < ${at}::timestamp`;
    const shares = await prisma.$queryRaw<Row[]>`
        SELECT channel, kind, COUNT(*) AS n FROM "InvoiceShare"
        WHERE "organizationId" = ${orgId} GROUP BY 1, 2`;
    const shared = (channel: string, kind: string) =>
        n(shares.find((s) => s.channel === channel && s.kind === kind)?.n);
    const styles = await prisma.$queryRaw<Row[]>`
        SELECT DISTINCT COALESCE("paperStyle", 'CLASSIC') AS style FROM "Invoice"
        WHERE "organizationId" = ${orgId} AND number IS NOT NULL
        ORDER BY 1`;
    const profile = await prisma.businessProfile.findUnique({
        where: { organizationId: orgId },
        select: { invoiceStyle: true, invoiceColour: true },
    });
    const writtenAgain = (status: string) =>
        one(prisma.$queryRaw<Row[]>`
            SELECT COUNT(DISTINCT r.id) AS n FROM "Invoice" r
            JOIN "Invoice" w ON w."reissuedFromId" = r.id
            WHERE r."organizationId" = ${orgId} AND r.status = ${status}`);
    return {
        partlyPaid: await one(prisma.$queryRaw<Row[]>`
            SELECT COUNT(*) AS n FROM "Invoice"
            WHERE "organizationId" = ${orgId} AND status = 'ISSUED'
              AND "paidCents" > 0`),
        partlyPaidRenewals: await one(prisma.$queryRaw<Row[]>`
            SELECT COUNT(*) AS n FROM "Invoice"
            WHERE "organizationId" = ${orgId} AND status = 'ISSUED'
              AND source = 'SUBSCRIPTION' AND "paidCents" > 0`),
        chequesWaiting: waiting.map((p) => p.amountCents / 100),
        chequesCleared: await prisma.invoicePayment.count({
            where: {
                organizationId: orgId,
                bankStatus: "CLEARED",
                removedAt: null,
            },
        }),
        bouncedOwedAgain: await one(prisma.$queryRaw<Row[]>`
            SELECT COUNT(DISTINCT i.id) AS n FROM "Invoice" i
            JOIN "InvoicePayment" p ON p."invoiceId" = i.id
            WHERE i."organizationId" = ${orgId} AND i.status = 'ISSUED'
              AND p."bankStatus" = 'BOUNCED'`),
        overdueAges: {
            week: n(ages[0]?.week),
            month: n(ages[0]?.month),
            older: n(ages[0]?.older),
        },
        sharedOnWhatsApp: shared("WHATSAPP", "NEW"),
        remindedByEmail: await prisma.message.count({
            where: { organizationId: orgId, template: "INVOICE_REMINDER" },
        }),
        remindedOnWhatsApp: shared("WHATSAPP", "REMINDER"),
        receiptsShared: shared("WHATSAPP", "RECEIPT"),
        creditedAndWrittenAgain: await writtenAgain("CREDITED"),
        voidAndWrittenAgain: await writtenAgain("VOID"),
        styles: styles.map((s) => String(s.style)),
        defaultLook: profile?.invoiceStyle
            ? `${profile.invoiceStyle} ${profile.invoiceColour ?? "ink"}`
            : "",
    };
}

/** The counts in a line for the seed's table. */
export function describeInvoiceStates(c: InvoiceStateCounts): string {
    const parts = [
        `${c.partlyPaid} part paid`,
        `${c.chequesWaiting.length} cheques waiting`,
        `${c.bouncedOwedAgain} bounced`,
        `overdue ${c.overdueAges.week}/${c.overdueAges.month}/${c.overdueAges.older}`,
        `${c.sharedOnWhatsApp} on WhatsApp`,
        `${c.remindedByEmail + c.remindedOnWhatsApp} reminders`,
        `${c.creditedAndWrittenAgain + c.voidAndWrittenAgain} written again`,
        c.styles.map((s) => s.toLowerCase()).join("/"),
    ];
    return parts.join(", ");
}

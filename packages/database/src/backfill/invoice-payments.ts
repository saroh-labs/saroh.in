/**
 * The invoice ledger backfill (DEC-173, #1113): every invoice already paid
 * gets its one payment.
 *
 * Before the ledger, an invoice was unpaid or paid in full, and its payment
 * lived on the row (`paidAt`, `paymentMethod`, `paymentReference`,
 * `paymentNote`). Since the ledger, the invoice's status and `paidCents`
 * are worked out from its `InvoicePayment` rows. This writes, for each PAID
 * invoice that has none:
 *
 * - **one row for its full total,** in integer paise;
 * - **its method:** the stored one (ONLINE stays ONLINE); none, or one the
 *   ledger doesn't know, is OTHER;
 * - **when it came in:** `paidAt`, else `issuedAt`, else `createdAt`;
 * - **its reference and note,** copied;
 * - **for ONLINE,** the succeeded payment intent it came from, when there is
 *   one no other row names;
 *
 * and then sets the invoice's `paidCents` from its rows.
 *
 * **Left out:** an order's invoice and its corrections (the order is their
 * ledger, ADR-008), credit notes (nothing is paid on one), and anything not
 * PAID (drafts, issued, void, credited). A paid invoice of ₹0, or one too big
 * for an Int of paise, is reported and left alone: the ledger refuses both.
 *
 * Each business runs in its own transaction and locks the invoices it fills
 * (FOR NO KEY UPDATE, as the ledger's own writes do), then reads again
 * whether each still has no payment, so a payment the API records meanwhile
 * is never doubled. Idempotent: a second run finds every paid invoice with
 * its row and writes nothing. A dry run does the same work and rolls it
 * back, so it reports exactly what a real run would do.
 *
 * Run: `pnpm --filter @saroh/database exec tsx src/backfill/invoice-payments.cli.ts [--dry-run] [--org <id>]...`
 */
import type { PrismaClient } from "@prisma/client";

import type { TransactionClient } from "../transaction";

/** Every method a ledger row holds (`InvoicePayment_method_check`). */
const LEDGER_METHODS: ReadonlySet<string> = new Set([
    "CASH",
    "UPI",
    "BANK_TRANSFER",
    "CARD",
    "OTHER",
    "CHEQUE",
    "ONLINE",
]);

/** The largest amount an `Int` of paise holds. */
const MAX_LEDGER_CENTS = 2_147_483_647;

export interface SkippedInvoice {
    organizationId: string;
    invoiceId: string;
    number: string | null;
    why: "nothing to pay" | "too large for the ledger";
}

export interface InvoicePaymentsReport {
    /** Businesses looked at: every one with a paid invoice, or those named. */
    organizations: number;
    /** Payments written, one per invoice. */
    written: number;
    /** Paid invoices left without a payment, and why. */
    skipped: SkippedInvoice[];
    /** True when nothing was written (a dry run). */
    dryRun: boolean;
}

class DryRunRollback extends Error {}

/**
 * The paid invoices the ledger covers that have no payment yet. The
 * `i`-aliased fragment every read here shares.
 */
const NEEDS_A_ROW = `
    i.status = 'PAID'
    AND i."orderId" IS NULL
    AND i.kind <> 'CREDIT_NOTE'
    AND NOT EXISTS (SELECT 1 FROM "InvoicePayment" p WHERE p."invoiceId" = i.id)`;

export async function backfillInvoicePayments(
    db: PrismaClient,
    options: { organizationIds?: readonly string[]; dryRun?: boolean } = {},
): Promise<InvoicePaymentsReport> {
    const dryRun = options.dryRun ?? false;
    const orgs = options.organizationIds
        ? Array.from(new Set(options.organizationIds)).sort()
        : (
              await db.$queryRawUnsafe<{ organizationId: string }[]>(
                  `SELECT DISTINCT i."organizationId" FROM "Invoice" i
                   WHERE ${NEEDS_A_ROW}
                   ORDER BY i."organizationId"`,
              )
          ).map((r) => r.organizationId);
    const report: InvoicePaymentsReport = {
        organizations: orgs.length,
        written: 0,
        skipped: [],
        dryRun,
    };
    for (const organizationId of orgs) {
        let part: { written: number; skipped: SkippedInvoice[] } = {
            written: 0,
            skipped: [],
        };
        try {
            await db.$transaction(
                async (tx) => {
                    part = await fillOrganization(tx, organizationId);
                    if (dryRun) throw new DryRunRollback();
                },
                { timeout: 120_000 },
            );
        } catch (e) {
            if (!(e instanceof DryRunRollback)) throw e;
        }
        report.written += part.written;
        report.skipped.push(...part.skipped);
    }
    return report;
}

interface PaidInvoice {
    id: string;
    number: string | null;
    currency: string;
    total: string;
    paidAt: Date | null;
    issuedAt: Date | null;
    createdAt: Date;
    paymentMethod: string | null;
    paymentReference: string | null;
    paymentNote: string | null;
}

async function fillOrganization(
    tx: TransactionClient,
    organizationId: string,
): Promise<{ written: number; skipped: SkippedInvoice[] }> {
    // Locked first, in id order, as the ledger's writes lock an invoice.
    const locked = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT i.id FROM "Invoice" i
         WHERE i."organizationId" = $1 AND ${NEEDS_A_ROW}
         ORDER BY i.id
         FOR NO KEY UPDATE OF i`,
        organizationId,
    );
    if (locked.length === 0) return { written: 0, skipped: [] };
    // Read again under the locks, in a statement of its own: a payment the
    // API recorded while this waited is seen now, and its invoice skipped.
    const invoices = await tx.$queryRawUnsafe<PaidInvoice[]>(
        `SELECT i.id, i.number, i.currency, i.total::text AS total,
                i."paidAt", i."issuedAt", i."createdAt",
                i."paymentMethod", i."paymentReference", i."paymentNote"
         FROM "Invoice" i
         WHERE i.id = ANY($1::text[]) AND ${NEEDS_A_ROW}
         ORDER BY i.id`,
        locked.map((r) => r.id),
    );

    const skipped: SkippedInvoice[] = [];
    const rows: {
        organizationId: string;
        invoiceId: string;
        amountCents: number;
        currency: string;
        method: string;
        reference: string | null;
        note: string | null;
        receivedAt: Date;
        paymentIntentId: string | null;
    }[] = [];
    for (const invoice of invoices) {
        const amountCents = paise(invoice.total);
        if (amountCents <= 0 || amountCents > MAX_LEDGER_CENTS) {
            skipped.push({
                organizationId,
                invoiceId: invoice.id,
                number: invoice.number,
                why:
                    amountCents <= 0
                        ? "nothing to pay"
                        : "too large for the ledger",
            });
            continue;
        }
        const method =
            invoice.paymentMethod && LEDGER_METHODS.has(invoice.paymentMethod)
                ? invoice.paymentMethod
                : "OTHER";
        rows.push({
            organizationId,
            invoiceId: invoice.id,
            amountCents,
            currency: invoice.currency,
            method,
            reference: invoice.paymentReference,
            note: invoice.paymentNote,
            receivedAt: invoice.paidAt ?? invoice.issuedAt ?? invoice.createdAt,
            paymentIntentId:
                method === "ONLINE"
                    ? await succeededIntent(tx, organizationId, invoice.id)
                    : null,
        });
    }
    if (rows.length === 0) return { written: 0, skipped };

    await tx.invoicePayment.createMany({ data: rows });
    // The cache, from the rows: live means not removed and not bounced.
    await tx.$executeRawUnsafe(
        `UPDATE "Invoice" i
         SET "paidCents" = COALESCE((
             SELECT SUM(p."amountCents")::int FROM "InvoicePayment" p
             WHERE p."invoiceId" = i.id
               AND p."removedAt" IS NULL
               AND p."bankStatus" IS DISTINCT FROM 'BOUNCED'
         ), 0)
         WHERE i.id = ANY($1::text[])`,
        rows.map((r) => r.invoiceId),
    );
    return { written: rows.length, skipped };
}

/** The invoice's latest succeeded online payment no ledger row names yet. */
async function succeededIntent(
    tx: TransactionClient,
    organizationId: string,
    invoiceId: string,
): Promise<string | null> {
    const intent = await tx.paymentIntent.findFirst({
        where: {
            organizationId,
            invoiceId,
            status: "SUCCEEDED",
            invoicePayment: { is: null },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true },
    });
    return intent?.id ?? null;
}

/** "8400.00" → 840000, by digits: no float touches the paisa. */
function paise(total: string): number {
    const negative = total.startsWith("-");
    const [whole = "0", frac = ""] = (negative ? total.slice(1) : total).split(
        ".",
    );
    const cents = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
    return negative ? -cents : cents;
}

/** One line per invoice left without a payment, for the command's output. */
export function describeInvoicePaymentsReport(
    report: InvoicePaymentsReport,
): string[] {
    return report.skipped.map(
        (s) =>
            `business ${s.organizationId}: invoice ${s.number ?? s.invoiceId} left without a payment (${s.why})`,
    );
}

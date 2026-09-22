import type { Prisma } from "@saroh/database";

type Sequencer = Pick<Prisma.TransactionClient, "invoiceSequence">;

/** 1 → "INV-0001". Past 9999 it simply grows: "INV-10000". */
export function formatInvoiceNumber(n: number): string {
    return `INV-${String(n).padStart(4, "0")}`;
}

/**
 * The business's next invoice number, taken on the caller's transaction.
 *
 * One statement: an upsert keyed on the organization with a single unique
 * field and no nested writes, which Prisma runs as Postgres's own
 * `INSERT … ON CONFLICT DO UPDATE SET "lastNumber" = "lastNumber" + 1`. The
 * row lock that statement takes is what serialises two issues in one
 * business, so the numbers are distinct without count-and-retry and without
 * depending on the transaction's isolation level — which the RLS proxy may
 * drop. The first invoice of a business needs no row to exist beforehand.
 *
 * Taken inside the caller's transaction on purpose: if anything after it
 * fails, the increment rolls back with it and no number is skipped.
 */
export async function nextInvoiceNumber(
    tx: Sequencer,
    organizationId: string,
): Promise<string> {
    const row = await tx.invoiceSequence.upsert({
        where: { organizationId },
        create: { organizationId, lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
        select: { lastNumber: true },
    });
    return formatInvoiceNumber(row.lastNumber);
}

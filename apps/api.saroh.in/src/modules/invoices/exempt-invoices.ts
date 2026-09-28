import type { Prisma } from "@saroh/database";

/**
 * The list's half of D15: which listed papers are a registered business's
 * with every line exempt — the list reads only a paper's first line, so it
 * cannot tell from the row. One read over the page, of the lines that are
 * **not** exempt (a rate above 0, or never set); a registered paper with
 * lines and none of those is exempt. The ids only, never a line.
 */
export async function exemptInvoiceIds(
    db: Pick<Prisma.TransactionClient, "invoiceLine">,
    organizationId: string,
    rows: readonly {
        id: string;
        sellerGstin?: string | null;
        _count?: { lines: number };
    }[],
): Promise<Set<string>> {
    const registered = rows
        .filter((r) => r.sellerGstin && (r._count?.lines ?? 0) > 0)
        .map((r) => r.id);
    if (registered.length === 0) return new Set();
    const taxed = await db.invoiceLine.findMany({
        where: {
            organizationId,
            invoiceId: { in: registered },
            OR: [{ gstRate: null }, { gstRate: { not: 0 } }],
        },
        distinct: ["invoiceId"],
        select: { invoiceId: true },
    });
    const notExempt = new Set(taxed.map((l) => l.invoiceId));
    return new Set(registered.filter((id) => !notExempt.has(id)));
}

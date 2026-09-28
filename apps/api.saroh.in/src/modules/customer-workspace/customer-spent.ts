import type { prisma } from "@saroh/database";
import { Prisma } from "@saroh/database";

import { spentInvoiceRowsSql, spentOrderRowsSql } from "./spent.sql";

type Db = Pick<typeof prisma, "$queryRaw">;

/** One currency's part of Spent, in major units as the database sums it. */
export interface SpentPart {
    currency: string;
    sum: { toString(): string } | null;
}

/**
 * Customer Detail's Spent, one part at a time (C14): what their orders, or
 * their invoices that are not an order's own, came to net of what went back
 * to them. The same rows the Customers list sums (`spent.sql.ts`), so the two
 * never disagree. Each part is read with the source it belongs to, so a
 * failed source still leaves Spent unstated rather than short.
 */
export async function spentPart(
    db: Db,
    organizationId: string,
    contactId: string,
    part: "orders" | "invoices",
): Promise<SpentPart[]> {
    const rows =
        part === "orders"
            ? spentOrderRowsSql(organizationId, [contactId])
            : spentInvoiceRowsSql(organizationId, [contactId]);
    return db.$queryRaw<SpentPart[]>(
        Prisma.sql`SELECT s.currency, SUM(s.amount) AS sum
            FROM (${rows}) s
            GROUP BY s.currency
            ORDER BY s.currency`,
    );
}

import type { prisma } from "@saroh/database";

import { readChequesWaiting } from "../invoices/invoice-summary.service";
import type { HomeChequesWaiting } from "./home-model";

type Db = typeof prisma;

/** Where the line opens: the invoices with a cheque not in the bank. */
export const CHEQUES_WAITING_HREF = "/billing/invoices?view=cheques";

/**
 * Home's "Cheques not in the bank" (DEC-173, invoices U4): how many
 * cheques were received and wait for the bank, and what they add up to
 * per currency, in minor units. Null while none waits, so the line is
 * shown only then. The caller reads it only for `payment:read`
 * (`WeekScope.cheques`, DEC-098); for anyone else it is null.
 *
 * The same read as the Invoices money strip's (`readChequesWaiting`), so
 * Home and the list never disagree. The Home plan (DEC-171) draws it.
 */
export async function readHomeCheques(
    db: Db,
    organizationId: string,
): Promise<HomeChequesWaiting | null> {
    const { count, totals } = await readChequesWaiting(db, organizationId);
    if (count === 0) return null;
    return { count, totals, href: CHEQUES_WAITING_HREF };
}

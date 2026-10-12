import type { Prisma } from "@saroh/database";

import type { PriceTerms } from "./gst-price";
import { businessPriceMode } from "./gst-price";

/**
 * The business's standing for pricing (`gst-price.ts`), read on its own:
 * whether it is GST-registered, and how its prices carry GST. Every place
 * that turns a typed price into an amount to pay without needing the whole
 * tax profile reads it here.
 *
 * "Registered" is the test `loadTaxProfile` makes (`order-invoicing.ts`):
 * the switch, a GSTIN and a state. The two must agree, or a price would be
 * charged with GST the paper then leaves out.
 */
export async function loadPriceTerms(
    db: Pick<Prisma.TransactionClient, "businessProfile">,
    organizationId: string,
): Promise<PriceTerms> {
    const p = await db.businessProfile.findUnique({
        where: { organizationId },
        select: {
            gstRegistered: true,
            gstState: true,
            taxId: true,
            gstPriceMode: true,
        },
    });
    return {
        registered: Boolean(p?.gstRegistered && p.taxId && p.gstState),
        mode: businessPriceMode(p?.gstPriceMode),
    };
}

import type { prisma } from "@saroh/database";

import { missingBusinessDetails } from "../invoices/business-details";
import type { HomeAction } from "./home-model";

type Db = Pick<typeof prisma, "businessProfile" | "invoice">;

export const BUSINESS_DETAILS_CODE = "PAYMENTS_BUSINESS_DETAILS";

/**
 * Invoices going out without the business details (DEC-068). A merchant's
 * own action is refused until they're added; paper written after money has
 * moved — a payment's webhook, a renewal, money taken at the desk — never
 * is, so it goes out without them. Once the business has written any
 * numbered paper and the address (or a registered business's GSTIN) is
 * still missing, Home says so, and the row leads to where it's added.
 *
 * Its words fit a business and a person working for themselves alike
 * (DEC-070): the API sends no kind-specific copy.
 *
 * The caller has checked the viewer can change the business's settings
 * (`org:update`): the row is only worth showing to someone who can act.
 */
export async function businessDetailsGap(
    db: Db,
    organizationId: string,
): Promise<HomeAction | null> {
    const missing = await missingBusinessDetails(db, organizationId);
    if (missing.length === 0) return null;
    const written = await db.invoice.findFirst({
        where: { organizationId, number: { not: null } },
        select: { id: true },
    });
    if (!written) return null;
    const address = missing.includes("address");
    return {
        code: BUSINESS_DETAILS_CODE,
        title: address
            ? "Add the address your invoices print — they go out without it"
            : "Add your GSTIN — invoices go out without it",
        href: `/settings/organization?tab=${address ? "address" : "tax"}`,
        severity: "ATTENTION",
        moduleKey: "PAYMENTS",
        tag: "Missing",
        tone: "bad",
    };
}

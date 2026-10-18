import { prisma } from "@saroh/database";

/**
 * Give a test business its registered address (DEC-068): a merchant's
 * invoice, pay link, subscribe, sale or provider connection is refused
 * without it. Keeps whatever GST standing the spec already set: the state
 * is written only when none is, and the profile is made when missing.
 */
export async function giveBusinessDetails(
    organizationId: string,
): Promise<void> {
    const address = {
        addressLine1: "3 Hill Road",
        city: "Bengaluru",
        postalCode: "560038",
    };
    const current = await prisma.businessProfile.findUnique({
        where: { organizationId },
        select: { gstState: true },
    });
    await prisma.businessProfile.upsert({
        where: { organizationId },
        create: { organizationId, ...address, gstState: "29" },
        update: {
            ...address,
            ...(current?.gstState ? {} : { gstState: "29" }),
        },
    });
}

/**
 * Give a test business all Saroh needs before it charges for a plan (17
 * Oct 2026, `billing/billing-details.ts`): its registered address and
 * state, and a contact email for a spec whose owner is no real user. Its
 * name is the organization's.
 */
export async function giveBillingDetails(
    organizationId: string,
): Promise<void> {
    await giveBusinessDetails(organizationId);
    await prisma.businessProfile.updateMany({
        where: { organizationId, contactEmail: null },
        data: { contactEmail: "billing@example.com" },
    });
}

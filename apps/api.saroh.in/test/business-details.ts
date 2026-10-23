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
 * Oct 2026, `billing/billing-details.ts`): the billing profile it is
 * billed to (DEC-167) with a billing email, address and state — copied
 * from its registered address and state, which are given it too. Its name
 * is the organization's. Answers the profile's id.
 */
export async function giveBillingDetails(
    organizationId: string,
): Promise<string> {
    await giveBusinessDetails(organizationId);
    return giveBillingProfile(organizationId);
}

/**
 * Give a test business the billing profile Saroh bills (DEC-167), when it
 * has none: owned by a user of its own (a spec's owner is often no real
 * user), billed to the business's details. Its customer at the provider is
 * made by the first checkout, as for a profile whose job hasn't run.
 * Answers the profile's id.
 */
export async function giveBillingProfile(
    organizationId: string,
): Promise<string> {
    const org = await prisma.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { name: true, billingProfileId: true },
    });
    if (org.billingProfileId) return org.billingProfileId;
    const business = await prisma.businessProfile.findUnique({
        where: { organizationId },
    });
    const owner = await prisma.user.create({
        data: {
            email: `billing-${organizationId}@example.com`.toLowerCase(),
            name: "Billing Owner",
        },
    });
    const profile = await prisma.billingProfile.create({
        data: {
            ownerUserId: owner.id,
            legalName: business?.legalName || org.name,
            gstState: business?.gstState ?? null,
            addressLine1: business?.addressLine1 ?? null,
            city: business?.city ?? null,
            postalCode: business?.postalCode ?? null,
            billingEmail: (
                business?.contactEmail ?? "billing@example.com"
            ).toLowerCase(),
            provider: "RAZORPAY",
        },
    });
    await prisma.organization.update({
        where: { id: organizationId },
        data: { billingProfileId: profile.id },
    });
    return profile.id;
}

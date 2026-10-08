import { ConflictException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

/**
 * The business details every invoice needs (DEC-068): the registered
 * address, and a GSTIN when the business is GST-registered.
 *
 * **Refuse before money, record after it.** Something a merchant starts
 * that writes an invoice, or opens a way to be paid online — Issue, Send, a
 * pay link, subscribing someone, selling a pack or a course that is still
 * to be paid, connecting a payment provider — is refused with a 409 whose
 * details say what is missing (`{ reason: "BUSINESS_DETAILS_MISSING",
 * missing: ["address", "gstin"] }`), and the app asks for them in place.
 * Paper written because money has already moved — a payment's webhook,
 * a renewal, money taken at the desk — is never refused for this: the
 * payment is recorded, and Home says the details are missing
 * (`home-business-details.ts`).
 */

export const BUSINESS_DETAILS_MISSING = "BUSINESS_DETAILS_MISSING";

export type BusinessDetail = "address" | "gstin";

/** What the check reads of the profile. */
export const BUSINESS_DETAILS_SELECT = {
    addressLine1: true,
    city: true,
    postalCode: true,
    gstState: true,
    country: true,
    gstRegistered: true,
    taxId: true,
} as const;

export type BusinessDetailsColumns = Prisma.BusinessProfileGetPayload<{
    select: typeof BUSINESS_DETAILS_SELECT;
}>;

const filled = (v: string | null | undefined) => !!v?.trim();

/**
 * What is missing, in the order the step asks for it. The address is its
 * first line, city, PIN and state; a business registered outside India has
 * no Indian state, so only an Indian (or unsaid) one needs it. No profile
 * at all is missing the address.
 */
export function missingFrom(
    p: BusinessDetailsColumns | null,
): BusinessDetail[] {
    const country = (p?.country ?? "").trim().toUpperCase();
    const india =
        country === "" ||
        country === "IN" ||
        country === "INDIA" ||
        !!p?.gstRegistered;
    const address =
        !!p &&
        filled(p.addressLine1) &&
        filled(p.city) &&
        filled(p.postalCode) &&
        (!india || filled(p.gstState));
    const missing: BusinessDetail[] = [];
    if (!address) missing.push("address");
    if (p?.gstRegistered && !filled(p.taxId)) missing.push("gstin");
    return missing;
}

/**
 * Whether the address is whole but for its state (UX-018): the first line,
 * city and PIN are in, and an Indian address has no state yet. The refusal
 * then names the state, not "your registered address", which reads as if
 * nothing had been saved.
 */
export function onlyStateMissing(p: BusinessDetailsColumns | null): boolean {
    return (
        !!p &&
        filled(p.addressLine1) &&
        filled(p.city) &&
        filled(p.postalCode) &&
        !filled(p.gstState) &&
        missingFrom(p).includes("address")
    );
}

export async function missingBusinessDetails(
    db: Pick<Prisma.TransactionClient, "businessProfile">,
    organizationId: string,
): Promise<BusinessDetail[]> {
    const p = await db.businessProfile.findUnique({
        where: { organizationId },
        select: BUSINESS_DETAILS_SELECT,
    });
    return missingFrom(p);
}

/** The refusal's words, for a toast where the app has no step to offer. */
export function businessDetailsMessage(
    missing: BusinessDetail[],
    opts: { onlyState?: boolean } = {},
): string {
    const address = missing.includes("address");
    const gstin = missing.includes("gstin");
    if (address && opts.onlyState) {
        return gstin
            ? "Add your state to your address, and your GSTIN, first. Every invoice prints them."
            : "Add your state to your address first. It's printed on every invoice, and GST depends on it.";
    }
    if (address && gstin) {
        return "Add your registered address and GSTIN first. Every invoice prints them.";
    }
    if (gstin) {
        return "Add your GSTIN first. A GST-registered business's invoices print it.";
    }
    return "Add your registered address first. Every invoice prints it.";
}

export function businessDetailsMissing(
    missing: BusinessDetail[],
    opts: { onlyState?: boolean } = {},
): ConflictException {
    return new ConflictException({
        message: businessDetailsMessage(missing, opts),
        details: {
            reason: BUSINESS_DETAILS_MISSING,
            missing,
            // The address wants only its state (UX-018): the app can say so.
            ...(opts.onlyState ? { onlyState: true } : {}),
        },
    });
}

/**
 * Refuse a merchant's action that would write an invoice, or open a way to
 * take money online, while the business details are missing. Never call it
 * on a path money has already moved on.
 */
export async function assertBusinessDetails(
    db: Pick<Prisma.TransactionClient, "businessProfile">,
    organizationId: string,
): Promise<void> {
    const p = await db.businessProfile.findUnique({
        where: { organizationId },
        select: BUSINESS_DETAILS_SELECT,
    });
    const missing = missingFrom(p);
    if (missing.length > 0) {
        throw businessDetailsMissing(missing, {
            onlyState: onlyStateMissing(p),
        });
    }
}

import { BadRequestException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import {
    E164,
    normalisePhoneNumber,
    PHONE_EXAMPLE,
} from "@saroh/block-contract";

/**
 * The business's public phone (DEC-053, F20): the merchant's own number,
 * shown only on that business's site — the Visit us Call button (G8), the
 * booking page's header (E6) and "Or call ‹Business› on ‹phone›" when a
 * sign-in code can't be sent (A2/A9). Saroh's number never appears there.
 *
 * Stored as E.164, "+919845012345": a `+`, the country code and the number,
 * digits only, 8 to 15 of them. What `tel:` wants, and what the column's
 * CHECK constraint holds (`20261012100000_business_public_phone`).
 *
 * The rule itself is `@saroh/block-contract`'s `phone.ts` (#1036), so the
 * workspace's and the site's phone fields say exactly what this refuses
 * (`business-phone.spec.ts` runs the shared cases here).
 */
export { E164, PHONE_EXAMPLE };

/**
 * A typed number as it is stored, or why it can't be: "" clears it (null),
 * "+91 98450-12345" is kept as "+919845012345", and an Indian number typed
 * without the + ("98450 12345") gets +91. Pure; the settings save says the
 * problem on the field.
 */
export const normalisePublicPhone = normalisePhoneNumber;

/** The settings save's write: absent leaves it, "" clears it, else E.164. */
export function phoneWrite(raw: string | undefined): {
    phone?: string | null;
} {
    if (raw === undefined) return {};
    const result = normalisePublicPhone(raw);
    if ("problem" in result) {
        throw new BadRequestException({
            message: result.problem,
            details: { field: "phone" },
        });
    }
    return { phone: result.phone };
}

/**
 * A stored number as the public may see it, or null. Re-checked on the way
 * out rather than trusted, as the public visit read re-checks the week: a
 * value that isn't E.164 would otherwise reach every visitor as a Call
 * button that dials nothing.
 */
export function publicPhone(stored: string | null | undefined): string | null {
    return typeof stored === "string" && E164.test(stored) ? stored : null;
}

/**
 * The one read of a business's public phone, for every public surface. The
 * caller has already resolved the business from the site (never from the
 * request) and runs this inside that organization's RLS context.
 */
export async function businessPublicPhoneOf(
    organizationId: string,
): Promise<string | null> {
    const profile = await prisma.businessProfile.findUnique({
        where: { organizationId },
        select: { phone: true },
    });
    return publicPhone(profile?.phone);
}

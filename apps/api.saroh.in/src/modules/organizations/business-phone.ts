import { BadRequestException } from "@nestjs/common";
import { prisma } from "@saroh/database";

/**
 * The business's public phone (DEC-053, F20): the merchant's own number,
 * shown only on that business's site — the Visit us Call button (G8), the
 * booking page's header (E6) and "Or call ‹Business› on ‹phone›" when a
 * sign-in code can't be sent (A2/A9). Saroh's number never appears there.
 *
 * Stored as E.164, "+919845012345": a `+`, the country code and the number,
 * digits only, 8 to 15 of them. What `tel:` wants, and what the column's
 * CHECK constraint holds (`20261012100000_business_public_phone`).
 */
export const E164 = /^\+[1-9]\d{7,14}$/;

/** What a merchant may type between the digits: spaces, dashes, dots, brackets. */
const SEPARATORS = /[\s\-.()]/g;

export const PHONE_EXAMPLE = "+91 98450 12345";

/**
 * A typed number as it is stored, or why it can't be: "" clears it (null),
 * and "+91 98450-12345" is kept as "+919845012345". Pure; the settings save
 * says the problem on the field.
 */
export function normalisePublicPhone(
    raw: string,
): { phone: string | null } | { problem: string } {
    const trimmed = raw.trim();
    if (trimmed === "") return { phone: null };
    const compact = trimmed.replace(SEPARATORS, "");
    if (!compact.startsWith("+")) {
        return {
            problem: `Start with + and the country code, like ${PHONE_EXAMPLE}.`,
        };
    }
    if (!E164.test(compact)) {
        return {
            problem: `That isn't a number a customer can call. Use + and the country code, like ${PHONE_EXAMPLE}.`,
        };
    }
    // India's numbers are ten digits after +91, mobile and landline alike.
    if (compact.startsWith("+91") && compact.length !== 13) {
        return { problem: "An Indian number is +91 and then 10 digits." };
    }
    return { phone: compact };
}

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

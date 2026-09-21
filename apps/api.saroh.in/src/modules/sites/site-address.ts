import type { Prisma } from "@saroh/database";

/**
 * A business's address on Saroh: the `<address>.saroh.app` its website lives
 * at, reserved when the business is created.
 *
 * Two tables answer "is this address in use", and both have to be asked:
 *
 * - `Organization.slug` — the address a business RESERVED at setup, before it
 *   has any website. Nothing else stops another business's site claiming it
 *   in the meantime, so a reservation that only lived here would be a promise
 *   the product could not keep.
 * - `Site.subdomain` — the address a website is actually served at.
 *
 * One definition of the shape, the reserved words and the check, used by
 * setup (reserving one) and by site creation (taking one), so the two cannot
 * disagree about what counts as free.
 */

/**
 * A single DNS label: 1–63 characters, lowercase letters, digits and hyphens,
 * never starting or ending with a hyphen.
 */
export const ADDRESS_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export const ADDRESS_FORMAT_MESSAGE =
    "Use lowercase letters, numbers and hyphens, not starting or ending with a hyphen";

/**
 * Addresses no business may have: Saroh's own hosts, and words that would
 * read as Saroh speaking (`status.saroh.app`, `support.saroh.app`) on a page
 * a merchant controls.
 */
export const RESERVED_ADDRESSES: ReadonlySet<string> = new Set([
    "www",
    "app",
    "api",
    "admin",
    "accounts",
    "account",
    "auth",
    "login",
    "signup",
    "docs",
    "help",
    "support",
    "status",
    "blog",
    "mail",
    "email",
    "saroh",
    "static",
    "assets",
    "cdn",
    "preview",
    "templates",
    "ui",
    "dashboard",
    "billing",
    "security",
    "legal",
]);

/** Why an address cannot be used, before asking the database — or null. */
export function addressProblem(address: string): string | null {
    if (address.length < 3) {
        return "An address needs at least 3 characters";
    }
    if (!ADDRESS_RE.test(address)) {
        return ADDRESS_FORMAT_MESSAGE;
    }
    if (RESERVED_ADDRESSES.has(address)) {
        return "That address is kept for Saroh";
    }
    return null;
}

type Reader = Pick<Prisma.TransactionClient, "organization" | "site">;

/**
 * Whether an address is in use by someone OTHER than `organizationId`: a
 * business that reserved it, or a website served at it. A business's own
 * reservation is free to itself — that is what reserving it was for.
 */
export async function addressTaken(
    db: Reader,
    address: string,
    organizationId: string | null = null,
): Promise<boolean> {
    const [business, site] = await Promise.all([
        db.organization.findUnique({
            where: { slug: address },
            select: { id: true },
        }),
        db.site.findUnique({
            where: { subdomain: address },
            select: { organizationId: true },
        }),
    ]);
    if (business && business.id !== organizationId) return true;
    if (site && site.organizationId !== organizationId) return true;
    return false;
}

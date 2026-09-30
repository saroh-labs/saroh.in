import type { Prisma } from "@saroh/database";
import {
    currentOrgContext,
    isRlsEnforcementEnabled,
    outsideOrgContext,
    prisma,
} from "@saroh/database";

/**
 * A business's address on Saroh: the `<address>.saroh.app` its website lives
 * at, reserved when the business is created.
 *
 * Three tables answer "is this address in use", and all have to be asked:
 *
 * - `Organization.slug` — the address a business RESERVED at setup, before it
 *   has any website. Nothing else stops another business's site claiming it
 *   in the meantime, so a reservation that only lived here would be a promise
 *   the product could not keep.
 * - `Site.subdomain` — the address a website is actually served at.
 * - `AddressReservation` — an address a business used to have, held for it
 *   until `reservedUntil` after a change (DEC-069). Past that date the row
 *   counts as free, and the next claimer deletes it (`releaseExpired`).
 *
 * One definition of the shape, the reserved words and the check, used by
 * setup (reserving one), site creation (taking one) and a change of address,
 * so they cannot disagree about what counts as free.
 */

/**
 * A single DNS label: 1–63 characters, lowercase letters, digits and hyphens,
 * never starting or ending with a hyphen.
 */
export const ADDRESS_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export const ADDRESS_FORMAT_MESSAGE =
    "Use lowercase letters, numbers and hyphens, not starting or ending with a hyphen";

/**
 * The longest address a business can claim (DEC-071). A DNS label allows 63,
 * but every address must also work as its test host, `test--<address>`, and
 * that prefix takes 6. Addresses claimed before this rule keep their length.
 */
export const MAX_ADDRESS_LENGTH = 57;

/**
 * `--` is kept for Saroh's own hosts (DEC-071): `test--<address>` is a
 * business's test release, and `xn--` starts an internationalised name that
 * a browser shows as a different word. No business can claim an address with
 * one, so every such host is Saroh's to route.
 */
export const DOUBLE_HYPHEN_MESSAGE =
    "An address can't have two hyphens in a row";

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
    // A test release's label on a custom domain is `test.<domain>` (DEC-071);
    // kept here too, so `test.saroh.app` is never a business's either.
    "test",
]);

/** Why an address cannot be used, before asking the database — or null. */
export function addressProblem(address: string): string | null {
    if (address.length < 3) {
        return "An address needs at least 3 characters";
    }
    if (address.length > MAX_ADDRESS_LENGTH) {
        return `An address can have at most ${MAX_ADDRESS_LENGTH} characters`;
    }
    if (!ADDRESS_RE.test(address)) {
        return ADDRESS_FORMAT_MESSAGE;
    }
    if (address.includes("--")) {
        return DOUBLE_HYPHEN_MESSAGE;
    }
    if (RESERVED_ADDRESSES.has(address)) {
        return "That address is kept for Saroh";
    }
    return null;
}

type Reader = Pick<
    Prisma.TransactionClient,
    "organization" | "site" | "addressReservation"
>;

/**
 * Run a read that must see EVERY business's rows. "Is this address free" is
 * cross-business by nature, but it is also asked during one business's
 * request (a site's creation, the Turn on sheet, a change of address). With
 * RLS enforced, `db` there is scoped to that business, and another business's
 * site or reservation would look free. So in that case the read goes to the
 * unscoped client outside the request's context (and so outside its
 * transaction); every other time it uses `db` as given.
 */
function acrossBusinesses<T>(
    db: Reader,
    read: (reader: Reader) => Promise<T>,
): Promise<T> {
    if (isRlsEnforcementEnabled() && currentOrgContext() !== undefined) {
        return outsideOrgContext(() => read(prisma));
    }
    return read(db);
}

/** Who uses an address, read across every business (see {@link addressUse}). */
export interface AddressUse {
    /** The business that reserved it at setup (`Organization.slug`). */
    reservedBy: string | null;
    /** The business whose website is served at it. */
    siteOf: string | null;
    /** The business still holding it after a change, while the hold lasts. */
    heldBy: string | null;
}

/**
 * Every use of `address`, from every business's rows even inside one
 * business's request under RLS. Anything that decides whether an address can
 * be claimed reads it here, never with its own `tx.site`/`tx.organization`
 * lookup: under RLS those see only the caller's business, so another
 * business's site looks free and the claim ends in the unique index's raw
 * error instead of a 409 with a suggestion.
 */
export async function addressUse(
    db: Reader,
    address: string,
): Promise<AddressUse> {
    const [business, site, held] = await acrossBusinesses(db, (r) =>
        Promise.all([
            r.organization.findUnique({
                where: { slug: address },
                select: { id: true },
            }),
            r.site.findUnique({
                where: { subdomain: address },
                select: { organizationId: true },
            }),
            r.addressReservation.findUnique({
                where: { address },
                select: { organizationId: true, reservedUntil: true },
            }),
        ]),
    );
    return {
        reservedBy: business?.id ?? null,
        siteOf: site?.organizationId ?? null,
        heldBy:
            held && held.reservedUntil > new Date()
                ? held.organizationId
                : null,
    };
}

/**
 * Whether an address is in use by someone OTHER than `organizationId`: a
 * business that reserved it at setup, a website served at it, or a business
 * that had it before a change and still holds it. A business's own
 * reservation is free to itself — that is what reserving it was for — and a
 * held address past its `reservedUntil` is free to everyone.
 */
export async function addressTaken(
    db: Reader,
    address: string,
    organizationId: string | null = null,
): Promise<boolean> {
    const use = await addressUse(db, address);
    return [use.reservedBy, use.siteOf, use.heldBy].some(
        (owner) => owner !== null && owner !== organizationId,
    );
}

/**
 * Delete the reservation of `address` if it has run out. The column is
 * unique, so the old holder's row would otherwise stand in the way of the new
 * one ever reserving it again. Claimers call it before they write; a live
 * reservation is never touched. Returns how many rows went (0 or 1).
 */
export async function releaseExpired(
    tx: Reader,
    address: string,
): Promise<number> {
    const { count } = await acrossBusinesses(tx, (r) =>
        r.addressReservation.deleteMany({
            where: { address, reservedUntil: { lte: new Date() } },
        }),
    );
    return count;
}

/** How many numbered variants {@link freeAddress} tries before giving up. */
const VARIANTS = 50;

/**
 * A free address like `wanted` (DEC-069: creation asks for a free address
 * rather than making a site with none): `wanted` itself when it is free,
 * else `wanted-2`, `wanted-3`, … — each checked against the shape, the
 * reserved words, other businesses' reservations and every site, this
 * business's own included (a site's address is unique). Runs of hyphens
 * collapse to one, so a suggestion never has `--`. Null when none of the
 * first {@link VARIANTS} is free.
 */
export async function freeAddress(
    db: Reader,
    wanted: string,
    organizationId: string,
): Promise<string | null> {
    let base = wanted
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-");
    while (base.startsWith("-")) base = base.slice(1);
    while (base.endsWith("-")) base = base.slice(0, -1);
    if (base.length < 3) base = base ? `${base}-site` : "my-site";
    // Room for "-50" within the longest address a business can claim.
    base = base.slice(0, MAX_ADDRESS_LENGTH - 3);
    while (base.endsWith("-")) base = base.slice(0, -1);

    for (let n = 1; n <= VARIANTS; n++) {
        const candidate = n === 1 ? base : `${base}-${n}`;
        if (addressProblem(candidate)) continue;
        const use = await addressUse(db, candidate);
        const taken =
            use.siteOf !== null ||
            [use.reservedBy, use.heldBy].some(
                (owner) => owner !== null && owner !== organizationId,
            );
        if (!taken) return candidate;
    }
    return null;
}

/** What a new website starts with, before the merchant changes anything. */
export interface SiteDefaults {
    /** The business's name, cut to what a site name may hold. */
    siteName: string;
    /**
     * The address the business chose at setup when it is free to them, else
     * a free one like it. Empty only when {@link freeAddress} found none.
     */
    address: string;
}

/**
 * The name and address a new website is offered (DEC-069): what the Turn on
 * sheet's Website step (`…/modules/WEBSITE/setup-defaults`) and `/sites/new`
 * (`GET …/sites/new-defaults`) both prefill, so the two ways of making a
 * site start from the same address, and a merchant normally never meets a
 * refusal for one in use.
 */
export async function siteDefaults(
    db: Reader,
    organizationId: string,
): Promise<SiteDefaults> {
    const org = await db.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { name: true, slug: true },
    });
    return {
        siteName: org.name.slice(0, 120),
        address: (await freeAddress(db, org.slug, organizationId)) ?? "",
    };
}

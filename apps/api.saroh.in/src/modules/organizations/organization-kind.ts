import type { Prisma } from "@saroh/database";

/**
 * What is being set up (DEC-070): a business, just me, or a site for my work.
 *
 * The kind changes Saroh's WORDS and DEFAULTS only — the first-run order, a
 * Turn on sheet's prefill, the starter template. It never decides a
 * feature: no guard, entitlement, module gate or refusal reads it, and
 * every module stays available to every kind (R3).
 *
 * `organization-kind.readers.spec.ts` holds that as a source fact: only the
 * files on its allow-list may call {@link organizationKind} or read
 * `Organization.kind`, and none of them is a guard, a module gate, an
 * entitlement or an `assert*`.
 */

/**
 * BUSINESS: a shop, studio or practice (today's flow). SOLO ("Just me"): a
 * freelancer, consultant or creator. WORK ("A site for my work"): a
 * portfolio, blog or projects. A CHECK constraint holds the same three.
 */
export const ORGANIZATION_KINDS = ["BUSINESS", "SOLO", "WORK"] as const;
export type OrganizationKind = (typeof ORGANIZATION_KINDS)[number];

/** Every business before DEC-070, and one set up by an older app. */
export const DEFAULT_ORGANIZATION_KIND: OrganizationKind = "BUSINESS";

/**
 * A stored kind as the API answers it. The CHECK keeps anything else out,
 * so this is belt and braces: an unknown value reads as a business, which
 * is today's behaviour.
 */
export function kindRead(raw: string | null | undefined): OrganizationKind {
    return (ORGANIZATION_KINDS as readonly string[]).includes(raw ?? "")
        ? (raw as OrganizationKind)
        : DEFAULT_ORGANIZATION_KIND;
}

/**
 * The one way the API reads a business's kind outside the organization's
 * own reads (onboarding, settings, the summary). A business that isn't
 * there reads as BUSINESS: the kind only picks words and defaults, and the
 * caller has its own not-found.
 */
export async function organizationKind(
    db: Pick<Prisma.TransactionClient, "organization">,
    organizationId: string,
): Promise<OrganizationKind> {
    const row = await db.organization.findUnique({
        where: { id: organizationId },
        select: { kind: true },
    });
    return kindRead(row?.kind);
}

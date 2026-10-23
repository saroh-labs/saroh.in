import { Injectable } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { outsideOrgContext, prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { siteRootDomain } from "../sites/site-host-mode";
import { AdminAuditOutcome, AdminAuditService } from "./admin-audit.service";
import { organizationSearch } from "./admin-billing-search";
import { PROVIDER_ID } from "./admin-billing.service";
import { AdminPermission } from "./admin-permissions";
import {
    domainSearchTerms,
    domainSearchWhere,
} from "./organization-domain-search";
import type { StaffScope } from "./staff-scope";
import { maySeeOrganization, scopeForStaff } from "./staff-scope";

/**
 * The console's header search (admin console redesign U10, R15): one box
 * that finds a business, a user, or the business behind a Razorpay id.
 * CROSS-TENANT READ, so every part is gated by the permission of the screen
 * it leads to, and the businesses go through `scopeForStaff`:
 *
 * - a business by id, name, setup address or web address: `organization:read`
 *   (all), or `accounts:read` scoped to the businesses this person looks
 *   after (an Account manager);
 * - a user by id, name or email: `organization:pii:read`, since a name and
 *   an email are personal data. An email finds nothing without it, and says
 *   so;
 * - a Razorpay id (`sub_`, `cust_`, `pay_`, `order_`, …): `saroh-billing:read`,
 *   since it reads Saroh's billing, which Support never sees.
 *
 * It returns ids and names only; the console builds the links.
 */

export const SEARCH_MIN_LENGTH = 2;
/** The most rows of one kind a search answers with. */
export const SEARCH_LIMIT = 5;

export type ConsoleSearchResult =
    | {
          kind: "business";
          id: string;
          name: string;
          slug: string;
      }
    | {
          kind: "user";
          id: string;
          name: string | null;
          email: string;
      }
    | {
          kind: "subscription";
          /** The subscription's own id, for the Billing sheet. */
          id: string;
          organizationId: string;
          organizationName: string;
      };

/** Why a search found nothing it could have, in the console's words. */
export type SearchNote = "email-needs-pii" | "provider-id-needs-billing";

export interface ConsoleSearch {
    results: ConsoleSearchResult[];
    note: SearchNote | null;
}

type Staff = Pick<
    PlatformAdminInfo,
    "userId" | "platformAdminId" | "roles" | "permissions" | "viaBootstrap"
>;

@Injectable()
export class AdminSearchService {
    constructor(private readonly audit: AdminAuditService) {}

    async search(
        staff: Staff,
        raw: string | undefined,
    ): Promise<ConsoleSearch> {
        const q = (raw ?? "").trim();
        if (q.length < SEARCH_MIN_LENGTH) return { results: [], note: null };

        const may = (permission: AdminPermission) =>
            staff.permissions.includes(permission);
        const scope = businessScope(staff);

        const found = await outsideOrgContext(async () => {
            if (PROVIDER_ID.test(q)) {
                if (!may(AdminPermission.SarohBillingRead)) {
                    return {
                        results: [],
                        note: "provider-id-needs-billing" as const,
                    };
                }
                return {
                    results: await this.byProviderId(q, scope),
                    note: null,
                };
            }
            if (q.includes("@")) {
                if (!may(AdminPermission.OrganizationPiiRead)) {
                    return { results: [], note: "email-needs-pii" as const };
                }
                return {
                    results: await this.users({
                        email: { contains: q, mode: "insensitive" },
                    }),
                    note: null,
                };
            }
            const [businesses, users] = await Promise.all([
                scope ? this.businesses(q, scope) : Promise.resolve([]),
                may(AdminPermission.OrganizationPiiRead)
                    ? this.users({
                          OR: [
                              { id: q },
                              { name: { contains: q, mode: "insensitive" } },
                          ],
                      })
                    : Promise.resolve([]),
            ]);
            return { results: [...businesses, ...users], note: null };
        });

        // A user row is a person's name and email: on the ledger, like the
        // Users list. Never the term itself, which may be an email.
        const people = found.results.filter((r) => r.kind === "user").length;
        if (people > 0) {
            await this.audit.recordRead({
                actorUserId: staff.userId,
                permission: AdminPermission.OrganizationPiiRead,
                action: "console.search",
                targetType: "user",
                outcome: AdminAuditOutcome.Success,
                metadata: {
                    resultCount: found.results.length,
                    people,
                },
            });
        }
        return found;
    }

    private async businesses(
        q: string,
        scope: StaffScope,
    ): Promise<ConsoleSearchResult[]> {
        const rows = await prisma.organization.findMany({
            where: {
                OR: [
                    { id: q },
                    { name: { contains: q, mode: "insensitive" } },
                    { slug: { contains: q, mode: "insensitive" } },
                    ...domainSearchWhere(
                        domainSearchTerms(q, siteRootDomain()),
                    ),
                ],
            },
            orderBy: [{ name: "asc" }, { id: "asc" }],
            take: SEARCH_LIMIT,
            select: { id: true, name: true, slug: true },
        });
        return (await visible(rows, scope)).map((row) => ({
            kind: "business" as const,
            ...row,
        }));
    }

    private async users(
        where: Prisma.UserWhereInput,
    ): Promise<ConsoleSearchResult[]> {
        const rows = await prisma.user.findMany({
            where,
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
            take: SEARCH_LIMIT,
            select: { id: true, name: true, email: true },
        });
        return rows.map((row) => ({
            kind: "user" as const,
            id: row.id,
            name: row.name?.trim() ? row.name : null,
            email: row.email,
        }));
    }

    /**
     * The businesses a Razorpay id names (its subscription, a checkout, its
     * billing profile or an invoice: `organizationSearch`), each as its
     * subscription where it has one, and as the business when this person
     * may open businesses.
     */
    private async byProviderId(
        q: string,
        scope: StaffScope | null,
    ): Promise<ConsoleSearchResult[]> {
        const rows = await prisma.organization.findMany({
            where: organizationSearch(q),
            orderBy: [{ name: "asc" }, { id: "asc" }],
            take: SEARCH_LIMIT,
            select: {
                id: true,
                name: true,
                slug: true,
                subscription: { select: { id: true } },
            },
        });
        const subscriptions: ConsoleSearchResult[] = rows.flatMap((row) =>
            row.subscription
                ? [
                      {
                          kind: "subscription" as const,
                          id: row.subscription.id,
                          organizationId: row.id,
                          organizationName: row.name,
                      },
                  ]
                : [],
        );
        const businesses = scope
            ? (
                  await visible(
                      rows.map(({ id, name, slug }) => ({ id, name, slug })),
                      scope,
                  )
              ).map((row) => ({ kind: "business" as const, ...row }))
            : [];
        return [...subscriptions, ...businesses];
    }
}

/**
 * Which businesses this person may find: every one with `organization:read`,
 * their own with `accounts:read` alone (an Account manager), none otherwise.
 */
function businessScope(staff: Staff): StaffScope | null {
    if (staff.permissions.includes(AdminPermission.OrganizationRead)) {
        return scopeForStaff(staff, AdminPermission.OrganizationRead);
    }
    if (staff.permissions.includes(AdminPermission.AccountsRead)) {
        return scopeForStaff(staff, AdminPermission.AccountsRead);
    }
    return null;
}

async function visible<T extends { id: string }>(
    rows: T[],
    scope: StaffScope,
): Promise<T[]> {
    const seen = await Promise.all(
        rows.map((row) => maySeeOrganization(scope, row.id)),
    );
    return rows.filter((_, i) => seen[i]);
}

/**
 * The console's header search (admin console redesign U10, R15) against a
 * real Postgres:
 *
 * - a Razorpay `sub_…` id finds its subscription and its business, for
 *   Billing; Support, who never sees Saroh's billing, is told why not;
 * - an email finds its user only with personal-data access, and says so
 *   without it;
 * - a name finds the business for anyone who may open businesses, and the
 *   user only with personal-data access;
 * - nothing found is an empty answer, not an error;
 * - an Account manager finds only the businesses they look after (none,
 *   until the account-manager link lands);
 * - a search that shows people is on the ledger, without the term.
 *
 * The route itself (identity only) is pinned in
 * `admin.controller.permissions.spec.ts`. Integration project
 * (TEST_DATABASE_URL), plain and `TEST_RLS=on`.
 */
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { AdminAuditService } from "./admin-audit.service";
import type { AdminRole } from "./admin-permissions";
import { AdminRole as Roles, permissionsFor } from "./admin-permissions";
import { AdminSearchService } from "./admin-search.service";

const tag = `${process.pid}-${Date.now()}`;
const service = new AdminSearchService(new AdminAuditService());

const ids = {
    staff: "",
    business: "",
    subscription: "",
    person: "",
};
const subscriptionRef = `sub_srch${tag.replace(/\D/g, "").slice(-10)}`;
const email = `asha.search-${tag}@example.com`;
const businessName = `Kavi Dental Search ${tag}`;

const as = (roles: AdminRole[]): PlatformAdminInfo => ({
    userId: ids.staff,
    platformAdminId: "pa_search_actor",
    roles,
    permissions: permissionsFor(roles),
    viaBootstrap: false,
});

beforeAll(async () => {
    ids.staff = (
        await prisma.user.create({
            data: { email: `staff-${tag}@example.com`, name: "Staff" },
        })
    ).id;
    ids.person = (
        await prisma.user.create({
            data: { email, name: `Asha Searchable ${tag}` },
        })
    ).id;
    ids.business = (
        await prisma.organization.create({
            data: { name: businessName, slug: `kavi-search-${tag}` },
        })
    ).id;
    const plan = await prisma.plan.create({
        data: {
            key: `search.${tag}`,
            version: 1,
            name: "Plan",
            priceCents: 0,
            interval: "month",
            entitlements: {},
        },
    });
    ids.subscription = (
        await prisma.subscription.create({
            data: {
                organizationId: ids.business,
                planId: plan.id,
                status: "ACTIVE",
                providerSubscriptionId: subscriptionRef,
            },
        })
    ).id;
});

async function searchRows() {
    return prisma.adminAuditEvent.findMany({
        where: { action: "console.search", actorUserId: ids.staff },
        orderBy: { createdAt: "asc" },
    });
}

describe("console search (DB, U10)", () => {
    it("finds a subscription and its business by sub_… for Billing", async () => {
        const found = await service.search(
            as([Roles.Billing]),
            subscriptionRef,
        );

        expect(found.note).toBeNull();
        expect(found.results).toEqual([
            {
                kind: "subscription",
                id: ids.subscription,
                organizationId: ids.business,
                organizationName: businessName,
            },
            {
                kind: "business",
                id: ids.business,
                name: businessName,
                slug: `kavi-search-${tag}`,
            },
        ]);
    });

    it("tells Support a Razorpay id needs billing access, and finds nothing", async () => {
        const found = await service.search(
            as([Roles.Support]),
            subscriptionRef,
        );

        expect(found).toEqual({
            results: [],
            note: "provider-id-needs-billing",
        });
    });

    it("finds a user by email only with personal-data access", async () => {
        const support = await service.search(as([Roles.Support]), email);
        expect(support.results).toEqual([
            {
                kind: "user",
                id: ids.person,
                name: `Asha Searchable ${tag}`,
                email,
            },
        ]);

        const release = await service.search(as([Roles.ReleaseManager]), email);
        expect(release).toEqual({ results: [], note: "email-needs-pii" });
    });

    it("finds a business by name for anyone who opens businesses, its people only with personal data", async () => {
        const release = await service.search(
            as([Roles.ReleaseManager]),
            businessName.toLowerCase(),
        );
        expect(release.results.map((r) => [r.kind, r.id])).toEqual([
            ["business", ids.business],
        ]);

        const byName = await service.search(
            as([Roles.ReleaseManager]),
            `Asha Searchable ${tag}`,
        );
        expect(byName.results).toEqual([]);

        const support = await service.search(
            as([Roles.Support]),
            `Asha Searchable ${tag}`,
        );
        expect(support.results.map((r) => [r.kind, r.id])).toEqual([
            ["user", ids.person],
        ]);
    });

    it("finds a business by its id", async () => {
        const found = await service.search(as([Roles.Auditor]), ids.business);
        expect(found.results.map((r) => r.id)).toEqual([ids.business]);
    });

    it("answers nothing found with an empty list, and nothing under two characters", async () => {
        expect(
            await service.search(as([Roles.PlatformOwner]), `zz-none-${tag}`),
        ).toEqual({ results: [], note: null });
        expect(await service.search(as([Roles.PlatformOwner]), "k")).toEqual({
            results: [],
            note: null,
        });
        expect(
            await service.search(as([Roles.PlatformOwner]), undefined),
        ).toEqual({ results: [], note: null });
    });

    it("shows an Account manager only the businesses they look after", async () => {
        // Until the account-manager link lands (U19/U25), that is none.
        const found = await service.search(
            as([Roles.AccountManager]),
            businessName,
        );
        expect(found).toEqual({ results: [], note: null });
    });

    it("puts a search that shows people on the ledger, never the term", async () => {
        const before = (await searchRows()).length;

        await service.search(as([Roles.ReleaseManager]), businessName);
        expect((await searchRows()).length).toBe(before);

        await service.search(as([Roles.Support]), email);
        const rows = await searchRows();
        expect(rows.length).toBe(before + 1);
        const row = rows.at(-1);
        expect(row).toMatchObject({
            permission: "organization:pii:read",
            targetType: "user",
            outcome: "SUCCESS",
        });
        expect(JSON.stringify(row?.metadata)).not.toContain(email);
    });
});

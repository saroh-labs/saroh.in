/**
 * Each console shows its own edition's businesses (DEC-204 item 6) against a
 * real Postgres: the directory, Home's counts, the header search and the Users
 * list stay on one edition; a job of no business shows on both; an address of
 * no edition (local) sees everything. A person stays reachable, with a count of
 * what they have elsewhere. Integration project (TEST_DATABASE_URL), plain and
 * `TEST_RLS=on`. The setup empties every table after each file.
 */
import { prisma } from "@saroh/database";

import type { CatalogueAccessService } from "../billing/catalogue-access.service";
import type { OrganizationMembersService } from "../organizations/organization-members.service";
import type { AdminAuditService } from "./admin-audit.service";
import { AdminHomeService } from "./admin-home.service";
import { AdminOrganizationsService } from "./admin-organizations.service";
import { AdminPeopleService } from "./admin-people.service";
import { AdminRole, permissionsFor } from "./admin-permissions";
import { AdminSearchService } from "./admin-search.service";

const tag = `${process.pid}-${Date.now()}`;
const now = new Date();

const audit = {
    recordRead: jest.fn(),
    write: jest.fn(),
} as unknown as AdminAuditService;
const access = {
    resolve: jest.fn(async () => ({ source: "legacy" })),
} as unknown as CatalogueAccessService;

const organizations = new AdminOrganizationsService(access);
const home = new AdminHomeService();
const search = new AdminSearchService(audit);
const people = new AdminPeopleService({} as OrganizationMembersService, audit);

const owner = {
    userId: "staff_edition_spec",
    platformAdminId: null,
    roles: [AdminRole.PlatformOwner],
    permissions: permissionsFor([AdminRole.PlatformOwner]),
    viaBootstrap: true,
    edition: null,
};

let indiaId = "";
let globalId = "";
let bothId = "";
let indiaOnlyId = "";
let noBusinessId = "";

beforeAll(async () => {
    const india = await prisma.organization.create({
        data: { name: `India ${tag}`, slug: `edition-in-${tag}` },
    });
    const global = await prisma.organization.create({
        data: {
            name: `Global ${tag}`,
            slug: `edition-gl-${tag}`,
            edition: "GLOBAL",
        },
    });
    indiaId = india.id;
    globalId = global.id;

    const both = await prisma.user.create({
        data: {
            name: `Both ${tag}`,
            email: `both-${tag}@example.com`,
            emailVerified: true,
        },
    });
    const indiaOnly = await prisma.user.create({
        data: {
            name: `India ${tag}`,
            email: `india-${tag}@example.com`,
            emailVerified: true,
        },
    });
    const noBusiness = await prisma.user.create({
        data: {
            name: `None ${tag}`,
            email: `none-${tag}@example.com`,
            emailVerified: true,
        },
    });
    bothId = both.id;
    indiaOnlyId = indiaOnly.id;
    noBusinessId = noBusiness.id;
    await prisma.membership.createMany({
        data: [
            { organizationId: india.id, userId: both.id, role: "OWNER" },
            { organizationId: global.id, userId: both.id, role: "MEMBER" },
            { organizationId: india.id, userId: indiaOnly.id, role: "OWNER" },
        ],
    });

    await prisma.job.createMany({
        data: [
            {
                organizationId: india.id,
                type: "edition.spec",
                payload: {},
                status: "FAILED",
                processedAt: now,
            },
            // The machinery's own: it belongs to neither edition.
            {
                type: "edition.spec",
                payload: {},
                status: "FAILED",
                processedAt: now,
            },
        ],
    });
    await prisma.contactMessage.createMany({
        data: [
            {
                topic: "help",
                name: "India",
                email: `in-${tag}@example.com`,
                message: "From saroh.in",
            },
            {
                topic: "help",
                name: "Global",
                email: `gl-${tag}@example.com`,
                message: "From saroh.tech",
                edition: "GLOBAL",
            },
        ],
    });
    await prisma.billingAction.create({
        data: {
            organizationId: india.id,
            code: "billing_double_charge_refund_given_up",
            refs: {},
            note: "India's.",
        },
    });
});

describe("Each console shows its own edition (DB, DEC-204)", () => {
    it("lists only the edition's businesses in the directory and the picker", async () => {
        const caller = { canReadPii: true };
        const onGlobal = await organizations.directory({}, caller, "GLOBAL");
        expect(onGlobal.items.map((row) => row.id)).toEqual([globalId]);
        const onIndia = await organizations.directory({}, caller, "INDIA");
        expect(onIndia.items.map((row) => row.id)).toEqual([indiaId]);

        const picker = await organizations.picker("GLOBAL");
        expect(picker.map((row) => row.id)).toEqual([globalId]);

        const local = await organizations.directory({}, caller, null);
        expect(local.items.map((row) => row.id).sort()).toEqual(
            [indiaId, globalId].sort(),
        );
    });

    it("counts Home by edition, with a job of no business on both", async () => {
        const onGlobal = await home.home(owner, "GLOBAL", now);
        const onIndia = await home.home(owner, "INDIA", now);

        expect(onGlobal.counts.businesses).toBe(1);
        expect(onIndia.counts.businesses).toBe(1);
        expect(onGlobal.counts.jobsFailedToday).toBe(1);
        expect(onIndia.counts.jobsFailedToday).toBe(2);

        const count = (
            page: typeof onGlobal,
            kind: (typeof onGlobal.needs)[number]["kind"],
        ) => page.needs.find((item) => item.kind === kind)?.count ?? 0;
        expect(count(onGlobal, "help")).toBe(1);
        expect(count(onIndia, "help")).toBe(1);
        expect(count(onGlobal, "billing")).toBe(0);
        expect(count(onIndia, "billing")).toBe(1);
        expect(count(onGlobal, "jobs")).toBe(1);
        expect(count(onIndia, "jobs")).toBe(2);
    });

    it("finds only this edition's business and people in the search", async () => {
        const onGlobal = await search.search(owner, tag, "GLOBAL");
        const ids = onGlobal.results.map((row) => row.id);

        expect(ids).toContain(globalId);
        expect(ids).not.toContain(indiaId);
        // Their business is on the other edition.
        expect(ids).not.toContain(indiaOnlyId);
        // A business on this one, and one on the other.
        expect(ids).toContain(bothId);
        // No business yet: could still set one up on either.
        expect(ids).toContain(noBusinessId);
    });

    it("lists people on their edition, counting only its businesses", async () => {
        const list = await people.search({ q: tag }, "GLOBAL");
        const byId = new Map(list.items.map((row) => [row.id, row]));

        expect(byId.has(indiaOnlyId)).toBe(false);
        expect(byId.has(noBusinessId)).toBe(true);
        // Owner on India, member here: one business, and no owner here.
        expect(byId.get(bothId)).toMatchObject({
            businesses: 1,
            isOwner: false,
        });
    });

    it("keeps a person reachable, showing a count of the other edition", async () => {
        const onGlobal = await people.detail(bothId, "GLOBAL");
        expect(onGlobal.memberships.map((row) => row.organizationId)).toEqual([
            globalId,
        ]);
        expect(onGlobal.otherEditionBusinesses).toBe(1);

        // Reachable though nothing of theirs is on this edition.
        const elsewhere = await people.detail(indiaOnlyId, "GLOBAL");
        expect(elsewhere.memberships).toEqual([]);
        expect(elsewhere.otherEditionBusinesses).toBe(1);

        const local = await people.detail(bothId, null);
        expect(local.memberships).toHaveLength(2);
        expect(local.otherEditionBusinesses).toBe(0);
    });
});

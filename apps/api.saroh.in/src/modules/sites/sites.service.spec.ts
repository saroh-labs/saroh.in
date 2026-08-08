// DB-free unit tests: the database package is mocked so nothing touches a real
// Postgres. The `$transaction` mock invokes its callback with the same mocked
// client, so every write is asserted to happen inside the one transaction.
//
// @saroh/templates is deliberately NOT mocked — the test runs the REAL
// `instantiateTemplate` against the REAL starter template, so it proves that a
// shipped template yields a valid, persistable Site (right pages/sections).
jest.mock("@saroh/database", () => {
    // Keep the REAL module (its `parseSectionContent` is what the un-mocked
    // @saroh/templates instantiate calls, plus the Prisma namespace used for the
    // JSON cast) and override ONLY `prisma` with an in-memory mock. Constructing
    // the real PrismaClient is lazy, so no DB connection is opened.
    const actual = jest.requireActual("@saroh/database");
    const client = {
        organization: {
            findUnique: jest.fn(),
        },
        site: {
            findFirst: jest.fn(),
            findUnique: jest.fn(),
            findMany: jest.fn(),
            count: jest.fn(),
            create: jest.fn(),
        },
        page: {
            create: jest.fn(),
        },
    };
    return {
        ...actual,
        prisma: {
            ...client,
            $transaction: jest.fn((cb: (tx: typeof client) => unknown) =>
                cb(client),
            ),
        },
    };
});

import { ConflictException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";
import { STARTER_TEMPLATE_ID } from "@saroh/templates";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { EntitlementService } from "../billing/entitlement.service";
import type { CreateSiteFromTemplateDto } from "./dto";
import { SitesService } from "./sites.service";

const orgFindUnique = prisma.organization.findUnique as jest.Mock;
const siteFindFirst = prisma.site.findFirst as jest.Mock;
const siteFindUnique = prisma.site.findUnique as jest.Mock;
const siteCount = prisma.site.count as jest.Mock;
const siteCreate = prisma.site.create as jest.Mock;
const pageCreate = prisma.page.create as jest.Mock;
const transaction = prisma.$transaction as jest.Mock;

/** A permissive EntitlementService fake — `check` allows unless overridden. */
const entCheck = jest.fn().mockResolvedValue(true);
const entitlements = {
    check: entCheck,
    can: jest.fn().mockResolvedValue(true),
    getEntitlements: jest.fn(),
} as unknown as EntitlementService;

function ctx(over: Partial<OrganizationContext> = {}): OrganizationContext {
    return {
        organizationId: "org_1",
        userId: "user_1",
        role: "OWNER",
        ...over,
    };
}

describe("SitesService.createFromTemplate", () => {
    const service = new SitesService(entitlements);

    beforeEach(() => {
        jest.clearAllMocks();
        // Happy-path stubs; individual tests override as needed.
        orgFindUnique.mockResolvedValue({
            name: "Acme",
            businessProfile: null,
        });
        siteFindFirst.mockResolvedValue(null);
        siteFindUnique.mockResolvedValue(null);
        siteCount.mockResolvedValue(0);
        entCheck.mockResolvedValue(true);
        siteCreate.mockResolvedValue({ id: "site_1", slug: "acme" });
        pageCreate.mockResolvedValue({ id: "page_x" });
    });

    it("enforces the plan's `sites` entitlement before creating (403 when at the limit, no write)", async () => {
        // Simulate the EntitlementService rejecting at the plan cap.
        const { ForbiddenException } =
            jest.requireActual<typeof import("@nestjs/common")>(
                "@nestjs/common",
            );
        siteCount.mockResolvedValue(1);
        entCheck.mockRejectedValueOnce(
            new ForbiddenException("Plan limit reached"),
        );

        await expect(
            service.createFromTemplate(ctx(), { name: "Acme" }),
        ).rejects.toThrow(/Plan limit reached/);

        // The cap is checked with the current site count and blocks the write.
        expect(entCheck).toHaveBeenCalledWith("org_1", "sites", 1);
        expect(transaction).not.toHaveBeenCalled();
        expect(siteCreate).not.toHaveBeenCalled();
    });

    it("creates a Site + Pages + DRAFT PageVersions + Sections in one org-scoped transaction from the real starter template", async () => {
        const dto: CreateSiteFromTemplateDto = { name: "Acme" };

        const result = await service.createFromTemplate(ctx(), dto);

        expect(result).toEqual({ siteId: "site_1", slug: "acme" });

        // Everything runs inside exactly one transaction.
        expect(transaction).toHaveBeenCalledTimes(1);

        // The Site row is scoped to the ctx org, with the name-derived slug.
        expect(siteCreate).toHaveBeenCalledWith({
            data: {
                organizationId: "org_1",
                name: "Acme",
                slug: "acme",
                subdomain: undefined,
            },
            select: { id: true, slug: true },
        });

        // The real starter template lays down exactly two pages (Home + About).
        expect(pageCreate).toHaveBeenCalledTimes(2);

        const pagesByPath = new Map<string, Record<string, unknown>>(
            pageCreate.mock.calls.map(([arg]) => [
                (arg.data as { path: string }).path,
                arg.data as Record<string, unknown>,
            ]),
        );

        const home = pagesByPath.get("/") as {
            organizationId: string;
            isHome: boolean;
            siteId: string;
            versions: {
                create: {
                    organizationId: string;
                    status: string;
                    createdByUserId: string;
                    sections: {
                        create: {
                            organizationId: string;
                            type: string;
                            contractVersion: number;
                            order: number;
                            content: unknown;
                        }[];
                    };
                };
            };
        };
        const about = pagesByPath.get("/about") as typeof home;

        // Home is the home page and hangs off the created Site.
        expect(home.siteId).toBe("site_1");
        expect(home.organizationId).toBe("org_1");
        expect(home.isHome).toBe(true);
        expect(about.isHome).toBe(false);

        // Each page gets exactly one DRAFT version authored by the ctx user, and
        // every version + section carries the denormalized ctx org id.
        for (const page of [home, about]) {
            const version = page.versions.create;
            expect(version.status).toBe("DRAFT");
            expect(version.organizationId).toBe("org_1");
            expect(version.createdByUserId).toBe("user_1");
            for (const section of version.sections.create) {
                expect(section.organizationId).toBe("org_1");
            }
        }

        // The real starter template's section shape flows through: Home has 4
        // ordered sections starting with a validated hero.
        const homeSections = home.versions.create.sections.create;
        expect(homeSections).toHaveLength(4);
        expect(homeSections.map((s) => s.order)).toEqual([0, 1, 2, 3]);
        expect(homeSections[0].type).toBe("hero");
        // Content is the CONTRACT-NORMALIZED output seeded with the org name.
        expect(homeSections[0].content).toMatchObject({ heading: "Acme" });
        expect(about.versions.create.sections.create).toHaveLength(2);
    });

    it("seeds the TemplateContext from the org's business profile", async () => {
        orgFindUnique.mockResolvedValue({
            name: "Acme",
            businessProfile: {
                legalName: "Acme Incorporated",
                contactEmail: "hello@acme.test",
                website: "https://acme.test",
            },
        });

        await service.createFromTemplate(ctx(), { name: "Acme" });

        const about = pageCreate.mock.calls
            .map(([arg]) => arg.data)
            .find((d: { path: string }) => d.path === "/about") as {
            versions: {
                create: { sections: { create: { content: unknown }[] } };
            };
        };
        // The About story section weaves in the legal name from the profile.
        const story = about.versions.create.sections.create[1].content as {
            value: string;
        };
        expect(story.value).toContain("Acme Incorporated");
    });

    it("throws ConflictException on a slug already used in the org", async () => {
        siteFindFirst.mockResolvedValue({ id: "existing_site" });

        await expect(
            service.createFromTemplate(ctx(), { name: "Acme" }),
        ).rejects.toBeInstanceOf(ConflictException);

        expect(siteCreate).not.toHaveBeenCalled();
    });

    it("uses the explicit templateId default of the starter template", async () => {
        await service.createFromTemplate(ctx(), {
            name: "Acme",
            templateId: STARTER_TEMPLATE_ID,
        });
        expect(siteCreate).toHaveBeenCalledTimes(1);
    });

    it("throws NotFoundException for an unknown templateId", async () => {
        await expect(
            service.createFromTemplate(ctx(), {
                name: "Acme",
                templateId: "does-not-exist",
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(transaction).not.toHaveBeenCalled();
    });

    it("denies site:create to a MEMBER (read-only role)", async () => {
        await expect(
            service.createFromTemplate(ctx({ role: "MEMBER" }), {
                name: "Acme",
            }),
        ).rejects.toThrow(/MEMBER.*site:create/);

        // Denied before any DB work.
        expect(orgFindUnique).not.toHaveBeenCalled();
        expect(transaction).not.toHaveBeenCalled();
    });
});

describe("SitesService.getSite", () => {
    const service = new SitesService(entitlements);

    beforeEach(() => jest.clearAllMocks());

    it("returns 404 for a site in another org (cross-tenant read)", async () => {
        siteFindFirst.mockResolvedValue(null);

        await expect(
            service.getSite(ctx(), "site_from_other_org"),
        ).rejects.toBeInstanceOf(NotFoundException);

        // The lookup is constrained to the ctx org, so another org's site is
        // simply "not found".
        expect(siteFindFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    id: "site_from_other_org",
                    organizationId: "org_1",
                    deletedAt: null,
                }),
            }),
        );
    });
});

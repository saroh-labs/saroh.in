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
            findUniqueOrThrow: jest.fn(),
        },
        site: {
            findFirst: jest.fn(),
            findUnique: jest.fn(),
            findMany: jest.fn(),
            count: jest.fn(),
            create: jest.fn(),
            // The template's menu (UX-070; a template's other pages when it
            // names none), written after the pages.
            update: jest.fn(async () => ({ id: "site_1" })),
        },
        page: {
            create: jest.fn(async () => ({ id: "page_1" })),
        },
        // Addresses held after a change (DEC-069, L1): none here.
        addressReservation: {
            findUnique: jest.fn(async () => null),
            deleteMany: jest.fn(async () => ({ count: 0 })),
        },
        // Where a new site sells from (G11): no storefront by default.
        store: {
            findMany: jest.fn(async () => []),
            findFirst: jest.fn(async () => null),
        },
        // What the template context reads (K15): no module on, no service.
        organizationModule: { findMany: jest.fn(async () => []) },
        service: { findMany: jest.fn(async () => []) },
        // A template's enquiry sections get their Form (K15): the starter
        // has none.
        form: { create: jest.fn() },
        // The logo that stands in for a site's icon (DEC-121): none here.
        businessProfile: { findUnique: jest.fn(async () => null) },
        // The shop's rollout flag, never configured here: off.
        featureFlagOverride: { findUnique: jest.fn(async () => null) },
        featureFlag: { findUnique: jest.fn(async () => null) },
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
import { planMeter } from "../billing/metering.service";
import { MAX_WEBSITES_PER_BUSINESS } from "../organizations/business-limits";
import type { CreateSiteFromTemplateDto } from "./dto";
import { SitesService } from "./sites.service";

const orgFindUnique = prisma.organization.findUnique as jest.Mock;
const orgFindUniqueOrThrow = prisma.organization.findUniqueOrThrow as jest.Mock;

/**
 * The organizations the mock knows: this business by id (its name, profile
 * and setup address), and by address only the `others` — businesses that
 * reserved an address at setup.
 */
function orgs({
    name = "Acme",
    slug = "acme",
    businessProfile = null as unknown,
    others = {} as Record<string, string>,
} = {}) {
    orgFindUnique.mockImplementation(
        async ({ where }: { where: { id?: string; slug?: string } }) => {
            if (where.slug !== undefined) {
                if (where.slug === slug) return { id: "org_1" };
                const other = others[where.slug];
                return other ? { id: other } : null;
            }
            return { name, slug, businessProfile };
        },
    );
    orgFindUniqueOrThrow.mockResolvedValue({ name, slug });
}
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
        orgs();
        siteFindFirst.mockResolvedValue(null);
        siteFindUnique.mockResolvedValue(null);
        siteCount.mockResolvedValue(0);
        entCheck.mockResolvedValue(true);
        siteCreate.mockResolvedValue({ id: "site_1", slug: "acme" });
        pageCreate.mockResolvedValue({ id: "page_x" });
    });

    it("refuses a second website before the plan is asked (ADR-006, 409, no write)", async () => {
        siteCount.mockResolvedValue(1);

        await expect(
            service.createFromTemplate(ctx(), { name: "Acme" }),
        ).rejects.toMatchObject({
            status: 409,
            response: {
                message: expect.stringMatching(/already has its website/),
            },
        });

        // A paid plan that allows more changes nothing: the product cap is
        // checked first, so the merchant is never told to upgrade.
        expect(entCheck).not.toHaveBeenCalled();
        expect(transaction).not.toHaveBeenCalled();
        expect(siteCount).toHaveBeenCalledWith({
            where: { organizationId: "org_1", deletedAt: null },
        });
    });

    describe("where the catalogue governs websites (its `sites` row, U13)", () => {
        let enforcedRow: jest.SpyInstance;
        let roomInTx: jest.SpyInstance;
        beforeEach(() => {
            enforcedRow = jest
                .spyOn(planMeter, "enforcedRow")
                .mockResolvedValue({ moduleId: "sites" } as never);
            roomInTx = jest
                .spyOn(planMeter, "roomInTx")
                .mockResolvedValue(null);
        });
        afterEach(() => {
            enforcedRow.mockRestore();
            roomInTx.mockRestore();
        });

        it("lets a second website be made, metered on the write's transaction", async () => {
            siteCount.mockResolvedValue(1);
            await expect(
                service.createFromTemplate(ctx(), { name: "Acme" }),
            ).resolves.toHaveProperty("siteId", "site_1");
            // The old one-website floor and entitlement aren't asked.
            expect(entCheck).not.toHaveBeenCalled();
            expect(roomInTx).toHaveBeenCalledWith(
                expect.anything(),
                "org_1",
                "sites",
            );
        });

        it("stops at the product's ceiling first, whatever the plan sells", async () => {
            siteCount.mockResolvedValue(MAX_WEBSITES_PER_BUSINESS);
            await expect(
                service.createFromTemplate(ctx(), { name: "Acme" }),
            ).rejects.toMatchObject({
                status: 409,
                response: {
                    message: expect.stringMatching(/as many as Saroh allows/),
                },
            });
            expect(transaction).not.toHaveBeenCalled();
        });
    });

    it("enforces the plan's `sites` entitlement before creating (403 when at the limit, no write)", async () => {
        // Simulate the EntitlementService rejecting at the plan cap — a plan
        // that allows no sites at all, since the product cap stops the second.
        const { ForbiddenException } =
            jest.requireActual<typeof import("@nestjs/common")>(
                "@nestjs/common",
            );
        siteCount.mockResolvedValue(0);
        entCheck.mockRejectedValueOnce(
            new ForbiddenException("Plan limit reached"),
        );

        await expect(
            service.createFromTemplate(ctx(), { name: "Acme" }),
        ).rejects.toThrow(/Plan limit reached/);

        // The cap is checked with the current site count and blocks the write.
        expect(entCheck).toHaveBeenCalledWith("org_1", "sites", 0);
        expect(transaction).not.toHaveBeenCalled();
        expect(siteCreate).not.toHaveBeenCalled();
    });

    describe("where a new site is served", () => {
        it("takes the address its business reserved at setup when none is asked for", async () => {
            orgs({ name: "Rye", slug: "ryeandco" });
            await service.createFromTemplate(ctx(), { name: "Rye" });
            expect(siteCreate.mock.calls[0][0].data.subdomain).toBe("ryeandco");
        });

        it("refuses, with a free address, when a site already uses the reserved one (L5: never no address)", async () => {
            orgs({ name: "Rye", slug: "ryeandco" });
            siteFindUnique.mockImplementation(
                async ({ where }: { where: { subdomain: string } }) =>
                    where.subdomain === "ryeandco"
                        ? { id: "site_old", organizationId: "org_1" }
                        : null,
            );
            await expect(
                service.createFromTemplate(ctx(), { name: "Rye 2" }),
            ).rejects.toMatchObject({
                status: 409,
                response: {
                    details: {
                        field: "subdomain",
                        reason: "taken",
                        suggestion: "ryeandco-2",
                    },
                },
            });
            expect(siteCreate).not.toHaveBeenCalled();
        });

        it("refuses an address another business reserved", async () => {
            orgs({
                name: "Rye",
                slug: "ryeandco",
                others: { kiln: "org_other" },
            });
            await expect(
                service.createFromTemplate(ctx(), {
                    name: "Rye",
                    subdomain: "kiln",
                }),
            ).rejects.toMatchObject({
                response: {
                    details: { field: "subdomain", suggestion: "kiln-2" },
                },
            });
            expect(siteCreate).not.toHaveBeenCalled();
        });

        it("refuses an address another business still holds after a change", async () => {
            (
                prisma.addressReservation.findUnique as jest.Mock
            ).mockResolvedValueOnce({
                organizationId: "org_other",
                reservedUntil: new Date(Date.now() + 86_400_000),
            });
            await expect(
                service.createFromTemplate(ctx(), {
                    name: "Rye",
                    subdomain: "kiln",
                }),
            ).rejects.toMatchObject({
                response: { details: { field: "subdomain", reason: "taken" } },
            });
            expect(siteCreate).not.toHaveBeenCalled();
        });

        it("refuses a setup address today's rules don't allow, offering one they do", async () => {
            orgs({ name: "Rye", slug: "rye--co" });
            await expect(
                service.createFromTemplate(ctx(), { name: "Rye" }),
            ).rejects.toMatchObject({
                status: 409,
                response: {
                    details: {
                        field: "subdomain",
                        reason: "unusable",
                        suggestion: "rye-co",
                    },
                },
            });
            expect(siteCreate).not.toHaveBeenCalled();
        });

        it("refuses an address with two hyphens in a row (DEC-071)", async () => {
            await expect(
                service.createFromTemplate(ctx(), {
                    name: "Rye",
                    subdomain: "rye--co",
                }),
            ).rejects.toMatchObject({
                status: 400,
                response: { details: { field: "subdomain" } },
            });
        });

        it("refuses an address kept for Saroh", async () => {
            await expect(
                service.createFromTemplate(ctx(), {
                    name: "Rye",
                    subdomain: "status",
                }),
            ).rejects.toMatchObject({
                response: { message: "That address is kept for Saroh" },
            });
        });
    });

    it("records the template a site was asked to be made from (KTD-7)", async () => {
        // Personal has an enquiry section, which gets its Form.
        (prisma.form.create as jest.Mock).mockResolvedValue({ id: "form_1" });
        await service.createFromTemplate(ctx(), {
            name: "Acme",
            templateId: "personal",
        });

        expect(siteCreate.mock.calls[0][0].data).toMatchObject({
            templateId: "personal",
            templateVersion: 1,
            templateStyleId: null,
        });
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
                // Never without an address (L5): the business's own.
                subdomain: "acme",
                // The template it came from (KTD-7): the kind's default.
                templateId: STARTER_TEMPLATE_ID,
                templateVersion: 3,
                templateStyleId: null,
                storefrontId: null,
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

        // The real starter template's section shape flows through: Home has 3
        // ordered sections without a contact email (one About button, UX-070),
        // starting with a validated hero.
        const homeSections = home.versions.create.sections.create;
        expect(homeSections).toHaveLength(3);
        expect(homeSections.map((s) => s.order)).toEqual([0, 1, 2]);
        expect(homeSections[0].type).toBe("hero");
        // Content is the CONTRACT-NORMALIZED output seeded with the org name.
        expect(homeSections[0].content).toMatchObject({ heading: "Acme" });
        expect(about.versions.create.sections.create).toHaveLength(2);

        // A real menu from the first draft (UX-070): Home, then About.
        expect(prisma.site.update).toHaveBeenCalledWith({
            where: { id: "site_1" },
            data: {
                navigation: {
                    items: [{ pageId: "page_x" }, { pageId: "page_x" }],
                },
            },
        });
    });

    it("seeds the TemplateContext from the org's business profile", async () => {
        orgs({
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

    it.each([
        ["OWNER", true],
        ["ADMIN", true],
        ["MEMBER", false],
        ["REVIEWER", false],
    ] as const)(
        "reports draft edit permission for %s",
        async (role, canEdit) => {
            siteFindFirst.mockResolvedValue({ id: "site_1", pages: [] });
            (prisma.site.findMany as jest.Mock).mockResolvedValue([]);
            await expect(
                service.getSite(ctx({ role }), "site_1"),
            ).resolves.toMatchObject({ canEdit });
        },
    );

    it("hands the editor a sanitized footer to draw, and the written one to edit", async () => {
        const written =
            '<p>Hill Road</p><script>alert(1)</script><img src=x onerror="alert(2)">';
        siteFindFirst.mockResolvedValue({
            id: "site_1",
            pages: [],
            footer: { format: "html", value: written },
        });
        (prisma.site.findMany as jest.Mock).mockResolvedValue([]);
        const site = await service.getSite(ctx(), "site_1");
        // What the settings screen edits is left as the merchant wrote it.
        expect(site.footer?.value).toBe(written);
        // What the canvas renders as markup is what publish would write.
        expect(site.footerPreview?.value).toContain("<p>Hill Road</p>");
        expect(site.footerPreview?.value).not.toMatch(/script|onerror/i);
    });

    it("dates each page by its last change, page or sections (#908)", async () => {
        siteFindFirst.mockResolvedValue({
            id: "site_1",
            pages: [
                {
                    id: "page_1",
                    path: "/",
                    title: "Home",
                    isHome: true,
                    hidden: false,
                    kind: "FREE",
                    inMenu: true,
                    updatedAt: new Date("2026-10-01T09:00:00Z"),
                    versions: [{ updatedAt: new Date("2026-10-05T12:00:00Z") }],
                },
            ],
        });
        (prisma.site.findMany as jest.Mock).mockResolvedValue([]);
        const site = await service.getSite(ctx(), "site_1");
        expect(site.pages[0]).toEqual(
            expect.objectContaining({
                id: "page_1",
                updatedAt: new Date("2026-10-05T12:00:00Z"),
            }),
        );
        // The draft is read for its date only; it never leaves the API.
        expect(site.pages[0]).not.toHaveProperty("versions");
    });

    it("has no footer preview when there is no footer", async () => {
        siteFindFirst.mockResolvedValue({ id: "site_1", pages: [] });
        (prisma.site.findMany as jest.Mock).mockResolvedValue([]);
        const site = await service.getSite(ctx(), "site_1");
        expect(site.footerPreview).toBeNull();
    });

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

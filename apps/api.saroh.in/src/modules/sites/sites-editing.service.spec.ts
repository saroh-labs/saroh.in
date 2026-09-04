// DB-free unit tests for S2-005 (draft editing, publish, public read). The
// database package is mocked so nothing touches Postgres, but the REAL section
// contract (`parseSectionContent`) and the REAL sanitizer (`sanitize-html`, via
// ./sanitize) are exercised — so these tests prove genuine contract rejection
// and genuine `<script>` stripping, not a stub's behavior.
//
// The `$transaction` mock invokes its callback with the same mocked client, so
// every publish/replace write is asserted to run inside the one transaction.
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    const client = {
        site: {
            findFirst: jest.fn(),
            // The pending-change count (#190) re-reads the site after a draft
            // save. Defaults to "no sites matched", which the count reads as
            // "nothing to compare" — these tests are about the write.
            findMany: jest.fn().mockResolvedValue([]),
            update: jest.fn(),
        },
        page: {
            findFirst: jest.fn(),
        },
        pageVersion: {
            findFirst: jest.fn(),
            create: jest.fn(),
        },
        section: {
            findMany: jest.fn(),
            deleteMany: jest.fn(),
            createMany: jest.fn(),
        },
        publication: {
            create: jest.fn(),
        },
        siteApproval: {
            findFirst: jest.fn(),
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

import { BadRequestException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { UpdateDraftSectionsDto } from "./dto";
import { defaultSiteStyle } from "./site-style";
import { SitesService } from "./sites.service";

const siteFindFirst = prisma.site.findFirst as jest.Mock;
const siteUpdate = prisma.site.update as jest.Mock;
const pageFindFirst = prisma.page.findFirst as jest.Mock;
const versionFindFirst = prisma.pageVersion.findFirst as jest.Mock;
const versionCreate = prisma.pageVersion.create as jest.Mock;
const sectionFindMany = prisma.section.findMany as jest.Mock;
const sectionDeleteMany = prisma.section.deleteMany as jest.Mock;
const sectionCreateMany = prisma.section.createMany as jest.Mock;
const publicationCreate = prisma.publication.create as jest.Mock;
const approvalFindFirst = prisma.siteApproval.findFirst as jest.Mock;
const approvalCreate = prisma.siteApproval.create as jest.Mock;
const transaction = prisma.$transaction as jest.Mock;

function ctx(over: Partial<OrganizationContext> = {}): OrganizationContext {
    return {
        organizationId: "org_1",
        userId: "user_1",
        role: "OWNER",
        ...over,
    };
}

// EntitlementService is only used by createFromTemplate (not the editing paths
// under test); a stub satisfies the constructor.
const service = new SitesService({
    check: jest.fn().mockResolvedValue(true),
    can: jest.fn().mockResolvedValue(true),
    getEntitlements: jest.fn(),
} as unknown as import("../billing/entitlement.service").EntitlementService);

beforeEach(() => jest.clearAllMocks());

describe("SitesService.replaceDraftSections", () => {
    beforeEach(() => {
        siteFindFirst.mockResolvedValue({ id: "site_1" });
        pageFindFirst.mockResolvedValue({ id: "page_1" });
        versionFindFirst.mockResolvedValue({ id: "ver_1" });
        sectionFindMany.mockResolvedValue([]);
        sectionDeleteMany.mockResolvedValue({ count: 0 });
        sectionCreateMany.mockResolvedValue({ count: 0 });
    });

    it("rejects invalid section content through the real contract and writes nothing", async () => {
        // hero v1 requires a non-empty `heading`; `{}` fails the contract.
        const dto: UpdateDraftSectionsDto = {
            sections: [{ type: "hero", contractVersion: 1, content: {} }],
        };

        await expect(
            service.replaceDraftSections(ctx(), "site_1", "page_1", dto),
        ).rejects.toBeInstanceOf(BadRequestException);

        // Validation happens before any DB write / transaction.
        expect(transaction).not.toHaveBeenCalled();
        expect(sectionDeleteMany).not.toHaveBeenCalled();
        expect(sectionCreateMany).not.toHaveBeenCalled();
    });

    it("replaces sections in one transaction with order = array index and org-scoped rows", async () => {
        const dto: UpdateDraftSectionsDto = {
            sections: [
                {
                    type: "hero",
                    contractVersion: 1,
                    content: { heading: "Hi" },
                },
                {
                    type: "richText",
                    contractVersion: 1,
                    content: { format: "html", value: "<p>ok</p>" },
                },
            ],
        };

        await service.replaceDraftSections(ctx(), "site_1", "page_1", dto);

        expect(transaction).toHaveBeenCalledTimes(1);
        expect(sectionDeleteMany).toHaveBeenCalledWith({
            where: { pageVersionId: "ver_1" },
        });
        const created = sectionCreateMany.mock.calls[0][0].data as Array<{
            pageVersionId: string;
            organizationId: string;
            type: string;
            order: number;
        }>;
        expect(created.map((s) => s.order)).toEqual([0, 1]);
        expect(created.map((s) => s.type)).toEqual(["hero", "richText"]);
        expect(created.every((s) => s.organizationId === "org_1")).toBe(true);
        expect(created.every((s) => s.pageVersionId === "ver_1")).toBe(true);
    });

    it("creates an empty DRAFT version when the page has none", async () => {
        versionFindFirst.mockResolvedValue(null);
        versionCreate.mockResolvedValue({ id: "ver_new" });

        await service.replaceDraftSections(ctx(), "site_1", "page_1", {
            sections: [],
        });

        expect(versionCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    pageId: "page_1",
                    organizationId: "org_1",
                    status: "DRAFT",
                    createdByUserId: "user_1",
                }),
            }),
        );
    });

    it("returns 404 for a site in another org (cross-tenant) before validating", async () => {
        siteFindFirst.mockResolvedValue(null);

        await expect(
            service.replaceDraftSections(ctx(), "other_org_site", "page_1", {
                sections: [],
            }),
        ).rejects.toBeInstanceOf(NotFoundException);

        expect(siteFindFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    id: "other_org_site",
                    organizationId: "org_1",
                    deletedAt: null,
                }),
            }),
        );
        expect(transaction).not.toHaveBeenCalled();
    });

    it("denies section:write to a MEMBER before any DB work", async () => {
        await expect(
            service.replaceDraftSections(
                ctx({ role: "MEMBER" }),
                "site_1",
                "page_1",
                {
                    sections: [],
                },
            ),
        ).rejects.toThrow(/MEMBER.*section:write/);

        expect(siteFindFirst).not.toHaveBeenCalled();
        expect(transaction).not.toHaveBeenCalled();
    });

    it("persists a section's hidden flag, and defaults it to visible when absent", async () => {
        // The second section omits `hidden` entirely — the shape an older
        // client sends. Omission must mean visible, never hidden, or an
        // upgrade would silently take sections off live sites.
        await service.replaceDraftSections(ctx(), "site_1", "page_1", {
            sections: [
                {
                    type: "hero",
                    contractVersion: 1,
                    content: { heading: "Parked" },
                    hidden: true,
                },
                {
                    type: "hero",
                    contractVersion: 1,
                    content: { heading: "Live" },
                },
            ],
        });

        const created = sectionCreateMany.mock.calls[0][0].data as Array<{
            hidden: boolean;
        }>;
        expect(created.map((s) => s.hidden)).toEqual([true, false]);
    });

    it("keeps a hidden section's order — hiding is not deleting", async () => {
        await service.replaceDraftSections(ctx(), "site_1", "page_1", {
            sections: [
                {
                    type: "hero",
                    contractVersion: 1,
                    content: { heading: "First" },
                },
                {
                    type: "hero",
                    contractVersion: 1,
                    content: { heading: "Parked" },
                    hidden: true,
                },
                {
                    type: "hero",
                    contractVersion: 1,
                    content: { heading: "Third" },
                },
            ],
        });

        const created = sectionCreateMany.mock.calls[0][0].data as Array<{
            order: number;
            hidden: boolean;
        }>;
        // The hidden one still occupies index 1: unhiding restores it in place.
        expect(created.map((s) => s.order)).toEqual([0, 1, 2]);
        expect(created[1].hidden).toBe(true);
    });
});

describe("SitesService.getPageDraft", () => {
    it("denies section:write to a MEMBER", async () => {
        await expect(
            service.getPageDraft(ctx({ role: "MEMBER" }), "site_1", "page_1"),
        ).rejects.toThrow(/MEMBER.*section:write/);
    });
});

describe("SitesService.publishSite", () => {
    beforeEach(() => {
        publicationCreate.mockResolvedValue({
            id: "pub_1",
            publishedAt: new Date("2026-07-18T00:00:00.000Z"),
        });
        siteUpdate.mockResolvedValue({ id: "site_1" });
    });

    function siteWithRichText(value: string) {
        return {
            id: "site_1",
            name: "Acme",
            slug: "acme",
            pages: [
                {
                    path: "/",
                    title: "Home",
                    isHome: true,
                    versions: [
                        {
                            sections: [
                                {
                                    type: "richText",
                                    contractVersion: 1,
                                    content: { format: "html", value },
                                },
                            ],
                        },
                    ],
                },
            ],
        };
    }

    it("asks the database for visible sections only — hidden work never publishes", async () => {
        siteFindFirst.mockResolvedValue(siteWithRichText("<p>hello</p>"));

        await service.publishSite(ctx(), "site_1");

        // The filter lives in the query, so this is where it can be proven.
        // A snapshot is immutable once written: a hidden section that slipped
        // in could not be taken back out without republishing.
        const select = siteFindFirst.mock.calls[0][0].select as {
            pages: {
                select: {
                    versions: {
                        select: { sections: { where: { hidden: boolean } } };
                    };
                };
            };
        };
        expect(select.pages.select.versions.select.sections.where).toEqual({
            hidden: false,
        });
    });

    it("SANITIZES the footer into the snapshot, on the same boundary as richText", async () => {
        siteFindFirst.mockResolvedValue({
            ...siteWithRichText("<p>hello</p>"),
            footer: {
                format: "html",
                value: '<p>Northwind Supply</p><script>alert("xss")</script>',
            },
        });

        await service.publishSite(ctx(), "site_1");

        // The renderer draws the footer with dangerouslySetInnerHTML, and that
        // is safe for exactly one reason: it was cleaned HERE, before the
        // immutable write. Nothing downstream sanitizes at read time.
        const data = publicationCreate.mock.calls[0][0].data as {
            snapshot: { site: { footer: { value: string } | null } };
        };
        expect(data.snapshot.site.footer?.value).toBe(
            "<p>Northwind Supply</p>",
        );
        expect(data.snapshot.site.footer?.value).not.toContain("script");
    });

    it("publishes no footer when the merchant has written none", async () => {
        // Null must reach the snapshot as null rather than as an empty string:
        // the renderer draws nothing for null, and an empty band in the
        // merchant's footer colour would be inventing a footer they never asked
        // for — the exact over-claim #202 exists to remove.
        siteFindFirst.mockResolvedValue({
            ...siteWithRichText("<p>hello</p>"),
            footer: null,
        });

        await service.publishSite(ctx(), "site_1");

        const data = publicationCreate.mock.calls[0][0].data as {
            snapshot: { site: { footer: unknown } };
        };
        expect(data.snapshot.site.footer).toBeNull();
    });

    it("carries the share image with its measurements into the snapshot (#220)", async () => {
        // WhatsApp draws its large card only when og:image:width/height are
        // present; the renderer reads them from here and nowhere else.
        siteFindFirst.mockResolvedValue({
            ...siteWithRichText("<p>hello</p>"),
            socialImageUrl: "https://cdn.example.com/share.png",
            socialImageWidth: 1200,
            socialImageHeight: 630,
        });

        await service.publishSite(ctx(), "site_1");

        const data = publicationCreate.mock.calls[0][0].data as {
            snapshot: {
                site: {
                    socialImageUrl: string | null;
                    socialImage: {
                        url: string;
                        width: number | null;
                        height: number | null;
                    } | null;
                };
            };
        };
        expect(data.snapshot.site.socialImage).toEqual({
            url: "https://cdn.example.com/share.png",
            width: 1200,
            height: 630,
        });
        // The bare address stays for snapshots an older renderer reads.
        expect(data.snapshot.site.socialImageUrl).toBe(
            "https://cdn.example.com/share.png",
        );
    });

    it("publishes no share image object when there is no picture", async () => {
        siteFindFirst.mockResolvedValue(siteWithRichText("<p>hello</p>"));

        await service.publishSite(ctx(), "site_1");

        const data = publicationCreate.mock.calls[0][0].data as {
            snapshot: { site: { socialImage: unknown } };
        };
        expect(data.snapshot.site.socialImage).toBeNull();
    });

    it("records a BYPASSED approval when publishing past a change request (#199)", async () => {
        siteFindFirst.mockResolvedValue(siteWithRichText("<p>hello</p>"));
        approvalFindFirst.mockResolvedValue({ outcome: "CHANGES_REQUESTED" });
        approvalCreate.mockResolvedValue({ id: "a_bypass" });

        const result = await service.publishSite(ctx(), "site_1");

        // Never prevented — the publication exists — and recorded: who, when,
        // and which publication, inside the same transaction.
        expect(publicationCreate).toHaveBeenCalledTimes(1);
        expect(result.bypassed).toBe(true);
        expect(approvalCreate).toHaveBeenCalledTimes(1);
        expect(approvalCreate.mock.calls[0][0].data).toMatchObject({
            siteId: "site_1",
            organizationId: "org_1",
            byUserId: "user_1",
            outcome: "BYPASSED",
            publicationId: "pub_1",
        });
        // The outstanding question reads VERDICTS only: a BYPASSED row from an
        // earlier publish must not count as the reviewer changing their mind.
        expect(approvalFindFirst.mock.calls[0][0].where.outcome).toEqual({
            in: ["APPROVED", "CHANGES_REQUESTED"],
        });
    });

    it("records nothing when the site is approved, or nobody reviewed it", async () => {
        siteFindFirst.mockResolvedValue(siteWithRichText("<p>hello</p>"));
        approvalFindFirst.mockResolvedValueOnce({ outcome: "APPROVED" });
        const approved = await service.publishSite(ctx(), "site_1");
        expect(approved.bypassed).toBe(false);

        approvalFindFirst.mockResolvedValueOnce(null);
        const unreviewed = await service.publishSite(ctx(), "site_1");
        expect(unreviewed.bypassed).toBe(false);
        expect(approvalCreate).not.toHaveBeenCalled();
    });

    it("asks the database for visible pages only — a hidden page never publishes", async () => {
        siteFindFirst.mockResolvedValue(siteWithRichText("<p>hello</p>"));

        await service.publishSite(ctx(), "site_1");

        // Same reasoning as the section filter above, one level up. A page the
        // merchant parked must not reach the snapshot, and the snapshot is
        // immutable once written, so the filter has to be in the QUERY rather
        // than in the renderer reading it back.
        const select = siteFindFirst.mock.calls[0][0].select as {
            pages: { where: { hidden: boolean } };
        };
        expect(select.pages.where).toEqual({ hidden: false });
    });

    it("creates an immutable Publication, repoints currentPublicationId, and SANITIZES richText", async () => {
        siteFindFirst.mockResolvedValue(
            siteWithRichText("<p>hello</p><script>alert('xss')</script>"),
        );

        const result = await service.publishSite(ctx(), "site_1");

        // One transaction: publication insert THEN pointer repoint.
        expect(transaction).toHaveBeenCalledTimes(1);
        expect(publicationCreate).toHaveBeenCalledTimes(1);

        const data = publicationCreate.mock.calls[0][0].data as {
            siteId: string;
            organizationId: string;
            templateId: string;
            templateVersion: number;
            publishedByUserId: string;
            snapshot: {
                site: { name: string; slug: string };
                pages: Array<{
                    path: string;
                    isHome: boolean;
                    sections: Array<{
                        type: string;
                        content: { value: string };
                    }>;
                }>;
            };
        };

        // Immutable stamp: org-scoped, has a template stamp + author.
        expect(data.siteId).toBe("site_1");
        expect(data.organizationId).toBe("org_1");
        expect(data.publishedByUserId).toBe("user_1");
        expect(data.templateId).toBeTruthy();
        expect(data.templateVersion).toBeGreaterThanOrEqual(1);

        // Snapshot is self-contained + the <script> was stripped before write.
        // The snapshot carries the site's identity, its search/social fields
        // (#188) and its look (#189) — the public renderer reads ONLY this row,
        // so anything left out here never reaches the live site. Style is
        // normalized to the defaults when the site has none, so a snapshot is
        // never half-styled.
        expect(data.snapshot.site).toMatchObject({
            name: "Acme",
            slug: "acme",
        });
        expect(data.snapshot.site.style.colours).toEqual(
            defaultSiteStyle().colours,
        );
        expect(data.snapshot.site.style.scalars).toEqual(
            defaultSiteStyle().scalars,
        );
        const value = data.snapshot.pages[0].sections[0].content.value;
        expect(value).not.toContain("<script>");
        expect(value).not.toContain("alert");
        expect(value).toContain("<p>hello</p>");

        // Live pointer repointed to the new (immutable) publication.
        expect(siteUpdate).toHaveBeenCalledWith({
            where: { id: "site_1" },
            data: { currentPublicationId: "pub_1" },
        });
        expect(result.currentPublicationId).toBe("pub_1");
        expect(result.publicationId).toBe("pub_1");
    });

    it("returns 404 for a site in another org (cross-tenant)", async () => {
        siteFindFirst.mockResolvedValue(null);
        await expect(
            service.publishSite(ctx(), "other_org_site"),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(transaction).not.toHaveBeenCalled();
    });

    it("denies site:publish to a MEMBER before any DB work", async () => {
        await expect(
            service.publishSite(ctx({ role: "MEMBER" }), "site_1"),
        ).rejects.toThrow(/MEMBER.*site:publish/);
        expect(siteFindFirst).not.toHaveBeenCalled();
    });
});

describe("SitesService public read (drafts never leak)", () => {
    it("returns ONLY the current publication snapshot", async () => {
        const publishedAt = new Date("2026-07-18T00:00:00.000Z");
        siteFindFirst.mockResolvedValue({
            currentPublication: { snapshot: { pages: [] }, publishedAt },
        });

        const result = await service.getPublicationBySubdomain("acme");

        // The query selects nothing but currentPublication — no draft tables.
        expect(siteFindFirst).toHaveBeenCalledWith({
            where: { subdomain: "acme", deletedAt: null },
            select: {
                currentPublication: {
                    select: { snapshot: true, publishedAt: true },
                },
            },
        });
        expect(result).toEqual({ snapshot: { pages: [] }, publishedAt });
    });

    it("404s a site that has never published (currentPublication null)", async () => {
        siteFindFirst.mockResolvedValue({ currentPublication: null });
        await expect(
            service.getPublicationBySubdomain("acme"),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("404s an unknown site (by id)", async () => {
        siteFindFirst.mockResolvedValue(null);
        await expect(
            service.getPublicationBySiteId("nope"),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});

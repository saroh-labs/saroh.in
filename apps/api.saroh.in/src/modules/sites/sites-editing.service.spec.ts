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
            // The revision bump a save makes in the same transaction (#285).
            update: jest.fn(),
        },
        section: {
            findMany: jest.fn(),
            deleteMany: jest.fn(),
            createMany: jest.fn(),
        },
        publication: {
            findFirst: jest.fn(),
            create: jest.fn(),
        },
        siteApproval: {
            findFirst: jest.fn(),
            // #278 reads every verdict and decides the route from all of them.
            findMany: jest.fn(),
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

import { draftFingerprint } from "./review-route";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { UpdateDraftSectionsDto } from "./dto";
import { defaultSiteStyle } from "./site-style";
import { SitesService } from "./sites.service";

const siteFindFirst = prisma.site.findFirst as jest.Mock;
const siteUpdate = prisma.site.update as jest.Mock;
const pageFindFirst = prisma.page.findFirst as jest.Mock;
const versionFindFirst = prisma.pageVersion.findFirst as jest.Mock;
const versionUpdate = prisma.pageVersion.update as jest.Mock;
const versionCreate = prisma.pageVersion.create as jest.Mock;
const sectionFindMany = prisma.section.findMany as jest.Mock;
const sectionDeleteMany = prisma.section.deleteMany as jest.Mock;
const sectionCreateMany = prisma.section.createMany as jest.Mock;
const publicationCreate = prisma.publication.create as jest.Mock;
const publicationFindFirst = prisma.publication.findFirst as jest.Mock;
const approvalFindFirst = prisma.siteApproval.findFirst as jest.Mock;
const approvalCreate = prisma.siteApproval.create as jest.Mock;
const approvalFindMany = prisma.siteApproval.findMany as jest.Mock;

/**
 * The fingerprint the service will compute for the draft `siteWithRichText`
 * describes — asked of the same builder, so the test states the rule rather
 * than a hash literal that would rot on the next snapshot change.
 */
async function fingerprintOfDraft(): Promise<string> {
    approvalFindMany.mockResolvedValueOnce([]);
    await service.publishSite(ctx(), "site_1");
    const { snapshot } = publicationCreate.mock.calls.at(-1)![0].data as {
        snapshot: unknown;
    };
    publicationCreate.mockClear();
    return draftFingerprint(snapshot);
}

/**
 * Verdict rows, written in the order they happened and returned newest first —
 * the order the service reads them in.
 */
function verdicts(
    ...rows: { outcome: string; byUserId?: string; fingerprint?: string }[]
) {
    let tick = 0;
    return rows
        .map((r) => ({
            outcome: r.outcome,
            byUserId: r.byUserId ?? "reviewer",
            draftFingerprint: r.fingerprint ?? null,
            createdAt: new Date(Date.UTC(2026, 8, 12, 0, 0, tick++)),
        }))
        .reverse();
}
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
        versionUpdate.mockResolvedValue({ revision: 1 });
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

    it("SANITIZES a stored draft on the way out, so the editor preview never renders it raw (#280)", async () => {
        siteFindFirst.mockResolvedValue({ id: "site_1" });
        pageFindFirst.mockResolvedValue({ id: "page_1" });
        versionFindFirst.mockResolvedValue({ id: "ver_1" });
        // Rows as they could exist from before sanitize-on-write: a rich
        // field carrying a handler, and a text field that merely looks like
        // HTML.
        sectionFindMany.mockResolvedValue([
            {
                id: "sec_1",
                type: "richText",
                contractVersion: 1,
                order: 0,
                hidden: false,
                key: "key_1",
                content: {
                    format: "html",
                    value: '<p>Hi</p><img src="https://img.test/a.png" onerror="alert(1)">',
                },
            },
            {
                id: "sec_2",
                type: "hero",
                contractVersion: 1,
                order: 1,
                hidden: false,
                key: "key_2",
                content: { heading: "<b onclick=x>Not HTML</b>" },
            },
        ]);

        const draft = await service.getPageDraft(ctx(), "site_1", "page_1");
        const [rich, hero] = draft.sections as unknown as Array<{
            content: Record<string, string>;
        }>;

        expect(rich.content.value).toContain("<p>Hi</p>");
        expect(rich.content.value).not.toMatch(/onerror|alert/);
        // Only the contract's flagged fields are cleaned. A heading is text,
        // and React escapes it wherever it is drawn.
        expect(hero.content.heading).toBe("<b onclick=x>Not HTML</b>");
    });
});

describe("SitesService.replaceDraftSections sanitizes on the way in (#280)", () => {
    beforeEach(() => {
        siteFindFirst.mockResolvedValue({ id: "site_1" });
        pageFindFirst.mockResolvedValue({ id: "page_1" });
        versionFindFirst.mockResolvedValue({ id: "ver_1" });
        sectionFindMany.mockResolvedValue([]);
        sectionDeleteMany.mockResolvedValue({ count: 0 });
        sectionCreateMany.mockResolvedValue({ count: 0 });
    });

    it("stores rich text already cleaned, not only at publish", async () => {
        await service.replaceDraftSections(ctx(), "site_1", "page_1", {
            sections: [
                {
                    type: "richText",
                    contractVersion: 1,
                    content: {
                        format: "html",
                        value: '<p style="position: fixed; color: #b91c1c">ok</p><img src="https://img.test/a.png" onerror="alert(1)"><script>alert(2)</script>',
                    },
                },
            ],
        });

        const created = sectionCreateMany.mock.calls[0][0].data as Array<{
            content: { value: string };
        }>;
        expect(created[0].content.value).not.toMatch(
            /onerror|alert|script|position/,
        );
        expect(created[0].content.value).toMatch(/color:\s*#b91c1c/);
    });

    it("refuses a button whose link would run script", async () => {
        await expect(
            service.replaceDraftSections(ctx(), "site_1", "page_1", {
                sections: [
                    {
                        type: "cta",
                        contractVersion: 2,
                        content: {
                            label: "Order now",
                            action: {
                                kind: "url",
                                href: "javascript:alert(1)",
                            },
                        },
                    },
                ],
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(sectionCreateMany).not.toHaveBeenCalled();
    });
});

describe("SitesService.updateFooter (#280)", () => {
    beforeEach(() => {
        siteFindFirst.mockResolvedValue({
            id: "site_1",
            currentPublicationId: null,
        });
        siteUpdate.mockResolvedValue({ id: "site_1" });
    });

    it("stores the footer SANITIZED, not only at publish", async () => {
        const result = await service.updateFooter(ctx(), "site_1", {
            format: "html",
            value: '<p onclick="steal()">Northwind Supply</p><script>alert(1)</script>',
        });

        const stored = siteUpdate.mock.calls[0][0].data.footer as {
            value: string;
        };
        expect(stored.value).toBe("<p>Northwind Supply</p>");
        expect(result.footer?.value).toBe("<p>Northwind Supply</p>");
    });

    it("still treats an emptied footer as no footer", async () => {
        const result = await service.updateFooter(ctx(), "site_1", {
            format: "html",
            value: "   ",
        });
        expect(result.footer).toBeNull();
    });
});

/** The version being restored — what actually goes live (#278). */
const RESTORED_SNAPSHOT = { pages: [] };

describe("SitesService.restorePublication (#279)", () => {
    beforeEach(() => {
        // Nobody asked for a review, unless a test says otherwise.
        approvalFindMany.mockResolvedValue([]);
        siteFindFirst.mockResolvedValue({
            id: "site_1",
            currentPublicationId: "pub_live",
        });
        publicationFindFirst.mockResolvedValue({
            snapshot: RESTORED_SNAPSHOT,
            templateId: "starter",
            templateVersion: 1,
            pageId: null,
            path: null,
        });
        publicationCreate.mockResolvedValue({
            id: "pub_restored",
            publishedAt: new Date("2026-09-11T10:00:00Z"),
        });
        siteUpdate.mockResolvedValue({ id: "site_1" });
        approvalCreate.mockResolvedValue({ id: "approval_1" });
    });

    it("records a BYPASSED approval for the restored version when a change request is outstanding", async () => {
        approvalFindMany.mockResolvedValue(
            verdicts({ outcome: "CHANGES_REQUESTED" }),
        );

        const result = await service.restorePublication(
            ctx(),
            "site_1",
            "pub_old",
        );

        expect(result).toMatchObject({
            publicationId: "pub_restored",
            bypassed: true,
        });
        expect(transaction).toHaveBeenCalledTimes(1);
        expect(approvalCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                data: {
                    siteId: "site_1",
                    organizationId: "org_1",
                    byUserId: "user_1",
                    outcome: "BYPASSED",
                    publicationId: "pub_restored",
                },
            }),
        );
    });

    it("records nothing when nobody has reviewed the site", async () => {
        approvalFindMany.mockResolvedValue([]);

        const result = await service.restorePublication(
            ctx(),
            "site_1",
            "pub_old",
        );

        expect(result).toMatchObject({ bypassed: false });
        expect(approvalCreate).not.toHaveBeenCalled();
        // Nobody was asked, so the route says so rather than claiming an
        // approval this restore never had (#278).
        expect(publicationCreate.mock.calls[0][0].data.reviewRoute).toBe(
            "NONE",
        );
    });

    it("counts an approval only when it approved THIS version (#278)", async () => {
        // The restored snapshot is what goes live, so that is what an approval
        // has to have covered. A draft approval does not carry over to a
        // rollback, which is content nobody signed off.
        const fingerprint = draftFingerprint(RESTORED_SNAPSHOT);
        approvalFindMany.mockResolvedValue(
            verdicts(
                { outcome: "REQUESTED", byUserId: "user_1", fingerprint },
                { outcome: "APPROVED", byUserId: "reviewer", fingerprint },
            ),
        );

        const result = await service.restorePublication(
            ctx(),
            "site_1",
            "pub_old",
        );

        expect(result).toMatchObject({ bypassed: false });
        expect(approvalCreate).not.toHaveBeenCalled();
        expect(publicationCreate.mock.calls[0][0].data.reviewRoute).toBe(
            "APPROVED",
        );
    });

    it("records a bypass when the approval was of a different draft (#278)", async () => {
        approvalCreate.mockResolvedValue({ id: "a_bypass" });
        approvalFindMany.mockResolvedValue(
            verdicts(
                {
                    outcome: "REQUESTED",
                    byUserId: "user_1",
                    fingerprint: "a-draft",
                },
                {
                    outcome: "APPROVED",
                    byUserId: "reviewer",
                    fingerprint: "a-draft",
                },
            ),
        );

        const result = await service.restorePublication(
            ctx(),
            "site_1",
            "pub_old",
        );

        expect(result).toMatchObject({ bypassed: true });
        expect(publicationCreate.mock.calls[0][0].data.reviewRoute).toBe(
            "BYPASSED",
        );
    });

    it("404s a version from another site or organization, and writes nothing", async () => {
        publicationFindFirst.mockResolvedValue(null);

        await expect(
            service.restorePublication(ctx(), "site_1", "pub_elsewhere"),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(publicationFindFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    id: "pub_elsewhere",
                    siteId: "site_1",
                    organizationId: "org_1",
                    // A post publish is not a version of the site (#283), so
                    // restore cannot resurrect one as the live site.
                    postId: null,
                },
            }),
        );
        expect(transaction).not.toHaveBeenCalled();
    });

    it("refuses a MEMBER before any database work", async () => {
        await expect(
            service.restorePublication(
                ctx({ role: "MEMBER" }),
                "site_1",
                "pub_old",
            ),
        ).rejects.toThrow(/MEMBER.*site:publish/);
        expect(siteFindFirst).not.toHaveBeenCalled();
        expect(transaction).not.toHaveBeenCalled();
    });
});

describe("SitesService.publishSite", () => {
    beforeEach(() => {
        // Nobody asked for a review, unless a test says otherwise (#278).
        approvalFindMany.mockResolvedValue([]);
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
        approvalFindMany.mockResolvedValue(
            verdicts({ outcome: "CHANGES_REQUESTED" }),
        );
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
        expect(approvalFindMany.mock.calls[0][0].where.outcome).toEqual({
            in: ["REQUESTED", "APPROVED", "CHANGES_REQUESTED"],
        });
        // And the publication says which route it took (#278).
        expect(publicationCreate.mock.calls[0][0].data.reviewRoute).toBe(
            "BYPASSED",
        );
    });

    it("records nothing when the site is approved, or nobody reviewed it", async () => {
        siteFindFirst.mockResolvedValue(siteWithRichText("<p>hello</p>"));
        // An approval of THIS draft, by someone other than the publisher
        // (#278): the fingerprint the service computes for the snapshot it is
        // about to write is the one the approval has to carry.
        const fingerprint = await fingerprintOfDraft();
        approvalFindMany.mockResolvedValue(
            verdicts(
                { outcome: "REQUESTED", byUserId: "user_1", fingerprint },
                { outcome: "APPROVED", byUserId: "reviewer", fingerprint },
            ),
        );
        const approved = await service.publishSite(ctx(), "site_1");
        expect(approved.bypassed).toBe(false);
        expect(publicationCreate.mock.calls[0][0].data.reviewRoute).toBe(
            "APPROVED",
        );

        approvalFindMany.mockResolvedValue([]);
        const unreviewed = await service.publishSite(ctx(), "site_1");
        expect(unreviewed.bypassed).toBe(false);
        expect(publicationCreate.mock.calls[1][0].data.reviewRoute).toBe(
            "NONE",
        );
        expect(approvalCreate).not.toHaveBeenCalled();
    });

    it("records a bypass when the only approval is the publisher's own (#278)", async () => {
        siteFindFirst.mockResolvedValue(siteWithRichText("<p>hello</p>"));
        approvalCreate.mockResolvedValue({ id: "a_bypass" });
        const fingerprint = await fingerprintOfDraft();
        approvalFindMany.mockResolvedValue(
            verdicts(
                { outcome: "REQUESTED", byUserId: "user_1", fingerprint },
                // The person who then publishes.
                { outcome: "APPROVED", byUserId: "user_1", fingerprint },
            ),
        );

        const result = await service.publishSite(ctx(), "site_1");

        // Signing off your own work is not a second pair of eyes, and the
        // record does not claim it was. Nothing is prevented.
        expect(result.bypassed).toBe(true);
        expect(publicationCreate.mock.calls[0][0].data.reviewRoute).toBe(
            "BYPASSED",
        );
    });

    it("treats an approval of an EARLIER draft as no approval at all (#278)", async () => {
        siteFindFirst.mockResolvedValue(siteWithRichText("<p>hello</p>"));
        approvalCreate.mockResolvedValue({ id: "a_bypass" });
        approvalFindMany.mockResolvedValue(
            verdicts(
                {
                    outcome: "REQUESTED",
                    byUserId: "user_1",
                    fingerprint: "older",
                },
                {
                    outcome: "APPROVED",
                    byUserId: "reviewer",
                    fingerprint: "older",
                },
            ),
        );

        const result = await service.publishSite(ctx(), "site_1");

        // Approve, change three sections, publish: #193 says the approval does
        // not survive the edits.
        expect(result.bypassed).toBe(true);
        expect(publicationCreate.mock.calls[0][0].data.reviewRoute).toBe(
            "BYPASSED",
        );
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
            id: "site_1",
            currentPublication: { snapshot: { pages: [] }, publishedAt },
        });

        const result = await service.getPublicationBySubdomain("acme");

        // The query selects nothing but the current publication and the site's
        // own id — no draft tables. The id is not content: the renderer
        // resolves a host once and then asks for that site's posts by it
        // (#232), rather than repeating the host resolution per post route.
        expect(siteFindFirst).toHaveBeenCalledWith({
            where: { subdomain: "acme", deletedAt: null },
            select: {
                id: true,
                currentPublication: {
                    select: { snapshot: true, publishedAt: true },
                },
            },
        });
        expect(result).toEqual({
            snapshot: { pages: [] },
            publishedAt,
            siteId: "site_1",
        });
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

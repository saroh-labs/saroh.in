// Undo one change (website editor plan U47a), with SitesService stood in.
jest.mock("@saroh/database", () => ({
    ...jest.requireActual("@saroh/database"),
    prisma: {
        site: { findFirst: jest.fn() },
        page: { findFirst: jest.fn() },
        auditEvent: { create: jest.fn() },
    },
}));

import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { ChangeRevertService } from "./change-revert";
import type { SitesService } from "./sites.service";

const siteFindFirst = prisma.site.findFirst as jest.Mock;
const pageFindFirst = prisma.page.findFirst as jest.Mock;
const auditCreate = prisma.auditEvent.create as jest.Mock;

function ctx(over: Partial<OrganizationContext> = {}): OrganizationContext {
    return {
        organizationId: "org_1",
        userId: "user_1",
        role: "OWNER",
        ...over,
    };
}

const text = (heading: string) => ({
    type: "text",
    contractVersion: 1,
    content: { heading },
});
const LIVE = {
    site: { name: "Gulmohar", seoTitle: "Bridal makeup", seoDescription: null },
    pages: [
        {
            path: "/bridal",
            title: "Bridal packages",
            sections: [text("Packages"), text("Trial")],
        },
    ],
    keys: { "/bridal": { id: "p_bridal", sections: ["k1", "k2"] } },
};

const unit = (key: string, over: Record<string, unknown> = {}) => ({
    key,
    kind: key.split(":")[0],
    change: "changed",
    pageId: key.startsWith("site:") ? null : "p_bridal",
    requires: [],
    ...over,
});

function stubSites(units: ReturnType<typeof unit>[]) {
    return {
        getChanges: jest.fn().mockResolvedValue({ count: units.length, units }),
        getPageDraft: jest.fn().mockResolvedValue({
            revision: 4,
            sections: [
                { key: "k1", ...text("Packages, cheaper"), hidden: false },
                { key: "k2", ...text("Trial"), hidden: false },
            ],
        }),
        replaceDraftSections: jest
            .fn()
            .mockResolvedValue({ revision: 5, sections: [] }),
        updatePage: jest.fn(),
        updateSettings: jest.fn(),
        updateStyle: jest.fn(),
        updateFooter: jest.fn(),
    };
}

const service = (sites: ReturnType<typeof stubSites>) =>
    new ChangeRevertService(sites as unknown as SitesService);

beforeEach(() => {
    jest.clearAllMocks();
    siteFindFirst.mockResolvedValue({ currentPublication: { snapshot: LIVE } });
});

describe("ChangeRevertService.revert", () => {
    it("saves the page with that section as it is live, and audits it", async () => {
        const sites = stubSites([unit("section:p_bridal:k1")]);
        const out = await service(sites).revert(ctx(), "site_1", {
            unitKey: "section:p_bridal:k1",
            revision: 4,
        });
        const [, , pageId, dto] = sites.replaceDraftSections.mock.calls[0];
        expect(pageId).toBe("p_bridal");
        expect(dto.revision).toBe(4);
        expect(dto.sections[0]).toMatchObject({
            key: "k1",
            content: { heading: "Packages" },
        });
        expect(dto.sections[1]).toMatchObject({
            key: "k2",
            content: { heading: "Trial" },
        });
        expect(out.draft).toMatchObject({ revision: 5 });
        expect(auditCreate.mock.calls[0][0].data).toMatchObject({
            action: "site.change.reverted",
            metadata: { unitKey: "section:p_bridal:k1", kind: "section" },
        });
    });

    it("passes a stale revision's 409 through, unaudited", async () => {
        const sites = stubSites([unit("section:p_bridal:k1")]);
        sites.replaceDraftSections.mockRejectedValue(
            new ConflictException("stale"),
        );
        await expect(
            service(sites).revert(ctx(), "site_1", {
                unitKey: "section:p_bridal:k1",
                revision: 2,
            }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(auditCreate).not.toHaveBeenCalled();
    });

    it("refuses a reader before reading anything", async () => {
        const sites = stubSites([unit("section:p_bridal:k1")]);
        for (const role of ["MEMBER", "REVIEWER"] as const) {
            await expect(
                service(sites).revert(ctx({ role }), "site_1", {
                    unitKey: "section:p_bridal:k1",
                }),
            ).rejects.toBeInstanceOf(ForbiddenException);
        }
        expect(sites.getChanges).not.toHaveBeenCalled();
    });

    it("says so when the change isn't waiting any more", async () => {
        const sites = stubSites([]);
        await expect(
            service(sites).revert(ctx(), "site_1", {
                unitKey: "section:p_bridal:k9",
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("puts a site setting back through its own write", async () => {
        const sites = stubSites([unit("site:search")]);
        await service(sites).revert(ctx(), "site_1", {
            unitKey: "site:search",
        });
        expect(sites.updateSettings).toHaveBeenCalledWith(
            expect.anything(),
            "site_1",
            {
                seoTitle: "Bridal makeup",
                seoDescription: null,
            },
        );
    });

    it("refuses the menu: it can't be put back on its own", async () => {
        const sites = stubSites([unit("site:menu")]);
        await expect(
            service(sites).revert(ctx(), "site_1", { unitKey: "site:menu" }),
        ).rejects.toMatchObject({
            response: { details: { reason: "cantUndo" } },
        });
    });

    it("puts a page's settings back, but not a moved link", async () => {
        const sites = stubSites([unit("page:p_bridal")]);
        pageFindFirst.mockResolvedValue({
            path: "/bridal",
            title: "Bridal",
            seoTitle: null,
            seoDescription: null,
            shareImageUrl: null,
            noindex: false,
        });
        await service(sites).revert(ctx(), "site_1", {
            unitKey: "page:p_bridal",
        });
        expect(sites.updatePage).toHaveBeenCalledWith(
            expect.anything(),
            "site_1",
            "p_bridal",
            {
                title: "Bridal packages",
                seoTitle: null,
                seoDescription: null,
                noindex: false,
            },
        );

        pageFindFirst.mockResolvedValue({ path: "/bridal-2", title: "Bridal" });
        await expect(
            service(sites).revert(ctx(), "site_1", {
                unitKey: "page:p_bridal",
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});

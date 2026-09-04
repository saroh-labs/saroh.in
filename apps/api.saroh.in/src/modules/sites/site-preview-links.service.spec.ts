/**
 * Preview links (#198): minted by an owner, resolved by anyone holding the
 * token, and gone — with a reason — once expired or taken back.
 */
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    return {
        ...actual,
        prisma: {
            site: { findFirst: jest.fn() },
            sitePreviewLink: {
                create: jest.fn(),
                findMany: jest.fn(),
                findFirst: jest.fn(),
                findUnique: jest.fn(),
                update: jest.fn(),
            },
            post: { findMany: jest.fn(), findFirst: jest.fn() },
        },
    };
});

import { GoneException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import {
    previewLinkState,
    SitePreviewLinksService,
} from "./site-preview-links.service";
import type { SitesService } from "./sites.service";

const siteFindFirst = prisma.site.findFirst as jest.Mock;
const linkCreate = prisma.sitePreviewLink.create as jest.Mock;
const linkFindMany = prisma.sitePreviewLink.findMany as jest.Mock;
const linkFindFirst = prisma.sitePreviewLink.findFirst as jest.Mock;
const linkFindUnique = prisma.sitePreviewLink.findUnique as jest.Mock;
const linkUpdate = prisma.sitePreviewLink.update as jest.Mock;
const postFindMany = prisma.post.findMany as jest.Mock;
const postFindFirst = prisma.post.findFirst as jest.Mock;

const OWNER: OrganizationContext = {
    organizationId: "org_1",
    userId: "user_1",
    role: "OWNER",
};
const MEMBER: OrganizationContext = { ...OWNER, role: "MEMBER" };

const loadDraftSite = jest.fn();
const buildSnapshot = jest.fn();
const service = new SitePreviewLinksService({
    loadDraftSite,
    buildSnapshot,
} as unknown as SitesService);

const DAY = 24 * 60 * 60 * 1000;
const row = (over: Partial<Record<string, unknown>> = {}) => ({
    id: "link_1",
    token: "tok",
    createdAt: new Date("2026-09-04T10:00:00Z"),
    expiresAt: new Date(Date.now() + 7 * DAY),
    revokedAt: null,
    lastUsedAt: null,
    createdBy: { name: "Demo Owner" },
    ...over,
});

beforeEach(() => {
    jest.clearAllMocks();
    siteFindFirst.mockResolvedValue({ id: "site_1" });
});

describe("previewLinkState", () => {
    const now = new Date("2026-09-04T12:00:00Z");
    it("is active until the expiry, expired after it, and revoked wins", () => {
        expect(
            previewLinkState(
                { expiresAt: new Date(now.getTime() + 1), revokedAt: null },
                now,
            ),
        ).toBe("active");
        expect(previewLinkState({ expiresAt: now, revokedAt: null }, now)).toBe(
            "expired",
        );
        expect(
            previewLinkState(
                { expiresAt: new Date(now.getTime() + DAY), revokedAt: now },
                now,
            ),
        ).toBe("revoked");
    });
});

describe("SitePreviewLinksService.create", () => {
    it("mints an unguessable token that expires when the sharer chose", async () => {
        linkCreate.mockImplementation(({ data }) =>
            Promise.resolve(
                row({ token: data.token, expiresAt: data.expiresAt }),
            ),
        );
        const before = Date.now();
        const view = await service.create(OWNER, "site_1", {
            expiresInDays: 7,
        });

        const { data } = linkCreate.mock.calls[0][0];
        expect(data.siteId).toBe("site_1");
        expect(data.organizationId).toBe("org_1");
        expect(data.createdByUserId).toBe("user_1");
        // 32 bytes, base64url: 43 characters, no padding, path-safe.
        expect(data.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
        // Seven days from the moment the service read its clock, which is at
        // or after `before` — so at least 7 days from here, and not more
        // than a minute over. The first version asserted "<= 7" against a
        // clock read before the call, and failed on CI by one millisecond.
        const span = data.expiresAt.getTime() - before;
        expect(span).toBeGreaterThanOrEqual(7 * DAY);
        expect(span).toBeLessThan(7 * DAY + 60_000);
        expect(view.state).toBe("active");
    });

    it("is the owner's call: a MEMBER cannot share the draft", async () => {
        await expect(
            service.create(MEMBER, "site_1", { expiresInDays: 1 }),
        ).rejects.toThrow();
        expect(linkCreate).not.toHaveBeenCalled();
    });

    it("404s for a site in another org before writing", async () => {
        siteFindFirst.mockResolvedValue(null);
        await expect(
            service.create(OWNER, "site_1", { expiresInDays: 1 }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(linkCreate).not.toHaveBeenCalled();
    });
});

describe("SitePreviewLinksService.list", () => {
    it("returns every link with its state, newest first, org-scoped", async () => {
        linkFindMany.mockResolvedValue([
            row({ id: "a" }),
            row({ id: "b", expiresAt: new Date(Date.now() - 1) }),
            row({ id: "c", revokedAt: new Date() }),
        ]);
        const views = await service.list(OWNER, "site_1");
        expect(views.map((v) => [v.id, v.state])).toEqual([
            ["a", "active"],
            ["b", "expired"],
            ["c", "revoked"],
        ]);
        expect(linkFindMany.mock.calls[0][0].where).toEqual({
            siteId: "site_1",
            organizationId: "org_1",
        });
    });
});

describe("SitePreviewLinksService.revoke", () => {
    it("stamps revokedAt once, and a second revoke keeps the first time", async () => {
        const first = new Date("2026-09-04T11:00:00Z");
        linkFindFirst.mockResolvedValue({ id: "link_1", revokedAt: first });
        linkUpdate.mockResolvedValue(row({ revokedAt: first }));

        const view = await service.revoke(OWNER, "site_1", "link_1");
        expect(linkUpdate.mock.calls[0][0].data).toEqual({ revokedAt: first });
        expect(view.state).toBe("revoked");
    });

    it("404s for a link that is not this site's", async () => {
        linkFindFirst.mockResolvedValue(null);
        await expect(
            service.revoke(OWNER, "site_1", "link_x"),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});

describe("SitePreviewLinksService.resolve (public)", () => {
    it("builds the draft with the same builder publish uses", async () => {
        linkFindUnique.mockResolvedValue({
            id: "link_1",
            siteId: "site_1",
            organizationId: "org_1",
            expiresAt: new Date(Date.now() + DAY),
            revokedAt: null,
        });
        loadDraftSite.mockResolvedValue({ id: "site_1", name: "Acme" });
        buildSnapshot.mockReturnValue({ site: { name: "Acme" }, pages: [] });
        linkUpdate.mockResolvedValue({ id: "link_1" });

        const view = await service.resolve("tok");

        expect(loadDraftSite.mock.calls[0][0]).toEqual({
            id: "site_1",
            organizationId: "org_1",
            deletedAt: null,
        });
        expect(buildSnapshot).toHaveBeenCalledTimes(1);
        expect(view.site.name).toBe("Acme");
        expect(view.snapshot).toEqual({ site: { name: "Acme" }, pages: [] });
        // Opening the link is recorded, without the page waiting on it.
        expect(linkUpdate.mock.calls[0][0].data.lastUsedAt).toBeInstanceOf(
            Date,
        );
    });

    it("is 410 with the reason once expired", async () => {
        linkFindUnique.mockResolvedValue({
            id: "link_1",
            siteId: "site_1",
            organizationId: "org_1",
            expiresAt: new Date(Date.now() - 1),
            revokedAt: null,
        });
        const err = await service.resolve("tok").catch((e: unknown) => e);
        expect(err).toBeInstanceOf(GoneException);
        expect((err as GoneException).getResponse()).toMatchObject({
            details: { reason: "expired" },
        });
        expect(loadDraftSite).not.toHaveBeenCalled();
    });

    it("is 410 with the reason once revoked — immediately, nothing cached", async () => {
        linkFindUnique.mockResolvedValue({
            id: "link_1",
            siteId: "site_1",
            organizationId: "org_1",
            expiresAt: new Date(Date.now() + DAY),
            revokedAt: new Date(),
        });
        const err = await service.resolve("tok").catch((e: unknown) => e);
        expect(err).toBeInstanceOf(GoneException);
        expect((err as GoneException).getResponse()).toMatchObject({
            details: { reason: "revoked" },
        });
    });

    it("is a plain 404 for a token that never existed", async () => {
        linkFindUnique.mockResolvedValue(null);
        await expect(service.resolve("nope")).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });
});

// ---------------------------------------------------------------------------
// The writing behind a preview (#236)
// ---------------------------------------------------------------------------

const ACTIVE = {
    id: "link_1",
    siteId: "site_1",
    organizationId: "org_1",
    expiresAt: new Date(Date.now() + DAY),
    revokedAt: null,
};

const draft = (over: Partial<Record<string, unknown>> = {}) => ({
    title: "Choosing pallet racking",
    slug: "choosing-pallet-racking",
    excerpt: null,
    content: "<p>Hello</p>",
    image: null,
    featured: false,
    publishedAt: new Date("2026-08-01T00:00:00Z"),
    updatedAt: new Date("2026-08-01T00:00:00Z"),
    currentPublicationId: "pub_1",
    category: null,
    author: { name: "Demo Owner" },
    ...over,
});

describe("SitePreviewLinksService.posts (public)", () => {
    beforeEach(() => linkFindUnique.mockResolvedValue(ACTIVE));

    it("shows the draft of every post, live or not, and says which", async () => {
        postFindMany.mockResolvedValue([
            draft(),
            draft({
                title: "Not out yet",
                slug: "not-out-yet",
                publishedAt: null,
                updatedAt: new Date("2026-09-04T00:00:00Z"),
                currentPublicationId: null,
            }),
        ]);

        const { posts } = await service.posts("tok");

        // A post that has never been published is the NEWEST writing, not the
        // oldest — ordering on publishedAt alone would bury every draft.
        expect(posts.map((p) => p.slug)).toEqual([
            "not-out-yet",
            "choosing-pallet-racking",
        ]);
        expect(posts[0]).toMatchObject({ live: false, publishedAt: null });
        expect(posts[1]).toMatchObject({ live: true });

        // Scoped to the token's own site and org, and reading the DRAFT: the
        // query must not reach for a publication.
        const { where, select } = postFindMany.mock.calls[0][0];
        expect(where).toEqual({
            siteId: "site_1",
            site: { organizationId: "org_1", deletedAt: null },
        });
        expect(select).not.toHaveProperty("currentPublication");
    });

    it("sanitizes the draft, because publish has not", async () => {
        postFindMany.mockResolvedValue([
            draft({
                content: "<p>Fine</p><script>alert(1)</script>",
            }),
        ]);
        const { posts } = await service.posts("tok");
        expect(posts[0]?.content).toBe("<p>Fine</p>");
    });

    it("serves no writing once the link is taken back", async () => {
        linkFindUnique.mockResolvedValue({
            ...ACTIVE,
            revokedAt: new Date(),
        });
        const err = await service.posts("tok").catch((e: unknown) => e);
        expect(err).toBeInstanceOf(GoneException);
        expect((err as GoneException).getResponse()).toMatchObject({
            details: { reason: "revoked" },
        });
        expect(postFindMany).not.toHaveBeenCalled();
    });

    it("is a plain 404 for a token that never existed", async () => {
        linkFindUnique.mockResolvedValue(null);
        await expect(service.posts("nope")).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });
});

describe("SitePreviewLinksService.post (public)", () => {
    beforeEach(() => linkFindUnique.mockResolvedValue(ACTIVE));

    it("reads one post from the draft, scoped to the token's site", async () => {
        postFindFirst.mockResolvedValue(
            draft({ publishedAt: null, currentPublicationId: null }),
        );
        const post = await service.post("tok", "choosing-pallet-racking");

        expect(post).toMatchObject({ live: false, publishedAt: null });
        expect(postFindFirst.mock.calls[0][0].where).toEqual({
            siteId: "site_1",
            slug: "choosing-pallet-racking",
            site: { organizationId: "org_1", deletedAt: null },
        });
    });

    it("404s for a slug this site does not have", async () => {
        postFindFirst.mockResolvedValue(null);
        await expect(service.post("tok", "nope")).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    it("records that the link was opened", async () => {
        postFindFirst.mockResolvedValue(draft());
        await service.post("tok", "choosing-pallet-racking");
        expect(linkUpdate.mock.calls[0][0].data.lastUsedAt).toBeInstanceOf(
            Date,
        );
    });
});

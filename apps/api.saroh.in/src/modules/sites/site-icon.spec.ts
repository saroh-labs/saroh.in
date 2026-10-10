// DB-free: which icon a site shows (DEC-124), with the database mocked.
jest.mock("@saroh/database", () => ({
    prisma: { businessProfile: { findUnique: jest.fn() } },
    runInOrgContext: jest.fn((_org: string, fn: () => unknown) => fn()),
}));

import { prisma, runInOrgContext } from "@saroh/database";

import {
    draftIcon,
    publicSiteIcon,
    siteIconProblem,
    siteIconView,
    snapshotIcon,
} from "./site-icon";

const profileFindUnique = prisma.businessProfile.findUnique as jest.Mock;

const OWN = "https://media.saroh.test/org/org_1/site-image/icon.png";
const LOGO = "https://media.saroh.test/org/org_1/business-logo/logo.webp";

const snapshot = (icon?: unknown) => ({
    site: { name: "Rye", slug: "rye", ...(icon === undefined ? {} : { icon }) },
    pages: [],
});

beforeEach(() => {
    jest.clearAllMocks();
    profileFindUnique.mockResolvedValue(null);
});

describe("what a site icon may be", () => {
    it("takes a PNG, JPG or WebP under 1 MB", () => {
        for (const contentType of ["image/png", "image/jpeg", "image/webp"]) {
            expect(siteIconProblem({ contentType, sizeBytes: 40_000 })).toBe(
                null,
            );
        }
        expect(
            siteIconProblem({
                contentType: "image/png",
                sizeBytes: 1024 * 1024,
            }),
        ).toBe(null);
    });

    it("refuses an SVG, a GIF and anything over 1 MB, in words", () => {
        expect(
            siteIconProblem({ contentType: "image/svg+xml", sizeBytes: 900 }),
        ).toBe("A site icon is a PNG, JPG or WebP image.");
        expect(
            siteIconProblem({ contentType: "image/gif", sizeBytes: 900 }),
        ).toBe("A site icon is a PNG, JPG or WebP image.");
        expect(
            siteIconProblem({
                contentType: "image/png",
                sizeBytes: 1024 * 1024 + 1,
            }),
        ).toBe("A site icon is under 1 MB. Choose a smaller image.");
    });
});

describe("the icon a publish writes", () => {
    it("is the saved address with its media type", () => {
        expect(
            draftIcon({
                iconUrl: OWN,
                iconMedia: { contentType: "image/png" },
            }),
        ).toEqual({ url: OWN, type: "image/png" });
    });

    it("is nothing without one, and has no type once the image is gone", () => {
        expect(draftIcon({ iconUrl: null, iconMedia: null })).toBeNull();
        expect(draftIcon({ iconUrl: OWN, iconMedia: null })).toEqual({
            url: OWN,
            type: null,
        });
    });
});

describe("the icon a snapshot holds", () => {
    it("reads the one publish wrote", () => {
        expect(snapshotIcon(snapshot({ url: OWN, type: "image/png" }))).toEqual(
            { url: OWN, type: "image/png" },
        );
    });

    it("is none for a snapshot from before icons, or a malformed one", () => {
        expect(snapshotIcon(snapshot())).toBeNull();
        expect(snapshotIcon(snapshot(null))).toBeNull();
        expect(snapshotIcon(snapshot("x"))).toBeNull();
        expect(snapshotIcon(null)).toBeNull();
        expect(snapshotIcon({ site: null })).toBeNull();
    });

    it("hands on only a web address, and only a known type", () => {
        expect(
            snapshotIcon(snapshot({ url: "javascript:alert(1)" })),
        ).toBeNull();
        expect(
            snapshotIcon(snapshot({ url: OWN, type: "image/svg+xml" })),
        ).toEqual({ url: OWN, type: null });
    });
});

describe("the icon the public read resolves", () => {
    it("is the site's own when the snapshot has one, and reads no logo", async () => {
        profileFindUnique.mockResolvedValue({
            logoUrl: LOGO,
            logoMedia: { contentType: "image/webp" },
        });
        await expect(
            publicSiteIcon(snapshot({ url: OWN, type: "image/png" }), "org_1"),
        ).resolves.toEqual({ url: OWN, type: "image/png", source: "site" });
        expect(profileFindUnique).not.toHaveBeenCalled();
    });

    it("is the business logo when the site has none, read for the site's business", async () => {
        profileFindUnique.mockResolvedValue({
            logoUrl: LOGO,
            logoMedia: { contentType: "image/webp" },
        });
        await expect(publicSiteIcon(snapshot(), "org_1")).resolves.toEqual({
            url: LOGO,
            type: "image/webp",
            source: "business",
        });
        expect(runInOrgContext).toHaveBeenCalledWith(
            "org_1",
            expect.any(Function),
        );
        expect(profileFindUnique).toHaveBeenCalledWith(
            expect.objectContaining({ where: { organizationId: "org_1" } }),
        );
    });

    it("is none with neither, so the renderer draws the plain tile", async () => {
        await expect(publicSiteIcon(snapshot(), "org_1")).resolves.toBeNull();
        profileFindUnique.mockResolvedValue({ logoUrl: null, logoMedia: null });
        await expect(publicSiteIcon(snapshot(), "org_1")).resolves.toBeNull();
    });

    it("a logo that cannot be read leaves the plain tile, never a failed page", async () => {
        profileFindUnique.mockRejectedValue(new Error("db down"));
        await expect(publicSiteIcon(snapshot(), "org_1")).resolves.toBeNull();
    });
});

describe("the icon as settings read it", () => {
    it("names the site's own and the logo that would stand in", async () => {
        profileFindUnique.mockResolvedValue({ logoUrl: LOGO });
        await expect(
            siteIconView("org_1", { iconUrl: OWN, iconMediaId: "media_1" }),
        ).resolves.toEqual({
            own: { url: OWN, mediaId: "media_1" },
            businessLogoUrl: LOGO,
        });
    });

    it("has neither for a new business", async () => {
        await expect(
            siteIconView("org_1", { iconUrl: null, iconMediaId: null }),
        ).resolves.toEqual({ own: null, businessLogoUrl: null });
    });
});

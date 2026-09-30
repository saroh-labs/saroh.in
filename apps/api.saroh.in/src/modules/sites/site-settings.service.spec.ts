// DB-free unit tests for a site's search and social settings (#188). The
// database package is mocked so nothing touches Postgres.
//
// The behaviour worth pinning is the absent/null distinction: a settings form
// PATCHes what changed, so an omitted field must be left alone and an explicit
// null must clear. Get that backwards and saving a title silently wipes the
// share image.
jest.mock("@saroh/database", () => {
    const client = {
        site: {
            findFirst: jest.fn(),
            update: jest.fn(),
            // "Publishing needs approval" reads the value it replaces (T9).
            findUniqueOrThrow: jest.fn(),
        },
        store: { findFirst: jest.fn() },
        auditEvent: { create: jest.fn() },
        // The setting and its audit event are one transaction, on the same
        // mocked client, so every write is seen here.
        $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(client)),
    };
    return { prisma: client };
});

// Whether test releases are on for the business (`SITE_TEST_RELEASES`).
const flagOn = jest.fn();
jest.mock("../feature-flags/feature-flags.service", () => ({
    FeatureFlagService: jest.fn().mockImplementation(() => ({
        isEnabled: (...args: unknown[]) => flagOn(...args) as unknown,
    })),
}));

import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { EntitlementService } from "../billing/entitlement.service";
import type { OrgAction } from "../organizations/organization-actions";
import { SitesService } from "./sites.service";

const siteFindFirst = prisma.site.findFirst as jest.Mock;
const siteUpdate = prisma.site.update as jest.Mock;
const storeFindFirst = prisma.store.findFirst as jest.Mock;

const OWNER: OrganizationContext = {
    organizationId: "org_1",
    userId: "u_1",
    role: "OWNER",
};
const MEMBER: OrganizationContext = {
    organizationId: "org_1",
    userId: "u_2",
    role: "MEMBER",
};
const SITE = "site_1";

const service = new SitesService({
    check: jest.fn().mockResolvedValue(true),
    can: jest.fn().mockResolvedValue(true),
    getEntitlements: jest.fn(),
} as unknown as EntitlementService);

beforeEach(() => {
    jest.clearAllMocks();
    // assertSiteInOrg's lookup, then the update's returning select.
    siteFindFirst.mockResolvedValue({ id: SITE });
    siteUpdate.mockResolvedValue({
        id: SITE,
        seoTitle: null,
        seoDescription: null,
        socialImageUrl: null,
    });
});

describe("SitesService.updateSettings — absent vs null", () => {
    it("writes only the fields the caller actually sent", async () => {
        await service.updateSettings(OWNER, SITE, {
            seoTitle: "Flour & Ferment · Bermondsey",
        });

        expect(siteUpdate).toHaveBeenCalledTimes(1);
        const { data } = siteUpdate.mock.calls[0][0];
        expect(data).toEqual({ seoTitle: "Flour & Ferment · Bermondsey" });
        // The two it did not send must not appear at all — présent-as-undefined
        // would still be a write in some clients, and a wipe in others.
        expect("seoDescription" in data).toBe(false);
        expect("socialImageUrl" in data).toBe(false);
    });

    it("clears a field when it is sent as null", async () => {
        await service.updateSettings(OWNER, SITE, { socialImageUrl: null });

        const { data } = siteUpdate.mock.calls[0][0];
        expect(data).toEqual({ socialImageUrl: null });
    });

    it("distinguishes clearing one field from leaving the others alone", async () => {
        // The exact case that makes this worth a test: a merchant removes the
        // share image and keeps their title.
        await service.updateSettings(OWNER, SITE, {
            socialImageUrl: null,
            seoTitle: "Kept",
        });

        const { data } = siteUpdate.mock.calls[0][0];
        expect(data).toEqual({ socialImageUrl: null, seoTitle: "Kept" });
        expect("seoDescription" in data).toBe(false);
    });

    it("carries the picture's measurements with it, and clears them with it", async () => {
        // WhatsApp draws its large card only when og:image:width/height are
        // present (#220), so the facts travel with the address — and go when
        // the address goes, or the next picture inherits the last one's size.
        await service.updateSettings(OWNER, SITE, {
            socialImageUrl: "https://cdn.example.com/share.png",
            socialImageWidth: 1200,
            socialImageHeight: 630,
            socialImageBytes: 180_000,
        });
        expect(siteUpdate.mock.calls[0][0].data).toEqual({
            socialImageUrl: "https://cdn.example.com/share.png",
            socialImageWidth: 1200,
            socialImageHeight: 630,
            socialImageBytes: 180_000,
        });

        await service.updateSettings(OWNER, SITE, {
            socialImageUrl: null,
            socialImageWidth: null,
            socialImageHeight: null,
            socialImageBytes: null,
        });
        expect(siteUpdate.mock.calls[1][0].data).toEqual({
            socialImageUrl: null,
            socialImageWidth: null,
            socialImageHeight: null,
            socialImageBytes: null,
        });
    });

    it("writes nothing when the body is empty", async () => {
        await service.updateSettings(OWNER, SITE, {});

        const { data } = siteUpdate.mock.calls[0][0];
        expect(data).toEqual({});
    });

    it("scopes the update to the proven site id", async () => {
        await service.updateSettings(OWNER, SITE, { seoTitle: "x" });
        expect(siteUpdate.mock.calls[0][0].where).toEqual({ id: SITE });
    });
});

describe("SitesService.updateSettings — authorization", () => {
    it("requires site:update, so a MEMBER cannot change what the public sees", async () => {
        await expect(
            service.updateSettings(MEMBER, SITE, { seoTitle: "x" }),
        ).rejects.toBeDefined();
        expect(siteUpdate).not.toHaveBeenCalled();
    });

    it("404s a site outside the actor's organization before writing", async () => {
        siteFindFirst.mockResolvedValue(null);
        await expect(
            service.updateSettings(OWNER, "site_elsewhere", { seoTitle: "x" }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(siteUpdate).not.toHaveBeenCalled();
    });
});

/*
 * The header's name (round 2, G6). The site editor's inspector edits it
 * through this same settings save, so it takes the same gate.
 */
describe("SitesService.updateSettings — the site name (G6)", () => {
    /*
     * A role a business made itself: it may edit blocks but not the site's
     * settings. The inspector shows it the name read-only, and the API is
     * what makes that true — the gate is the capability, never a role name.
     */
    const BLOCKS_ONLY: OrganizationContext = {
        organizationId: "org_1",
        userId: "u_3",
        role: "MEMBER",
        roleKey: "copywriter",
        actions: new Set<OrgAction>(["site:read", "section:write"]),
    };

    it("writes the name and nothing else", async () => {
        await service.updateSettings(OWNER, SITE, { name: "Rye & Co." });

        const { data } = siteUpdate.mock.calls[0][0];
        expect(data).toEqual({ name: "Rye & Co." });
        // The address stays where it is: renaming never moves the site.
        expect("slug" in data).toBe(false);
    });

    it("refuses the name with a 403 to a role that can edit blocks but not the site", async () => {
        await expect(
            service.updateSettings(BLOCKS_ONLY, SITE, { name: "Renamed" }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(siteUpdate).not.toHaveBeenCalled();
    });
});

/*
 * Where the site sells from (round 2, G11): `site:update`, and only an open
 * storefront of the site's own business.
 */
describe("SitesService.updateSettings — sells from (G11)", () => {
    it("saves an open storefront of this business, checked by the actor's organization", async () => {
        storeFindFirst.mockResolvedValue({ id: "st_online" });
        await service.updateSettings(OWNER, SITE, {
            storefrontId: "st_online",
        });
        expect(storeFindFirst).toHaveBeenCalledWith({
            where: {
                id: "st_online",
                organizationId: "org_1",
                deletedAt: null,
            },
            select: { id: true },
        });
        expect(siteUpdate.mock.calls[0][0].data).toEqual({
            storefrontId: "st_online",
        });
    });

    it("refuses another business's storefront, or a closed one, at save", async () => {
        storeFindFirst.mockResolvedValue(null);
        await expect(
            service.updateSettings(OWNER, SITE, {
                storefrontId: "st_other_business",
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(siteUpdate).not.toHaveBeenCalled();
    });

    it("clears the choice with null, without looking a storefront up", async () => {
        await service.updateSettings(OWNER, SITE, { storefrontId: null });
        expect(storeFindFirst).not.toHaveBeenCalled();
        expect(siteUpdate.mock.calls[0][0].data).toEqual({
            storefrontId: null,
        });
    });

    it("needs site:update, like the rest of the settings", async () => {
        await expect(
            service.updateSettings(MEMBER, SITE, { storefrontId: "st_online" }),
        ).rejects.toBeDefined();
        expect(storeFindFirst).not.toHaveBeenCalled();
        expect(siteUpdate).not.toHaveBeenCalled();
    });
});

/*
 * "Publishing needs approval" (DEC-071, T9): an owner's alone, recorded as
 * an audit event in the same transaction, and only with test releases on.
 */
describe("SitesService.updateSettings — Publishing needs approval (T9)", () => {
    const ADMIN: OrganizationContext = {
        organizationId: "org_1",
        userId: "u_4",
        role: "ADMIN",
    };
    const siteRead = prisma.site.findUniqueOrThrow as jest.Mock;
    const auditCreate = prisma.auditEvent.create as jest.Mock;

    beforeEach(() => {
        siteRead.mockResolvedValue({ publishNeedsApproval: false });
        flagOn.mockResolvedValue(true);
    });

    it("lets the owner turn it on, and records who did it", async () => {
        await service.updateSettings(OWNER, SITE, {
            publishNeedsApproval: true,
        });

        expect(siteUpdate).toHaveBeenCalledWith({
            where: { id: SITE },
            data: { publishNeedsApproval: true },
            select: { id: true },
        });
        expect(auditCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({
                action: "site.publish_approval.on",
                actorUserId: "u_1",
                organizationId: "org_1",
                targetType: "site",
                targetId: SITE,
                outcome: "SUCCESS",
                metadata: { from: false, to: true },
            }) as unknown,
            select: { id: true },
        });
    });

    it("records turning it off as its own event", async () => {
        siteRead.mockResolvedValue({ publishNeedsApproval: true });
        await service.updateSettings(OWNER, SITE, {
            publishNeedsApproval: false,
        });
        expect(auditCreate.mock.calls[0][0].data.action).toBe(
            "site.publish_approval.off",
        );
    });

    it("refuses an admin with a 403, and writes nothing", async () => {
        await expect(
            service.updateSettings(ADMIN, SITE, {
                publishNeedsApproval: false,
                seoTitle: "Rye",
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(siteUpdate).not.toHaveBeenCalled();
        expect(auditCreate).not.toHaveBeenCalled();
    });

    it("writes nothing, and records nothing, when it already has that value", async () => {
        siteRead.mockResolvedValue({ publishNeedsApproval: true });
        await service.updateSettings(OWNER, SITE, {
            publishNeedsApproval: true,
        });
        expect(auditCreate).not.toHaveBeenCalled();
        expect(siteUpdate).not.toHaveBeenCalledWith(
            expect.objectContaining({
                data: { publishNeedsApproval: true },
            }),
        );
    });

    it("can't be turned on while test releases are off (409), and can still be turned off", async () => {
        flagOn.mockResolvedValue(false);
        await expect(
            service.updateSettings(OWNER, SITE, {
                publishNeedsApproval: true,
            }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(auditCreate).not.toHaveBeenCalled();

        siteRead.mockResolvedValue({ publishNeedsApproval: true });
        await service.updateSettings(OWNER, SITE, {
            publishNeedsApproval: false,
        });
        expect(auditCreate).toHaveBeenCalledTimes(1);
    });
});

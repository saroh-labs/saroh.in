// #285: two editors on one page must not silently undo each other.
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    return {
        ...actual,
        prisma: {
            // `findMany` for the pending-changes recount the save ends with.
            site: { findFirst: jest.fn(), findMany: jest.fn() },
            page: { findFirst: jest.fn() },
            pageVersion: { findFirst: jest.fn(), update: jest.fn() },
            section: {
                deleteMany: jest.fn(),
                createMany: jest.fn(),
                findMany: jest.fn(),
            },
            $transaction: jest.fn(),
        },
    };
});

import { ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { EntitlementService } from "../billing/entitlement.service";
import { SitesService } from "./sites.service";

const db = prisma as unknown as {
    site: { findFirst: jest.Mock; findMany: jest.Mock };
    page: { findFirst: jest.Mock };
    pageVersion: { findFirst: jest.Mock; update: jest.Mock };
    section: {
        deleteMany: jest.Mock;
        createMany: jest.Mock;
        findMany: jest.Mock;
    };
    $transaction: jest.Mock;
};

const service = new SitesService({
    check: jest.fn(),
    can: jest.fn(),
    getEntitlements: jest.fn(),
} as unknown as EntitlementService);

const ctx: OrganizationContext = {
    organizationId: "org_1",
    userId: "user_1",
    role: "OWNER",
};

const HERO = {
    type: "hero",
    contractVersion: 1,
    content: { heading: "Northwind Supply" },
};

/** The draft as the server holds it, at a given revision. */
function draftAt(revision: number) {
    db.pageVersion.findFirst.mockResolvedValue({ id: "ver_1", revision });
    db.pageVersion.update.mockResolvedValue({ revision: revision + 1 });
}

beforeEach(() => {
    jest.clearAllMocks();
    db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        typeof fn === "function" ? fn(prisma) : Promise.resolve([]),
    );
    db.site.findFirst.mockResolvedValue({
        id: "site_1",
        currentPublicationId: null,
    });
    db.page.findFirst.mockResolvedValue({ id: "page_1" });
    // The recount after the transaction: no sites, so no counting to do.
    db.site.findMany.mockResolvedValue([]);
    db.section.deleteMany.mockResolvedValue({ count: 0 });
    db.section.createMany.mockResolvedValue({ count: 1 });
    db.section.findMany.mockResolvedValue([]);
    draftAt(3);
});

describe("saving a draft against the revision it was read at (#285)", () => {
    it("saves, and hands back the revision the next save must send", async () => {
        const result = await service.replaceDraftSections(
            ctx,
            "site_1",
            "page_1",
            {
                sections: [HERO],
                revision: 3,
            },
        );

        expect(db.section.createMany).toHaveBeenCalled();
        expect(result.revision).toBe(4);
        expect(db.pageVersion.update.mock.calls[0][0].data).toEqual({
            revision: { increment: 1 },
        });
    });

    it("refuses a save built on an older revision, and writes nothing", async () => {
        // The other tab saved while this one was editing: the draft is at 3,
        // this editor still holds 2.
        await expect(
            service.replaceDraftSections(ctx, "site_1", "page_1", {
                sections: [HERO],
                revision: 2,
            }),
        ).rejects.toBeInstanceOf(ConflictException);

        // Nothing deleted, nothing written — the other editor's work survives.
        expect(db.section.deleteMany).not.toHaveBeenCalled();
        expect(db.section.createMany).not.toHaveBeenCalled();
        expect(db.pageVersion.update).not.toHaveBeenCalled();
    });

    it("says which revision the caller had and which one is current", async () => {
        const error = await service
            .replaceDraftSections(ctx, "site_1", "page_1", {
                sections: [HERO],
                revision: 1,
            })
            .catch((e: ConflictException) => e.getResponse());

        expect(error).toMatchObject({
            code: "DRAFT_REVISION_MISMATCH",
            yours: 1,
            current: 3,
        });
    });

    it("trusts a caller that sends no revision at all", async () => {
        // A client that never read the draft cannot be overwriting an edit it
        // saw, and requiring the field would have broken every caller the day
        // it shipped.
        await expect(
            service.replaceDraftSections(ctx, "site_1", "page_1", {
                sections: [HERO],
            }),
        ).resolves.toMatchObject({ revision: 4 });
    });

    it("refuses a save from before the draft existed", async () => {
        // A fresh DRAFT starts at 0; an editor holding anything else is stale.
        draftAt(0);

        await expect(
            service.replaceDraftSections(ctx, "site_1", "page_1", {
                sections: [HERO],
                revision: 7,
            }),
        ).rejects.toBeInstanceOf(ConflictException);
    });
});

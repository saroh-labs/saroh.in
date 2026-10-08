jest.mock("@saroh/database", () => ({
    prisma: {
        featureFlag: { findMany: jest.fn() },
        featureFlagOverride: { findMany: jest.fn() },
        featureFlagAudit: { findMany: jest.fn() },
        user: { findMany: jest.fn() },
        organization: { findMany: jest.fn() },
    },
}));

import { prisma } from "@saroh/database";

import { FLAG_KEYS } from "../feature-flags/flags";
import { AdminFlagsService } from "./admin-flags.service";

const audit = prisma.featureFlagAudit.findMany as jest.Mock;
const users = prisma.user.findMany as jest.Mock;
const orgs = prisma.organization.findMany as jest.Mock;

describe("AdminFlagsService", () => {
    const service = new AdminFlagsService();
    beforeEach(() => jest.clearAllMocks());

    it("lists every flag with the name a business sees and its group", async () => {
        (prisma.featureFlag.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.featureFlagOverride.findMany as jest.Mock).mockResolvedValue(
            [],
        );
        const flags = await service.list();
        expect(flags).toHaveLength(FLAG_KEYS.length);
        const payments = flags.find((flag) => flag.key === "MODULE_PAYMENTS");
        expect(payments?.metadata.shownAs).toBe("Payments");
        expect(payments?.metadata.group).toBe("module");
    });

    it("names who changed a flag and for which business, newest first", async () => {
        audit.mockResolvedValue([
            {
                id: "a2",
                organizationId: "org_1",
                previousValue: null,
                newValue: true,
                actorUserId: "u_1",
                reason: "Rolling out",
                createdAt: new Date("2026-10-08T10:00:00Z"),
            },
            {
                id: "a1",
                organizationId: null,
                previousValue: null,
                newValue: false,
                actorUserId: "u_2",
                reason: "Registered",
                createdAt: new Date("2026-10-07T10:00:00Z"),
            },
        ]);
        users.mockResolvedValue([
            { id: "u_1", name: "Asha", email: "asha@example.com" },
            { id: "u_2", name: null, email: "ops@example.com" },
        ]);
        orgs.mockResolvedValue([{ id: "org_1", name: "Rye & Co." }]);

        const history = await service.history("MODULE_PAYMENTS");

        expect(audit).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { flagKey: "MODULE_PAYMENTS" },
                take: 20,
            }),
        );
        expect(history.map((row) => row.actorName)).toEqual([
            "Asha",
            "ops@example.com",
        ]);
        expect(history[0]?.organizationName).toBe("Rye & Co.");
        expect(history[1]?.organizationName).toBeNull();
    });

    it("reads no names when the flag has never changed", async () => {
        audit.mockResolvedValue([]);
        await expect(service.history("SITE_SHOP")).resolves.toEqual([]);
        expect(users).not.toHaveBeenCalled();
        expect(orgs).not.toHaveBeenCalled();
    });
});

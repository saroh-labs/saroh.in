// Mock the database package so the service never touches a real Postgres.
// $transaction is mocked to invoke its callback with the same prisma mock as
// the `tx` client, mirroring how the real interactive transaction works.
jest.mock("@saroh/database", () => {
    const prisma = {
        featureFlag: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
            upsert: jest.fn(),
        },
        featureFlagOverride: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
            upsert: jest.fn(),
            delete: jest.fn(),
        },
        featureFlagAudit: {
            create: jest.fn(),
            findMany: jest.fn(),
        },
        $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    return { prisma };
});

import { prisma } from "@saroh/database";

import { FeatureFlagService } from "./feature-flags.service";
import { FLAG_KEYS, FlagKey } from "./flags";

const flagFindUnique = prisma.featureFlag.findUnique as jest.Mock;
const flagFindMany = prisma.featureFlag.findMany as jest.Mock;
const flagUpsert = prisma.featureFlag.upsert as jest.Mock;
const overrideFindUnique = prisma.featureFlagOverride.findUnique as jest.Mock;
const overrideFindMany = prisma.featureFlagOverride.findMany as jest.Mock;
const overrideUpsert = prisma.featureFlagOverride.upsert as jest.Mock;
const auditCreate = prisma.featureFlagAudit.create as jest.Mock;
const overrideDelete = prisma.featureFlagOverride.delete as jest.Mock;

describe("FeatureFlagService.isEnabled — precedence", () => {
    const service = new FeatureFlagService();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("returns the org override when one exists (override > default)", async () => {
        overrideFindUnique.mockResolvedValue({ enabled: true });
        flagFindUnique.mockResolvedValue({ enabledByDefault: false });

        const result = await service.isEnabled(
            FlagKey.ORG_AUTHORIZATION,
            "org_1",
        );

        expect(result).toBe(true);
        // Override short-circuits — the global default is never consulted.
        expect(flagFindUnique).not.toHaveBeenCalled();
        expect(overrideFindUnique).toHaveBeenCalledWith({
            where: {
                flagKey_organizationId: {
                    flagKey: FlagKey.ORG_AUTHORIZATION,
                    organizationId: "org_1",
                },
            },
            select: { enabled: true },
        });
    });

    it("falls back to the global default when no override exists", async () => {
        overrideFindUnique.mockResolvedValue(null);
        flagFindUnique.mockResolvedValue({ enabledByDefault: true });

        const result = await service.isEnabled(
            FlagKey.ORG_AUTHORIZATION,
            "org_1",
        );

        expect(result).toBe(true);
        expect(flagFindUnique).toHaveBeenCalled();
    });

    it("uses the global default when no organizationId is given", async () => {
        flagFindUnique.mockResolvedValue({ enabledByDefault: true });

        const result = await service.isEnabled(FlagKey.ORG_AUTHORIZATION);

        expect(result).toBe(true);
        expect(overrideFindUnique).not.toHaveBeenCalled();
    });

    it("returns false when the flag has no global definition row", async () => {
        overrideFindUnique.mockResolvedValue(null);
        flagFindUnique.mockResolvedValue(null);

        const result = await service.isEnabled(
            FlagKey.ORG_AUTHORIZATION,
            "org_1",
        );

        expect(result).toBe(false);
    });

    it("returns a disabled override even when the default is enabled", async () => {
        overrideFindUnique.mockResolvedValue({ enabled: false });

        const result = await service.isEnabled(
            FlagKey.ORG_AUTHORIZATION,
            "org_1",
        );

        expect(result).toBe(false);
        expect(flagFindUnique).not.toHaveBeenCalled();
    });
});

describe("FeatureFlagService.isEnabled — unknown key", () => {
    const service = new FeatureFlagService();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("fails closed to false and never queries the DB", async () => {
        const warn = jest
            .spyOn(
                (service as unknown as { logger: { warn: () => void } }).logger,
                "warn",
            )
            .mockImplementation(() => undefined);

        const result = await service.isEnabled(
            "NOPE_NOT_A_FLAG" as FlagKey,
            "org_1",
        );

        expect(result).toBe(false);
        expect(overrideFindUnique).not.toHaveBeenCalled();
        expect(flagFindUnique).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalled();
    });
});

describe("FeatureFlagService.setGlobal", () => {
    const service = new FeatureFlagService();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("upserts the flag and appends an audit row in a transaction", async () => {
        flagFindUnique.mockResolvedValue({ enabledByDefault: false });

        await service.setGlobal(FlagKey.ORG_AUTHORIZATION, true, "user_1");

        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(flagUpsert).toHaveBeenCalledWith({
            where: { key: FlagKey.ORG_AUTHORIZATION },
            create: { key: FlagKey.ORG_AUTHORIZATION, enabledByDefault: true },
            update: { enabledByDefault: true },
        });
        expect(auditCreate).toHaveBeenCalledWith({
            data: {
                flagKey: FlagKey.ORG_AUTHORIZATION,
                organizationId: null,
                previousValue: false,
                newValue: true,
                actorUserId: "user_1",
            },
        });
    });

    it("records a null previousValue when the flag did not exist", async () => {
        flagFindUnique.mockResolvedValue(null);

        await service.setGlobal(FlagKey.ORG_AUTHORIZATION, true, "user_1");

        expect(auditCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ previousValue: null }),
            }),
        );
    });
});

describe("FeatureFlagService.setOverride", () => {
    const service = new FeatureFlagService();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("upserts the override and appends an audit row in a transaction", async () => {
        overrideFindUnique.mockResolvedValue({ enabled: true });

        await service.setOverride(
            FlagKey.ORG_AUTHORIZATION,
            "org_1",
            false,
            "user_1",
        );

        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(overrideUpsert).toHaveBeenCalledWith({
            where: {
                flagKey_organizationId: {
                    flagKey: FlagKey.ORG_AUTHORIZATION,
                    organizationId: "org_1",
                },
            },
            create: {
                flagKey: FlagKey.ORG_AUTHORIZATION,
                organizationId: "org_1",
                enabled: false,
            },
            update: { enabled: false },
        });
        expect(auditCreate).toHaveBeenCalledWith({
            data: {
                flagKey: FlagKey.ORG_AUTHORIZATION,
                organizationId: "org_1",
                previousValue: true,
                newValue: false,
                actorUserId: "user_1",
            },
        });
    });
});

describe("FeatureFlagService.list", () => {
    const service = new FeatureFlagService();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("resolves each flag with override > default > fallback", async () => {
        flagFindMany.mockResolvedValue([
            { key: FlagKey.ORG_AUTHORIZATION, enabledByDefault: false },
        ]);
        overrideFindMany.mockResolvedValue([
            { flagKey: FlagKey.ORG_AUTHORIZATION, enabled: true },
        ]);

        const result = await service.list("org_1");

        // list() resolves every registered flag; ORG_AUTHORIZATION is overridden
        // on, the rest (the module rollout flags) fall back to false.
        expect(result).toHaveLength(FLAG_KEYS.length);
        expect(result).toContainEqual({
            key: FlagKey.ORG_AUTHORIZATION,
            enabled: true,
            source: "override",
        });
    });

    it("uses the global default and never queries overrides without an org", async () => {
        flagFindMany.mockResolvedValue([
            { key: FlagKey.ORG_AUTHORIZATION, enabledByDefault: true },
        ]);

        const result = await service.list();

        expect(result).toHaveLength(FLAG_KEYS.length);
        expect(result).toContainEqual({
            key: FlagKey.ORG_AUTHORIZATION,
            enabled: true,
            source: "default",
        });
        expect(overrideFindMany).not.toHaveBeenCalled();
    });

    it("falls back to false for a registered flag with no default row", async () => {
        flagFindMany.mockResolvedValue([]);
        overrideFindMany.mockResolvedValue([]);

        const result = await service.list("org_1");

        // No default rows and no overrides: every registered flag falls back.
        expect(result).toHaveLength(FLAG_KEYS.length);
        expect(
            result.every((f) => f.enabled === false && f.source === "fallback"),
        ).toBe(true);
        expect(result).toContainEqual({
            key: FlagKey.ORG_AUTHORIZATION,
            enabled: false,
            source: "fallback",
        });
    });
});

describe("FeatureFlagService.clearOverride", () => {
    const service = new FeatureFlagService();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("deletes the override and audits the value the org now inherits", async () => {
        overrideFindUnique.mockResolvedValue({ enabled: true });
        flagFindUnique.mockResolvedValue({ enabledByDefault: false });

        await service.clearOverride(
            FlagKey.MODULE_CRM,
            "org_1",
            "user_1",
            "beta over",
        );

        expect(overrideDelete).toHaveBeenCalledWith({
            where: {
                flagKey_organizationId: {
                    flagKey: FlagKey.MODULE_CRM,
                    organizationId: "org_1",
                },
            },
        });
        expect(auditCreate).toHaveBeenCalledWith({
            data: {
                flagKey: FlagKey.MODULE_CRM,
                organizationId: "org_1",
                previousValue: true,
                // Falls back to the global default, not to `false` blindly.
                newValue: false,
                actorUserId: "user_1",
                reason: "beta over",
            },
        });
    });

    it("records the global default as the new effective value", async () => {
        overrideFindUnique.mockResolvedValue({ enabled: false });
        flagFindUnique.mockResolvedValue({ enabledByDefault: true });

        await service.clearOverride(
            FlagKey.MODULE_CRM,
            "org_1",
            "user_1",
            "why",
        );

        expect(auditCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ newValue: true }),
            }),
        );
    });

    it("treats a missing global row as the fail-closed false", async () => {
        overrideFindUnique.mockResolvedValue({ enabled: true });
        flagFindUnique.mockResolvedValue(null);

        await service.clearOverride(
            FlagKey.MODULE_CRM,
            "org_1",
            "user_1",
            "why",
        );

        expect(auditCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ newValue: false }),
            }),
        );
    });

    it("is a no-op with no audit row when there is no override to clear", async () => {
        overrideFindUnique.mockResolvedValue(null);

        await service.clearOverride(
            FlagKey.MODULE_CRM,
            "org_1",
            "user_1",
            "why",
        );

        expect(overrideDelete).not.toHaveBeenCalled();
        expect(auditCreate).not.toHaveBeenCalled();
    });
});

describe("FeatureFlagService — change reason", () => {
    const service = new FeatureFlagService();

    beforeEach(() => {
        jest.clearAllMocks();
        flagFindUnique.mockResolvedValue({ enabledByDefault: false });
        overrideFindUnique.mockResolvedValue(null);
    });

    it("records the operator's reason on a global change", async () => {
        await service.setGlobal(
            FlagKey.MODULE_CRM,
            true,
            "user_1",
            "CRM GA rollout",
        );

        expect(auditCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    actorUserId: "user_1",
                    reason: "CRM GA rollout",
                }),
            }),
        );
    });

    it("records the operator's reason on an org override", async () => {
        await service.setOverride(
            FlagKey.MODULE_CRM,
            "org_1",
            true,
            "user_1",
            "internal pilot",
        );

        expect(auditCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    organizationId: "org_1",
                    reason: "internal pilot",
                }),
            }),
        );
    });
});

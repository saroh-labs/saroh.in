jest.mock("@saroh/database", () => ({
    prisma: { organization: { findUnique: jest.fn() } },
}));

import { ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContextService } from "./organization-context.service";
import {
    assertOrganizationOpen,
    isReadOnlyMethod,
} from "./organization-lifecycle.gate";

const findUnique = prisma.organization.findUnique as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe("assertOrganizationOpen", () => {
    it("lets an active business through", async () => {
        findUnique.mockResolvedValue({ lifecycleStatus: "ACTIVE" });
        await expect(assertOrganizationOpen("org_1")).resolves.toBeUndefined();
    });

    it.each(["SUSPENDED", "PENDING_DELETION", "DELETED_RETAINED"])(
        "refuses new activity for a %s business",
        async (status) => {
            findUnique.mockResolvedValue({ lifecycleStatus: status });
            await expect(
                assertOrganizationOpen("org_1"),
            ).rejects.toBeInstanceOf(ForbiddenException);
        },
    );

    it("reads on every call, so lifting a suspension works at once", async () => {
        findUnique
            .mockResolvedValueOnce({ lifecycleStatus: "SUSPENDED" })
            .mockResolvedValueOnce({ lifecycleStatus: "ACTIVE" });
        await expect(assertOrganizationOpen("org_1")).rejects.toThrow();
        await expect(assertOrganizationOpen("org_1")).resolves.toBeUndefined();
    });

    it("knows which methods only read", () => {
        expect(["GET", "HEAD", "OPTIONS"].every(isReadOnlyMethod)).toBe(true);
        expect(["POST", "PUT", "PATCH", "DELETE"].some(isReadOnlyMethod)).toBe(
            false,
        );
    });
});

describe("OrganizationGuard on a suspended business", () => {
    const resolve = jest.fn(async () => ({
        organizationId: "org_1",
        userId: "user_1",
        role: "OWNER" as const,
    }));
    const guard = new OrganizationGuard({
        resolve,
    } as unknown as OrganizationContextService);

    const contextFor = (method: string) =>
        ({
            switchToHttp: () => ({
                getRequest: () => ({
                    method,
                    params: { organizationId: "org_1" },
                    headers: {},
                    user: { id: "user_1" },
                }),
            }),
        }) as never;

    beforeEach(() =>
        findUnique.mockResolvedValue({ lifecycleStatus: "SUSPENDED" }),
    );

    it("still lets its members read", async () => {
        await expect(guard.canActivate(contextFor("GET"))).resolves.toBe(true);
        expect(findUnique).not.toHaveBeenCalled();
    });

    it("refuses a write", async () => {
        await expect(
            guard.canActivate(contextFor("POST")),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });
});

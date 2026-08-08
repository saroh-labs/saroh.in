import { ForbiddenException } from "@nestjs/common";

// The controller references guards only via `@UseGuards()` decorators. Stub the
// guard modules so importing the controller doesn't pull in `better-auth`'s ESM
// (which ts-jest can't transform) — this keeps the spec a pure, DB-free unit
// test of the read-authorization rule.
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class {},
}));
jest.mock("../../common/guards/organization.guard", () => ({
    OrganizationGuard: class {},
}));

import type {
    OrganizationContext,
    OrgRole,
} from "../../common/types/organization-context";
import { AuditController } from "./audit.controller";
import type { AuditService } from "./audit.service";

function ctx(role: OrgRole): OrganizationContext {
    return { organizationId: "org_1", userId: "user_1", role };
}

describe("AuditController.list authorization (S1-009)", () => {
    const listForOrganization = jest.fn().mockResolvedValue({
        events: [],
        nextCursor: null,
    });
    const audit = { listForOrganization } as unknown as AuditService;
    const controller = new AuditController(audit);

    beforeEach(() => jest.clearAllMocks());

    it("allows OWNER to read the audit stream", async () => {
        await controller.list(ctx("OWNER"));
        expect(listForOrganization).toHaveBeenCalledWith("org_1", {
            limit: undefined,
            cursor: undefined,
        });
    });

    it("allows ADMIN to read the audit stream", async () => {
        await controller.list(ctx("ADMIN"));
        expect(listForOrganization).toHaveBeenCalledTimes(1);
    });

    it("denies a MEMBER (403) and never touches the service", () => {
        // MEMBER is authenticated and a real member (guard passed) but the
        // policy forbids audit:read — tamper/read-authorization guard.
        expect(() => controller.list(ctx("MEMBER"))).toThrow(
            ForbiddenException,
        );
        expect(listForOrganization).not.toHaveBeenCalled();
    });

    it("parses limit and cursor query params for OWNER", async () => {
        await controller.list(ctx("OWNER"), "25", "evt_9");
        expect(listForOrganization).toHaveBeenCalledWith("org_1", {
            limit: 25,
            cursor: "evt_9",
        });
    });
});

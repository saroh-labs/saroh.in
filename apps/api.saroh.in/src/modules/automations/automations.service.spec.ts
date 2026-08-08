// DB-free unit tests: @saroh/database is mocked so nothing touches Postgres.
jest.mock("@saroh/database", () => ({
    Prisma: {},
    prisma: {
        automationRule: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        },
    },
}));

import {
    BadRequestException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type {
    OrganizationContext,
    OrgRole,
} from "../../common/types/organization-context";
import { AutomationsService } from "./automations.service";
import { CreateAutomationRuleDto, UpdateAutomationRuleDto } from "./dto";

const findMany = prisma.automationRule.findMany as jest.Mock;
const findUnique = prisma.automationRule.findUnique as jest.Mock;
const create = prisma.automationRule.create as jest.Mock;
const update = prisma.automationRule.update as jest.Mock;
const del = prisma.automationRule.delete as jest.Mock;

function ctx(role: OrgRole = "OWNER"): OrganizationContext {
    return { organizationId: "org_1", userId: "user_1", role };
}

/** A stored send.message rule owned by org_1. */
const storedRule = {
    id: "rule_1",
    organizationId: "org_1",
    name: "Welcome",
    trigger: "lead.created",
    action: "send.message",
    config: { channel: "EMAIL", body: "Hi" },
    enabled: true,
};

describe("AutomationsService", () => {
    let service: AutomationsService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new AutomationsService();
        findUnique.mockResolvedValue(storedRule);
        create.mockImplementation(({ data }) =>
            Promise.resolve({ id: "rule_new", ...data }),
        );
        update.mockImplementation(({ data }) =>
            Promise.resolve({ ...storedRule, ...data }),
        );
        del.mockResolvedValue({});
        findMany.mockResolvedValue([storedRule]);
    });

    // ---- authorization ----------------------------------------------------

    it("denies a MEMBER every operation (automation:manage is OWNER/ADMIN-only)", async () => {
        await expect(service.list(ctx("MEMBER"))).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        await expect(
            service.get(ctx("MEMBER"), "rule_1"),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
            service.create(ctx("MEMBER"), validCreate()),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
            service.remove(ctx("MEMBER"), "rule_1"),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(create).not.toHaveBeenCalled();
        expect(del).not.toHaveBeenCalled();
    });

    it("allows an ADMIN to manage rules", async () => {
        await expect(service.list(ctx("ADMIN"))).resolves.toEqual([storedRule]);
    });

    // ---- tenant isolation -------------------------------------------------

    it("404s a cross-tenant rule id on read (never a 403 — no cross-org probing)", async () => {
        findUnique.mockResolvedValue({
            ...storedRule,
            organizationId: "other",
        });
        await expect(service.get(ctx(), "rule_1")).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    it("404s a missing rule on update and delete", async () => {
        findUnique.mockResolvedValue(null);
        await expect(
            service.update(ctx(), "gone", { name: "x" }),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(service.remove(ctx(), "gone")).rejects.toBeInstanceOf(
            NotFoundException,
        );
        expect(update).not.toHaveBeenCalled();
        expect(del).not.toHaveBeenCalled();
    });

    // ---- create + config validation ---------------------------------------

    it("creates a rule stamped with the org + creating user, defaulting enabled to true", async () => {
        await service.create(ctx(), validCreate());
        expect(create.mock.calls[0][0].data).toMatchObject({
            organizationId: "org_1",
            createdByUserId: "user_1",
            trigger: "lead.created",
            action: "send.message",
            enabled: true,
        });
    });

    it("rejects a send.message config missing a body (400 before any write)", async () => {
        const dto = validCreate();
        dto.config = { channel: "EMAIL" };
        await expect(service.create(ctx(), dto)).rejects.toBeInstanceOf(
            BadRequestException,
        );
        expect(create).not.toHaveBeenCalled();
    });

    it("rejects a send.message config with an unsupported channel", async () => {
        const dto = validCreate();
        dto.config = { channel: "CARRIER_PIGEON", body: "hi" };
        await expect(service.create(ctx(), dto)).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });

    it("rejects a create.task config with an out-of-range dueInDays", async () => {
        const dto = validCreate();
        dto.action = "create.task";
        dto.config = { body: "call", dueInDays: 9999 };
        await expect(service.create(ctx(), dto)).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });

    // ---- update: action/config pairing ------------------------------------

    it("requires a matching config when changing the action", async () => {
        const dto: UpdateAutomationRuleDto = { action: "create.task" };
        await expect(
            service.update(ctx(), "rule_1", dto),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(update).not.toHaveBeenCalled();
    });

    it("re-validates a new config against the EXISTING action", async () => {
        // Existing action is send.message; a config without a body is invalid.
        const dto: UpdateAutomationRuleDto = { config: { channel: "EMAIL" } };
        await expect(
            service.update(ctx(), "rule_1", dto),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("toggles enabled without touching action/config", async () => {
        await service.update(ctx(), "rule_1", { enabled: false });
        expect(update.mock.calls[0][0].data).toEqual({ enabled: false });
    });

    it("accepts a coherent action+config change", async () => {
        const dto: UpdateAutomationRuleDto = {
            action: "create.task",
            config: { body: "Follow up", dueInDays: 3 },
        };
        await expect(
            service.update(ctx(), "rule_1", dto),
        ).resolves.toBeDefined();
        expect(update.mock.calls[0][0].data).toMatchObject({
            action: "create.task",
        });
    });
});

/** A valid create DTO (send.message). */
function validCreate(): CreateAutomationRuleDto {
    const dto = new CreateAutomationRuleDto();
    dto.name = "Welcome email";
    dto.trigger = "lead.created";
    dto.action = "send.message";
    dto.config = { channel: "EMAIL", subject: "Hi", body: "Thanks!" };
    return dto;
}

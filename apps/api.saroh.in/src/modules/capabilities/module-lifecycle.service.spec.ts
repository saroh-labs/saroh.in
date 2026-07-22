import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
} from "@nestjs/common";

import type { OrganizationContext } from "../../common/types/organization-context";
import { ModuleLifecycleService } from "./module-lifecycle.service";
import type { ModuleReadinessRegistry } from "./readiness/module-readiness.registry";

const OWNER: OrganizationContext = {
    organizationId: "org_1",
    userId: "user_1",
    role: "OWNER",
};
const MEMBER: OrganizationContext = { ...OWNER, role: "MEMBER" };

function makeDb() {
    const db = {
        organizationModule: {
            findMany: jest.fn().mockResolvedValue([]),
            findUnique: jest.fn().mockResolvedValue(null),
            upsert: jest.fn().mockResolvedValue({}),
        },
        project: {
            findFirst: jest.fn().mockResolvedValue({ id: "proj_1" }),
        },
        projectModule: {
            upsert: jest.fn().mockResolvedValue({}),
            deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        auditEvent: {
            create: jest.fn().mockResolvedValue({}),
        },
        $transaction: jest.fn((cb: (tx: unknown) => unknown): unknown =>
            cb(db),
        ),
    };
    return db;
}

function makeReadiness(blockers: unknown[] = []) {
    return {
        deactivationBlockers: jest.fn().mockResolvedValue(blockers),
    } as unknown as ModuleReadinessRegistry;
}

describe("ModuleLifecycleService", () => {
    it("denies a MEMBER (module:manage required)", async () => {
        const db = makeDb();
        const svc = new ModuleLifecycleService(makeReadiness(), db as never);
        await expect(svc.enable(MEMBER, "CRM")).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        expect(db.organizationModule.upsert).not.toHaveBeenCalled();
    });

    it("enable refuses a module with an unmet dependency", async () => {
        const db = makeDb(); // no CRM enabled
        const svc = new ModuleLifecycleService(makeReadiness(), db as never);
        await expect(svc.enable(OWNER, "APPOINTMENTS")).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });

    it("enable writes an ENABLED row and an audit event in one tx", async () => {
        const db = makeDb();
        const svc = new ModuleLifecycleService(makeReadiness(), db as never);
        await svc.enable(OWNER, "CRM");
        expect(db.$transaction).toHaveBeenCalledTimes(1);
        expect(db.organizationModule.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                create: expect.objectContaining({ status: "ENABLED" }),
            }),
        );
        expect(db.auditEvent.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    action: "organization.module.enabled",
                    actorUserId: "user_1",
                    targetId: "CRM",
                }),
            }),
        );
    });

    it("disable is blocked while an enabled module depends on it", async () => {
        const db = makeDb();
        db.organizationModule.findMany.mockResolvedValue([
            { moduleKey: "APPOINTMENTS" },
        ]);
        const svc = new ModuleLifecycleService(makeReadiness(), db as never);
        await expect(svc.disable(OWNER, "CRM")).rejects.toBeInstanceOf(
            ConflictException,
        );
        expect(db.organizationModule.upsert).not.toHaveBeenCalled();
    });

    it("disable is blocked by a safe-deactivation blocker", async () => {
        const db = makeDb();
        const readiness = makeReadiness([
            { code: "COMMERCE_OPEN_ORDERS", message: "x" },
        ]);
        const svc = new ModuleLifecycleService(readiness, db as never);
        await expect(svc.disable(OWNER, "COMMERCE")).rejects.toBeInstanceOf(
            ConflictException,
        );
        expect(db.organizationModule.upsert).not.toHaveBeenCalled();
    });

    it("disable writes a DISABLED row when safe", async () => {
        const db = makeDb();
        const svc = new ModuleLifecycleService(makeReadiness(), db as never);
        await svc.disable(OWNER, "WEBSITE");
        expect(db.organizationModule.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                create: expect.objectContaining({ status: "DISABLED" }),
            }),
        );
        expect(db.auditEvent.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    action: "organization.module.disabled",
                }),
            }),
        );
    });

    it("selectForProject requires the module enabled for the Organization", async () => {
        const db = makeDb();
        db.organizationModule.findUnique.mockResolvedValue({
            id: "om_1",
            status: "DISABLED",
        });
        const svc = new ModuleLifecycleService(makeReadiness(), db as never);
        await expect(
            svc.selectForProject(OWNER, "proj_1", "CRM"),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("selectForProject links an enabled module to a same-org Project", async () => {
        const db = makeDb();
        db.organizationModule.findUnique.mockResolvedValue({
            id: "om_1",
            status: "ENABLED",
        });
        const svc = new ModuleLifecycleService(makeReadiness(), db as never);
        await svc.selectForProject(OWNER, "proj_1", "CRM");
        expect(db.projectModule.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                create: expect.objectContaining({
                    organizationId: "org_1",
                    projectId: "proj_1",
                    organizationModuleId: "om_1",
                }),
            }),
        );
        expect(db.auditEvent.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    action: "organization.module.project.selected",
                    projectId: "proj_1",
                }),
            }),
        );
    });
});

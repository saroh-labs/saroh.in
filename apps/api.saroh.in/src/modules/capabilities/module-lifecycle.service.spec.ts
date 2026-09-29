import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
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

    it("enable refuses Class packs while Appointments is off, in a sentence (E12)", async () => {
        const db = makeDb(); // Appointments not enabled
        const svc = new ModuleLifecycleService(makeReadiness(), db as never);
        const refused = svc.enable(OWNER, "CLASS_PACKS");
        await expect(refused).rejects.toBeInstanceOf(BadRequestException);
        await expect(refused).rejects.toThrow(
            "Class packs needs Appointments. Turn on Appointments first.",
        );
        expect(db.organizationModule.upsert).not.toHaveBeenCalled();
    });

    it("disable refuses Appointments while Class packs is on, in a sentence", async () => {
        const db = makeDb();
        db.organizationModule.findUnique.mockResolvedValue({
            status: "ENABLED",
        });
        db.organizationModule.findMany.mockResolvedValue([
            { moduleKey: "CLASS_PACKS" },
        ]);
        const svc = new ModuleLifecycleService(makeReadiness(), db as never);
        const refused = svc.disable(OWNER, "APPOINTMENTS");
        await expect(refused).rejects.toBeInstanceOf(ConflictException);
        await expect(refused).rejects.toThrow(
            "Class packs needs Appointments. Turn off Class packs first.",
        );
    });

    it("disable isn't held up by a dependent Saroh hasn't rolled out, and leaves it as it is (F13, DEC-067)", async () => {
        const db = makeDb();
        db.organizationModule.findUnique.mockResolvedValue({
            status: "ENABLED",
        });
        db.organizationModule.findMany.mockResolvedValue([
            { moduleKey: "CLASS_PACKS" },
        ]);
        const flags = {
            isEnabled: jest.fn((flag: string) =>
                Promise.resolve(flag !== "MODULE_CLASS_PACKS"),
            ),
        };
        const svc = new ModuleLifecycleService(
            makeReadiness(),
            db as never,
            undefined,
            flags as never,
        );
        await svc.disable(OWNER, "APPOINTMENTS");
        // Only Appointments is written: the hidden Class packs keeps its
        // own setting, never switched off without being named.
        expect(db.organizationModule.upsert).toHaveBeenCalledTimes(1);
        expect(db.organizationModule.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    organizationId_moduleKey: {
                        organizationId: "org_1",
                        moduleKey: "APPOINTMENTS",
                    },
                },
                update: expect.objectContaining({ status: "DISABLED" }),
            }),
        );
    });

    it("a rolled-out dependent still holds the disable up, named", async () => {
        const db = makeDb();
        db.organizationModule.findUnique.mockResolvedValue({
            status: "ENABLED",
        });
        db.organizationModule.findMany.mockResolvedValue([
            { moduleKey: "CLASS_PACKS" },
        ]);
        const flags = { isEnabled: jest.fn(() => Promise.resolve(true)) };
        const svc = new ModuleLifecycleService(
            makeReadiness(),
            db as never,
            undefined,
            flags as never,
        );
        await expect(svc.disable(OWNER, "APPOINTMENTS")).rejects.toThrow(
            "Class packs needs Appointments. Turn off Class packs first.",
        );
        expect(db.organizationModule.upsert).not.toHaveBeenCalled();
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
                    // Named as the business reads it, for Activity (#509).
                    metadata: { module: "CRM", enabled: true },
                }),
            }),
        );
    });

    it("a Saroh operator's switch is marked byOperator for Activity (DEC-035)", async () => {
        const OPERATOR: OrganizationContext = {
            organizationId: "org_1",
            userId: "u_staff",
            role: "MEMBER",
            roleKey: "platform-operator",
            actions: new Set(["module:manage"]),
        };
        const db = makeDb();
        const svc = new ModuleLifecycleService(makeReadiness(), db as never);
        await svc.enable(OPERATOR, "CRM");
        expect(db.auditEvent.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    action: "organization.module.enabled",
                    metadata: {
                        module: "CRM",
                        enabled: true,
                        byOperator: true,
                    },
                }),
            }),
        );
    });

    it("enabling an already-enabled module is a no-op (no second audit)", async () => {
        const db = makeDb();
        db.organizationModule.findUnique.mockResolvedValue({
            status: "ENABLED",
        });
        const svc = new ModuleLifecycleService(makeReadiness(), db as never);
        await svc.enable(OWNER, "CRM");
        expect(db.organizationModule.upsert).not.toHaveBeenCalled();
        expect(db.auditEvent.create).not.toHaveBeenCalled();
    });

    it("disable is blocked while an enabled module depends on it", async () => {
        const db = makeDb();
        db.organizationModule.findUnique.mockResolvedValue({
            status: "ENABLED",
        });
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
        db.organizationModule.findUnique.mockResolvedValue({
            status: "ENABLED",
        });
        const readiness = makeReadiness([
            { code: "COMMERCE_OPEN_ORDERS", message: "x" },
        ]);
        const svc = new ModuleLifecycleService(readiness, db as never);
        await expect(svc.disable(OWNER, "COMMERCE")).rejects.toBeInstanceOf(
            ConflictException,
        );
        expect(db.organizationModule.upsert).not.toHaveBeenCalled();
    });

    it("every refusal names the module, never its key (DEC-057)", async () => {
        const on = makeDb();
        on.organizationModule.findUnique.mockResolvedValue({
            id: "om_1",
            status: "ENABLED",
        });
        const blocked = new ModuleLifecycleService(
            makeReadiness([{ code: "SOMETHING", message: "x" }]),
            on as never,
        );
        const said = async (p: Promise<unknown>) => {
            const e = (await p.then(
                () => null,
                (err: unknown) => err,
            )) as { getResponse(): unknown } | null;
            expect(e).not.toBeNull();
            return JSON.stringify(e?.getResponse());
        };
        const refusals = [
            await said(blocked.disable(OWNER, "CLASS_PACKS")),
            await said(blocked.archive(OWNER, "CLASS_PACKS")),
        ];
        const off = makeDb();
        off.organizationModule.findUnique.mockResolvedValue({
            id: "om_1",
            status: "DISABLED",
        });
        refusals.push(
            await said(
                new ModuleLifecycleService(
                    makeReadiness(),
                    off as never,
                ).selectForProject(OWNER, "proj_1", "CRM"),
            ),
        );
        expect(refusals[0]).toContain("Class packs can't be turned off yet.");
        expect(refusals[1]).toContain(
            "Turn Class packs off before archiving it.",
        );
        for (const r of refusals) {
            expect(r).not.toMatch(/"message":"[^"]*\b[A-Z]+_[A-Z_]+\b/);
        }
    });

    it("disable writes a DISABLED row when safe", async () => {
        const db = makeDb();
        db.organizationModule.findUnique.mockResolvedValue({
            status: "ENABLED",
        });
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
                    metadata: { module: "Website", enabled: false },
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

describe("ModuleLifecycleService.impact (F13)", () => {
    const item = (moduleKey: string, code: string) => ({
        code,
        moduleKey,
        count: 3,
        message: `${code} message`,
    });

    function setup(opts: {
        enabled?: string[];
        rolledOut?: (flag: string) => boolean;
        blockers?: Record<string, unknown[]>;
    }) {
        const db = makeDb();
        db.organizationModule.findMany.mockResolvedValue(
            (opts.enabled ?? []).map((moduleKey) => ({
                moduleKey,
                status: "ENABLED",
            })),
        );
        const readiness = {
            deactivationImpact: jest.fn((key: string) =>
                Promise.resolve([item(key, `${key}_LINE`)]),
            ),
            deactivationBlockers: jest.fn((key: string) =>
                Promise.resolve(opts.blockers?.[key] ?? []),
            ),
        };
        const flags = {
            isEnabled: jest.fn((flag: string) =>
                Promise.resolve(opts.rolledOut ? opts.rolledOut(flag) : true),
            ),
        };
        const svc = new ModuleLifecycleService(
            readiness as unknown as ModuleReadinessRegistry,
            db as never,
            undefined,
            flags as never,
        );
        return { svc, readiness, flags, db };
    }

    it("returns the module's lines and those of the modules going with it", async () => {
        const { svc, readiness } = setup({
            enabled: ["CRM", "APPOINTMENTS", "COURSES", "CLASS_PACKS"],
        });
        const view = await svc.impact(OWNER, "APPOINTMENTS");
        expect(view.enabled).toBe(true);
        expect(view.goesWith).toEqual(["COURSES", "CLASS_PACKS"]);
        expect(view.items.map((i) => i.code)).toEqual([
            "APPOINTMENTS_LINE",
            "COURSES_LINE",
            "CLASS_PACKS_LINE",
        ]);
        // Each read is asked with the viewer's own reads.
        const input = readiness.deactivationImpact.mock.calls[0][1] as {
            organizationId: string;
            may: (a: string) => boolean;
        };
        expect(input.organizationId).toBe("org_1");
        expect(input.may("booking:read")).toBe(true);
    });

    it("goes through dependents of dependents, a module before what it needs", async () => {
        const { svc } = setup({
            enabled: ["CRM", "APPOINTMENTS", "COURSES", "COMMUNICATIONS"],
        });
        const view = await svc.impact(OWNER, "CRM");
        expect(view.goesWith).toEqual([
            "COURSES",
            "APPOINTMENTS",
            "COMMUNICATIONS",
        ]);
    });

    it("never names a module going with it that Saroh hasn't rolled out (DEC-057)", async () => {
        const { svc } = setup({
            enabled: ["CRM", "APPOINTMENTS", "CLASS_PACKS"],
            rolledOut: (flag) => flag !== "MODULE_CLASS_PACKS",
        });
        const view = await svc.impact(OWNER, "APPOINTMENTS");
        expect(view.goesWith).toEqual([]);
        expect(view.items.map((i) => i.moduleKey)).toEqual(["APPOINTMENTS"]);
    });

    it("404s a module Saroh hasn't rolled out, as for an unknown one (DEC-057)", async () => {
        const { svc, readiness } = setup({
            enabled: ["PAYMENTS"],
            rolledOut: () => false,
        });
        await expect(svc.impact(OWNER, "PAYMENTS")).rejects.toBeInstanceOf(
            NotFoundException,
        );
        expect(readiness.deactivationImpact).not.toHaveBeenCalled();
    });

    it("carries the blockers, which still block", async () => {
        const blocker = {
            code: "COMMERCE_OPEN_ORDERS",
            message: "2 open orders need sending or cancelling first.",
        };
        const { svc, db } = setup({
            enabled: ["COMMERCE"],
            blockers: { COMMERCE: [blocker] },
        });
        const view = await svc.impact(OWNER, "COMMERCE");
        expect(view.blockers).toEqual([blocker]);
        // And turning it off is still refused.
        db.organizationModule.findUnique.mockResolvedValue({
            status: "ENABLED",
        });
        db.organizationModule.findMany.mockResolvedValue([]);
        await expect(svc.disable(OWNER, "COMMERCE")).rejects.toBeInstanceOf(
            ConflictException,
        );
        expect(db.organizationModule.upsert).not.toHaveBeenCalled();
    });

    it("needs module:read; turning off needs module:manage", async () => {
        const { svc } = setup({ enabled: ["APPOINTMENTS"] });
        // A MEMBER reads what it would touch, but can't turn it off.
        await expect(svc.impact(MEMBER, "APPOINTMENTS")).resolves.toEqual(
            expect.objectContaining({ moduleKey: "APPOINTMENTS" }),
        );
        await expect(
            svc.disable(MEMBER, "APPOINTMENTS"),
        ).rejects.toBeInstanceOf(ForbiddenException);
        // A role the business invented without module:read reads nothing.
        const NO_READ: OrganizationContext = {
            ...OWNER,
            role: "MEMBER",
            roleKey: "front-desk",
            actions: new Set(["booking:read"]),
        };
        await expect(
            svc.impact(NO_READ, "APPOINTMENTS"),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("passes the viewer's reads to the counts: a role without booking:read", async () => {
        const { svc, readiness } = setup({ enabled: ["APPOINTMENTS"] });
        const FRONT_DESK: OrganizationContext = {
            ...OWNER,
            role: "MEMBER",
            roleKey: "front-desk",
            actions: new Set(["module:read", "module:manage"]),
        };
        await svc.impact(FRONT_DESK, "APPOINTMENTS");
        const input = readiness.deactivationImpact.mock.calls[0][1] as {
            may: (a: string) => boolean;
        };
        expect(input.may("booking:read")).toBe(false);
        expect(input.may("module:read")).toBe(true);
    });

    it("turning off still works when a count couldn't be read: only blockers refuse", async () => {
        const { svc, readiness, db } = setup({ enabled: ["APPOINTMENTS"] });
        readiness.deactivationImpact.mockRejectedValue(new Error("boom"));
        db.organizationModule.findUnique.mockResolvedValue({
            status: "ENABLED",
        });
        db.organizationModule.findMany.mockResolvedValue([]);
        await svc.disable(OWNER, "APPOINTMENTS");
        expect(db.organizationModule.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                update: expect.objectContaining({ status: "DISABLED" }),
            }),
        );
        expect(readiness.deactivationImpact).not.toHaveBeenCalled();
    });

    it("disable asks the blockers with the viewer's reads", async () => {
        const { svc, readiness, db } = setup({ enabled: ["COMMERCE"] });
        db.organizationModule.findUnique.mockResolvedValue({
            status: "ENABLED",
        });
        db.organizationModule.findMany.mockResolvedValue([]);
        await svc.disable(OWNER, "COMMERCE");
        const input = readiness.deactivationBlockers.mock.calls[0][1] as {
            may: (a: string) => boolean;
        };
        expect(input.may("order:read")).toBe(true);
    });
});

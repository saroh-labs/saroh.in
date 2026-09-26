/**
 * A Saroh operator's change, as the business reads it in Settings ›
 * Activity, against a real Postgres (DEC-035). The operator changes a role
 * and switches a module through the admin console's own services — which go
 * through the business's `OrganizationMembersService` and
 * `ModuleLifecycleService` — and the Activity read puts both down to Saroh
 * support: the staff member's name, email and user id never appear.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { AdminAuditService } from "../admin/admin-audit.service";
import { AdminLifecycleService } from "../admin/admin-lifecycle.service";
import { AdminPeopleService } from "../admin/admin-people.service";
import type { EntitlementService } from "../billing/entitlement.service";
import { ModuleLifecycleService } from "../capabilities/module-lifecycle.service";
import type { ModuleReadinessRegistry } from "../capabilities/readiness/module-readiness.registry";
import { OrganizationMembersService } from "../organizations/organization-members.service";
import { AuditAction, AuditService } from "./audit.service";

const audit = new AuditService();
const adminAudit = new AdminAuditService();
const people = new AdminPeopleService(
    new OrganizationMembersService(audit),
    adminAudit,
);
const lifecycle = new AdminLifecycleService(
    adminAudit,
    new ModuleLifecycleService({} as ModuleReadinessRegistry),
    {} as EntitlementService,
);

const STAFF_NAME = "Opal Operator";
const STAFF_EMAIL = `opal-${process.pid}@saroh.in`;

let organizationId: string;
let staff: PlatformAdminInfo;
let memberId: string;

beforeAll(async () => {
    const organization = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: `operator-activity-${process.pid}` },
    });
    organizationId = organization.id;
    const owner = await prisma.user.create({
        data: { email: `priya-${process.pid}@rye.in`, name: "Priya" },
    });
    const member = await prisma.user.create({
        data: { email: `aditya-${process.pid}@rye.in`, name: "Aditya" },
    });
    const operator = await prisma.user.create({
        data: { email: STAFF_EMAIL, name: STAFF_NAME },
    });
    memberId = member.id;
    await prisma.membership.createMany({
        data: [
            { organizationId, userId: owner.id, role: "OWNER" },
            { organizationId, userId: member.id, role: "MEMBER" },
        ],
    });
    staff = {
        userId: operator.id,
        platformAdminId: null,
        roles: ["SUPPORT"],
        permissions: [],
        viaBootstrap: true,
    };
});

describe("an operator's change in Settings › Activity (real database)", () => {
    it("reads as Saroh support for a role change and a module switch", async () => {
        await people.changeRole({
            staff,
            organizationId,
            userId: memberId,
            role: "ADMIN",
            reason: "Owner asked on a support call",
        });
        await lifecycle.setModule({
            staff,
            organizationId,
            moduleKey: "INSIGHTS",
            enabled: true,
            reason: "Owner asked on a support call",
        });

        const { events } = await audit.listForOrganization(organizationId, {
            actions: [
                AuditAction.MembershipRoleUpdate,
                AuditAction.ModuleEnable,
            ],
        });

        expect(events.map((e) => e.action).sort()).toEqual([
            "membership.role.update",
            "organization.module.enabled",
        ]);
        for (const event of events) {
            expect(event.actor).toEqual({
                name: "Saroh support",
                email: null,
                role: null,
                operator: true,
            });
            expect(event.actorUserId).toBeNull();
        }
        // The member the role change was about is still named.
        const roleChange = events.find(
            (e) => e.action === "membership.role.update",
        );
        expect(roleChange?.target).toMatchObject({
            name: "Aditya",
            role: "ADMIN",
        });

        const read = JSON.stringify(events);
        expect(read).not.toContain(STAFF_NAME);
        expect(read).not.toContain(STAFF_EMAIL);
        expect(read).not.toContain(staff.userId);
    });
});

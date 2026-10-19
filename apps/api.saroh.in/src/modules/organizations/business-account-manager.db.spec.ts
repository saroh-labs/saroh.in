/**
 * The business sees its manager (DEC-169, admin console U26) against a real
 * Postgres: `GET /organizations/:id` carries `accountManager` as the open
 * link's manager's name and the work email on their staff profile. Never
 * the email they sign in with, never a phone. Null when no link was ever
 * opened, when the last one ended, and for a business whose neighbour has
 * a manager. Read inside the business's own context, as the request is, so
 * under `TEST_RLS=on` the policy applies.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));

import { prisma, runInOrgContext } from "@saroh/database";

import { AdminRole } from "../admin/admin-permissions";
import { generateManagerCode } from "../admin/staff-profile";
import { AuditService } from "../audit/audit.service";
import { OrganizationContextService } from "./organization-context.service";
import { OrganizationOnboardingService } from "./organization-onboarding.service";
import { OrganizationsController } from "./organizations.controller";

const onboarding = new OrganizationOnboardingService(new AuditService());
const controller = new OrganizationsController(
    new OrganizationContextService(),
    onboarding,
    // getOne never reaches the settings service.
    {} as never,
);

const tag = `${process.pid}x${Date.now()}`;
let seq = 0;
const uniq = (label: string) => `${label}${tag}x${++seq}`;
const email = (label: string) => `${uniq(label)}@example.com`;

async function person(name?: string): Promise<{ id: string; email: string }> {
    return prisma.user.create({
        data: { email: email("person-"), name, emailVerified: true },
        select: { id: true, email: true },
    });
}

interface Manager {
    platformAdminId: string;
    signInEmail: string;
    workEmail: string | null;
}

/** An Account manager with a staff profile carrying a work email and phone. */
async function manager(
    input: { name?: string; workEmail?: string | null } = {},
): Promise<Manager> {
    const user = await person(input.name ?? "Asha Verma");
    const admin = await prisma.platformAdmin.create({
        data: {
            userId: user.id,
            roleAssignments: {
                create: {
                    role: AdminRole.AccountManager,
                    reason: "test grant",
                },
            },
        },
        select: { id: true },
    });
    const workEmail =
        input.workEmail === undefined ? email("asha.work-") : input.workEmail;
    await prisma.staffProfile.create({
        data: {
            platformAdminId: admin.id,
            worksAs: "ACCOUNT_MANAGER_JOB",
            workEmail,
            phone: "+919800000000",
            managerCode: generateManagerCode(),
        },
    });
    return { platformAdminId: admin.id, signInEmail: user.email, workEmail };
}

async function business(): Promise<{ id: string; ownerId: string }> {
    const owner = await person("Ravi Kumar");
    const made = await onboarding.onboard(owner.id, {
        name: "Pulse Studio",
        address: uniq("pulse-"),
    });
    return { id: made.id, ownerId: owner.id };
}

const assign = (organizationId: string, who: Manager) =>
    prisma.accountManagerLink.create({
        data: {
            organizationId,
            platformAdminId: who.platformAdminId,
            source: "ASSIGNED",
            kind: "ASSIGNED",
        },
        select: { id: true },
    });

/** `GET /organizations/:id` as the business's owner reads it. */
const read = (made: { id: string; ownerId: string }) =>
    runInOrgContext(made.id, () =>
        controller.getOne({
            organizationId: made.id,
            userId: made.ownerId,
            role: "OWNER",
        }),
    );

describe("the business sees its manager (real database, U26)", () => {
    it("an open link gives the manager's name and work email, and nothing else", async () => {
        const asha = await manager();
        const made = await business();
        await assign(made.id, asha);

        const seen = await read(made);

        expect(seen.accountManager).toEqual({
            name: "Asha Verma",
            workEmail: asha.workEmail,
        });
        // The profile's work email, never the console sign-in email; no phone.
        expect(seen.accountManager?.workEmail).not.toBe(asha.signInEmail);
        expect(Object.keys(seen.accountManager ?? {}).sort()).toEqual([
            "name",
            "workEmail",
        ]);
        expect(JSON.stringify(seen)).not.toContain(asha.signInEmail);
        expect(JSON.stringify(seen)).not.toContain("+919800000000");
    });

    it("with no work email on the profile, the sign-in email still isn't given", async () => {
        const asha = await manager({ workEmail: null });
        const made = await business();
        await assign(made.id, asha);

        const seen = await read(made);

        expect(seen.accountManager).toEqual({
            name: "Asha Verma",
            workEmail: null,
        });
        expect(JSON.stringify(seen)).not.toContain(asha.signInEmail);
    });

    it("is null once the link has ended", async () => {
        const asha = await manager();
        const made = await business();
        const link = await assign(made.id, asha);
        await prisma.accountManagerLink.update({
            where: { id: link.id },
            data: { endedAt: new Date(), endedReason: "Moved on" },
        });

        expect((await read(made)).accountManager).toBeNull();
    });

    it("is null when no link was ever opened", async () => {
        const made = await business();

        const seen = await read(made);

        expect(seen).toHaveProperty("accountManager", null);
    });

    it("another business's manager is never this one's", async () => {
        const asha = await manager();
        const theirs = await business();
        await assign(theirs.id, asha);
        const mine = await business();

        expect((await read(mine)).accountManager).toBeNull();
        expect((await read(theirs)).accountManager?.workEmail).toBe(
            asha.workEmail,
        );
    });
});

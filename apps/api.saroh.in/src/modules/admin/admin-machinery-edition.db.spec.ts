/**
 * The console's machinery stays in its edition (KTD11, DEC-204 item 6): a
 * retry, cancel or replay naming another edition's business, planned or run,
 * is a 404 and nothing runs; so are that edition's operations, a flag
 * explained for its business, a waitlist invite for its signups and a recheck
 * of its business's domain. A job of no business is reached from both.
 * Integration project (TEST_DATABASE_URL).
 */
import { NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";
import type { Edition } from "@saroh/edition";

import type { DomainsService } from "../domains/domains.service";
import type { WaitlistInvitesService } from "../waitlist/invites.service";
import type { WebhooksService } from "../webhooks/webhooks.service";
import { AdminAuditService } from "./admin-audit.service";
import { assertBusinessInEdition } from "./admin-edition";
import { AdminMachineryService } from "./admin-machinery.service";
import { AdminOperationsService } from "./admin-operations.service";
import { AdminRole, permissionsFor } from "./admin-permissions";
import { assertWaitlistInEdition } from "./admin-waitlist.service";

const tag = `${process.pid}-${Date.now()}`;

const service = new AdminOperationsService(
    new AdminAuditService(),
    {} as WebhooksService,
    {} as WaitlistInvitesService,
);

const staff = (edition: Edition | null) => ({
    userId: `staff-machinery-${tag}`,
    platformAdminId: null,
    roles: [AdminRole.PlatformOwner],
    permissions: permissionsFor([AdminRole.PlatformOwner]),
    viaBootstrap: true,
    edition,
});

let indiaId = "";
let globalId = "";

async function failedJob(organizationId: string | null) {
    return (
        await prisma.job.create({
            data: {
                organizationId,
                type: "enquiry.notify",
                status: "FAILED",
                payload: {},
                lastError: "network error",
            },
        })
    ).id;
}

const start = (
    edition: Edition | null,
    kind: "jobs.retry" | "jobs.cancel" | "webhooks.replay" | "waitlist.invite",
    ids: string[],
    key: string,
) =>
    service.start({
        staff: staff(edition),
        kind,
        targetIds: ids,
        reason: "spec check",
        idempotencyKey: `${key}-${tag}`,
    });

beforeAll(async () => {
    indiaId = (
        await prisma.organization.create({
            data: { name: `India ${tag}`, slug: `mach-in-${tag}` },
        })
    ).id;
    globalId = (
        await prisma.organization.create({
            data: {
                name: `Global ${tag}`,
                slug: `mach-gl-${tag}`,
                edition: "GLOBAL",
            },
        })
    ).id;
});

describe("retrying and cancelling jobs from a console", () => {
    it("is a 404 for another edition's job, planned or run, and leaves it failed", async () => {
        const job = await failedJob(globalId);

        await expect(
            service.plan("jobs.retry", [job], "INDIA"),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            service.plan("jobs.cancel", [job], "INDIA"),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            start("INDIA", "jobs.retry", [job], "in-retry"),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            start("INDIA", "jobs.cancel", [job], "in-cancel"),
        ).rejects.toBeInstanceOf(NotFoundException);

        expect(
            (await prisma.job.findUniqueOrThrow({ where: { id: job } })).status,
        ).toBe("FAILED");
        expect(
            await prisma.adminOperation.count({
                where: { actorUserId: staff(null).userId },
            }),
        ).toBe(0);
    });

    it("runs from the business's own console", async () => {
        const job = await failedJob(globalId);
        const plan = await service.plan("jobs.retry", [job], "GLOBAL");
        expect(plan.act).toBe(1);

        const operation = await start("GLOBAL", "jobs.retry", [job], "gl");
        await service.run(operation.id);
        expect(
            (await prisma.job.findUniqueOrThrow({ where: { id: job } })).status,
        ).toBe("PENDING");

        // Its operation is the Global console's alone.
        await expect(service.get(operation.id, "INDIA")).rejects.toBeInstanceOf(
            NotFoundException,
        );
        await expect(service.get(operation.id, "GLOBAL")).resolves.toEqual(
            expect.objectContaining({ id: operation.id }),
        );
        const listed = async (edition: Edition | null) =>
            (await service.list(20, edition)).map((row) => row.id);
        expect(await listed("INDIA")).not.toContain(operation.id);
        expect(await listed("GLOBAL")).toContain(operation.id);
        expect(await listed(null)).toContain(operation.id);
        await expect(
            service.cancel({
                staff: staff("INDIA"),
                operationId: operation.id,
                reason: "spec check",
                idempotencyKey: `cancel-${tag}`,
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("reaches a job of no business from both consoles", async () => {
        for (const edition of ["INDIA", "GLOBAL"] as const) {
            const job = await failedJob(null);
            expect((await service.plan("jobs.retry", [job], edition)).act).toBe(
                1,
            );
            const operation = await start(
                edition,
                "jobs.retry",
                [job],
                `none-${edition}`,
            );
            await expect(
                service.get(operation.id, edition),
            ).resolves.toBeTruthy();
        }
    });
});

describe("replaying webhooks from a console", () => {
    it("is a 404 for another edition's delivery, planned or run", async () => {
        const event = await prisma.webhookEvent.create({
            data: {
                organizationId: indiaId,
                provider: "razorpay",
                providerEventId: `evt-${tag}`,
                eventType: "payment.captured",
                payload: {},
                status: "FAILED",
            },
        });
        await expect(
            service.plan("webhooks.replay", [event.id], "GLOBAL"),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            start("GLOBAL", "webhooks.replay", [event.id], "gl-replay"),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(
            (await service.plan("webhooks.replay", [event.id], "INDIA")).act,
        ).toBe(1);
    });
});

describe("explaining a flag for a business", () => {
    it("is a 404 for another edition's business, and passes its own or none", async () => {
        await expect(
            assertBusinessInEdition(globalId, "INDIA"),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            assertBusinessInEdition(globalId, "GLOBAL"),
        ).resolves.toBeUndefined();
        await expect(
            assertBusinessInEdition(undefined, "INDIA"),
        ).resolves.toBeUndefined();
        await expect(
            assertBusinessInEdition(globalId, null),
        ).resolves.toBeUndefined();
    });
});

describe("inviting from the waitlist from a console", () => {
    it("is a 404 for another edition's signup, planned or run", async () => {
        const signup = await prisma.waitlistSignup.create({
            data: {
                edition: "GLOBAL",
                email: `wl-${tag}@example.com`,
                emailKey: `wl-${tag}@example.com`,
            },
        });
        await expect(
            assertWaitlistInEdition([signup.id], "INDIA"),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            service.plan("waitlist.invite", [signup.id], "INDIA"),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            start("INDIA", "waitlist.invite", [signup.id], "in-invite"),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            assertWaitlistInEdition([signup.id], "GLOBAL"),
        ).resolves.toBeUndefined();
    });
});

describe("rechecking a domain from a console", () => {
    it("is a 404 for another edition's business's domain, and checks its own", async () => {
        const verify = jest.fn().mockResolvedValue({ verified: false });
        const machinery = new AdminMachineryService(
            { verify } as unknown as DomainsService,
            new AdminAuditService(),
        );
        const domain = await prisma.domain.create({
            data: {
                organizationId: globalId,
                hostname: `recheck-${tag}.example.com`,
                verificationToken: "token",
            },
        });

        await expect(
            machinery.recheckDomain(staff("INDIA"), domain.id),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(verify).not.toHaveBeenCalled();

        await expect(
            machinery.recheckDomain(staff("GLOBAL"), domain.id),
        ).resolves.toEqual({ verified: false, reason: null });
        expect(verify).toHaveBeenCalledTimes(1);
    });
});

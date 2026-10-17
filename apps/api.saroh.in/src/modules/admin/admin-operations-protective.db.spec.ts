/**
 * Admin › Jobs retry and the jobs that stop or give back Saroh's own
 * billing (DEC-166): a closing or suspended business takes no new activity,
 * so a failed job of its is "unsafe" to retry — except cancelling its
 * provider subscription, refunding a double charge and putting Saroh's ids
 * on a payment, which never act for it. A closing business whose cancel
 * failed on a network error must not be renewal-charged in its window.
 * Integration project (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import type { WaitlistInvitesService } from "../waitlist/invites.service";
import type { WebhooksService } from "../webhooks/webhooks.service";
import { AdminAuditService } from "./admin-audit.service";
import {
    AdminOperationsService,
    PROTECTIVE_JOB_TYPES,
} from "./admin-operations.service";

const tag = `${process.pid}-${Date.now()}`;

const service = new AdminOperationsService(
    new AdminAuditService(),
    {} as WebhooksService,
    {} as WaitlistInvitesService,
);

async function failedJob(organizationId: string, type: string) {
    return (
        await prisma.job.create({
            data: {
                organizationId,
                type,
                status: "FAILED",
                attempts: 5,
                payload: {},
                lastError: "network error",
            },
        })
    ).id;
}

describe("retrying a failed job of a business that is closing (DEC-166)", () => {
    it.each(["PENDING_DELETION", "SUSPENDED"])(
        "may retry billing's protective jobs of a %s business, and nothing else of it",
        async (lifecycleStatus) => {
            const org = await prisma.organization.create({
                data: {
                    name: `Closing ${lifecycleStatus}`,
                    slug: `closing-${lifecycleStatus.toLowerCase()}-${tag}`,
                    lifecycleStatus,
                },
            });
            const protective = await Promise.all(
                [...PROTECTIVE_JOB_TYPES].map((type) =>
                    failedJob(org.id, type),
                ),
            );
            const other = await failedJob(org.id, "enquiry.notify");

            const plan = await service.plan("jobs.retry", [
                ...protective,
                other,
            ]);
            const verdict = new Map(
                plan.items.map((item) => [item.targetId, item.verdict]),
            );
            for (const id of protective) expect(verdict.get(id)).toBe("act");
            expect(verdict.get(other)).toBe("unsafe");
        },
    );

    it("lists exactly the jobs that stop or give back money", () => {
        expect([...PROTECTIVE_JOB_TYPES].sort()).toEqual([
            "billing.payment.notes",
            "billing.provider.cancel",
            "billing.refund.double-charge",
        ]);
    });
});

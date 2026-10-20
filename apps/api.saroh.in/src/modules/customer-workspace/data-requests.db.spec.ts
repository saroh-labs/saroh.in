/**
 * Customers' "Ask to remove my data" requests, for the business, against a
 * real Postgres (DEC-172, #1106; site templates v2 plan, U13): the list,
 * closing one without removal (only that, and only with a reason), a
 * request that survives the privacy removal as DONE though the account it
 * was asked from is deleted, one with no customer linked, the permission,
 * and another business's request (404). Runs in the integration project
 * (TEST_DATABASE_URL), plain and with `TEST_RLS=on`. Only the app env is
 * stubbed (the credential key), as `privacy-removal.db.spec.ts` does.
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
    declaredNodeEnv: "test",
}));

import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
    ValidationPipe,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { validationPipeOptions } from "../../common/validation";
import { AuditAction } from "../audit/audit.service";
import { MandatesService } from "../payments/mandates.service";
import { PaymentsService } from "../payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../payments/providers/fake.provider";
import {
    DATA_REQUEST_EMAIL_TYPE,
    DataRequestEmailHandler,
} from "../site-accounts/data-request-email.handler";
import { CloseDataRequestDto } from "./data-requests.dto";
import { DataRequestsService } from "./data-requests.service";
import { PrivacyRemovalService } from "./privacy-removal.service";

const fake = new FakeMerchantProvider();
const removals = new PrivacyRemovalService(
    new MandatesService(new FakeProviderFactory(fake)),
    new PaymentsService(new FakeProviderFactory(fake)),
);
const requests = new DataRequestsService();

const tag = `${process.pid}-${Date.now()}`;
let seq = 0;
const next = () => `${tag}-${++seq}`;

let ownerId = "";

beforeAll(async () => {
    ownerId = (
        await prisma.user.create({
            data: { email: `dr-owner-${tag}@example.com` },
        })
    ).id;
});

async function business(name = "Northwind"): Promise<OrganizationContext> {
    const org = await prisma.organization.create({
        data: { name, slug: `drq-${next()}` },
    });
    return { organizationId: org.id, userId: ownerId, role: "OWNER" };
}

/** A customer with a site account, as signing in on the site makes one. */
async function customer(ctx: OrganizationContext, firstName = "Asha") {
    const email = `${firstName.toLowerCase()}-${next()}@example.com`;
    const contact = await prisma.contact.create({
        data: {
            organizationId: ctx.organizationId,
            email,
            firstName,
            lastName: "Rao",
        },
    });
    const account = await prisma.customerAccount.create({
        data: {
            organizationId: ctx.organizationId,
            contactId: contact.id,
            email,
            emailVerifiedAt: new Date(),
        },
    });
    return { contactId: contact.id, accountId: account.id, email };
}

/** Their request, as the account's POST writes it. */
function ask(
    ctx: OrganizationContext,
    who: { contactId: string | null; accountId: string | null; email: string },
    createdAt = new Date(),
) {
    return prisma.customerDataRequest.create({
        data: {
            organizationId: ctx.organizationId,
            customerAccountId: who.accountId,
            contactId: who.contactId,
            requesterName: "Asha Rao",
            requesterEmail: who.email,
            createdAt,
        },
    });
}

const pipe = new ValidationPipe(validationPipeOptions);
function closeBody(body: unknown) {
    return pipe.transform(body, {
        type: "body",
        metatype: CloseDataRequestDto,
    }) as Promise<CloseDataRequestDto>;
}

describe("the list", () => {
    it("shows open requests, newest first, with the customer's name and when they asked", async () => {
        const ctx = await business();
        const asha = await customer(ctx, "Asha");
        const ravi = await customer(ctx, "Ravi");
        const older = await ask(ctx, asha, new Date("2026-10-20T05:00:00Z"));
        const newer = await ask(ctx, ravi, new Date("2026-10-21T05:00:00Z"));
        const closed = await ask(ctx, {
            ...asha,
            accountId: null,
        });
        await requests.close(ctx, closed.id, "Duplicate of the other one");

        const { requests: open } = await requests.list(ctx);
        expect(open.map((r) => [r.id, r.name, r.askedAt, r.status])).toEqual([
            [newer.id, "Ravi Rao", "2026-10-21T05:00:00.000Z", "OPEN"],
            [older.id, "Asha Rao", "2026-10-20T05:00:00.000Z", "OPEN"],
        ]);
        expect(open[1]).toMatchObject({
            kind: "REMOVAL",
            contactId: asha.contactId,
            email: asha.email,
            handledAt: null,
            reason: null,
        });

        const { requests: all } = await requests.list(ctx, "all");
        expect(all).toHaveLength(3);
        const { requests: shut } = await requests.list(ctx, "closed");
        expect(shut).toEqual([
            expect.objectContaining({
                id: closed.id,
                status: "CLOSED_WITHOUT_REMOVAL",
                reason: "Duplicate of the other one",
            }),
        ]);
    });

    it("lists a request with no customer linked, by the name and email they asked with", async () => {
        const ctx = await business();
        const lone = await ask(ctx, {
            contactId: null,
            accountId: null,
            email: `lone-${next()}@example.com`,
        });
        const { requests: open } = await requests.list(ctx);
        expect(open).toEqual([
            expect.objectContaining({
                id: lone.id,
                contactId: null,
                name: "Asha Rao",
                email: lone.requesterEmail,
            }),
        ]);
        // And it can be closed.
        const row = await requests.close(
            ctx,
            lone.id,
            "Not a customer of ours",
        );
        expect(row.status).toBe("CLOSED_WITHOUT_REMOVAL");
    });

    it("refuses someone without the removal permission (403), and lists nothing of another business", async () => {
        const ctx = await business();
        const other = await business("Rye");
        await ask(other, await customer(other));

        const member: OrganizationContext = { ...ctx, role: "MEMBER" };
        await expect(requests.list(member)).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        expect((await requests.list(ctx, "all")).requests).toEqual([]);
    });
});

describe("closing one without removal", () => {
    it("takes only CLOSED_WITHOUT_REMOVAL, and only with a reason (400)", async () => {
        await expect(
            closeBody({ outcome: "DONE", reason: "Removed already" }),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            closeBody({ outcome: "CLOSED_WITHOUT_REMOVAL" }),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            closeBody({ outcome: "CLOSED_WITHOUT_REMOVAL", reason: "   " }),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            closeBody({
                outcome: "CLOSED_WITHOUT_REMOVAL",
                reason: "x".repeat(501),
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            closeBody({
                outcome: "CLOSED_WITHOUT_REMOVAL",
                reason: "  Warranty claim open  ",
            }),
        ).resolves.toMatchObject({ reason: "Warranty claim open" });
    });

    it("records who and when, queues the customer's email without the reason, and audits ids only", async () => {
        const ctx = await business();
        const asha = await customer(ctx);
        const request = await ask(ctx, asha);
        const at = new Date("2026-10-22T09:00:00Z");

        const row = await requests.close(
            ctx,
            request.id,
            "Warranty claim open",
            at,
        );
        expect(row).toMatchObject({
            status: "CLOSED_WITHOUT_REMOVAL",
            reason: "Warranty claim open",
            handledAt: at.toISOString(),
        });
        const stored = await prisma.customerDataRequest.findUniqueOrThrow({
            where: { id: request.id },
        });
        expect(stored.handledByUserId).toBe(ownerId);

        const jobs = await prisma.job.findMany({
            where: {
                organizationId: ctx.organizationId,
                type: DATA_REQUEST_EMAIL_TYPE,
            },
        });
        expect(jobs.map((j) => j.payload)).toEqual([
            { requestId: request.id, step: "closed" },
        ]);
        const audit = await prisma.auditEvent.findFirstOrThrow({
            where: {
                organizationId: ctx.organizationId,
                action: AuditAction.CustomerDataRequestClosed,
            },
        });
        expect(audit).toMatchObject({
            actorUserId: ownerId,
            targetId: request.id,
        });
        expect(JSON.stringify(audit.metadata)).not.toMatch(/Warranty|@/);

        // Closed is closed: a second close is a 409.
        await expect(
            requests.close(ctx, request.id, "Again"),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it("is a 404 for another business's request, and a 403 without the permission", async () => {
        const ctx = await business();
        const other = await business("Rye");
        const theirs = await ask(other, await customer(other));

        await expect(
            requests.close(ctx, theirs.id, "Not ours"),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            requests.close({ ...other, role: "MEMBER" }, theirs.id, "No"),
        ).rejects.toBeInstanceOf(ForbiddenException);
        const stored = await prisma.customerDataRequest.findUniqueOrThrow({
            where: { id: theirs.id },
        });
        expect(stored.status).toBe("OPEN");
    });
});

describe("the privacy removal marks it done", () => {
    it("survives the removal as DONE, though the account it was asked from is deleted", async () => {
        const ctx = await business();
        const asha = await customer(ctx);
        const request = await ask(ctx, asha);
        const now = new Date("2026-10-23T10:00:00Z");

        await removals.remove(ctx, asha.contactId, now);

        expect(
            await prisma.customerAccount.count({
                where: { id: asha.accountId },
            }),
        ).toBe(0);
        const done = await prisma.customerDataRequest.findUniqueOrThrow({
            where: { id: request.id },
        });
        expect(done).toMatchObject({
            status: "DONE",
            handledByUserId: ownerId,
            handledAt: now,
            customerAccountId: null,
            contactId: asha.contactId,
            // Their name goes with their details (review #19); the email
            // stays only until the done email has gone to it.
            requesterName: null,
            requesterEmail: asha.email,
        });

        const jobs = await prisma.job.findMany({
            where: {
                organizationId: ctx.organizationId,
                type: DATA_REQUEST_EMAIL_TYPE,
            },
        });
        expect(jobs.map((j) => j.payload)).toEqual([
            { requestId: request.id, step: "done" },
        ]);
        expect(
            await prisma.auditEvent.count({
                where: {
                    organizationId: ctx.organizationId,
                    action: AuditAction.CustomerDataRequestDone,
                    targetId: request.id,
                },
            }),
        ).toBe(1);

        // The list says done, names no removed customer and shows no email.
        const { requests: done_ } = await requests.list(ctx, "done");
        expect(done_).toEqual([
            expect.objectContaining({
                id: request.id,
                status: "DONE",
                contactId: null,
                name: null,
                email: null,
                handledAt: now.toISOString(),
            }),
        ]);

        // The done email goes to the address they asked from; then that
        // address leaves the request too, and a retry sends nothing.
        const sent: string[] = [];
        const handler = new DataRequestEmailHandler(async (to) => {
            sent.push(to);
            return "sent";
        });
        await handler.handle(jobs[0]!);
        await handler.handle(jobs[0]!);
        expect(sent).toEqual([asha.email]);
        const after = await prisma.customerDataRequest.findUniqueOrThrow({
            where: { id: request.id },
        });
        expect(after).toMatchObject({
            status: "DONE",
            requesterName: null,
            requesterEmail: null,
        });
        // Done is the removal's: closing it now is refused.
        await expect(
            requests.close(ctx, request.id, "Too late"),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it("leaves a closed request closed, and another customer's open one open", async () => {
        const ctx = await business();
        const asha = await customer(ctx, "Asha");
        const ravi = await customer(ctx, "Ravi");
        const closed = await ask(ctx, { ...asha, accountId: null });
        await requests.close(ctx, closed.id, "Asked twice");
        const theirs = await ask(ctx, ravi);

        await removals.remove(ctx, asha.contactId);

        const after = await prisma.customerDataRequest.findMany({
            where: { id: { in: [closed.id, theirs.id] } },
            orderBy: { createdAt: "asc" },
        });
        expect(after.map((r) => [r.id, r.status])).toEqual([
            [closed.id, "CLOSED_WITHOUT_REMOVAL"],
            [theirs.id, "OPEN"],
        ]);
    });

    it("a removal with no request queues no email", async () => {
        const ctx = await business();
        const asha = await customer(ctx);
        await removals.remove(ctx, asha.contactId);
        expect(
            await prisma.job.count({
                where: {
                    organizationId: ctx.organizationId,
                    type: DATA_REQUEST_EMAIL_TYPE,
                },
            }),
        ).toBe(0);
    });
});

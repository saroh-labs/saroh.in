/**
 * A role the business made survives the invitation (UX-004), against a real
 * Postgres and the context the guard would really resolve.
 *
 * Accepting used to narrow every role but Owner, Admin and Reviewer to
 * MEMBER, so someone invited as "Front desk" joined with a Member's powers:
 * no New booking, no order changes, while Roles said "0 people". Here the
 * whole path runs — invite, the link's token, accept, resolve — and the
 * role's own permissions are then asked by the services that check them:
 * what it grants is let through (to the 404 a missing id meets), what it
 * doesn't is still a 403. A Member invited beside them is the control.
 * Runs in the integration project (TEST_DATABASE_URL).
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
        SITE_ACCOUNT_AREA: "off",
    },
}));
// The link is the one thing the invitee's inbox holds; read it from here.
jest.mock("../../common/email", () => ({
    sendOrganizationInvitationEmail: jest.fn().mockResolvedValue(undefined),
}));

import { ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";
import { readFileSync } from "node:fs";
import * as path from "node:path";

import { sendOrganizationInvitationEmail } from "../../common/email";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { AuditService } from "../audit/audit.service";
import { BookingsService } from "../bookings/bookings.service";
import { OrderCancelService } from "../orders/order-cancel.service";
import { OrderKitchenService } from "../orders/order-kitchen.service";
import { PaymentsService } from "../payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../payments/providers/fake.provider";
import { OrganizationContextService } from "./organization-context.service";
import { OrganizationMembersService } from "./organization-members.service";

const tag = `${process.pid}-${Date.now()}`;
const audit = { record: jest.fn() } as unknown as AuditService;
const members = new OrganizationMembersService(audit);
const contexts = new OrganizationContextService();
const bookings = new BookingsService();
const payments = new PaymentsService(
    new FakeProviderFactory(new FakeMerchantProvider("RAZORPAY")),
);
const kitchen = new OrderKitchenService(payments);
const cancels = new OrderCancelService(payments);

const FRONT_DESK = "front-desk";
const MISSING = "missing-ux004";

let orgId = "";
let ownerId = "";

/** Refused (a 403), or let through to whatever the request itself meets. */
async function gate(run: () => unknown): Promise<"allowed" | "refused"> {
    try {
        await run();
    } catch (error) {
        if (error instanceof ForbiddenException) return "refused";
    }
    return "allowed";
}

/** Invite `email` at `role` as the owner, then accept it as that person. */
async function inviteAndAccept(
    email: string,
    role: string,
): Promise<OrganizationContext> {
    const owner = await contexts.resolve(ownerId, orgId);
    const send = sendOrganizationInvitationEmail as jest.Mock;
    send.mockClear();
    await members.invite(owner, { email, role } as never);
    const link = send.mock.calls[0][1] as string;
    const token = link.split("/join/")[1]!;

    const user = await prisma.user.create({ data: { email } });
    await members.accept({ id: user.id, email }, token);
    return contexts.resolve(user.id, orgId);
}

beforeAll(async () => {
    ownerId = (
        await prisma.user.create({
            data: { email: `ux004-owner-${tag}@example.com` },
        })
    ).id;
    orgId = (
        await prisma.organization.create({
            data: { name: "Hill Road Clinic", slug: `ux004-${tag}` },
        })
    ).id;
    await prisma.membership.create({
        data: { organizationId: orgId, userId: ownerId, role: "OWNER" },
    });
    // The matrix's Front desk: books, sees customers, takes and changes
    // orders. Not refunds, not invoices.
    await prisma.organizationRole.create({
        data: {
            organizationId: orgId,
            key: FRONT_DESK,
            label: "Front desk",
            actions: [
                "booking:write",
                "contact:read",
                "order:create",
                "order:edit",
            ],
        },
    });
});

describe("a role the business made, through invite and accept (UX-004)", () => {
    let desk: OrganizationContext;
    let member: OrganizationContext;

    beforeAll(async () => {
        desk = await inviteAndAccept(
            `ux004-desk-${tag}@example.com`,
            FRONT_DESK,
        );
        member = await inviteAndAccept(
            `ux004-member-${tag}@example.com`,
            "MEMBER",
        );
    });

    it("stores the role's key on the membership, and Roles counts them", async () => {
        const row = await prisma.membership.findUniqueOrThrow({
            where: {
                organizationId_userId: {
                    organizationId: orgId,
                    userId: desk.userId,
                },
            },
            select: { role: true },
        });
        expect(row.role).toBe(FRONT_DESK);
        expect(desk.roleKey).toBe(FRONT_DESK);
        expect(
            await prisma.membership.count({
                where: { organizationId: orgId, role: FRONT_DESK },
            }),
        ).toBe(1);
    });

    it("resolves the role's permissions, implied holds included", () => {
        const held = desk.actions!;
        for (const action of [
            "booking:write",
            "booking:read",
            "contact:read",
            "order:create",
            "order:edit",
            "order:read",
        ] as const) {
            expect(held.has(action)).toBe(true);
        }
        expect(held.has("order:refund")).toBe(false);
        expect(held.has("invoice:write")).toBe(false);
    });

    it("books, moves and cancels where a Member is refused", async () => {
        for (const run of [
            (c: OrganizationContext) =>
                bookings.bookByHand(c, MISSING, {
                    startAt: "2026-10-01T09:00:00.000Z",
                } as never),
            (c: OrganizationContext) =>
                bookings.rescheduleBooking(c, MISSING, {
                    startAt: "2026-10-01T10:00:00.000Z",
                } as never),
            (c: OrganizationContext) => bookings.cancelBooking(c, MISSING),
        ]) {
            expect(await gate(() => run(desk))).toBe("allowed");
            expect(await gate(() => run(member))).toBe("refused");
        }
    });

    it("changes an order but still can't refund one", async () => {
        expect(
            await gate(() => kitchen.edit(desk, MISSING, { notes: "Hi" })),
        ).toBe("allowed");
        expect(
            await gate(() => kitchen.edit(member, MISSING, { notes: "Hi" })),
        ).toBe("refused");
        expect(
            await gate(() =>
                cancels.cancel(desk, MISSING, {
                    idempotencyKey: `ux004-${tag}`,
                } as never),
            ),
        ).toBe("refused");
    });
});

/**
 * The migration that gives back the role people were invited at
 * (`20261029141100_invited_custom_role`), run against rows the old accept
 * left: only a membership still at MEMBER whose accepted invitation named a
 * role that still exists, and whose role nobody changed since, is put back.
 */
describe("putting back the role the old accept dropped (UX-004)", () => {
    const sql = readFileSync(
        path.resolve(
            __dirname,
            "../../../../../packages/database/prisma/migrations/20261029141100_invited_custom_role/migration.sql",
        ),
        "utf8",
    );
    const acceptedAt = new Date("2026-10-01T10:00:00.000Z");

    /** A person the old accept joined as MEMBER from an invite at `role`. */
    async function joinedAsMember(who: string, role: string) {
        const email = `ux004-old-${who}-${tag}@example.com`;
        const user = await prisma.user.create({ data: { email } });
        await prisma.membership.create({
            data: { organizationId: orgId, userId: user.id, role: "MEMBER" },
        });
        await prisma.organizationInvitation.create({
            data: {
                organizationId: orgId,
                email,
                role,
                tokenHash: `accepted:${who}-${tag}`,
                status: "ACCEPTED",
                acceptedAt,
                expiresAt: new Date("2026-10-08T10:00:00.000Z"),
            },
        });
        return user.id;
    }
    const roleOf = async (userId: string) =>
        (
            await prisma.membership.findUniqueOrThrow({
                where: {
                    organizationId_userId: { organizationId: orgId, userId },
                },
                select: { role: true },
            })
        ).role;

    it("restores the dropped role and leaves every other choice alone", async () => {
        const dropped = await joinedAsMember("dropped", FRONT_DESK);
        const member = await joinedAsMember("member", "MEMBER");
        const gone = await joinedAsMember("gone", "removed-role");
        // Made a Member on purpose after joining: the owner's choice stands.
        const chosen = await joinedAsMember("chosen", FRONT_DESK);
        await prisma.auditEvent.create({
            data: {
                action: "membership.role.update",
                actorUserId: ownerId,
                organizationId: orgId,
                targetType: "membership",
                targetId: chosen,
                outcome: "SUCCESS",
                createdAt: new Date("2026-10-02T10:00:00.000Z"),
            },
        });

        await prisma.$executeRawUnsafe(sql);
        // Running it twice changes nothing more.
        await prisma.$executeRawUnsafe(sql);

        expect(await roleOf(dropped)).toBe(FRONT_DESK);
        expect(await roleOf(member)).toBe("MEMBER");
        expect(await roleOf(gone)).toBe("MEMBER");
        expect(await roleOf(chosen)).toBe("MEMBER");
    });
});

/**
 * Users and sign-in help against a real Postgres (admin console U9, R13):
 * the list's chips, a sign-in code through Better Auth and its limits, Mark
 * verified kept apart from the person's own proof, and a changed sign-in
 * email's safeguards — the old address told, the paid owner, a duplicate,
 * the 24-hour hold, the second confirmer and the job that ends the hold —
 * each with its ledger row, and the routes refused without the permission.
 *
 * Better Auth is ESM, which this CommonJS runner cannot load, so the API's
 * instance is stood in for by its endpoint's own steps: a code is made and
 * handed to `deliverVerificationOtp`, the very sender `auth.ts` gives the
 * library, which asks the hold. The library's side (the code signs in at
 * accounts, the session hook refuses a held person, a code clears the
 * staff mark) runs for real in `packages/auth/src/sign-in-code.test.ts`.
 * No mail leaves: every sender here is a capture.
 *
 * Runs in the integration project (TEST_DATABASE_URL), and under
 * `TEST_RLS=on`, where the migration's CHECKs apply.
 */
const sentCodes: { to: string; otp: string; type: string }[] = [];
const oldAddressNotices: { to: string; masked: string }[] = [];

jest.mock("../../common/email", () => ({
    ...jest.requireActual<object>("../../common/email"),
    sendVerificationOtpEmail: jest.fn(
        (to: string, otp: string, type: string) => {
            sentCodes.push({ to, otp, type });
            return Promise.resolve();
        },
    ),
    sendSignInEmailChangedNotice: jest.fn((to: string, masked: string) => {
        oldAddressNotices.push({ to, masked });
        return Promise.resolve();
    }),
}));
// The endpoint `SignInCodeSender` calls, as the plugin runs it: a fresh
// code, then the sender `auth.ts` configures.
const askedForCodes: { email: string; type: string }[] = [];
jest.mock("../../common/auth/auth", () => ({
    auth: {
        api: {
            sendVerificationOTP: async ({
                body,
            }: {
                body: { email: string; type: "sign-in" };
            }) => {
                askedForCodes.push(body);
                const { deliverVerificationOtp } = jest.requireActual<
                    typeof import("../../common/auth/verification-otp")
                >("../../common/auth/verification-otp");
                const otp = String(Math.floor(100000 + Math.random() * 900000));
                await deliverVerificationOtp(
                    { to: body.email, otp, type: body.type },
                    600,
                );
                return { success: true };
            },
        },
    },
}));
// The controller is loaded for its route metadata only.
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));
jest.mock("../../common/guards/platform-admin.guard", () => ({
    PlatformAdminGuard: class PlatformAdminGuard {},
}));

import type { ExecutionContext } from "@nestjs/common";
import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    HttpException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { isRlsTestMode } from "../../../test/rls-mode";
import {
    clearStaffVerification,
    emailVerifiedBySelf,
} from "../../common/auth/email-verification";
import { SignInCodeSender } from "../../common/auth/sign-in-code-sender";
import {
    mayStartSession,
    signInHeldForEmail,
} from "../../common/auth/sign-in-holds";
import { deliverVerificationOtp } from "../../common/auth/verification-otp";
import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { PlatformPermissionGuard } from "../../common/guards/platform-permission.guard";
import type { OrganizationMembersService } from "../organizations/organization-members.service";
import { AdminAuditService } from "./admin-audit.service";
import { AdminPeopleController } from "./admin-people.controller";
import { AdminPeopleService } from "./admin-people.service";
import type { AdminRole } from "./admin-permissions";
import { AdminRole as Roles, permissionsFor } from "./admin-permissions";
import {
    AdminSignInHelpService,
    SIGN_IN_EMAIL_RELEASE_TYPE,
} from "./admin-sign-in-help.service";
import { SignInEmailReleaseHandler } from "./sign-in-email-release.handler";
import {
    CODES_PER_PERSON,
    CODES_PER_STAFF,
    EMAIL_CHANGE_HOLD_MS,
    SignInHelpAction,
} from "./sign-in-help-rules";

const tag = `${process.pid}-${Date.now()}`;
const audit = new AdminAuditService();
const help = new AdminSignInHelpService(audit, new SignInCodeSender());
const people = new AdminPeopleService(
    {} as unknown as OrganizationMembersService,
    audit,
);
const release = new SignInEmailReleaseHandler(new SignInCodeSender());

const as = (userId: string, roles: AdminRole[]): PlatformAdminInfo => ({
    userId,
    platformAdminId: null,
    roles,
    permissions: permissionsFor(roles),
    viaBootstrap: false,
});

let seq = 0;
const address = (label: string) => `${label}-${tag}-${++seq}@example.com`;

async function person(
    label: string,
    data: { emailVerified?: boolean; createdAt?: Date; name?: string } = {},
) {
    return prisma.user.create({
        data: {
            email: address(label),
            name: data.name ?? label,
            emailVerified: data.emailVerified ?? true,
            ...(data.createdAt ? { createdAt: data.createdAt } : {}),
        },
    });
}

async function business(label: string) {
    return prisma.organization.create({
        data: { name: `U9 ${label}`, slug: `u9-${label}-${tag}-${++seq}` },
    });
}

async function member(userId: string, organizationId: string, role: string) {
    await prisma.membership.create({
        data: { userId, organizationId, role },
    });
}

/** A business billed by a provider: it pays Saroh. No price is named. */
async function paidBusiness(label: string) {
    const org = await business(label);
    const plan = await prisma.plan.create({
        data: {
            key: `u9.${label}.${tag}.${++seq}`,
            name: "Plan B",
            entitlements: {},
        },
    });
    await prisma.subscription.create({
        data: {
            organizationId: org.id,
            planId: plan.id,
            status: "ACTIVE",
            provider: "RAZORPAY",
            providerSubscriptionId: `sub_u9_${tag}_${seq}`,
        },
    });
    return org;
}

async function session(userId: string) {
    await prisma.session.create({
        data: {
            id: `sess-${tag}-${++seq}`,
            userId,
            token: `tok-${tag}-${seq}`,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
    });
}

function ledger(action: string, targetId: string) {
    return prisma.adminAuditEvent.findMany({
        where: { action, targetId },
        orderBy: { createdAt: "asc" },
    });
}

async function statusOf(promise: Promise<unknown>): Promise<number> {
    try {
        await promise;
    } catch (error) {
        if (error instanceof HttpException) return error.getStatus();
        throw error;
    }
    throw new Error("expected a refusal");
}

const codesTo = (email: string) => sentCodes.filter((c) => c.to === email);

let ownerStaff: PlatformAdminInfo;
let supportStaff: PlatformAdminInfo;
let secondSupport: PlatformAdminInfo;

beforeAll(async () => {
    ownerStaff = as((await person("po")).id, [Roles.PlatformOwner]);
    supportStaff = as((await person("support")).id, [Roles.Support]);
    secondSupport = as((await person("support-2")).id, [Roles.Support]);
});

beforeEach(() => {
    sentCodes.length = 0;
    oldAddressNotices.length = 0;
    askedForCodes.length = 0;
});

describe("the Users list's chips (U9)", () => {
    it("filters by no business, unverified, owners and joined this week, and by a search", async () => {
        const week = 7 * 24 * 60 * 60 * 1000;
        const loner = await person("chips-loner");
        const owner = await person("chips-owner", {
            createdAt: new Date(Date.now() - 2 * week),
        });
        const unverified = await person("chips-unverified", {
            emailVerified: false,
            createdAt: new Date(Date.now() - 2 * week),
        });
        const shop = await business("chips");
        await member(owner.id, shop.id, "OWNER");
        await member(unverified.id, shop.id, "MEMBER");

        const ids = async (filters: Parameters<typeof people.search>[0]) =>
            (await people.search({ q: `chips-`, ...filters }))
                .map((row) => row.id)
                .sort();

        expect(await ids({ filters: ["no-business"] })).toEqual([loner.id]);
        expect(await ids({ filters: ["unverified"] })).toEqual([unverified.id]);
        expect(await ids({ filters: ["owners"] })).toEqual([owner.id]);
        expect(await ids({ filters: ["joined-this-week"] })).toEqual([
            loner.id,
        ]);
        // Chips together: every one must match.
        expect(
            await ids({ filters: ["joined-this-week", "no-business"] }),
        ).toEqual([loner.id]);
        expect(await ids({ filters: ["owners", "unverified"] })).toEqual([]);

        const [row] = await people.search({
            q: owner.email,
            filters: ["owners"],
        });
        expect(row).toMatchObject({
            id: owner.id,
            isOwner: true,
            businesses: 1,
            verifiedBy: "self",
        });
    });

    it("lists the newest accounts with no search, and refuses a one-letter search", async () => {
        const newest = await person("newest");
        const rows = await people.search({});
        expect(rows[0]?.id).toBe(newest.id);
        await expect(people.search({ q: "a" })).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });
});

describe("Send a sign-in code (U9)", () => {
    it("asks Better Auth for a sign-in code to their address, and records it", async () => {
        const user = await person("code");
        const result = await help.sendCode(
            supportStaff,
            user.id,
            "Can't find the email",
        );

        expect(result).toEqual({
            sent: true,
            to: expect.stringMatching(/^c\*\*\*@example\.com$/),
        });
        expect(askedForCodes).toEqual([{ email: user.email, type: "sign-in" }]);
        expect(codesTo(user.email)).toEqual([
            {
                to: user.email,
                otp: expect.stringMatching(/^\d{6}$/),
                type: "sign-in",
            },
        ]);
        const rows = await ledger(SignInHelpAction.CodeSent, user.id);
        expect(rows).toEqual([
            expect.objectContaining({
                actorUserId: supportStaff.userId,
                permission: "people:sign-in-help",
                targetType: "user",
                reason: "Can't find the email",
                outcome: "SUCCESS",
            }),
        ]);
    });

    it(`sends one person at most ${CODES_PER_PERSON} an hour, then refuses with when to try again`, async () => {
        const user = await person("limit-person");
        for (let i = 0; i < CODES_PER_PERSON; i++) {
            await help.sendCode(supportStaff, user.id, "Code did not come");
        }
        const refused = help.sendCode(
            secondSupport,
            user.id,
            "Code did not come",
        );
        await expect(refused).rejects.toThrow(
            /in the last hour\. Try again in/,
        );
        expect(
            await statusOf(
                help.sendCode(secondSupport, user.id, "Code did not come"),
            ),
        ).toBe(429);
        expect(codesTo(user.email)).toHaveLength(CODES_PER_PERSON);
        const denied = (
            await ledger(SignInHelpAction.CodeSent, user.id)
        ).filter((row) => row.outcome === "DENIED");
        expect(denied).toHaveLength(2);
        expect(denied[0]?.metadata).toEqual({ limit: "person" });
    });

    it(`lets one staff member send at most ${CODES_PER_STAFF} an hour`, async () => {
        const busy = as((await person("busy")).id, [Roles.Support]);
        const target = await person("limit-staff");
        // The sends already made this hour, as the ledger has them.
        await prisma.adminAuditEvent.createMany({
            data: Array.from({ length: CODES_PER_STAFF }, (_, i) => ({
                actorUserId: busy.userId,
                permission: "people:sign-in-help",
                action: SignInHelpAction.CodeSent,
                targetType: "user",
                targetId: `someone-${i}`,
                reason: "Earlier",
                outcome: "SUCCESS",
            })),
        });
        await expect(
            help.sendCode(busy, target.id, "One more"),
        ).rejects.toThrow(/You've sent/);
        expect(codesTo(target.email)).toHaveLength(0);
        const [denied] = await ledger(SignInHelpAction.CodeSent, target.id);
        expect(denied).toMatchObject({
            outcome: "DENIED",
            metadata: { limit: "staff" },
        });
        // Someone else may still send it.
        await help.sendCode(supportStaff, target.id, "One more");
        expect(codesTo(target.email)).toHaveLength(1);
    });

    it("refuses someone who isn't there", async () => {
        expect(
            await statusOf(help.sendCode(supportStaff, "nobody", "Lost")),
        ).toBe(404);
    });
});

describe("Mark verified (U9)", () => {
    it("marks it as staff's word, never the person's own, until they prove it with a code", async () => {
        const user = await person("mark", { emailVerified: false });
        expect((await people.detail(user.id)).signIn.block).toBe("unverified");

        const result = await help.markVerified(
            supportStaff,
            user.id,
            "Checked on a call",
        );
        expect(result).toMatchObject({
            emailVerified: true,
            verifiedBy: "staff",
        });

        const marked = await prisma.user.findUniqueOrThrow({
            where: { id: user.id },
        });
        expect(marked.emailVerified).toBe(true);
        expect(marked.emailVerifiedByStaffAt).toBeInstanceOf(Date);
        expect(emailVerifiedBySelf(marked)).toBe(false);
        const detail = await people.detail(user.id);
        expect(detail.verifiedBy).toBe("staff");
        expect(detail.signIn).toMatchObject({
            verifiedBy: "staff",
            block: null,
        });
        expect(await ledger(SignInHelpAction.MarkedVerified, user.id)).toEqual([
            expect.objectContaining({
                actorUserId: supportStaff.userId,
                reason: "Checked on a call",
                outcome: "SUCCESS",
            }),
        ]);

        // Already verified: a second press changes nothing.
        expect(
            await statusOf(
                help.markVerified(supportStaff, user.id, "Checked again"),
            ),
        ).toBe(409);

        // A code later is their own proof (Better Auth's onMailboxProven).
        await clearStaffVerification(user.id);
        const proven = await prisma.user.findUniqueOrThrow({
            where: { id: user.id },
        });
        expect(emailVerifiedBySelf(proven)).toBe(true);
        expect((await people.detail(user.id)).verifiedBy).toBe("self");
    });
});

describe("Change sign-in email (U9)", () => {
    it("moves the address, unverified, ends every session, holds its code and tells the old address", async () => {
        const user = await person("move");
        await session(user.id);
        await session(user.id);
        const before = Date.now();
        const to = address("moved");

        const result = await help.changeEmail({
            staff: supportStaff,
            userId: user.id,
            email: to.toUpperCase(),
            reason: "Lost the old mailbox",
        });
        expect(result.sessionsEnded).toBe(2);
        const heldUntil = result.codeHeldUntil.getTime() - before;
        expect(heldUntil).toBeGreaterThanOrEqual(EMAIL_CHANGE_HOLD_MS - 1000);
        expect(heldUntil).toBeLessThanOrEqual(EMAIL_CHANGE_HOLD_MS + 60_000);

        const moved = await prisma.user.findUniqueOrThrow({
            where: { id: user.id },
        });
        expect(moved).toMatchObject({
            email: to,
            emailVerified: false,
            emailVerifiedByStaffAt: null,
        });
        expect(await prisma.session.count({ where: { userId: user.id } })).toBe(
            0,
        );
        expect(oldAddressNotices).toEqual([
            {
                to: user.email,
                masked: expect.stringMatching(/^m\*\*\*@example\.com$/),
            },
        ]);
        expect(oldAddressNotices[0]?.masked).not.toContain(to.split("@")[0]);

        const [job] = await prisma.job.findMany({
            where: { type: SIGN_IN_EMAIL_RELEASE_TYPE },
            orderBy: { createdAt: "desc" },
            take: 1,
        });
        expect(job).toMatchObject({
            payload: { changeId: result.changeId },
            status: "PENDING",
        });
        expect(job?.runAt.getTime()).toBe(result.codeHeldUntil.getTime());

        const [row] = await ledger(SignInHelpAction.EmailChanged, user.id);
        expect(row).toMatchObject({
            actorUserId: supportStaff.userId,
            reason: "Lost the old mailbox",
            outcome: "SUCCESS",
            metadata: expect.objectContaining({
                changeId: result.changeId,
                sessionsEnded: 2,
                paidOwner: false,
            }),
        });

        // The hold: no code by any way, no session, and the banner says so.
        expect(await signInHeldForEmail(to)).toBe(true);
        expect(await mayStartSession(user.id)).toBe(false);
        await deliverVerificationOtp(
            { to, otp: "123456", type: "sign-in" },
            600,
        );
        expect(codesTo(to)).toHaveLength(0);
        expect(
            await statusOf(help.sendCode(ownerStaff, user.id, "Send one now")),
        ).toBe(409);
        expect(
            await statusOf(help.markVerified(ownerStaff, user.id, "Trust me")),
        ).toBe(409);
        const detail = await people.detail(user.id);
        expect(detail.signIn).toMatchObject({
            block: "held",
            lastChange: expect.objectContaining({
                held: true,
                oldEmail: user.email,
                newEmail: to,
                requestedByUserId: supportStaff.userId,
                requestedByName: "support",
            }),
        });
    });

    it("needs a second, different staff member to send the held code early", async () => {
        const user = await person("confirm");
        const to = address("confirmed");
        await help.changeEmail({
            staff: supportStaff,
            userId: user.id,
            email: to,
            reason: "New work email",
        });

        // The person who made the change can't wave it through.
        const self = help.confirmEmailChange(
            supportStaff,
            user.id,
            "Confirming my own",
        );
        await expect(self).rejects.toBeInstanceOf(ForbiddenException);
        expect(codesTo(to)).toHaveLength(0);

        const result = await help.confirmEmailChange(
            secondSupport,
            user.id,
            "Called them back",
        );
        expect(result).toMatchObject({ confirmed: true });
        expect(codesTo(to)).toEqual([
            expect.objectContaining({ to, type: "sign-in" }),
        ]);
        expect(await signInHeldForEmail(to)).toBe(false);
        expect(await mayStartSession(user.id)).toBe(true);
        const change = await prisma.signInEmailChange.findFirstOrThrow({
            where: { userId: user.id },
        });
        expect(change).toMatchObject({
            confirmedByUserId: secondSupport.userId,
            confirmedAt: expect.any(Date),
            codeSentAt: expect.any(Date),
        });
        expect(await ledger(SignInHelpAction.EmailConfirmed, user.id)).toEqual([
            expect.objectContaining({
                actorUserId: secondSupport.userId,
                reason: "Called them back",
                metadata: {
                    changeId: change.id,
                    requestedBy: supportStaff.userId,
                },
            }),
        ]);

        // Nothing left to confirm, and the job at the hold's end sends nothing.
        expect(
            await statusOf(
                help.confirmEmailChange(ownerStaff, user.id, "Again"),
            ),
        ).toBe(409);
        await release.handle(await releaseJobFor(change.id));
        expect(codesTo(to)).toHaveLength(1);
    });

    it("sends the held code when the hold ends, once", async () => {
        const user = await person("release");
        const to = address("released");
        const { changeId } = await help.changeEmail({
            staff: supportStaff,
            userId: user.id,
            email: to,
            reason: "New address",
        });
        const job = await releaseJobFor(changeId);

        // Too early: it fails, and the worker tries again later.
        await expect(release.handle(job)).rejects.toThrow(/not ended/);
        expect(codesTo(to)).toHaveLength(0);

        await prisma.signInEmailChange.update({
            where: { id: changeId },
            data: { codeHeldUntil: new Date(Date.now() - 1000) },
        });
        expect(await mayStartSession(user.id)).toBe(true);
        await release.handle(job);
        expect(codesTo(to)).toEqual([
            expect.objectContaining({ to, type: "sign-in" }),
        ]);
        await release.handle(job);
        expect(codesTo(to)).toHaveLength(1);
    });

    it("refuses an address another account uses, and their own", async () => {
        const user = await person("dupe");
        const other = await person("taken");
        const refused = help.changeEmail({
            staff: ownerStaff,
            userId: user.id,
            email: other.email.toUpperCase(),
            reason: "Wrong one",
        });
        await expect(refused).rejects.toBeInstanceOf(ConflictException);
        await expect(
            help.changeEmail({
                staff: ownerStaff,
                userId: user.id,
                email: user.email,
                reason: "Same one",
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(
            (await prisma.user.findUniqueOrThrow({ where: { id: user.id } }))
                .email,
        ).toBe(user.email);
        expect(await ledger(SignInHelpAction.EmailChanged, user.id)).toEqual(
            [],
        );
        expect(oldAddressNotices).toEqual([]);
    });

    it("refuses an owner of a paid business unless a Platform owner asks", async () => {
        const user = await person("paid-owner");
        await member(user.id, (await paidBusiness("paid")).id, "OWNER");
        const to = address("paid-moved");

        const refused = help.changeEmail({
            staff: supportStaff,
            userId: user.id,
            email: to,
            reason: "Says they lost it",
        });
        await expect(refused).rejects.toBeInstanceOf(ForbiddenException);
        await expect(refused).rejects.toThrow(/Only a Platform owner/);
        expect(
            (await prisma.user.findUniqueOrThrow({ where: { id: user.id } }))
                .email,
        ).toBe(user.email);
        const [denied] = await ledger(SignInHelpAction.EmailChanged, user.id);
        expect(denied).toMatchObject({
            actorUserId: supportStaff.userId,
            outcome: "DENIED",
            metadata: { paidOwner: true },
        });

        const done = await help.changeEmail({
            staff: ownerStaff,
            userId: user.id,
            email: to,
            reason: "Verified by the owner on a call",
        });
        expect(done.changeId).toEqual(expect.any(String));
        const rows = await ledger(SignInHelpAction.EmailChanged, user.id);
        expect(rows.at(-1)).toMatchObject({
            actorUserId: ownerStaff.userId,
            outcome: "SUCCESS",
            metadata: expect.objectContaining({ paidOwner: true }),
        });
    });

    it("lets Support change a member of a paid business, and an owner of a free one", async () => {
        const memberOfPaid = await person("paid-member");
        await member(memberOfPaid.id, (await paidBusiness("pm")).id, "MEMBER");
        const freeOwner = await person("free-owner");
        await member(freeOwner.id, (await business("free")).id, "OWNER");

        for (const user of [memberOfPaid, freeOwner]) {
            await expect(
                help.changeEmail({
                    staff: supportStaff,
                    userId: user.id,
                    email: address(`${user.name}-moved`),
                    reason: "Asked on chat",
                }),
            ).resolves.toMatchObject({ changeId: expect.any(String) });
        }
    });
});

describe("the History tab (U9)", () => {
    it("lists what staff did, newest first, without the page reads", async () => {
        const user = await person("history", { emailVerified: false });
        await audit.recordRead({
            actorUserId: supportStaff.userId,
            permission: "organization:pii:read",
            action: "person.read",
            targetType: "user",
            targetId: user.id,
            outcome: "SUCCESS",
        });
        await help.markVerified(supportStaff, user.id, "Checked on a call");
        await help.sendCode(secondSupport, user.id, "Then a code");

        const items = await people.history(user.id);
        expect(items.map((item) => item.action)).toEqual([
            SignInHelpAction.CodeSent,
            SignInHelpAction.MarkedVerified,
        ]);
        expect(items[0]).toMatchObject({
            actorName: "support-2",
            reason: "Then a code",
        });
    });
});

describe("the migration's rules (U9, RLS mode)", () => {
    const checked = isRlsTestMode() ? it : it.skip;

    checked(
        "refuses a change confirmed by the person who made it",
        async () => {
            const user = await person("check");
            await expect(
                prisma.signInEmailChange.create({
                    data: {
                        userId: user.id,
                        oldEmail: user.email,
                        newEmail: address("check-new"),
                        requestedByUserId: supportStaff.userId,
                        reason: "Spec",
                        codeHeldUntil: new Date(),
                        confirmedByUserId: supportStaff.userId,
                        confirmedAt: new Date(),
                    },
                }),
            ).rejects.toThrow(/SignInEmailChange_second_confirmer_check/);
        },
    );
});

async function releaseJobFor(changeId: string): Promise<Job> {
    const jobs = await prisma.job.findMany({
        where: { type: SIGN_IN_EMAIL_RELEASE_TYPE },
    });
    const job = jobs.find(
        (row) => (row.payload as { changeId?: string }).changeId === changeId,
    );
    if (!job) throw new Error(`No release job for ${changeId}`);
    return job;
}

describe("sign-in help routes refuse without the permission (U9)", () => {
    const guard = new PlatformPermissionGuard(new Reflector());
    const proto = AdminPeopleController.prototype as unknown as Record<
        string,
        () => unknown
    >;
    const context = (handler: string, roles: AdminRole[]) =>
        ({
            getHandler: () => proto[handler],
            getClass: () => AdminPeopleController,
            switchToHttp: () => ({
                getRequest: () => ({ platformAdmin: as("u", roles) }),
            }),
        }) as unknown as ExecutionContext;

    const writes = [
        "sendSignInCode",
        "markVerified",
        "changeEmail",
        "confirmEmail",
    ] as const;
    const refused = [
        Roles.Operations,
        Roles.Billing,
        Roles.ReleaseManager,
        Roles.Auditor,
        Roles.AccountManager,
    ];

    it.each(
        writes.flatMap((handler) => refused.map((role) => [handler, role])),
    )("refuses %s to %s with 403", (handler, role) => {
        expect(() =>
            guard.canActivate(context(handler, [role as AdminRole])),
        ).toThrow(ForbiddenException);
    });

    it.each(
        writes.flatMap((handler) =>
            [Roles.PlatformOwner, Roles.Support].map((role) => [handler, role]),
        ),
    )("lets %s through for %s", (handler, role) => {
        expect(guard.canActivate(context(handler, [role as AdminRole]))).toBe(
            true,
        );
    });

    it("needs the personal-data read for the History tab", () => {
        expect(() =>
            guard.canActivate(context("history", [Roles.Operations])),
        ).toThrow(ForbiddenException);
        expect(guard.canActivate(context("history", [Roles.Support]))).toBe(
            true,
        );
    });
});

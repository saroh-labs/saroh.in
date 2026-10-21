/**
 * DEC-174, U1 #1132 against a real Postgres: the business's switches for
 * its automatic customer notices. A fresh business reads every kind at its
 * default; a switch put back leaves no row; a Member can't change one; the
 * enquiry reply needs the business's own email; `noticeOn` reads the
 * caller's transaction; and one business never sees another's choices
 * (under `TEST_RLS=on`, row-level security itself).
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { ForbiddenException } from "@nestjs/common";
import { prisma, runInOrgContext } from "@saroh/database";

import { isRlsTestMode } from "../../../test/rls-mode";
import type { OrganizationContext } from "../../common/types/organization-context";
import { AuditService } from "../audit/audit.service";
import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import { NOTICE_KINDS, noticeOn } from "./notice-settings";
import { NoticeSettingsService } from "./notice-settings.service";

let n = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++n}`;

/** Every module on: which kinds a module hides is the unit spec's. */
const availability = {
    evaluate: () =>
        Promise.resolve({
            rolloutAllowed: true,
            configured: true,
            entitled: true,
        }),
} as unknown as ModuleAvailabilityService;

const settings = new NoticeSettingsService(availability, new AuditService());

interface Business {
    organizationId: string;
    owner: string;
    member: string;
}

async function business(name = "Rye & Co"): Promise<Business> {
    const org = await prisma.organization.create({
        data: { name, slug: uniq("notices") },
    });
    const [owner, member] = await Promise.all(
        ["priya", "meera"].map((who) =>
            prisma.user.create({
                data: { email: `${uniq(who)}@example.com`, name: who },
            }),
        ),
    );
    await prisma.membership.createMany({
        data: [
            { organizationId: org.id, userId: owner.id, role: "OWNER" },
            { organizationId: org.id, userId: member.id, role: "MEMBER" },
        ],
    });
    return { organizationId: org.id, owner: owner.id, member: member.id };
}

async function connectEmail(b: Business) {
    await prisma.communicationProvider.create({
        data: {
            organizationId: b.organizationId,
            channel: "EMAIL",
            provider: "SMTP",
            fromAddress: "hello@example.com",
            encryptedCredentials: "sealed",
            credentialsIv: "iv",
            credentialsAuthTag: "tag",
        },
    });
}

const as = (b: Business, who: "owner" | "member") =>
    ({
        organizationId: b.organizationId,
        userId: b[who],
        role: who === "owner" ? "OWNER" : "MEMBER",
        roleKey: who === "owner" ? "OWNER" : "MEMBER",
    }) satisfies OrganizationContext;

const rows = (b: Business) =>
    prisma.customerNoticeSetting.findMany({
        where: { organizationId: b.organizationId },
        select: { kind: true, enabled: true, updatedByUserId: true },
    });

describe("customer notice switches (real database)", () => {
    it("a fresh business reads every kind at its default: on, except overdue reminders", async () => {
        const b = await business();
        await connectEmail(b);

        const view = await settings.read(as(b, "owner"));

        expect(view.canChange).toBe(true);
        expect(
            Object.fromEntries(view.notices.map((x) => [x.kind, x.on])),
        ).toEqual(
            Object.fromEntries(
                NOTICE_KINDS.map((k) => [k, k !== "OVERDUE_REMINDERS"]),
            ),
        );
        expect(view.notices.every((x) => x.offered)).toBe(true);
        for (const kind of NOTICE_KINDS) {
            expect(await noticeOn(prisma, b.organizationId, kind)).toBe(
                kind !== "OVERDUE_REMINDERS",
            );
        }
        expect(await rows(b)).toEqual([]);
    });

    it("turning Membership emails off writes one row; turning them back on deletes it", async () => {
        const b = await business();

        const off = await settings.update(as(b, "owner"), {
            kind: "MEMBERSHIP",
            on: false,
        });
        expect(off.notices.find((x) => x.kind === "MEMBERSHIP")?.on).toBe(
            false,
        );
        expect(await rows(b)).toEqual([
            { kind: "MEMBERSHIP", enabled: false, updatedByUserId: b.owner },
        ]);
        expect(await noticeOn(prisma, b.organizationId, "MEMBERSHIP")).toBe(
            false,
        );

        const on = await settings.update(as(b, "owner"), {
            kind: "MEMBERSHIP",
            on: true,
        });
        expect(on.notices.find((x) => x.kind === "MEMBERSHIP")?.on).toBe(true);
        expect(await rows(b)).toEqual([]);
        expect(await noticeOn(prisma, b.organizationId, "MEMBERSHIP")).toBe(
            true,
        );
    });

    it("overdue reminders, off by default, are kept as a row once turned on", async () => {
        const b = await business();
        await settings.update(as(b, "owner"), {
            kind: "OVERDUE_REMINDERS",
            on: true,
        });
        expect(await rows(b)).toEqual([
            {
                kind: "OVERDUE_REMINDERS",
                enabled: true,
                updatedByUserId: b.owner,
            },
        ]);
    });

    it("each change is a settings-audit entry, with the kind and on or off", async () => {
        const b = await business();
        await settings.update(as(b, "owner"), { kind: "REFUND", on: false });
        // Setting what is already set records nothing.
        await settings.update(as(b, "owner"), { kind: "REFUND", on: false });

        const entries = await prisma.auditEvent.findMany({
            where: {
                organizationId: b.organizationId,
                action: "customer-notices.setting",
            },
        });
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({
            actorUserId: b.owner,
            targetType: "organization",
            targetId: b.organizationId,
            outcome: "SUCCESS",
            metadata: {
                kind: "REFUND",
                changes: [{ field: "noticeOn", before: true, after: false }],
            },
        });
    });

    it("a Member reads the switches but is refused a change (403), and nothing is written", async () => {
        const b = await business();

        const view = await settings.read(as(b, "member"));
        expect(view.canChange).toBe(false);

        await expect(
            settings.update(as(b, "member"), { kind: "MEMBERSHIP", on: false }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(await rows(b)).toEqual([]);
    });

    it("with no email provider, the enquiry reply isn't offered and says why; connected, it is", async () => {
        const b = await business();

        const before = await settings.read(as(b, "owner"));
        expect(
            before.notices.find((x) => x.kind === "ENQUIRY_REPLY"),
        ).toMatchObject({
            offered: false,
            why: "Connect your email first",
        });
        await expect(
            settings.update(as(b, "owner"), {
                kind: "ENQUIRY_REPLY",
                on: false,
            }),
        ).rejects.toThrow("Connect your email first.");
        expect(await rows(b)).toEqual([]);

        await connectEmail(b);
        const after = await settings.read(as(b, "owner"));
        expect(
            after.notices.find((x) => x.kind === "ENQUIRY_REPLY"),
        ).toMatchObject({ offered: true, why: null });
    });

    it("noticeOn inside a transaction that has just turned the kind off reads false", async () => {
        const b = await business();

        const seen = await prisma.$transaction(async (tx) => {
            await tx.customerNoticeSetting.create({
                data: {
                    organizationId: b.organizationId,
                    kind: "COURSE",
                    enabled: false,
                },
            });
            return noticeOn(tx, b.organizationId, "COURSE");
        });

        expect(seen).toBe(false);
    });

    it("one business's choices never reach another's", async () => {
        const a = await business("Rye & Co");
        const other = await business("Pulse Fitness");
        await settings.update(as(a, "owner"), {
            kind: "BACK_IN_STOCK",
            on: false,
        });

        const theirs = await settings.read(as(other, "owner"));
        expect(theirs.notices.find((x) => x.kind === "BACK_IN_STOCK")?.on).toBe(
            true,
        );
        expect(
            await noticeOn(prisma, other.organizationId, "BACK_IN_STOCK"),
        ).toBe(true);
        expect(await rows(other)).toEqual([]);
    });

    // Row-level security itself: only where the policies exist.
    (isRlsTestMode() ? it : it.skip)(
        "under row-level security, a business sees and changes only its own rows",
        async () => {
            const a = await business("Rye & Co");
            const other = await business("Pulse Fitness");
            await settings.update(as(a, "owner"), {
                kind: "MEMBERSHIP",
                on: false,
            });
            await settings.update(as(other, "owner"), {
                kind: "MEMBERSHIP",
                on: false,
            });

            const seen = await runInOrgContext(a.organizationId, () =>
                prisma.customerNoticeSetting.findMany({
                    where: {
                        organizationId: {
                            in: [a.organizationId, other.organizationId],
                        },
                    },
                    select: { organizationId: true },
                }),
            );
            expect(seen).toEqual([{ organizationId: a.organizationId }]);

            const changed = await runInOrgContext(a.organizationId, () =>
                prisma.customerNoticeSetting.updateMany({
                    where: { organizationId: other.organizationId },
                    data: { enabled: true },
                }),
            );
            expect(changed.count).toBe(0);

            await expect(
                runInOrgContext(a.organizationId, () =>
                    prisma.customerNoticeSetting.create({
                        data: {
                            organizationId: other.organizationId,
                            kind: "REFUND",
                            enabled: false,
                        },
                    }),
                ),
            ).rejects.toThrow();
            expect(
                await noticeOn(prisma, other.organizationId, "MEMBERSHIP"),
            ).toBe(false);
        },
    );
});

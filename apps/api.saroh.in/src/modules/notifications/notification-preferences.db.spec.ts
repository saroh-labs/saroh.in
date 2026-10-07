/**
 * F14 against a real Postgres: a person's alert choices are theirs alone,
 * turning the bell off for New order takes those notices out of their
 * inbox (and only theirs), a settings-audit entry is written, and a
 * `team.alert` puts one notice in the inbox and has Saroh email the
 * people who chose email, whether or not the business connected a
 * provider, and never through it (DEC-011, amended 2026-10-07).
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { AuditService } from "../audit/audit.service";
import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { NotificationPreferencesService } from "./notification-preferences.service";
import { NotificationsService } from "./notifications.service";
import { tellTeam } from "./team-alert.handler";

let n = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++n}`;

/** Every module on: which rows a module hides is the unit spec's. */
const availability = {
    evaluate: () =>
        Promise.resolve({
            rolloutAllowed: true,
            configured: true,
            entitled: true,
        }),
} as unknown as ModuleAvailabilityService;

const preferences = new NotificationPreferencesService(
    availability,
    new AuditService(),
    new FeatureFlagService(),
);
const inbox = new NotificationsService();

interface Business {
    organizationId: string;
    owner: string;
    admin: string;
}

async function business(): Promise<Business> {
    const org = await prisma.organization.create({
        data: { name: "Rye & Co", slug: uniq("alerts") },
    });
    const [owner, admin] = await Promise.all(
        ["priya", "aditya"].map((name) =>
            prisma.user.create({
                data: { email: `${uniq(name)}@rye.in`, name },
            }),
        ),
    );
    await prisma.membership.createMany({
        data: [
            { organizationId: org.id, userId: owner.id, role: "OWNER" },
            { organizationId: org.id, userId: admin.id, role: "ADMIN" },
        ],
    });
    return { organizationId: org.id, owner: owner.id, admin: admin.id };
}

const as = (b: Business, userId: string, role: "OWNER" | "ADMIN") =>
    ({
        organizationId: b.organizationId,
        userId,
        role,
        roleKey: role,
    }) satisfies OrganizationContext;

describe("alerts (real database)", () => {
    it("turning the bell off for New order stops that notice reaching you, and only you", async () => {
        const b = await business();
        await prisma.notification.createMany({
            data: [
                {
                    organizationId: b.organizationId,
                    type: "order.new",
                    title: "New order ORD-001 from Asha",
                },
                {
                    organizationId: b.organizationId,
                    type: "enquiry.new",
                    title: "New enquiry from Ravi",
                },
            ],
        });

        const view = await preferences.update(as(b, b.owner, "OWNER"), {
            alert: "order",
            channel: "bell",
            on: false,
        });
        expect(view.alerts.find((a) => a.key === "order")?.channels.bell).toBe(
            false,
        );

        const ownerSees = await inbox.list(as(b, b.owner, "OWNER"));
        const adminSees = await inbox.list(as(b, b.admin, "ADMIN"));
        expect(ownerSees.map((x) => x.type)).toEqual(["enquiry.new"]);
        expect(adminSees.map((x) => x.type).sort()).toEqual([
            "enquiry.new",
            "order.new",
        ]);
        expect(await inbox.unreadCount(as(b, b.owner, "OWNER"))).toEqual({
            count: 1,
        });

        // And back on: the row goes, the default stands, the notice returns.
        await preferences.update(as(b, b.owner, "OWNER"), {
            alert: "order",
            channel: "bell",
            on: true,
        });
        expect(
            await prisma.notificationPreference.count({
                where: { organizationId: b.organizationId },
            }),
        ).toBe(0);
        expect(await inbox.unreadCount(as(b, b.owner, "OWNER"))).toEqual({
            count: 2,
        });
    });

    it("another person's choices can't be read or written: each reads and writes only their own", async () => {
        const b = await business();
        await preferences.update(as(b, b.owner, "OWNER"), {
            alert: "team",
            channel: "bell",
            on: false,
        });

        // The admin's read is theirs: the owner's choice isn't in it.
        const adminView = await preferences.read(as(b, b.admin, "ADMIN"));
        expect(
            adminView.alerts.find((a) => a.key === "team")?.channels.bell,
        ).toBe(true);

        // The admin's write lands on the admin's row, never the owner's.
        await preferences.update(as(b, b.admin, "ADMIN"), {
            alert: "team",
            channel: "bell",
            on: false,
        });
        const rows = await prisma.notificationPreference.findMany({
            where: { organizationId: b.organizationId },
            select: { userId: true, event: true, channel: true, enabled: true },
            orderBy: { userId: "asc" },
        });
        expect(rows).toHaveLength(2);
        expect(new Set(rows.map((r) => r.userId))).toEqual(
            new Set([b.owner, b.admin]),
        );

        // A second business sees none of the first's choices.
        const other = await business();
        const otherView = await preferences.read(
            as(other, other.owner, "OWNER"),
        );
        expect(
            otherView.alerts.find((a) => a.key === "team")?.channels.bell,
        ).toBe(true);
    });

    it("a change is a settings-audit entry, with the alert, the channel and on or off", async () => {
        const b = await business();
        await preferences.update(as(b, b.owner, "OWNER"), {
            alert: "booking",
            channel: "bell",
            on: false,
        });
        const [entry] = await prisma.auditEvent.findMany({
            where: {
                organizationId: b.organizationId,
                action: "member.alerts.update",
            },
        });
        expect(entry).toMatchObject({
            actorUserId: b.owner,
            targetType: "member",
            targetId: b.owner,
            outcome: "SUCCESS",
            metadata: {
                alert: "booking",
                channel: "bell",
                changes: [{ field: "alertOn", before: true, after: false }],
            },
        });
    });

    it("a WhatsApp cell with no provider can't be switched on, and nothing is written", async () => {
        const b = await business();
        await expect(
            preferences.update(as(b, b.owner, "OWNER"), {
                alert: "booking",
                channel: "whatsapp",
                on: true,
            }),
        ).rejects.toThrow("Alerts can't be sent to you on WhatsApp.");
        expect(
            await prisma.notificationPreference.count({
                where: { organizationId: b.organizationId },
            }),
        ).toBe(0);
    });

    /** Meera joins `b`'s team: the alert's payload. */
    async function joiner(b: Business) {
        const user = await prisma.user.create({
            data: { email: `${uniq("meera")}@rye.in`, name: "Meera" },
        });
        await prisma.membership.create({
            data: {
                organizationId: b.organizationId,
                userId: user.id,
                role: "MEMBER",
            },
        });
        return {
            event: "team" as const,
            userId: user.id,
            invitationId: uniq("inv"),
        };
    }

    async function nothingThroughTheProvider(b: Business) {
        expect(
            await prisma.message.count({
                where: { organizationId: b.organizationId },
            }),
        ).toBe(0);
        expect(
            await prisma.job.count({
                where: {
                    organizationId: b.organizationId,
                    type: "message.send",
                },
            }),
        ).toBe(0);
    }

    it("someone joining, with no email provider: one notice in the inbox, and Saroh emails who chose it, not who turned it off", async () => {
        const b = await business();
        for (const [user, role] of [
            [b.admin, "ADMIN"],
            [b.owner, "OWNER"],
        ] as const) {
            await preferences.update(as(b, user, role), {
                alert: "team",
                channel: "email",
                on: true,
            });
        }
        // The owner turns email alerts off again.
        await preferences.update(as(b, b.owner, "OWNER"), {
            alert: "team",
            channel: "email",
            on: false,
        });
        const payload = await joiner(b);

        const first = await prisma.$transaction((tx) =>
            tellTeam(tx, b.organizationId, payload),
        );
        const again = await prisma.$transaction((tx) =>
            tellTeam(tx, b.organizationId, payload),
        );

        const admin = await prisma.user.findUniqueOrThrow({
            where: { id: b.admin },
        });
        expect(first.told).toBe(true);
        expect(first.emails).toEqual([
            {
                userId: b.admin,
                to: admin.email,
                mail: expect.objectContaining({
                    subject: "Rye & Co: Meera joined the team",
                }),
            },
        ]);
        expect(again).toEqual({ told: false, emails: [] });
        const notices = await prisma.notification.findMany({
            where: { organizationId: b.organizationId },
        });
        expect(notices).toHaveLength(1);
        expect(notices[0]).toMatchObject({
            type: "team.joined",
            title: "Meera joined the team",
        });
        await nothingThroughTheProvider(b);
    });

    it("with an email provider connected, the team's alert still goes from Saroh, not the provider", async () => {
        const b = await business();
        await prisma.communicationProvider.create({
            data: {
                organizationId: b.organizationId,
                channel: "EMAIL",
                provider: "SMTP",
                fromAddress: "hello@rye.in",
                encryptedCredentials: "sealed",
                credentialsIv: "iv",
                credentialsAuthTag: "tag",
            },
        });
        await preferences.update(as(b, b.admin, "ADMIN"), {
            alert: "team",
            channel: "email",
            on: true,
        });
        const payload = await joiner(b);

        const out = await prisma.$transaction((tx) =>
            tellTeam(tx, b.organizationId, payload),
        );

        expect(out.emails.map((e) => e.userId)).toEqual([b.admin]);
        await nothingThroughTheProvider(b);
    });
});

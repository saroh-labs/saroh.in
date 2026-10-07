// F14: each person's alerts — which rows they are offered, which channels
// can deliver, what a switch writes, and that it is only ever their own.
jest.mock("@saroh/database", () => ({
    prisma: {
        notificationPreference: {
            findMany: jest.fn(),
            upsert: jest.fn(),
            deleteMany: jest.fn(),
        },
        communicationProvider: { findMany: jest.fn() },
    },
}));

import {
    BadRequestException,
    ConflictException,
    ValidationPipe,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { validationPipeOptions } from "../../common/validation";
import type { AuditService } from "../audit/audit.service";
import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import type { OrgAction } from "../organizations/organization-actions";
import { UpdateAlertDto } from "./notification-preferences.dto";
import { NotificationPreferencesService } from "./notification-preferences.service";

const db = prisma as unknown as {
    notificationPreference: Record<string, jest.Mock>;
    communicationProvider: Record<string, jest.Mock>;
};

const record = jest.fn();
const evaluate = jest.fn();
const releasesOn = jest.fn().mockResolvedValue(false);

function service() {
    return new NotificationPreferencesService(
        { evaluate } as unknown as ModuleAvailabilityService,
        { record } as unknown as AuditService,
        { isEnabled: releasesOn } as unknown as FeatureFlagService,
    );
}

function ctx(over: Partial<OrganizationContext> = {}): OrganizationContext {
    return {
        organizationId: "org_1",
        userId: "user_1",
        role: "OWNER",
        roleKey: "OWNER",
        ...over,
    };
}

/** Every module on, rolled out and in the plan unless a test says so. */
function modules(off: string[] = [], rolledOut: string[] = []) {
    evaluate.mockImplementation(({ moduleKey }: { moduleKey: string }) =>
        Promise.resolve({
            rolloutAllowed: !rolledOut.includes(moduleKey),
            configured: !off.includes(moduleKey),
            entitled: true,
        }),
    );
}

function providers(...channels: string[]) {
    db.communicationProvider.findMany.mockResolvedValue(
        channels.map((channel) => ({ channel })),
    );
}

beforeEach(() => {
    jest.clearAllMocks();
    modules();
    providers();
    db.notificationPreference.findMany.mockResolvedValue([]);
});

describe("reading your alerts", () => {
    it("offers the four rows with the defaults, and email from Saroh with no provider connected", async () => {
        const view = await service().read(ctx());

        expect(view.alerts.map((a) => a.key)).toEqual([
            "order",
            "booking",
            "failed",
            "team",
        ]);
        // Email defaults on for a failed payment: Saroh sends it, so no
        // provider is needed (DEC-011, amended 2026-10-07).
        expect(view.alerts.find((a) => a.key === "failed")?.channels).toEqual({
            bell: true,
            email: true,
            whatsapp: false,
        });
        expect(view.channels).toEqual({
            bell: { available: true },
            email: { available: true },
            whatsapp: { available: false, reason: "NO_PROVIDER" },
        });
        expect(view.canConnect).toBe(true);
    });

    it("with email connected, a failed payment emails by default", async () => {
        providers("EMAIL");
        const view = await service().read(ctx());
        expect(view.alerts.find((a) => a.key === "failed")?.channels).toEqual({
            bell: true,
            email: true,
            whatsapp: false,
        });
        expect(view.alerts.find((a) => a.key === "order")?.channels.email).toBe(
            false,
        );
    });

    it("reads your own stored choices over the defaults", async () => {
        providers("EMAIL");
        db.notificationPreference.findMany.mockResolvedValue([
            { event: "order", channel: "bell", enabled: false },
            { event: "order", channel: "email", enabled: true },
        ]);
        const view = await service().read(ctx());
        expect(view.alerts[0]).toEqual({
            key: "order",
            channels: { bell: false, email: true, whatsapp: false },
        });
    });

    it("never offers a row the role can't read", async () => {
        // The kitchen: orders by their stage, the diary and the team.
        const view = await service().read(
            ctx({
                role: "MEMBER",
                roleKey: "MEMBER",
                actions: new Set<OrgAction>([
                    "order:stage",
                    "booking:read",
                    "member:read",
                ]),
            }),
        );
        expect(view.alerts.map((a) => a.key)).toEqual([
            "order",
            "booking",
            "team",
        ]);
        // No inbox for this role, so no bell, and they can't connect email.
        expect(view.channels.bell).toEqual({
            available: false,
            reason: "NO_INBOX",
        });
        expect(view.alerts.every((a) => !a.channels.bell)).toBe(true);
        expect(view.canConnect).toBe(false);
    });

    it("never names a module that is off, or rolled out off (DEC-057)", async () => {
        modules(["APPOINTMENTS"], ["COMMERCE"]);
        const view = await service().read(ctx());
        expect(view.alerts.map((a) => a.key)).toEqual(["failed", "team"]);
    });

    it("offers the Website row only with test releases on, to who can publish (DEC-071, T10)", async () => {
        providers("EMAIL");
        releasesOn.mockResolvedValue(true);
        const view = await service().read(ctx());
        expect(view.alerts.map((a) => a.key)).toEqual([
            "order",
            "booking",
            "failed",
            "team",
            "site",
        ]);
        // Email on by default: the site changed, or didn't, unwatched.
        expect(view.alerts.find((a) => a.key === "site")?.channels).toEqual({
            bell: true,
            email: true,
            whatsapp: false,
        });

        // Can't publish, not offered, and the flag isn't even asked.
        releasesOn.mockClear();
        const member = await service().read(
            ctx({ role: "MEMBER", roleKey: "MEMBER" }),
        );
        expect(member.alerts.map((a) => a.key)).not.toContain("site");
        expect(releasesOn).not.toHaveBeenCalled();

        // The website module off: not named (DEC-057).
        modules(["WEBSITE"]);
        const off = await service().read(ctx());
        expect(off.alerts.map((a) => a.key)).not.toContain("site");
    });

    it("hides the Website row while the business has no test releases", async () => {
        releasesOn.mockResolvedValue(false);
        const view = await service().read(ctx());
        expect(view.alerts.map((a) => a.key)).not.toContain("site");
        await expect(
            service().update(ctx(), {
                alert: "site",
                channel: "bell",
                on: false,
            }),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it("WhatsApp with a provider still can't reach a team member", async () => {
        providers("EMAIL", "WHATSAPP");
        const view = await service().read(ctx());
        expect(view.channels.whatsapp).toEqual({
            available: false,
            reason: "NO_NUMBER",
        });
        expect(view.alerts.every((a) => !a.channels.whatsapp)).toBe(true);
    });

    it("reads only the signed-in person's rows, in the active business", async () => {
        await service().read(ctx({ userId: "user_7" }));
        expect(
            db.notificationPreference.findMany.mock.calls[0][0].where,
        ).toEqual({ organizationId: "org_1", userId: "user_7" });
        expect(
            db.communicationProvider.findMany.mock.calls[0][0].where,
        ).toEqual({
            organizationId: "org_1",
            status: "CONNECTED",
            channel: "WHATSAPP",
        });
    });
});

describe("changing one", () => {
    it("turning the bell off for New order keeps a row for it, and records the change", async () => {
        await service().update(ctx(), {
            alert: "order",
            channel: "bell",
            on: false,
        });

        const key = {
            organizationId: "org_1",
            userId: "user_1",
            event: "order",
            channel: "bell",
        };
        expect(db.notificationPreference.upsert).toHaveBeenCalledWith({
            where: { organizationId_userId_event_channel: key },
            create: { ...key, enabled: false },
            update: { enabled: false },
        });
        expect(record).toHaveBeenCalledWith({
            action: "member.alerts.update",
            actorUserId: "user_1",
            actorRoleKey: "OWNER",
            organizationId: "org_1",
            targetType: "member",
            targetId: "user_1",
            outcome: "SUCCESS",
            metadata: {
                alert: "order",
                channel: "bell",
                changes: [{ field: "alertOn", before: true, after: false }],
            },
        });
    });

    it("putting a switch back to its default removes the row", async () => {
        db.notificationPreference.findMany.mockResolvedValue([
            { event: "order", channel: "bell", enabled: false },
        ]);
        await service().update(ctx(), {
            alert: "order",
            channel: "bell",
            on: true,
        });
        expect(db.notificationPreference.deleteMany).toHaveBeenCalledWith({
            where: {
                organizationId: "org_1",
                userId: "user_1",
                event: "order",
                channel: "bell",
            },
        });
        expect(db.notificationPreference.upsert).not.toHaveBeenCalled();
    });

    it("a switch set to what it already was records nothing", async () => {
        await service().update(ctx(), {
            alert: "order",
            channel: "bell",
            on: true,
        });
        expect(record).not.toHaveBeenCalled();
    });

    it("a WhatsApp cell with no provider can't be switched on", async () => {
        await expect(
            service().update(ctx(), {
                alert: "booking",
                channel: "whatsapp",
                on: true,
            }),
        ).rejects.toBeInstanceOf(ConflictException);
        providers("WHATSAPP");
        await expect(
            service().update(ctx(), {
                alert: "booking",
                channel: "whatsapp",
                on: true,
            }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(db.notificationPreference.upsert).not.toHaveBeenCalled();
        expect(record).not.toHaveBeenCalled();
    });

    it("email can be switched on with no provider: Saroh sends it", async () => {
        await service().update(ctx(), {
            alert: "order",
            channel: "email",
            on: true,
        });
        expect(db.notificationPreference.upsert).toHaveBeenCalledWith(
            expect.objectContaining({ update: { enabled: true } }),
        );
    });

    it("a row the role can't read can't be written either", async () => {
        await expect(
            service().update(
                ctx({
                    role: "MEMBER",
                    roleKey: "MEMBER",
                    actions: new Set<OrgAction>([
                        "notification:read",
                        "order:stage",
                    ]),
                }),
                { alert: "failed", channel: "bell", on: false },
            ),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(db.notificationPreference.upsert).not.toHaveBeenCalled();
    });

    it("always writes the signed-in person's own row: the body names no user", async () => {
        await service().update(ctx({ userId: "user_2" }), {
            alert: "team",
            channel: "bell",
            on: false,
        });
        const where =
            db.notificationPreference.upsert.mock.calls[0][0].where
                .organizationId_userId_event_channel;
        expect(where.userId).toBe("user_2");
        expect(where.organizationId).toBe("org_1");
    });
});

describe("the request body", () => {
    const pipe = new ValidationPipe(validationPipeOptions);
    const body = (value: unknown) =>
        pipe.transform(value, { type: "body", metatype: UpdateAlertDto });

    it("takes an alert, a channel and on", async () => {
        await expect(
            body({ alert: "failed", channel: "email", on: true }),
        ).resolves.toMatchObject({
            alert: "failed",
            channel: "email",
            on: true,
        });
    });

    it("refuses another person's id: a preference is only ever your own", async () => {
        await expect(
            body({
                alert: "order",
                channel: "bell",
                on: false,
                userId: "user_other",
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuses SMS, the Monday summary, and a truthy string for on", async () => {
        for (const bad of [
            { alert: "order", channel: "sms", on: true },
            { alert: "weekly", channel: "email", on: true },
            { alert: "order", channel: "bell", on: "false" },
        ]) {
            await expect(body(bad)).rejects.toBeInstanceOf(BadRequestException);
        }
    });
});

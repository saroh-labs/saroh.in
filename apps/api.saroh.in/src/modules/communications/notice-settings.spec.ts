// DEC-174, U1 #1132: the business's switches for its automatic customer
// notices — the kinds and their defaults, which are listed and which can
// change, what a switch writes, and who may flip one.
jest.mock("@saroh/database", () => ({
    prisma: {
        customerNoticeSetting: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            upsert: jest.fn(),
            deleteMany: jest.fn(),
        },
        communicationProvider: { findUnique: jest.fn() },
    },
}));

import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    ValidationPipe,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { validationPipeOptions } from "../../common/validation";
import type { AuditService } from "../audit/audit.service";
import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import { MODULE_KEYS } from "../capabilities/module-registry";
import { SetNoticeSettingDto } from "./dto";
import type { NoticeSettingsReader } from "./notice-settings";
import {
    defaultOn,
    isNoticeKind,
    NOTICE_KINDS,
    NOTICE_MODULE,
    NOTICE_WORDS,
    noticeOffer,
    noticeOn,
    settingOn,
} from "./notice-settings";
import { NoticeSettingsService } from "./notice-settings.service";

const db = prisma as unknown as {
    customerNoticeSetting: Record<string, jest.Mock>;
    communicationProvider: Record<string, jest.Mock>;
};

const record = jest.fn();
const evaluate = jest.fn();

function service() {
    return new NoticeSettingsService(
        { evaluate } as unknown as ModuleAvailabilityService,
        { record } as unknown as AuditService,
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

function email(status: string | null) {
    db.communicationProvider.findUnique.mockResolvedValue(
        status ? { status } : null,
    );
}

beforeEach(() => {
    jest.clearAllMocks();
    modules();
    email("CONNECTED");
    db.customerNoticeSetting.findMany.mockResolvedValue([]);
});

describe("the kinds (pure)", () => {
    it("every kind starts on, except overdue reminders, which a business opts into (D3)", () => {
        const off = NOTICE_KINDS.filter((k) => !defaultOn(k));
        expect(off).toEqual(["OVERDUE_REMINDERS"]);
    });

    it("every kind has words, and a module that exists or none", () => {
        for (const kind of NOTICE_KINDS) {
            expect(NOTICE_WORDS[kind].label.length).toBeGreaterThan(0);
            expect(NOTICE_WORDS[kind].says.length).toBeGreaterThan(0);
            const module = NOTICE_MODULE[kind];
            if (module !== null) expect(MODULE_KEYS).toContain(module);
        }
    });

    it("memberships, renewals, autopay and refunds belong to Payments; courses, packs and the shop to theirs", () => {
        expect(NOTICE_MODULE).toMatchObject({
            MEMBERSHIP: "PAYMENTS",
            RENEWAL_INVOICE: "PAYMENTS",
            AUTOPAY_FAILED: "PAYMENTS",
            REFUND: "PAYMENTS",
            COURSE: "COURSES",
            PACK_CREDITS: "CLASS_PACKS",
            ORDER_DELIVERY: "COMMERCE",
            BACK_IN_STOCK: "COMMERCE",
            ENQUIRY_REPLY: "CRM",
            TEAM_REPLY: null,
            OVERDUE_REMINDERS: null,
        });
    });

    it("knows its kinds, and nothing else", () => {
        expect(isNoticeKind("MEMBERSHIP")).toBe(true);
        expect(isNoticeKind("membership")).toBe(false);
        expect(isNoticeKind("BOOKING_CONFIRMED")).toBe(false);
        expect(isNoticeKind(undefined)).toBe(false);
    });

    it("a stored row wins over the default, either way", () => {
        expect(settingOn([], "MEMBERSHIP")).toBe(true);
        expect(settingOn([], "OVERDUE_REMINDERS")).toBe(false);
        expect(
            settingOn([{ kind: "MEMBERSHIP", enabled: false }], "MEMBERSHIP"),
        ).toBe(false);
        expect(
            settingOn(
                [{ kind: "OVERDUE_REMINDERS", enabled: true }],
                "OVERDUE_REMINDERS",
            ),
        ).toBe(true);
        // Another kind's row says nothing about this one.
        expect(
            settingOn([{ kind: "REFUND", enabled: false }], "MEMBERSHIP"),
        ).toBe(true);
    });

    it("a kind whose module is off isn't listed; the enquiry reply with no email is listed, not offered", () => {
        const has = (on: boolean, emailConnected: boolean) => ({
            moduleOn: () => on,
            emailConnected,
        });
        expect(noticeOffer("MEMBERSHIP", has(false, true))).toBeNull();
        expect(noticeOffer("TEAM_REPLY", has(false, false))).toEqual({
            offered: true,
        });
        expect(noticeOffer("ENQUIRY_REPLY", has(true, false))).toEqual({
            offered: false,
            why: "NO_EMAIL",
        });
        expect(noticeOffer("ENQUIRY_REPLY", has(true, true))).toEqual({
            offered: true,
        });
        // The module comes first: no CRM, no row at all.
        expect(noticeOffer("ENQUIRY_REPLY", has(false, false))).toBeNull();
    });
});

describe("noticeOn: what every sender asks", () => {
    function reader(row: { enabled: boolean } | null) {
        const findUnique = jest.fn().mockResolvedValue(row);
        return {
            tx: {
                customerNoticeSetting: { findUnique },
            } as unknown as NoticeSettingsReader,
            findUnique,
        };
    }

    it("reads the business's row for that kind on the caller's transaction", async () => {
        const { tx, findUnique } = reader({ enabled: false });
        expect(await noticeOn(tx, "org_1", "MEMBERSHIP")).toBe(false);
        expect(findUnique).toHaveBeenCalledWith({
            where: {
                organizationId_kind: {
                    organizationId: "org_1",
                    kind: "MEMBERSHIP",
                },
            },
            select: { enabled: true },
        });
    });

    it("with no row, the default", async () => {
        expect(await noticeOn(reader(null).tx, "org_1", "REFUND")).toBe(true);
        expect(
            await noticeOn(reader(null).tx, "org_1", "OVERDUE_REMINDERS"),
        ).toBe(false);
    });
});

describe("reading the switches", () => {
    it("a fresh business reads every kind at its default, all offered, and its owner can change them", async () => {
        const view = await service().read(ctx());

        expect(view.canChange).toBe(true);
        expect(view.notices.map((n) => n.kind)).toEqual([...NOTICE_KINDS]);
        for (const n of view.notices) {
            expect(n.on).toBe(n.default);
            expect(n.default).toBe(n.kind !== "OVERDUE_REMINDERS");
            expect(n).toMatchObject({ offered: true, reason: null, why: null });
        }
        expect(view.notices[2]).toMatchObject({
            kind: "MEMBERSHIP",
            label: "Membership emails",
        });
    });

    it("a business with Payments off isn't offered membership, renewal, autopay or refund emails", async () => {
        modules(["PAYMENTS"]);
        const kinds = (await service().read(ctx())).notices.map((n) => n.kind);
        for (const k of [
            "MEMBERSHIP",
            "RENEWAL_INVOICE",
            "AUTOPAY_FAILED",
            "REFUND",
        ]) {
            expect(kinds).not.toContain(k);
        }
        expect(kinds).toContain("OVERDUE_REMINDERS");
    });

    it("a module rolled out off (DEC-057) hides its kinds as one turned off does", async () => {
        modules([], ["COURSES", "CLASS_PACKS"]);
        const kinds = (await service().read(ctx())).notices.map((n) => n.kind);
        expect(kinds).not.toContain("COURSE");
        expect(kinds).not.toContain("PACK_CREDITS");
    });

    it("with no email provider, the enquiry reply is listed but not offered, and says why", async () => {
        email(null);
        const view = await service().read(ctx());
        expect(view.notices.find((n) => n.kind === "ENQUIRY_REPLY")).toEqual(
            expect.objectContaining({
                offered: false,
                reason: "NO_EMAIL",
                why: "Connect your email first",
                on: true,
            }),
        );
        // A provider that stopped working is no provider either.
        email("ERROR");
        const again = await service().read(ctx());
        expect(
            again.notices.find((n) => n.kind === "ENQUIRY_REPLY")?.offered,
        ).toBe(false);
    });

    it("shows a stored choice", async () => {
        db.customerNoticeSetting.findMany.mockResolvedValue([
            { kind: "MEMBERSHIP", enabled: false },
            { kind: "OVERDUE_REMINDERS", enabled: true },
        ]);
        const view = await service().read(ctx());
        const on = (k: string) => view.notices.find((n) => n.kind === k)?.on;
        expect(on("MEMBERSHIP")).toBe(false);
        expect(on("OVERDUE_REMINDERS")).toBe(true);
        expect(on("REFUND")).toBe(true);
    });

    it("a Member reads the switches but can't change them", async () => {
        const view = await service().read(
            ctx({ role: "MEMBER", roleKey: "MEMBER" }),
        );
        expect(view.canChange).toBe(false);
        expect(view.notices.length).toBe(NOTICE_KINDS.length);
    });

    it("reads only the business in the context", async () => {
        await service().read(ctx({ organizationId: "org_2" }));
        expect(db.customerNoticeSetting.findMany).toHaveBeenCalledWith({
            where: { organizationId: "org_2" },
            select: { kind: true, enabled: true },
        });
    });
});

describe("changing a switch", () => {
    it("off, away from the default: one row, who did it, and an audit entry", async () => {
        await service().update(ctx(), { kind: "MEMBERSHIP", on: false });

        expect(db.customerNoticeSetting.upsert).toHaveBeenCalledWith({
            where: {
                organizationId_kind: {
                    organizationId: "org_1",
                    kind: "MEMBERSHIP",
                },
            },
            create: {
                organizationId: "org_1",
                kind: "MEMBERSHIP",
                enabled: false,
                updatedByUserId: "user_1",
            },
            update: { enabled: false, updatedByUserId: "user_1" },
        });
        expect(db.customerNoticeSetting.deleteMany).not.toHaveBeenCalled();
        expect(record).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "customer-notices.setting",
                actorUserId: "user_1",
                organizationId: "org_1",
                targetType: "organization",
                targetId: "org_1",
                metadata: {
                    kind: "MEMBERSHIP",
                    changes: [
                        { field: "noticeOn", before: true, after: false },
                    ],
                },
            }),
        );
    });

    it("back to the default deletes the row instead of storing it", async () => {
        db.customerNoticeSetting.findMany.mockResolvedValue([
            { kind: "MEMBERSHIP", enabled: false },
        ]);
        await service().update(ctx(), { kind: "MEMBERSHIP", on: true });

        expect(db.customerNoticeSetting.deleteMany).toHaveBeenCalledWith({
            where: { organizationId: "org_1", kind: "MEMBERSHIP" },
        });
        expect(db.customerNoticeSetting.upsert).not.toHaveBeenCalled();
        expect(record).toHaveBeenCalledTimes(1);
    });

    it("overdue reminders, off by default, are stored when turned on", async () => {
        await service().update(ctx(), { kind: "OVERDUE_REMINDERS", on: true });
        expect(db.customerNoticeSetting.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                create: expect.objectContaining({ enabled: true }),
            }),
        );
    });

    it("setting what is already set writes no audit entry", async () => {
        await service().update(ctx(), { kind: "REFUND", on: true });
        expect(record).not.toHaveBeenCalled();
    });

    it("a Member without comms:manage is refused (403), and nothing is written", async () => {
        await expect(
            service().update(ctx({ role: "MEMBER", roleKey: "MEMBER" }), {
                kind: "MEMBERSHIP",
                on: false,
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(db.customerNoticeSetting.upsert).not.toHaveBeenCalled();
        expect(db.customerNoticeSetting.deleteMany).not.toHaveBeenCalled();
    });

    it("a kind whose module is off is refused in words (409)", async () => {
        modules(["PAYMENTS"]);
        await expect(
            service().update(ctx(), { kind: "MEMBERSHIP", on: false }),
        ).rejects.toThrow(
            new ConflictException("That email isn't one this business sends."),
        );
        expect(db.customerNoticeSetting.upsert).not.toHaveBeenCalled();
    });

    it("the enquiry reply with no email provider is refused with the reason (409)", async () => {
        email(null);
        await expect(
            service().update(ctx(), { kind: "ENQUIRY_REPLY", on: false }),
        ).rejects.toThrow(new ConflictException("Connect your email first."));
        expect(db.customerNoticeSetting.upsert).not.toHaveBeenCalled();
    });
});

describe("the request body", () => {
    const pipe = new ValidationPipe(validationPipeOptions);
    const validate = (body: unknown) =>
        pipe.transform(body, { type: "body", metatype: SetNoticeSettingDto });

    it("takes a kind and a real boolean", async () => {
        await expect(
            validate({ kind: "MEMBERSHIP", on: false }),
        ).resolves.toEqual({ kind: "MEMBERSHIP", on: false });
    });

    it.each([
        { kind: "membership", on: false },
        { kind: "BOOKING_CONFIRMED", on: false },
        { kind: "MEMBERSHIP", on: "false" },
        { kind: "MEMBERSHIP" },
        { on: true },
    ])("refuses %j (400)", async (body) => {
        await expect(validate(body)).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });
});

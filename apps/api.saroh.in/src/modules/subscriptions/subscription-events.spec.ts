// A subscription's log (D9): what an action records, who it names, and how
// the log is read a page at a time. The database is mocked;
// subscription-events.db.spec.ts writes and reads real rows.
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    return {
        ...actual,
        prisma: {
            customerSubscription: { findFirst: jest.fn() },
            subscriptionEvent: {
                findFirst: jest.fn(),
                findMany: jest.fn(),
            },
            invoice: { findMany: jest.fn() },
            user: { findMany: jest.fn() },
        },
    };
});

import "reflect-metadata";

import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import {
    collectionChanges,
    JOB,
    listSubscriptionEvents,
    recordSubscriptionEvent,
    subscriptionActor,
    subscriptionEventLog,
} from "./subscription-events";

type Mocked = Record<string, jest.Mock>;
const db = prisma as unknown as Record<string, Mocked>;

describe("what an action records", () => {
    const create = jest.fn();
    const tx = {
        subscriptionEvent: { create },
    } as unknown as Prisma.TransactionClient;

    beforeEach(() => create.mockReset());

    it("writes one row with who, the invoice, a note and its data", async () => {
        await recordSubscriptionEvent(
            tx,
            "org_1",
            "sub_1",
            "RESUMED",
            { actorKind: "TEAM", actorUserId: "user_1" },
            { invoiceId: "inv_1", data: { restarted: true } },
        );
        expect(create).toHaveBeenCalledWith({
            data: {
                organizationId: "org_1",
                subscriptionId: "sub_1",
                kind: "RESUMED",
                actorKind: "TEAM",
                actorUserId: "user_1",
                customerAccountId: null,
                invoiceId: "inv_1",
                note: null,
                data: { restarted: true },
            },
        });
    });

    it("binds a log to one subscription and one actor", async () => {
        const log = subscriptionEventLog(tx, "org_1", "sub_1", JOB);
        await log("ENDED");
        expect(create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                subscriptionId: "sub_1",
                kind: "ENDED",
                actorKind: "JOB",
                actorUserId: null,
                invoiceId: null,
                data: {},
            }),
        });
    });

    it("records the customer's own account when they acted", async () => {
        await recordSubscriptionEvent(tx, "org_1", "sub_1", "PAUSED", {
            actorKind: "CUSTOMER",
            actorUserId: null,
            customerAccountId: "acct_1",
        });
        expect(create.mock.calls[0]![0].data).toMatchObject({
            actorKind: "CUSTOMER",
            customerAccountId: "acct_1",
        });
    });

    it("keeps only the collection fields that changed", () => {
        expect(
            collectionChanges(
                { weekday: 6, note: "1 loaf" },
                { weekday: 3, note: "1 loaf" },
            ),
        ).toEqual({ weekday: [6, 3] });
        expect(
            collectionChanges(
                { weekday: 6, note: "1 loaf" },
                { weekday: null, note: null },
            ),
        ).toEqual({ weekday: [6, null], note: ["1 loaf", null] });
        expect(
            collectionChanges(
                { weekday: 6, note: null },
                { weekday: 6, note: null },
            ),
        ).toEqual({});
    });
});

describe("who an action is recorded as", () => {
    const ctx: OrganizationContext = {
        organizationId: "org_1",
        userId: "user_1",
        role: "OWNER",
    };

    it("is the team member, or OPERATOR for a Saroh operator", () => {
        expect(subscriptionActor(ctx)).toEqual({
            actorKind: "TEAM",
            actorUserId: "user_1",
        });
        expect(
            subscriptionActor({
                ...ctx,
                userId: "op_1",
                roleKey: "platform-operator",
            }),
        ).toEqual({ actorKind: "OPERATOR", actorUserId: "op_1" });
    });
});

describe("reading a subscription's log", () => {
    const at = (s: string) => new Date(s);
    const row = (
        id: string,
        over: Record<string, unknown> = {},
    ): Record<string, unknown> => ({
        id,
        kind: "PAUSED",
        actorKind: "TEAM",
        actorUserId: "user_1",
        invoiceId: null,
        note: null,
        data: {},
        createdAt: at("2026-10-01T10:00:00Z"),
        ...over,
    });
    const read = (
        options: {
            cursor?: string;
            limit?: number;
            showInvoices?: boolean;
        } = {},
    ) =>
        listSubscriptionEvents("org_1", "sub_1", {
            showInvoices: true,
            ...options,
        });

    beforeEach(() => {
        jest.clearAllMocks();
        db.customerSubscription!.findFirst!.mockResolvedValue({ id: "sub_1" });
        db.subscriptionEvent!.findFirst!.mockImplementation(
            (args: { where: { kind?: string } }) =>
                Promise.resolve(
                    args.where.kind === "SUBSCRIBED" ? { id: "evt_0" } : null,
                ),
        );
        db.subscriptionEvent!.findMany!.mockResolvedValue([]);
        db.invoice!.findMany!.mockResolvedValue([]);
        db.user!.findMany!.mockResolvedValue([{ id: "user_1", name: "Priya" }]);
    });

    it("names who did each thing, newest first, within the business", async () => {
        db.subscriptionEvent!.findMany!.mockResolvedValue([
            row("evt_2", { kind: "RESUMED", data: { extendedDays: 3 } }),
            row("evt_1"),
        ]);
        const page = await read();
        expect(page).toEqual({
            events: [
                {
                    id: "evt_2",
                    kind: "RESUMED",
                    actor: { kind: "TEAM", userId: "user_1", name: "Priya" },
                    invoice: null,
                    note: null,
                    data: { extendedDays: 3 },
                    createdAt: "2026-10-01T10:00:00.000Z",
                },
                expect.objectContaining({ id: "evt_1", kind: "PAUSED" }),
            ],
            nextCursor: null,
            earlierUnrecorded: false,
        });
        const query = db.subscriptionEvent!.findMany!.mock.calls[0]![0];
        expect(query.where).toEqual({
            organizationId: "org_1",
            subscriptionId: "sub_1",
        });
        expect(query.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    });

    it("shows an operator as Saroh support, the job as Saroh and a customer unnamed", async () => {
        db.subscriptionEvent!.findMany!.mockResolvedValue([
            row("evt_3", { actorKind: "OPERATOR", actorUserId: "op_1" }),
            row("evt_2", { actorKind: "JOB", actorUserId: null }),
            row("evt_1", { actorKind: "CUSTOMER", actorUserId: null }),
        ]);
        const page = await read();
        expect(page.events.map((e) => e.actor)).toEqual([
            { kind: "OPERATOR", userId: null, name: "Saroh support" },
            { kind: "JOB", userId: null, name: "Saroh" },
            { kind: "CUSTOMER", userId: null, name: null },
        ]);
        expect(db.user!.findMany).not.toHaveBeenCalled();
    });

    it("names the invoice an event issued, only for someone who reads invoices", async () => {
        db.subscriptionEvent!.findMany!.mockResolvedValue([
            row("evt_2", { kind: "RENEWED", invoiceId: "inv_2" }),
        ]);
        db.invoice!.findMany!.mockResolvedValue([
            { id: "inv_2", number: "INV-0042" },
        ]);
        expect((await read()).events[0]!.invoice).toEqual({
            id: "inv_2",
            number: "INV-0042",
        });
        expect(db.invoice!.findMany!.mock.calls[0]![0].where).toEqual({
            organizationId: "org_1",
            id: { in: ["inv_2"] },
        });

        db.invoice!.findMany!.mockClear();
        expect(
            (await read({ showInvoices: false })).events[0]!.invoice,
        ).toBeNull();
        expect(db.invoice!.findMany).not.toHaveBeenCalled();
    });

    it("pages by the last event, reading one more to know there is more", async () => {
        db.subscriptionEvent!.findMany!.mockResolvedValue([
            row("evt_3"),
            row("evt_2"),
            row("evt_1"),
        ]);
        const page = await read({ limit: 2 });
        expect(page.events.map((e) => e.id)).toEqual(["evt_3", "evt_2"]);
        expect(page.nextCursor).toBe("evt_2");
        expect(db.subscriptionEvent!.findMany!.mock.calls[0]![0].take).toBe(3);
    });

    it("reads on from the cursor: older, or as old with a smaller id", async () => {
        const when = at("2026-10-01T10:00:00Z");
        db.subscriptionEvent!.findFirst!.mockImplementation(
            (args: { where: { kind?: string; id?: string } }) =>
                Promise.resolve(
                    args.where.id === "evt_2"
                        ? { id: "evt_2", createdAt: when }
                        : null,
                ),
        );
        const page = await read({ cursor: "evt_2" });
        expect(db.subscriptionEvent!.findMany!.mock.calls[0]![0].where).toEqual(
            {
                organizationId: "org_1",
                subscriptionId: "sub_1",
                OR: [
                    { createdAt: { lt: when } },
                    { createdAt: when, id: { lt: "evt_2" } },
                ],
            },
        );
        // No SUBSCRIBED event: it began before the log was kept.
        expect(page.earlierUnrecorded).toBe(true);
    });

    it("refuses a cursor that isn't one of this subscription's events", async () => {
        await expect(read({ cursor: "evt_other" })).rejects.toBeInstanceOf(
            BadRequestException,
        );
        expect(db.subscriptionEvent!.findMany).not.toHaveBeenCalled();
    });

    it("answers another business's subscription with a 404 before reading its log", async () => {
        db.customerSubscription!.findFirst!.mockResolvedValue(null);
        await expect(read()).rejects.toBeInstanceOf(NotFoundException);
        expect(db.customerSubscription!.findFirst).toHaveBeenCalledWith({
            where: { id: "sub_1", organizationId: "org_1" },
            select: { id: true },
        });
        expect(db.subscriptionEvent!.findMany).not.toHaveBeenCalled();
    });

    it("keeps the page between 1 and 100", async () => {
        await read({ limit: 500 });
        await read({ limit: 0 });
        await read();
        const takes = db.subscriptionEvent!.findMany!.mock.calls.map(
            ([a]) => a.take,
        );
        expect(takes).toEqual([101, 2, 51]);
    });
});

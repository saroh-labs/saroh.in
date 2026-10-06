// `queueTransactional`'s Saroh branch (DEC-086), DB-free: the order of its
// checks (address → provider → consent) is unchanged, and only the
// provider's 409 gives way, for a booking notice the one rule lets Saroh
// send. The rule itself has its own spec (`saroh-may-send.spec.ts`).
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    },
}));

jest.mock("./saroh-may-send", () => ({
    ...jest.requireActual<object>("./saroh-may-send"),
    sarohMaySend: jest.fn(),
}));

jest.mock("@saroh/database", () => ({ prisma: {} }));

// The allowance's meter (U3), stood in: the real one is in
// saroh-email-allowance.db.spec.ts.
jest.mock("../billing/metering.service", () => ({
    ...jest.requireActual<object>("../billing/metering.service"),
    planMeter: { roomInTx: jest.fn(), enforcedRow: jest.fn() },
}));

import { ConflictException, ForbiddenException } from "@nestjs/common";

import { planMeter } from "../billing/metering.service";
import type { NoticeVars } from "../site-accounts/notify-templates";
import { renderNotice } from "../site-accounts/notify-templates";
import { CommunicationsService } from "./communications.service";
import { sarohMaySend } from "./saroh-may-send";

const maySend = sarohMaySend as jest.Mock;
const roomInTx = planMeter.roomInTx as jest.Mock;
const enforcedRow = planMeter.enforcedRow as jest.Mock;

/** The meter refusing at the cap, with the caller's own refusal. */
const atTheCap = (
    _tx: unknown,
    _org: string,
    _row: string,
    opts: { refuse: () => Error },
) => Promise.reject(opts.refuse());

const vars: NoticeVars = {
    kind: "BOOKING_CONFIRMED",
    booking: {
        business: "Rye & Co. www.rye.example",
        firstName: "Asha",
        service: "Check-up",
        staff: null,
        startAt: new Date("2026-10-06T05:30:00Z"),
        fromStartAt: null,
        timeZone: "Asia/Kolkata",
        byCustomer: false,
    },
};

function makeTx(
    over: { provider?: string | null; consent?: string | null } = {},
) {
    const provider = over.provider === undefined ? null : over.provider;
    return {
        customerAccount: {
            findFirst: jest
                .fn()
                .mockResolvedValue({ email: "asha@example.com" }),
        },
        communicationProvider: {
            findUnique: jest
                .fn()
                .mockResolvedValue(
                    provider ? { provider: "RESEND", status: provider } : null,
                ),
        },
        consent: {
            findUnique: jest
                .fn()
                .mockResolvedValue(
                    over.consent ? { status: over.consent } : null,
                ),
        },
        organization: {
            findUnique: jest.fn().mockResolvedValue({ slug: "rye-co" }),
        },
        businessProfile: {
            findUnique: jest.fn().mockResolvedValue({
                contactEmail: "hello@rye.example",
                phone: null,
            }),
        },
        message: {
            create: jest.fn(({ data }: { data: object }) =>
                Promise.resolve({ id: "msg_1", ...data }),
            ),
        },
        delivery: {
            create: jest.fn().mockResolvedValue({ id: "del_1" }),
            count: jest.fn().mockResolvedValue(3),
        },
        job: { create: jest.fn().mockResolvedValue({ id: "job_1" }) },
        service: { findFirst: jest.fn().mockResolvedValue(null) },
        customerNotice: {
            findUnique: jest.fn().mockResolvedValue(null),
            findMany: jest.fn().mockResolvedValue([]),
        },
        $executeRaw: jest.fn().mockResolvedValue(1),
    };
}

type Tx = Parameters<CommunicationsService["queueTransactional"]>[0];

const notice = (sarohMay?: boolean) => ({
    template: "BOOKING_CONFIRMED" as const,
    notice: vars,
    ...(sarohMay === undefined ? {} : { sarohMay }),
    recipient: { kind: "SITE_ACCOUNT" as const, contactId: "contact_1" },
    createdByUserId: null,
});

const comms = new CommunicationsService();

beforeEach(() => {
    jest.clearAllMocks();
    maySend.mockResolvedValue(true);
    roomInTx.mockResolvedValue({ limit: 3, used: 0, adding: 1 });
    enforcedRow.mockResolvedValue({
        moduleId: "saroh-emails",
        state: "on",
        limit: 3,
        per: "month",
    });
});

describe("queueTransactional through Saroh (DEC-086)", () => {
    it("no provider and the handler's yes: Message, a SAROH delivery and one job, its tries capped", async () => {
        const tx = makeTx();
        const res = await comms.queueTransactional(
            tx as unknown as Tx,
            "org_1",
            notice(true),
        );
        expect(res).toEqual({
            id: "msg_1",
            status: "QUEUED",
            toAddress: "asha@example.com",
            route: "SAROH",
        });
        // The handler asked already; a flip since can't 409 its transaction.
        expect(maySend).not.toHaveBeenCalled();
        expect(tx.delivery.create.mock.calls[0][0].data).toMatchObject({
            provider: "SAROH",
            status: "QUEUED",
        });
        expect(tx.job.create.mock.calls[0][0].data).toMatchObject({
            type: "message.send",
            maxAttempts: 5,
            payload: { messageId: "msg_1", deliveryId: "del_1" },
        });
        const data = tx.message.create.mock.calls[0][0].data as {
            subject: string;
            body: string;
            template: string;
        };
        expect(data.template).toBe("BOOKING_CONFIRMED");
        // Names cleaned, Saroh's footer added.
        expect(data.subject).toBe("Your booking with Rye & Co. is confirmed");
        expect(`${data.subject} ${data.body}`).not.toContain("rye.example");
        expect(data.body).toContain("Sent for Rye &amp; Co. by Saroh.");
    });

    it("asks the rule itself when the caller didn't", async () => {
        const tx = makeTx({ provider: "DISABLED" });
        const res = await comms.queueTransactional(
            tx as unknown as Tx,
            "org_1",
            notice(),
        );
        expect(res.route).toBe("SAROH");
        expect(maySend).toHaveBeenCalledWith(tx, "org_1", "BOOKING_CONFIRMED");
    });

    it("the rule says no: 409 as before, nothing written", async () => {
        maySend.mockResolvedValue(false);
        const tx = makeTx();
        await expect(
            comms.queueTransactional(tx as unknown as Tx, "org_1", notice()),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(tx.message.create).not.toHaveBeenCalled();
    });

    it("a connected provider sends it, worded as ever, and Saroh is never asked", async () => {
        const tx = makeTx({ provider: "CONNECTED" });
        const res = await comms.queueTransactional(
            tx as unknown as Tx,
            "org_1",
            notice(),
        );
        expect(res.route).toBe("PROVIDER");
        expect(maySend).not.toHaveBeenCalled();
        expect(tx.delivery.create.mock.calls[0][0].data.provider).toBe(
            "RESEND",
        );
        expect(tx.message.create.mock.calls[0][0].data).toMatchObject(
            renderNotice(vars),
        );
    });

    it("a revoked email consent still suppresses it on Saroh's route: no delivery, no job", async () => {
        const tx = makeTx({ consent: "REVOKED" });
        const res = await comms.queueTransactional(
            tx as unknown as Tx,
            "org_1",
            notice(true),
        );
        expect(res).toMatchObject({ status: "SUPPRESSED", route: "SAROH" });
        expect(tx.delivery.create).not.toHaveBeenCalled();
        expect(tx.job.create).not.toHaveBeenCalled();
    });

    it("never takes words already rendered through Saroh: they weren't cleaned for it", async () => {
        const tx = makeTx();
        await expect(
            comms.queueTransactional(tx as unknown as Tx, "org_1", {
                template: "BOOKING_CONFIRMED",
                rendered: renderNotice(vars),
                recipient: { kind: "SITE_ACCOUNT", contactId: "contact_1" },
                createdByUserId: null,
            }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(maySend).not.toHaveBeenCalled();
    });
});

describe("the monthly allowance on Saroh's route (U3)", () => {
    it("counts each send against the business's row, on its transaction", async () => {
        const tx = makeTx();
        await comms.queueTransactional(
            tx as unknown as Tx,
            "org_1",
            notice(true),
        );
        expect(roomInTx).toHaveBeenCalledWith(
            tx,
            "org_1",
            "saroh-emails",
            expect.objectContaining({ refuse: expect.any(Function) }),
        );
    });

    it("at the cap: recorded ALLOWANCE_USED, no delivery or job, nothing thrown, the cap's notice queued once", async () => {
        roomInTx.mockImplementation(atTheCap);
        const tx = makeTx();
        const res = await comms.queueTransactional(
            tx as unknown as Tx,
            "org_1",
            notice(true),
        );
        expect(res).toMatchObject({ status: "ALLOWANCE_USED", route: "SAROH" });
        expect(tx.message.create.mock.calls[0][0].data).toMatchObject({
            status: "ALLOWANCE_USED",
            template: "BOOKING_CONFIRMED",
        });
        expect(tx.delivery.create).not.toHaveBeenCalled();
        const jobs = tx.job.create.mock.calls.map(
            (c: [{ data: { type: string } }]) => c[0].data,
        );
        expect(jobs).toEqual([
            expect.objectContaining({
                type: "plan.limit.notice",
                payload: { organizationId: "org_1", moduleId: "saroh-emails" },
            }),
        ]);
        expect(tx.customerNotice.findUnique.mock.calls[0][0].where).toEqual({
            organizationId_eventKey: {
                organizationId: "org_1",
                eventKey: expect.stringMatching(
                    /^plan-limit:saroh-emails:full:3:\d{4}-\d{2}$/,
                ) as unknown,
            },
        });
    });

    it("at the cap with this month's notice already told: no second notice job", async () => {
        roomInTx.mockImplementation(atTheCap);
        const tx = makeTx();
        tx.customerNotice.findUnique.mockResolvedValue({ id: "cn_1" });
        await comms.queueTransactional(
            tx as unknown as Tx,
            "org_1",
            notice(true),
        );
        expect(tx.job.create).not.toHaveBeenCalled();
    });

    it("no allowance to count against (the meter has nothing): NO_ALLOWANCE, not sent", async () => {
        roomInTx.mockResolvedValue(null);
        const tx = makeTx();
        const res = await comms.queueTransactional(
            tx as unknown as Tx,
            "org_1",
            notice(true),
        );
        expect(res.status).toBe("NO_ALLOWANCE");
        expect(tx.delivery.create).not.toHaveBeenCalled();
        expect(tx.job.create).not.toHaveBeenCalled();
    });

    it("a soft allowance cell (it would never refuse): NO_ALLOWANCE, never unmetered", async () => {
        roomInTx.mockImplementation(
            (
                _tx: unknown,
                _org: string,
                _row: string,
                opts: { refuseSoft: () => Error },
            ) => Promise.reject(opts.refuseSoft()),
        );
        const tx = makeTx();
        const res = await comms.queueTransactional(
            tx as unknown as Tx,
            "org_1",
            notice(true),
        );
        expect(res).toMatchObject({ status: "NO_ALLOWANCE", route: "SAROH" });
        expect(tx.message.create.mock.calls[0][0].data).toMatchObject({
            status: "NO_ALLOWANCE",
        });
        expect(tx.delivery.create).not.toHaveBeenCalled();
        expect(tx.job.create).not.toHaveBeenCalled();
    });

    it("the row turned off since: NO_ALLOWANCE, the refusal kept out of the caller's transaction", async () => {
        roomInTx.mockRejectedValue(new ForbiddenException("locked"));
        const tx = makeTx();
        await expect(
            comms.queueTransactional(
                tx as unknown as Tx,
                "org_1",
                notice(true),
            ),
        ).resolves.toMatchObject({ status: "NO_ALLOWANCE" });
    });

    it("a database failure is not swallowed: the job retries", async () => {
        roomInTx.mockRejectedValue(new Error("connection lost"));
        await expect(
            comms.queueTransactional(
                makeTx() as unknown as Tx,
                "org_1",
                notice(true),
            ),
        ).rejects.toThrow("connection lost");
    });

    it("a revoked consent is suppressed before anything is counted", async () => {
        const tx = makeTx({ consent: "REVOKED" });
        await comms.queueTransactional(
            tx as unknown as Tx,
            "org_1",
            notice(true),
        );
        expect(roomInTx).not.toHaveBeenCalled();
    });

    it("the business's own provider is never counted", async () => {
        const tx = makeTx({ provider: "CONNECTED" });
        await comms.queueTransactional(tx as unknown as Tx, "org_1", notice());
        expect(roomInTx).not.toHaveBeenCalled();
    });
});

describe("Saroh's cap per booking (DEC-086)", () => {
    const aboutBooking = () => ({ ...notice(true), bookingId: "bk_1" });

    it("under the cap: counted through the booking's notices, then queued", async () => {
        const tx = makeTx();
        tx.customerNotice.findMany.mockResolvedValue([
            { messageId: "m1" },
            { messageId: "m2" },
        ]);
        tx.delivery.count.mockResolvedValue(2);
        const res = await comms.queueTransactional(
            tx as unknown as Tx,
            "org_1",
            aboutBooking(),
        );
        expect(res.status).toBe("QUEUED");
        expect(tx.customerNotice.findMany.mock.calls[0][0].where).toMatchObject(
            { organizationId: "org_1", bookingId: "bk_1" },
        );
        expect(tx.delivery.count.mock.calls[0][0].where).toMatchObject({
            provider: "SAROH",
            messageId: { in: ["m1", "m2"] },
        });
    });

    it("at 3 in the last day: BOOKING_LIMIT, nothing queued and the allowance not asked", async () => {
        const tx = makeTx();
        tx.customerNotice.findMany.mockResolvedValue([
            { messageId: "m1" },
            { messageId: "m2" },
            { messageId: "m3" },
        ]);
        tx.delivery.count.mockResolvedValue(3);
        const res = await comms.queueTransactional(
            tx as unknown as Tx,
            "org_1",
            aboutBooking(),
        );
        expect(res).toMatchObject({ status: "BOOKING_LIMIT", route: "SAROH" });
        expect(tx.message.create.mock.calls[0][0].data).toMatchObject({
            status: "BOOKING_LIMIT",
        });
        expect(roomInTx).not.toHaveBeenCalled();
        expect(tx.delivery.create).not.toHaveBeenCalled();
        expect(tx.job.create).not.toHaveBeenCalled();
    });

    it("the business's own provider has no cap per booking", async () => {
        const tx = makeTx({ provider: "CONNECTED" });
        tx.delivery.count.mockResolvedValue(10);
        const res = await comms.queueTransactional(
            tx as unknown as Tx,
            "org_1",
            {
                ...notice(),
                bookingId: "bk_1",
            },
        );
        expect(res).toMatchObject({ status: "QUEUED", route: "PROVIDER" });
        expect(tx.customerNotice.findMany).not.toHaveBeenCalled();
    });
});

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

import { ConflictException } from "@nestjs/common";

import type { NoticeVars } from "../site-accounts/notify-templates";
import { renderNotice } from "../site-accounts/notify-templates";
import { CommunicationsService } from "./communications.service";
import { sarohMaySend } from "./saroh-may-send";

const maySend = sarohMaySend as jest.Mock;

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
        delivery: { create: jest.fn().mockResolvedValue({ id: "del_1" }) },
        job: { create: jest.fn().mockResolvedValue({ id: "job_1" }) },
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

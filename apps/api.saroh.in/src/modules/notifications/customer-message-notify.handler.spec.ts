// DB-free + network-free: @saroh/database and the email helper are mocked.
jest.mock("@saroh/database", () => ({
    prisma: {
        customerThreadMessage: { findUnique: jest.fn() },
        notification: { create: jest.fn() },
        membership: { findMany: jest.fn() },
    },
}));

jest.mock("../../common/email", () => ({
    sendCustomerMessageNotificationEmail: jest
        .fn()
        .mockResolvedValue(undefined),
}));

jest.mock("../../env", () => ({ env: { APP_URL: "https://app.saroh.in" } }));

import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { sendCustomerMessageNotificationEmail } from "../../common/email";
import {
    attendedAt,
    enqueueCustomerMessageNotice,
    opensATurn,
} from "./customer-message-notify";
import {
    CUSTOMER_MESSAGE_NOTIFY_TYPE,
    CustomerMessageNotifyHandler,
    MESSAGE_NEW_NOTIFICATION_TYPE,
    messageQuote,
    writerName,
} from "./customer-message-notify.handler";

const findMessage = prisma.customerThreadMessage.findUnique as jest.Mock;
const notificationCreate = prisma.notification.create as jest.Mock;
const membershipFindMany = prisma.membership.findMany as jest.Mock;
const sendEmail = sendCustomerMessageNotificationEmail as jest.Mock;

function job(messageId = "msg_1"): Job {
    return {
        id: "job_1",
        type: CUSTOMER_MESSAGE_NOTIFY_TYPE,
        payload: { messageId },
    } as unknown as Job;
}

function message(overrides: Record<string, unknown> = {}) {
    return {
        id: "msg_1",
        organizationId: "org_1",
        author: "CUSTOMER",
        body: "Hi, any update on my Friday delivery question?",
        customerAccount: { email: "priya@example.in" },
        thread: {
            contact: {
                id: "contact_1",
                firstName: "Priya",
                lastName: null,
                email: "priya@example.in",
                mergedIntoId: null,
            },
        },
        ...overrides,
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    membershipFindMany.mockResolvedValue([
        { user: { email: "owner@example.in" } },
        { user: { email: "admin@example.in" } },
        { user: { email: "owner@example.in" } },
    ]);
});

describe("CustomerMessageNotifyHandler (UX-014)", () => {
    const handler = new CustomerMessageNotifyHandler();

    it("puts one notice in the inbox that opens the customer's thread, and emails owners and admins", async () => {
        findMessage.mockResolvedValue(message());
        notificationCreate.mockResolvedValue({ id: "n_1" });

        await handler.handle(job());

        expect(notificationCreate).toHaveBeenCalledWith({
            data: {
                organizationId: "org_1",
                type: MESSAGE_NEW_NOTIFICATION_TYPE,
                title: "Priya sent you a message",
                body: "Hi, any update on my Friday delivery question?",
                contactId: "contact_1",
                messageId: "msg_1",
            },
        });
        expect(sendEmail).toHaveBeenCalledTimes(2);
        expect(sendEmail).toHaveBeenCalledWith("owner@example.in", {
            customerName: "Priya",
            message: "Hi, any update on my Friday delivery question?",
            threadUrl: "https://app.saroh.in/customers/contact_1?tab=msg",
        });
    });

    it("names a separate contact by the email they sign in with, never the placeholder", async () => {
        findMessage.mockResolvedValue(
            message({
                thread: {
                    contact: {
                        id: "contact_2",
                        firstName: null,
                        lastName: null,
                        email: "account+contact_2@account.invalid",
                        mergedIntoId: null,
                    },
                },
            }),
        );
        await handler.handle(job());
        const data = notificationCreate.mock.calls[0][0].data;
        expect(data.title).toBe("priya@example.in sent you a message");
        expect(data.title).not.toContain("account.invalid");
    });

    it("opens the survivor when the contact was merged since", async () => {
        findMessage.mockResolvedValue(
            message({
                thread: {
                    contact: {
                        id: "contact_old",
                        firstName: "Priya",
                        lastName: null,
                        email: "x@example.in",
                        mergedIntoId: "contact_kept",
                    },
                },
            }),
        );
        await handler.handle(job());
        expect(notificationCreate.mock.calls[0][0].data.contactId).toBe(
            "contact_kept",
        );
    });

    it("notifies once when the job runs twice: the second create hits the unique and only retries email", async () => {
        findMessage.mockResolvedValue(message());
        notificationCreate.mockRejectedValueOnce(
            Object.assign(new Error("Unique"), { code: "P2002" }),
        );
        await expect(handler.handle(job())).resolves.toBeUndefined();
        expect(sendEmail).toHaveBeenCalledTimes(2);
    });

    it("is a no-op for a message that has gone, or one the team wrote", async () => {
        findMessage.mockResolvedValueOnce(null);
        await handler.handle(job());
        findMessage.mockResolvedValueOnce(message({ author: "STAFF" }));
        await handler.handle(job());
        expect(notificationCreate).not.toHaveBeenCalled();
        expect(sendEmail).not.toHaveBeenCalled();
    });

    it("rethrows any other failure so the worker retries", async () => {
        findMessage.mockResolvedValue(message());
        notificationCreate.mockRejectedValueOnce(new Error("db down"));
        await expect(handler.handle(job())).rejects.toThrow("db down");
    });
});

describe("wording", () => {
    it("quotes one line, cut with an ellipsis", () => {
        expect(messageQuote("  two\n\nlines  ")).toBe("two lines");
        const long = messageQuote("a".repeat(500));
        expect(long).toHaveLength(140);
        expect(long.endsWith("…")).toBe(true);
    });

    it("falls back to A customer with no name and no real email", () => {
        expect(
            writerName({
                firstName: null,
                lastName: " ",
                contactEmail: "account+c@account.invalid",
                accountEmail: null,
            }),
        ).toBe("A customer");
    });
});

describe("enqueueCustomerMessageNotice: the first message of a turn", () => {
    const at = (iso: string) => new Date(iso);

    it("takes the later of the team's last answer and last open", () => {
        expect(attendedAt({ lastStaffAt: null, staffReadAt: null })).toBeNull();
        expect(
            attendedAt({
                lastStaffAt: at("2026-10-07T10:00:00Z"),
                staffReadAt: at("2026-10-07T11:00:00Z"),
            }),
        ).toEqual(at("2026-10-07T11:00:00Z"));
        expect(
            attendedAt({
                lastStaffAt: at("2026-10-07T12:00:00Z"),
                staffReadAt: at("2026-10-07T11:00:00Z"),
            }),
        ).toEqual(at("2026-10-07T12:00:00Z"));
        expect(opensATurn(0)).toBe(true);
        expect(opensATurn(1)).toBe(false);
    });

    function tx(lastStaffAt: Date | null, earlierWaiting: number) {
        return {
            job: { create: jest.fn() },
            customerThreadMessage: {
                findFirst: jest
                    .fn()
                    .mockResolvedValue(
                        lastStaffAt ? { createdAt: lastStaffAt } : null,
                    ),
                count: jest.fn().mockResolvedValue(earlierWaiting),
            },
        };
    }

    const input = {
        organizationId: "org_1",
        threadId: "thread_1",
        messageId: "msg_2",
        createdAt: at("2026-10-07T12:30:00Z"),
        staffReadAt: at("2026-10-07T12:00:00Z"),
    };

    it("queues the notice when nothing else waits since the team last looked", async () => {
        const db = tx(at("2026-10-07T11:00:00Z"), 0);
        await expect(
            enqueueCustomerMessageNotice(db as never, input),
        ).resolves.toBe(true);
        expect(db.job.create).toHaveBeenCalledWith({
            data: {
                organizationId: "org_1",
                type: CUSTOMER_MESSAGE_NOTIFY_TYPE,
                payload: { messageId: "msg_2" },
            },
        });
        // Counted from the later of the two marks: the open at 12:00.
        const where = db.customerThreadMessage.count.mock.calls[0][0].where;
        expect(where.createdAt.gt).toEqual(at("2026-10-07T12:00:00Z"));
        expect(where.id).toEqual({ not: "msg_2" });
    });

    it("queues nothing for a follow-up in a turn already told", async () => {
        const db = tx(null, 1);
        await expect(
            enqueueCustomerMessageNotice(db as never, input),
        ).resolves.toBe(false);
        expect(db.job.create).not.toHaveBeenCalled();
    });
});

// DB-free + network-free unit tests: @saroh/database is mocked so nothing
// touches Postgres, and the email helper is mocked so nothing touches SMTP.
jest.mock("@saroh/database", () => ({
    prisma: {
        lead: { findUnique: jest.fn() },
        notification: { create: jest.fn() },
        membership: { findMany: jest.fn() },
    },
}));

jest.mock("../../common/email", () => ({
    sendEnquiryNotificationEmail: jest.fn().mockResolvedValue(undefined),
}));

// Avoid the real env validation (requires DATABASE_URL etc.) — the handler only
// reads APP_URL to build the lead link.
jest.mock("../../env", () => ({ env: { APP_URL: "https://app.saroh.in" } }));

import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { sendEnquiryNotificationEmail } from "../../common/email";
import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import {
    ENQUIRY_NEW_NOTIFICATION_TYPE,
    ENQUIRY_NOTIFY_TYPE,
    EnquiryNotifyHandler,
} from "./enquiry-notify.handler";

const leadFindUnique = prisma.lead.findUnique as jest.Mock;
const notificationCreate = prisma.notification.create as jest.Mock;
const membershipFindMany = prisma.membership.findMany as jest.Mock;
const sendEmail = sendEnquiryNotificationEmail as jest.Mock;

/** A claimed job carrying the enquiry-notify payload. */
function job(leadId = "lead_1"): Job {
    return {
        id: "job_1",
        type: ENQUIRY_NOTIFY_TYPE,
        payload: {
            leadId,
            contactId: "contact_1",
            formId: "form_1",
            submissionId: "sub_1",
        },
    } as unknown as Job;
}

/** A P2002 unique-violation error like the Prisma client raises. */
function p2002(): Error & { code: string } {
    return Object.assign(new Error("Unique constraint failed"), {
        code: "P2002",
    });
}

const lead = {
    id: "lead_1",
    organizationId: "org_1",
    contact: {
        id: "contact_1",
        firstName: "Ada",
        lastName: "Lovelace",
        company: null,
        email: "ada@example.com",
    },
    form: { id: "form_1", name: "Contact us" },
};

describe("EnquiryNotifyHandler", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        leadFindUnique.mockResolvedValue(lead);
        membershipFindMany.mockResolvedValue([
            { role: "OWNER", user: { email: "owner@example.com" } },
            { role: "ADMIN", user: { email: "admin@example.com" } },
        ]);
    });

    it("creates exactly one enquiry.new Notification for the lead and emails each owner/admin", async () => {
        notificationCreate.mockResolvedValue({ id: "notif_1" });
        const handler = new EnquiryNotifyHandler();

        await handler.handle(job());

        // Exactly ONE durable Notification, scoped to the lead's org, keyed to
        // the (leadId, type) unique.
        expect(notificationCreate).toHaveBeenCalledTimes(1);
        expect(notificationCreate.mock.calls[0][0].data).toMatchObject({
            organizationId: "org_1",
            type: ENQUIRY_NEW_NOTIFICATION_TYPE,
            leadId: "lead_1",
            title: "New enquiry from Ada Lovelace",
        });

        // Each owner/admin got an email pointing at the lead.
        expect(sendEmail).toHaveBeenCalledTimes(2);
        expect(sendEmail).toHaveBeenCalledWith(
            "owner@example.com",
            expect.objectContaining({
                contactName: "Ada Lovelace",
                formName: "Contact us",
                leadUrl: expect.stringContaining("/leads/lead_1"),
            }),
        );
        expect(sendEmail).toHaveBeenCalledWith(
            "admin@example.com",
            expect.any(Object),
        );
    });

    it("is a successful no-op on a second run for the same lead: the (leadId,type) unique blocks a duplicate Notification (notified once)", async () => {
        // First run creates the row; the second run hits P2002.
        notificationCreate
            .mockResolvedValueOnce({ id: "notif_1" })
            .mockRejectedValueOnce(p2002());
        const handler = new EnquiryNotifyHandler();

        await handler.handle(job());
        // The second delivery of the at-least-once job must NOT throw and must
        // NOT create a second Notification.
        await expect(handler.handle(job())).resolves.toBeUndefined();

        // create() was attempted twice (idempotent by the unique guard); the
        // second attempt was rejected with P2002 by the DB, so only ONE durable
        // row exists — the "notified once" guarantee. Both attempts used the
        // same (leadId, type) key.
        expect(notificationCreate).toHaveBeenCalledTimes(2);
        for (const call of notificationCreate.mock.calls) {
            expect(call[0].data).toMatchObject({
                leadId: "lead_1",
                type: ENQUIRY_NEW_NOTIFICATION_TYPE,
            });
        }
    });

    it("re-throws a non-P2002 Prisma error so the worker retries (and never swallows real failures)", async () => {
        notificationCreate.mockRejectedValue(
            Object.assign(new Error("db down"), { code: "P1001" }),
        );
        const handler = new EnquiryNotifyHandler();

        await expect(handler.handle(job())).rejects.toThrow("db down");
        expect(sendEmail).not.toHaveBeenCalled();
    });

    it("completes as a no-op when the lead no longer exists (never dead-letters a doomed job)", async () => {
        leadFindUnique.mockResolvedValue(null);
        const handler = new EnquiryNotifyHandler();

        await expect(handler.handle(job("gone"))).resolves.toBeUndefined();
        expect(notificationCreate).not.toHaveBeenCalled();
        expect(sendEmail).not.toHaveBeenCalled();
    });

    it("registers under the enquiry.notify job type", () => {
        const registry = new JobHandlerRegistry();
        const handler = new EnquiryNotifyHandler();

        registry.register(ENQUIRY_NOTIFY_TYPE, handler.handle);

        expect(registry.has("enquiry.notify")).toBe(true);
        expect(registry.get("enquiry.notify")).toBe(handler.handle);
    });
});

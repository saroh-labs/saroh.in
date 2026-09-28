import { describe, expect, it } from "vitest";

import type { CustomerThread } from "./thread";
import { emptyThreadText, messageFrom, replyNote } from "./thread";
import { showsThread } from "./view";

/**
 * The Messages tab's words on Customer Detail (round-2 A13): who each
 * message is from, what a reply does — honestly: it shows in their account,
 * nothing is emailed or texted — and when the tab shows at all.
 */

const THREAD: CustomerThread = {
    messages: [],
    earlier: false,
    unread: 0,
    signsIn: true,
    canReply: true,
};

describe("messageFrom", () => {
    it("names the customer, the viewer, a teammate and an automatic post", () => {
        const base = { by: null, mine: false, event: null };
        expect(messageFrom({ ...base, author: "CUSTOMER" }, "Farah")).toBe(
            "Farah",
        );
        expect(
            messageFrom({ ...base, author: "STAFF", mine: true }, "Farah"),
        ).toBe("You");
        expect(
            messageFrom({ ...base, author: "STAFF", by: "Priya Rao" }, "Farah"),
        ).toBe("Priya");
        expect(messageFrom({ ...base, author: "STAFF" }, "Farah")).toBe(
            "The team",
        );
        expect(
            messageFrom(
                { ...base, author: "SYSTEM", event: "INVOICE_SENT" },
                "Farah",
            ),
        ).toBe("Invoice sent");
        expect(
            messageFrom(
                { ...base, author: "SYSTEM", event: "INVOICE_REMINDER" },
                "Farah",
            ),
        ).toBe("Invoice reminder");
        expect(messageFrom({ ...base, author: "SYSTEM" }, "Farah")).toBe(
            "Automatic message",
        );
    });
});

describe("what a reply does", () => {
    it("shows in their account, and says nothing else is sent", () => {
        expect(replyNote(true, "Farah")).toBe(
            "Farah sees your reply in Messages when they're signed in on your site. Nothing is emailed or texted.",
        );
    });

    it("waits for someone who doesn't sign in yet", () => {
        expect(replyNote(false, "Farah")).toBe(
            "Farah doesn't sign in on your site yet. They'll see it when they sign in on your site.",
        );
        expect(emptyThreadText(false, "Farah")).toContain(
            "doesn't sign in on your site",
        );
    });
});

describe("showsThread", () => {
    it("shows for someone who signs in, or who has written, or a failed read", () => {
        expect(showsThread(THREAD)).toBe(true);
        expect(showsThread({ ...THREAD, signsIn: false })).toBe(false);
        expect(
            showsThread({
                ...THREAD,
                signsIn: false,
                messages: [
                    {
                        id: "m1",
                        author: "CUSTOMER",
                        body: "Hi",
                        at: "2026-10-04T09:00:00.000Z",
                        by: null,
                        mine: false,
                        event: null,
                        invoiceId: null,
                    },
                ],
            }),
        ).toBe(true);
        expect(showsThread("failed")).toBe(true);
        // Can't read messages, or the account area is still off.
        expect(showsThread(null)).toBe(false);
    });
});

import {
    dataRequestEmail,
    dataRequestFooter,
    KEPT_BY_LAW,
} from "./data-request-emails";

/**
 * The words of Saroh's two emails about "Ask to remove my data" (DEC-172,
 * #1106): the acknowledgement, and the second email — done, or closed
 * without removal (never with the business's reason).
 */
describe("the acknowledgement", () => {
    const mail = dataRequestEmail("received", "Northwind Studio");

    it("says it was sent to the business, and that nothing is removed yet", () => {
        expect(mail.subject).toBe(
            "We've sent your request to Northwind Studio",
        );
        expect(mail.html).toContain("<h2>We've sent your request</h2>");
        expect(mail.html).toContain(
            "You asked Northwind Studio to remove your details. Nothing is removed yet: Northwind Studio will review your request, and we'll email you again when it's done.",
        );
    });

    it("says receipts and invoices are kept as the law requires", () => {
        expect(mail.html).toContain(
            "Receipts and invoices are kept as the law requires.",
        );
    });

    it("tells someone who didn't ask whom to contact", () => {
        expect(mail.html).toContain(
            "If you didn't ask for this, contact Northwind Studio.",
        );
    });
});

describe("the done email", () => {
    const mail = dataRequestEmail("done", "Northwind Studio");

    it("says their details were removed and their account is closed", () => {
        expect(mail.subject).toBe("Northwind Studio removed your details");
        expect(mail.html).toContain("<h2>Your details have been removed</h2>");
        expect(mail.html).toContain(
            "Northwind Studio removed your details, as you asked. Your account on their website is closed, so you won't be able to sign in there with it.",
        );
        expect(mail.html).toContain(KEPT_BY_LAW);
        expect(mail.html).toContain(
            "Keep this email as your record that it was done.",
        );
    });
});

describe("the closed email", () => {
    const mail = dataRequestEmail("closed", "Northwind Studio");

    it("says it was closed without removal, and to contact the business", () => {
        expect(mail.subject).toBe("Northwind Studio closed your request");
        expect(mail.html).toContain("<h2>Your request was closed</h2>");
        expect(mail.html).toContain(
            "Northwind Studio closed your request to remove your details without removing them.",
        );
        expect(mail.html).toContain(
            "To find out why, contact Northwind Studio. You can ask again from your account on their website.",
        );
    });

    it("carries no reason: the business's words are theirs to give", () => {
        expect(mail.html).not.toMatch(/reason/i);
        expect(mail.html).not.toContain(KEPT_BY_LAW);
    });
});

describe("every email", () => {
    it("escapes the business's name in the body, never in the subject's header text", () => {
        for (const step of ["received", "done", "closed"] as const) {
            const mail = dataRequestEmail(step, "Rye & Co's <b>");
            expect(mail.html).toContain("Rye &amp; Co&#39;s &lt;b&gt;");
            expect(mail.html).not.toContain("<b>");
            expect(mail.subject).toContain("Rye & Co's <b>");
        }
    });

    it("says it comes from Saroh, for the business's site", () => {
        for (const step of ["received", "done", "closed"] as const) {
            expect(dataRequestEmail(step, "Northwind").html).toContain(
                dataRequestFooter("Northwind"),
            );
        }
        expect(dataRequestFooter("Northwind")).toBe(
            "Northwind's website runs on Saroh. This address sends only sign-in codes and notices about your account there.",
        );
    });
});

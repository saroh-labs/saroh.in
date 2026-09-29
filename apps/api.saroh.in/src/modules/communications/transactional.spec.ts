// The transactional templates (D17): what an invoice email and its reminder
// say, that everything typed is escaped, and that the pay link is only ever
// a slot in the stored body. Pure.
import {
    autopayCancelledSentence,
    fillSecretLink,
    renderAutopayCancelled,
    renderAutopaySetupLink,
    renderTransactional,
    SECRET_LINK_SLOT,
} from "./transactional";

const vars = {
    business: "Rye & Co.",
    firstName: "Asha",
    number: "INV-0042",
    total: "₹2,400.00",
    dueOn: "3 Oct 2026",
    overdue: false,
};

describe("renderTransactional", () => {
    it("an invoice names the business, the number, the total and the due date", () => {
        const { subject, body } = renderTransactional("INVOICE_SENT", vars);
        expect(subject).toBe("Invoice INV-0042 from Rye & Co.: ₹2,400.00");
        expect(body).toContain("<p>Hi Asha,</p>");
        expect(body).toContain(
            "Rye &amp; Co. has sent you invoice INV-0042 for ₹2,400.00, due 3 Oct 2026.",
        );
        expect(body).toContain(`href="${SECRET_LINK_SLOT}"`);
    });

    it("a reminder says it is a reminder, and when it was due once overdue", () => {
        expect(renderTransactional("INVOICE_REMINDER", vars).subject).toBe(
            "Reminder: invoice INV-0042 from Rye & Co.",
        );
        const late = renderTransactional("INVOICE_REMINDER", {
            ...vars,
            overdue: true,
        });
        expect(late.subject).toBe(
            "Reminder: invoice INV-0042 from Rye & Co. was due 3 Oct 2026",
        );
        expect(late.body).toContain("was due on 3 Oct 2026");
        expect(late.body).toContain("already paid");
    });

    it("greets without a name, and says nothing of a due date it doesn't have", () => {
        const { body } = renderTransactional("INVOICE_SENT", {
            ...vars,
            firstName: null,
            dueOn: null,
        });
        expect(body).toContain("<p>Hello,</p>");
        expect(body).toContain("for ₹2,400.00.");
        expect(body).not.toContain("due");
    });

    it("escapes what a person or business typed", () => {
        const { body } = renderTransactional("INVOICE_SENT", {
            ...vars,
            business: "<script>x</script>",
            firstName: '"Asha"',
        });
        expect(body).not.toContain("<script>");
        expect(body).toContain("&lt;script&gt;");
        expect(body).toContain("Hi &quot;Asha&quot;,");
    });
});

describe("fillSecretLink", () => {
    it("puts the link in every slot", () => {
        const { body } = renderTransactional("INVOICE_SENT", vars);
        const filled = fillSecretLink(body, "https://saroh.app/pay/abc");
        expect(filled).not.toContain(SECRET_LINK_SLOT);
        expect(filled.match(/https:\/\/saroh\.app\/pay\/abc/g)).toHaveLength(2);
    });
});

describe("renderAutopaySetupLink (D14)", () => {
    const link = {
        business: "Pulse & Co.",
        firstName: "Meera",
        plan: "Monthly unlimited",
        method: "UPI app",
        limit: "₹1,800.00",
        check: "₹1.00",
        expiresOn: "6 Oct 2026",
    };

    it("names the plan, the method, the limit, the ₹1 check and when the link stops", () => {
        const { subject, body } = renderAutopaySetupLink(link);
        expect(subject).toBe(
            "Turn on autopay for Monthly unlimited with Pulse & Co.",
        );
        expect(body).toContain("<p>Hi Meera,</p>");
        expect(body).toContain(
            "paid from your UPI app, up to ₹1,800.00 a time",
        );
        expect(body).toContain("your bank needs a ₹1.00 check");
        expect(body).toContain("The link works until 6 Oct 2026.");
        expect(body).toContain("Pulse &amp; Co.");
        // The link is only ever a slot in the stored body.
        expect(body).toContain(`href="${SECRET_LINK_SLOT}"`);
    });

    it("says no check for a method that takes none, and escapes what was typed", () => {
        const { body } = renderAutopaySetupLink({
            ...link,
            check: null,
            method: "bank account",
            plan: "<b>Gold</b>",
            firstName: null,
        });
        expect(body).not.toContain("check");
        expect(body).toContain("<p>Hello,</p>");
        expect(body).toContain("&lt;b&gt;Gold&lt;/b&gt;");
        expect(body).not.toContain("<b>Gold</b>");
    });
});

describe("the autopay-cancelled note (D14)", () => {
    const vars = {
        business: "Pulse & Co.",
        firstName: "Meera",
        plan: "Monthly unlimited",
    };

    it("says it stopped, the plan carries on, and how the next renewal is paid", () => {
        const { subject, body } = renderAutopayCancelled(vars);
        expect(subject).toBe("Autopay for Monthly unlimited is off");
        expect(body).toContain("<p>Hi Meera,</p>");
        expect(body).toContain(
            "Pulse &amp; Co. has turned off autopay for Monthly unlimited. Nothing more will be taken automatically.",
        );
        expect(body).toContain("an invoice with a link to pay it");
        // Nothing secret: no link slot at all.
        expect(body).not.toContain(SECRET_LINK_SLOT);
    });

    it("escapes what was typed, and greets someone with no name", () => {
        const { body } = renderAutopayCancelled({
            ...vars,
            firstName: null,
            plan: "<b>Gold</b>",
        });
        expect(body).toContain("<p>Hello,</p>");
        expect(body).toContain("&lt;b&gt;Gold&lt;/b&gt;");
        expect(body).not.toContain("<b>Gold</b>");
    });

    it("the thread line is plain text, never HTML", () => {
        expect(autopayCancelledSentence(vars)).toBe(
            "Pulse & Co. turned off autopay for Monthly unlimited. Nothing more is taken automatically — your next renewal comes as an invoice with a link to pay.",
        );
    });
});

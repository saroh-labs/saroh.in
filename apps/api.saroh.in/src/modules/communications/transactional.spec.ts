// The transactional templates (D17): what an invoice email and its reminder
// say, that everything typed is escaped, and that the pay link is only ever
// a slot in the stored body. Pure.
import {
    fillSecretLink,
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

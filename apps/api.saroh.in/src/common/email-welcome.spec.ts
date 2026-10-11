import {
    oneLine,
    welcomeEmail,
    welcomeNextStep,
    welcomeSubject,
} from "./email-welcome";

/** The one email a new business gets (UX audit, 10 Oct). */

const mail = {
    businessName: "Rye & Co. Bakery",
    openUrl: "https://app.saroh.in/open/org_1",
    address: "rye-co",
};

describe("the welcome email", () => {
    it('is subject "‹Business› is set up on Saroh", and its heading is the subject', () => {
        const { subject, html } = welcomeEmail(mail);
        expect(subject).toBe("Rye & Co. Bakery is set up on Saroh");
        expect(html).toContain(
            "<h2>Rye &amp; Co. Bakery is set up on Saroh</h2>",
        );
    });

    it('has one button, "Open ‹Business›", to the business itself', () => {
        const { html, cta } = welcomeEmail(mail);
        expect(cta).toBe("Open Rye & Co. Bakery");
        expect(html.match(/<a /g)).toHaveLength(1);
        expect(html).toContain('href="https://app.saroh.in/open/org_1"');
        expect(html).toContain(">Open Rye &amp; Co. Bakery</a>");
    });

    it.each([
        [
            "COMMERCE",
            "Next, add your first product. A name and a price are enough to start selling.",
        ],
        [
            "APPOINTMENTS",
            "Next, add your first service, so people can book time with you.",
        ],
        [
            "WEBSITE",
            "Next, publish your site. Nobody can see rye-co.saroh.app until you do.",
        ],
        [
            "CRM",
            "Next, add your first contact. Everyone you deal with goes in one list.",
        ],
        ["INVOICE", "Next, send your first invoice."],
    ] as const)("%s: the first line is that goal's next step", (goal, line) => {
        expect(welcomeNextStep({ ...mail, goal })).toBe(line);
        const { html } = welcomeEmail({ ...mail, goal });
        // The first paragraph after the heading.
        expect(html.split("<p>")[1]).toContain(line);
    });

    it("someone who will decide later is pointed at Home", () => {
        expect(welcomeNextStep(mail)).toBe(
            "Next, pick what to do first. Home has the choices.",
        );
        expect(welcomeNextStep({ ...mail, goal: null })).toBe(
            "Next, pick what to do first. Home has the choices.",
        );
    });

    it("names the site without an address when it has none to name", () => {
        expect(
            welcomeNextStep({ ...mail, address: null, goal: "WEBSITE" }),
        ).toBe("Next, publish your site. Nobody can see it until you do.");
    });

    it("escapes a name that is markup, and keeps the subject to one line", () => {
        const sly = welcomeEmail({
            ...mail,
            businessName:
                "<img src=x onerror=alert(1)>\r\nBcc: someone@example.com",
        });
        expect(sly.html).not.toContain("<img");
        expect(sly.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
        expect(sly.subject).not.toMatch(/[\r\n]/);
        expect(welcomeSubject("Rye\n&\tCo.")).toBe(
            "Rye & Co. is set up on Saroh",
        );
        expect(oneLine("x".repeat(200))).toHaveLength(80);
    });

    it("escapes the link", () => {
        const { html } = welcomeEmail({
            ...mail,
            openUrl: 'https://app.saroh.in/open/"><script>',
        });
        expect(html).not.toContain("<script>");
    });

    it("says why they got it, with no long dash and no semicolon", () => {
        const { html } = welcomeEmail({ ...mail, goal: "COMMERCE" });
        const text = html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&");
        expect(text).toContain(
            "You are getting this because you set up Rye & Co. Bakery on Saroh",
        );
        expect(text).not.toMatch(/[—;]/);
    });
});

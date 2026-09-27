import {
    cleanBusinessName,
    codeSenderName,
    codeSubject,
    MAX_SENDER_NAME,
} from "./sender-name";

const HOST = "kavi.saroh.app";

describe("cleanBusinessName", () => {
    it("keeps an ordinary name as it is", () => {
        expect(cleanBusinessName("Kavi Dental", HOST)).toBe("Kavi Dental");
        expect(cleanBusinessName("Rao & Sons, Bandra", HOST)).toBe(
            "Rao & Sons, Bandra",
        );
        expect(cleanBusinessName("कवि डेंटल", HOST)).toBe("कवि डेंटल");
    });

    it("strips a URL and a newline from a name", () => {
        const out = cleanBusinessName("Bank Alert www.example.com\n", HOST);
        expect(out).toBe("Bank Alert");
        expect(out).not.toMatch(/[\r\n]/);
        expect(out).not.toMatch(/example|www|\./);
        expect(out.length).toBeLessThanOrEqual(MAX_SENDER_NAME);
    });

    it("strips schemes, bare domains and email addresses", () => {
        expect(
            cleanBusinessName("Visit https://evil.test/login now", HOST),
        ).toBe("Visit now");
        expect(cleanBusinessName("Pay at secure.bank.co.in", HOST)).toBe(
            "Pay at",
        );
        expect(cleanBusinessName("Mail help@kavi.in today", HOST)).toBe(
            "Mail today",
        );
    });

    it("strips control, format and header-breaking characters", () => {
        const out = cleanBusinessName(
            'Kavi\u0000 "Dental" <x>‮\r\nBcc: a',
            HOST,
        );
        expect(out).not.toMatch(/[\u0000-\u001f‮"<>]/);
        expect(out).toBe("Kavi Dental x Bcc: a");
    });

    it("cuts a long name to 40 characters", () => {
        const out = cleanBusinessName(
            "The Very Long Name Of A Dental Clinic In South Bombay",
            HOST,
        );
        expect(Array.from(out).length).toBeLessThanOrEqual(40);
        expect(out.startsWith("The Very Long Name")).toBe(true);
        expect(out).toBe(out.trim());
    });

    it("counts characters, not UTF-16 units, and never splits one", () => {
        const out = cleanBusinessName("😀a".repeat(30), HOST);
        expect(Array.from(out)).toHaveLength(40);
    });

    it("falls back to the site's host when nothing is left", () => {
        expect(cleanBusinessName("www.example.com", HOST)).toBe(HOST);
        expect(cleanBusinessName("  \n\t ", HOST)).toBe(HOST);
        expect(cleanBusinessName('"<>"', HOST)).toBe(HOST);
    });
});

describe("sender and subject", () => {
    it("reads as the design says", () => {
        expect(codeSenderName("Kavi Dental")).toBe("Kavi Dental via Saroh");
        expect(codeSubject("Kavi Dental")).toBe("Your code for Kavi Dental");
    });
});

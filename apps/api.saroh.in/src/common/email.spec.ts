import {
    SIGN_IN_CODE_SUBJECT,
    siteCodesSmtpSecure,
    siteCodesTransportOptions,
    verificationOtpEmail,
} from "./email";

/**
 * The code a merchant signs up and signs in with (owner, 10 Oct 2026). One
 * email for both, so it can't say whether the address had an account.
 */
describe("verificationOtpEmail: the sign-in code", () => {
    const mail = verificationOtpEmail("sign-in", "039147", 600);

    it("has one subject, and the heading is the subject", () => {
        expect(SIGN_IN_CODE_SUBJECT).toBe("Your Saroh sign-in code");
        expect(mail.subject).toBe("Your Saroh sign-in code");
        expect(mail.html).toContain("<h2>Your Saroh sign-in code</h2>");
    });

    it("names the screen, carries the code and says how long it lasts", () => {
        expect(mail.html).toContain("Check your email");
        expect(mail.html).toContain("039147");
        expect(mail.html).toContain("This code expires in 10 minutes.");
    });

    it("says the same code makes an account, without saying whether one exists", () => {
        expect(mail.html).toContain(
            "New to Saroh? The same code creates your account.",
        );
        expect(mail.html).not.toMatch(/already have|welcome back/i);
    });

    it("has no long dash and no semicolon in what a person reads", () => {
        const text = mail.html.replace(/<[^>]+>/g, " ");
        expect(text).not.toMatch(/[—;]/);
    });

    it("words a password code for setting one, first or new", () => {
        const password = verificationOtpEmail("forget-password", "111111", 600);
        expect(password.subject).toBe("Your Saroh password code");
        expect(password.html).toContain(
            "Enter this code to set a new password.",
        );
    });
});

/**
 * The code stream's SMTP connection (review M-3): a TLS hello on a STARTTLS
 * port fails every send, and with it every booking.
 */
describe("siteCodesSmtpSecure", () => {
    it("starts in TLS on 465 and upgrades with STARTTLS anywhere else", () => {
        expect(siteCodesSmtpSecure(465, undefined)).toBe(true);
        expect(siteCodesSmtpSecure(587, undefined)).toBe(false);
        expect(siteCodesSmtpSecure(2525, undefined)).toBe(false);
    });

    it("does what SITE_CODES_SMTP_SECURE says when it is set", () => {
        expect(siteCodesSmtpSecure(587, "true")).toBe(true);
        expect(siteCodesSmtpSecure(465, "false")).toBe(false);
    });
});

/** Visibly fake values: nothing here connects anywhere. */
const identity = {
    SMTP_HOST: "smtp.example.test",
    SMTP_PORT: "465",
    SMTP_USER: "identity-user",
    SMTP_PASS: "identity-pass",
};

describe("siteCodesTransportOptions", () => {
    it("is null with no SMTP, so development falls back to the fake", () => {
        expect(siteCodesTransportOptions({})).toBeNull();
    });

    it("pools at most two connections and keeps the short timeouts", () => {
        expect(siteCodesTransportOptions(identity)).toMatchObject({
            host: "smtp.example.test",
            port: 465,
            secure: true,
            auth: { user: "identity-user", pass: "identity-pass" },
            pool: true,
            maxConnections: 2,
            connectionTimeout: 5_000,
            greetingTimeout: 5_000,
            socketTimeout: 10_000,
        });
    });

    it("uses the code stream's own SMTP when it is set", () => {
        const options = siteCodesTransportOptions({
            ...identity,
            SITE_CODES_SMTP_HOST: "codes.example.test",
            SITE_CODES_SMTP_PORT: "587",
            SITE_CODES_SMTP_USER: "codes-user",
            SITE_CODES_SMTP_PASS: "codes-pass",
        });
        expect(options).toMatchObject({
            host: "codes.example.test",
            port: 587,
            secure: false,
            auth: { user: "codes-user", pass: "codes-pass" },
            pool: true,
        });
    });
});

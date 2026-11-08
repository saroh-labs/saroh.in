/**
 * One send helper for both transports, choosing the sender by edition
 * (KTD6): Global mail from saroh.tech, India's unchanged, and a retry from
 * India's sender only when SES says Global's identity isn't verified.
 */

const SMTP = {
    SMTP_HOST: "smtp.example.com",
    SMTP_USER: "user",
    SMTP_PASS: "pass",
    EMAIL_FROM: "Saroh <noreply@saroh.in>",
};

const unverified = Object.assign(
    new Error(
        "Message failed: 554 Message rejected: Email address is not verified.",
    ),
    {
        responseCode: 554,
        response:
            "554 Message rejected: Email address is not verified. The following identities failed the check in region AP-SOUTH-1: Saroh <noreply@saroh.tech>",
    },
);

function load(env: Record<string, string | undefined>) {
    const sendMail = jest.fn().mockResolvedValue({});
    const logError = jest.fn();
    let email!: typeof import("./email");
    jest.isolateModules(() => {
        jest.doMock("nodemailer", () => ({
            __esModule: true,
            default: { createTransport: () => ({ sendMail }) },
        }));
        jest.doMock("../env", () => ({ env, declaredNodeEnv: "test" }));
        jest.doMock("./logging/structured-logger", () => ({
            structuredLogger: {
                error: logError,
                warn: jest.fn(),
                info: jest.fn(),
            },
        }));
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        email = require("./email") as typeof import("./email");
    });
    return { email, sendMail, logError };
}

const flush = () => new Promise((done) => setImmediate(done));

describe("send: the sender by edition", () => {
    afterEach(() => jest.resetModules());

    it("sends Global mail from the default saroh.tech address when EMAIL_FROM_GLOBAL is unset", async () => {
        const { email, sendMail } = load(SMTP);
        await email.send("GLOBAL", { to: "a@example.com", subject: "s" });
        await email.send("INDIA", { to: "a@example.com", subject: "s" });
        expect(sendMail.mock.calls.map((c) => c[0].from)).toEqual([
            "Saroh <noreply@saroh.tech>",
            "Saroh <noreply@saroh.in>",
        ]);
    });

    it("uses EMAIL_FROM_GLOBAL when set", async () => {
        const { email, sendMail } = load({
            ...SMTP,
            EMAIL_FROM_GLOBAL: "Saroh <hello@saroh.tech>",
        });
        await email.send("GLOBAL", { to: "a@example.com", subject: "s" });
        expect(sendMail.mock.calls[0][0].from).toBe("Saroh <hello@saroh.tech>");
    });

    it("sends a code asked for through Global's instance from the Global sender", async () => {
        const { email, sendMail } = load(SMTP);
        await email.sendVerificationOtpEmail(
            "a@example.com",
            "123456",
            "sign-in",
            600,
            "GLOBAL",
        );
        await flush();
        expect(sendMail.mock.calls[0][0].from).toBe(
            "Saroh <noreply@saroh.tech>",
        );
    });

    it("sends a Global business's invoice from the Global sender", async () => {
        const { email, sendMail } = load(SMTP);
        await expect(
            email.sendSarohBillingEmail({
                to: ["owner@example.com"],
                subject: "Invoice",
                html: "<p>x</p>",
                edition: "GLOBAL",
            }),
        ).resolves.toBe("sent");
        await email.sendSarohBillingEmail({
            to: ["owner@example.com"],
            subject: "Invoice",
            html: "<p>x</p>",
        });
        expect(sendMail.mock.calls.map((c) => c[0].from)).toEqual([
            "Saroh <noreply@saroh.tech>",
            "Saroh <noreply@saroh.in>",
        ]);
    });

    it("sends a Global site code on the site-codes stream from Global's code address, in the business's name", async () => {
        const { email, sendMail } = load(SMTP);
        await expect(
            email.sendSiteSignInCodeEmail("c@example.com", {
                code: "123456",
                businessName: "Kavi Dental",
                minutes: 10,
                edition: "GLOBAL",
            }),
        ).resolves.toBe("sent");
        await email.sendSiteSignInCodeEmail("c@example.com", {
            code: "123456",
            businessName: "Kavi Dental",
            minutes: 10,
        });
        const [global, india] = sendMail.mock.calls.map((c) => c[0].from);
        expect(global).toEqual({
            name: expect.stringContaining("Kavi Dental"),
            address: "codes@saroh.tech",
        });
        expect(india.address).toBe("codes@saroh.in");
    });

    it("uses SITE_CODES_EMAIL_FROM_GLOBAL when set", async () => {
        const { email, sendMail } = load({
            ...SMTP,
            SITE_CODES_EMAIL_FROM_GLOBAL: "signin@saroh.tech",
        });
        await email.sendSiteEmailChangedEmail("c@example.com", {
            businessName: "Kavi Dental",
            edition: "GLOBAL",
        });
        expect(sendMail.mock.calls[0][0].from.address).toBe(
            "signin@saroh.tech",
        );
    });

    it("retries once from India's sender when SES says Global's identity isn't verified, at ERROR", async () => {
        const { email, sendMail, logError } = load(SMTP);
        sendMail.mockRejectedValueOnce(unverified);
        await email.send("GLOBAL", { to: "a@example.com", subject: "s" });
        expect(sendMail.mock.calls.map((c) => c[0].from)).toEqual([
            "Saroh <noreply@saroh.tech>",
            "Saroh <noreply@saroh.in>",
        ]);
        expect(logError).toHaveBeenCalledWith("email_global_sender_fallback", {
            stream: "identity",
        });
    });

    it("falls back on the site-codes stream too, to India's code address", async () => {
        const { email, sendMail } = load(SMTP);
        sendMail.mockRejectedValueOnce(unverified);
        await expect(
            email.sendSiteSignInCodeEmail("c@example.com", {
                code: "123456",
                businessName: "Kavi Dental",
                minutes: 10,
                edition: "GLOBAL",
            }),
        ).resolves.toBe("sent");
        expect(sendMail.mock.calls[1][0].from.address).toBe("codes@saroh.in");
    });

    it("never retries another refusal or a timeout, so nothing goes out twice", async () => {
        const { email, sendMail, logError } = load(SMTP);
        const timeout = Object.assign(new Error("Connection timeout"), {
            code: "ETIMEDOUT",
        });
        const throttled = Object.assign(new Error("454 Throttling failure"), {
            responseCode: 454,
            response: "454 Throttling failure: Maximum sending rate exceeded.",
        });
        for (const error of [timeout, throttled]) {
            sendMail.mockClear();
            sendMail.mockRejectedValueOnce(error);
            await expect(
                email.send("GLOBAL", { to: "a@example.com", subject: "s" }),
            ).rejects.toBe(error);
            expect(sendMail).toHaveBeenCalledTimes(1);
        }
        expect(logError).not.toHaveBeenCalledWith(
            "email_global_sender_fallback",
            expect.anything(),
        );
    });

    it("never retries India's own sender", async () => {
        const { email, sendMail } = load(SMTP);
        sendMail.mockRejectedValueOnce(unverified);
        await expect(
            email.send("INDIA", { to: "a@example.com", subject: "s" }),
        ).rejects.toBe(unverified);
        expect(sendMail).toHaveBeenCalledTimes(1);
    });

    it("logs a failed fire-and-forget code send instead of swallowing it", async () => {
        const { email, sendMail, logError } = load(SMTP);
        sendMail.mockRejectedValueOnce(new Error("Connection timeout"));
        await expect(
            email.sendVerificationOtpEmail(
                "a@example.com",
                "123456",
                "sign-in",
                600,
                "GLOBAL",
            ),
        ).resolves.toBeUndefined();
        await flush();
        expect(logError).toHaveBeenCalledWith(
            "email_send_failed",
            expect.objectContaining({ edition: "GLOBAL" }),
        );
        // The line names no address and no code.
        expect(JSON.stringify(logError.mock.calls)).not.toMatch(
            /a@example\.com|123456/,
        );
    });
});

describe("accountsBaseFor", () => {
    afterEach(() => jest.resetModules());

    it("is the edition's accounts in ACCOUNTS_URL's environment", () => {
        const { email } = load(SMTP);
        expect(
            email.accountsBaseFor("GLOBAL", {
                ACCOUNTS_URL: "https://accounts.saroh.in",
            }),
        ).toBe("https://accounts.saroh.tech");
        expect(
            email.accountsBaseFor("INDIA", {
                ACCOUNTS_URL: "https://accounts.saroh.in",
            }),
        ).toBe("https://accounts.saroh.in");
    });

    it("stays on a local stack's one accounts app, and is null with none", () => {
        const { email } = load(SMTP);
        expect(
            email.accountsBaseFor("GLOBAL", { NODE_ENV: "development" }),
        ).toBe("https://accounts.saroh.localhost");
        expect(email.accountsBaseFor("GLOBAL", {})).toBeNull();
    });
});

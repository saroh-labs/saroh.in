/**
 * The opening-day invite email (marketing plan U31) on the fake transport:
 * with no SMTP configured, nothing leaves the process — no transport is
 * made and no mail is handed to one — whatever the fake mode says.
 */

interface Loaded {
    send: typeof import("./email").sendWaitlistLaunchInviteEmail;
    createTransport: jest.Mock;
    sendMail: jest.Mock;
}

function load(
    env: Record<string, string | undefined>,
    declaredNodeEnv: string | undefined,
): Loaded {
    const sendMail = jest.fn().mockResolvedValue({});
    const createTransport = jest.fn(() => ({ sendMail }));
    let send!: Loaded["send"];
    jest.isolateModules(() => {
        jest.doMock("nodemailer", () => ({
            __esModule: true,
            default: { createTransport },
        }));
        jest.doMock("../env", () => ({ env, declaredNodeEnv }));
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        send = (require("./email") as typeof import("./email"))
            .sendWaitlistLaunchInviteEmail;
    });
    return { send, createTransport, sendMail };
}

const DETAILS = {
    url: "https://accounts.example.test/signup?invite=abc",
    businessName: "Asha's <Salon>",
    validDays: 7,
};

describe("sendWaitlistLaunchInviteEmail without SMTP", () => {
    let info: jest.SpyInstance;
    beforeEach(() => {
        info = jest.spyOn(console, "info").mockImplementation(() => {});
    });
    afterEach(() => {
        info.mockRestore();
        jest.resetModules();
    });

    it("logs it and sends nothing anywhere (SITE_CODES_EMAIL_FAKE=log)", async () => {
        const mail = load({ SITE_CODES_EMAIL_FAKE: "log" }, "test");
        await expect(mail.send("a@example.test", DETAILS)).resolves.toBe(
            "sent",
        );
        expect(mail.createTransport).not.toHaveBeenCalled();
        expect(mail.sendMail).not.toHaveBeenCalled();
        expect(info).toHaveBeenCalledWith(
            expect.stringContaining("[Saroh invite] (no SMTP) a@example.test"),
        );
    });

    it("fails it, still sending nothing (SITE_CODES_EMAIL_FAKE=fail)", async () => {
        const mail = load({ SITE_CODES_EMAIL_FAKE: "fail" }, "test");
        await expect(mail.send("a@example.test", DETAILS)).resolves.toBe(
            "failed",
        );
        expect(mail.createTransport).not.toHaveBeenCalled();
        expect(info).not.toHaveBeenCalled();
    });

    it("is not configured in production, and never fakes it", async () => {
        const mail = load({ SITE_CODES_EMAIL_FAKE: "log" }, "production");
        await expect(mail.send("a@example.test", DETAILS)).resolves.toBe(
            "not-configured",
        );
        expect(mail.createTransport).not.toHaveBeenCalled();
        expect(info).not.toHaveBeenCalled();
    });
});

describe("sendWaitlistLaunchInviteEmail with SMTP", () => {
    afterEach(() => jest.resetModules());

    it("hands the transport one escaped email (so the fake above is the only thing between a test and a real send)", async () => {
        const mail = load(
            { SMTP_HOST: "smtp.example.test", SMTP_USER: "u", SMTP_PASS: "p" },
            "test",
        );
        await expect(mail.send("a@example.test", DETAILS)).resolves.toBe(
            "sent",
        );
        expect(mail.sendMail).toHaveBeenCalledTimes(1);
        const [message] = mail.sendMail.mock.calls[0] as [
            { to: string; subject: string; html: string },
        ];
        expect(message.to).toBe("a@example.test");
        expect(message.subject).toBe("Your Saroh invite");
        expect(message.html).toContain("Asha&#39;s &lt;Salon&gt;");
        expect(message.html).not.toContain("<Salon>");
        expect(message.html).toContain("for 7 days");
    });
});

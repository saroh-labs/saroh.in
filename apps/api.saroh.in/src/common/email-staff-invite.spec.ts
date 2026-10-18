/**
 * A staff invite's email (admin console U24): the link is a credential, so
 * the fake transport leaves it only in the browser test's outbox and never
 * prints it; production never fakes it; and with SMTP every value in the
 * body is escaped.
 */

interface Loaded {
    send: typeof import("./email").sendStaffInviteEmail;
    createTransport: jest.Mock;
    sendMail: jest.Mock;
    writeOutbox: jest.Mock;
}

function load(
    env: Record<string, string | undefined>,
    declaredNodeEnv: string | undefined,
): Loaded {
    const sendMail = jest.fn().mockResolvedValue({});
    const createTransport = jest.fn(() => ({ sendMail }));
    const writeOutbox = jest.fn();
    let send!: Loaded["send"];
    jest.isolateModules(() => {
        jest.doMock("nodemailer", () => ({
            __esModule: true,
            default: { createTransport },
        }));
        jest.doMock("../env", () => ({ env, declaredNodeEnv }));
        jest.doMock("./site-code-outbox", () => ({
            ...jest.requireActual("./site-code-outbox"),
            writeStaffInviteOutbox: writeOutbox,
        }));
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        send = (require("./email") as typeof import("./email"))
            .sendStaffInviteEmail;
    });
    return { send, createTransport, sendMail, writeOutbox };
}

const URL_WITH_TOKEN =
    "https://accounts.example.com/staff-invite/open?token=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ";
const DETAILS = {
    url: URL_WITH_TOKEN,
    name: "Asha <b>Rao</b>",
    invitedByName: "Sam & Co",
    validDays: 7,
};

describe("sendStaffInviteEmail", () => {
    let info: jest.SpyInstance;
    beforeEach(() => {
        info = jest.spyOn(console, "info").mockImplementation(() => {});
    });
    afterEach(() => {
        info.mockRestore();
        jest.resetModules();
    });

    it("leaves the link in the outbox and never prints it (fake transport)", async () => {
        const mail = load({ SITE_CODES_EMAIL_FAKE: "log" }, "test");
        await expect(mail.send("asha@example.com", DETAILS)).resolves.toBe(
            "sent",
        );
        expect(mail.writeOutbox).toHaveBeenCalledWith(
            "asha@example.com",
            URL_WITH_TOKEN,
        );
        expect(mail.createTransport).not.toHaveBeenCalled();
        expect(JSON.stringify(info.mock.calls)).not.toContain("token=");
    });

    it("fails it on asking, and production never fakes it", async () => {
        const failing = load({ SITE_CODES_EMAIL_FAKE: "fail" }, "test");
        await expect(failing.send("a@example.com", DETAILS)).resolves.toBe(
            "failed",
        );
        jest.resetModules();
        const production = load({ SITE_CODES_EMAIL_FAKE: "log" }, "production");
        await expect(production.send("a@example.com", DETAILS)).resolves.toBe(
            "not-configured",
        );
        expect(production.writeOutbox).not.toHaveBeenCalled();
    });

    it("escapes every value in the body when it sends", async () => {
        const mail = load(
            { SMTP_HOST: "smtp.example.com", SMTP_USER: "u", SMTP_PASS: "p" },
            "production",
        );
        await expect(mail.send("asha@example.com", DETAILS)).resolves.toBe(
            "sent",
        );
        const sent = mail.sendMail.mock.calls[0]?.[0] as {
            to: string;
            subject: string;
            html: string;
        };
        expect(sent.to).toBe("asha@example.com");
        expect(sent.subject).toBe("You're invited to join Saroh's team");
        expect(sent.html).toContain("Asha &lt;b&gt;Rao&lt;/b&gt;");
        expect(sent.html).toContain("Sam &amp; Co has invited you");
        expect(sent.html).toContain("for 7 days");
        expect(sent.html).not.toContain("<b>Rao</b>");
    });

    it("says it failed when the transport throws", async () => {
        const mail = load(
            { SMTP_HOST: "smtp.example.com", SMTP_USER: "u", SMTP_PASS: "p" },
            "production",
        );
        mail.sendMail.mockRejectedValueOnce(new Error("down"));
        await expect(mail.send("a@example.com", DETAILS)).resolves.toBe(
            "failed",
        );
    });
});

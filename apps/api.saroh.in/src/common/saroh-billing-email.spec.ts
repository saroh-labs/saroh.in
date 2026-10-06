// Saroh's billing mail (pricing catalogue U17) never leaves the process on
// the log/fake transport: with no SMTP configured, `sendSarohBillingEmail`
// makes no transport, opens no socket and calls no sendMail — it logs the
// subject and a count, never an address. nodemailer and `net` are watched so
// any attempt to reach the network fails the spec.
import net from "node:net";
import tls from "node:tls";

const createTransport = jest.fn();
jest.mock("nodemailer", () => ({
    __esModule: true,
    default: { createTransport },
}));

const fakeEnv: Record<string, string | undefined> = {
    SITE_CODES_EMAIL_FAKE: "log",
};
jest.mock("../env", () => ({
    get env() {
        return fakeEnv;
    },
    declaredNodeEnv: "test",
}));

import { sendSarohBillingEmail } from "./email";

const mail = {
    to: ["owner@example.test", "admin@example.test"],
    subject: "Your Saroh invoice SRH/26-27/00001",
    html: "<p>Invoice</p>",
    attachments: [
        { filename: "SRH-26-27-00001.pdf", content: Buffer.from("%PDF") },
    ],
};

describe("sendSarohBillingEmail on the fake transport (U17)", () => {
    let connect: jest.SpyInstance;
    let tlsConnect: jest.SpyInstance;
    let info: jest.SpyInstance;

    beforeEach(() => {
        connect = jest.spyOn(net.Socket.prototype, "connect");
        tlsConnect = jest.spyOn(tls, "connect");
        info = jest.spyOn(console, "info").mockImplementation(() => undefined);
        fakeEnv.SITE_CODES_EMAIL_FAKE = "log";
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("logs it as sent and nothing leaves the process", async () => {
        await expect(sendSarohBillingEmail(mail)).resolves.toBe("sent");

        expect(createTransport).not.toHaveBeenCalled();
        expect(connect).not.toHaveBeenCalled();
        expect(tlsConnect).not.toHaveBeenCalled();
        expect(info).toHaveBeenCalledTimes(1);
        const line = String(info.mock.calls[0][0]);
        expect(line).toContain("SRH/26-27/00001");
        expect(line).toContain("2 recipient(s)");
        // The addresses and the body stay out of the log.
        expect(line).not.toContain("@example.test");
        expect(line).not.toContain("<p>");
    });

    it("fails every send with `fail`, still without the network", async () => {
        fakeEnv.SITE_CODES_EMAIL_FAKE = "fail";
        await expect(sendSarohBillingEmail(mail)).resolves.toBe("failed");
        expect(createTransport).not.toHaveBeenCalled();
        expect(connect).not.toHaveBeenCalled();
    });

    it("says not configured when no fake is named outside development", async () => {
        fakeEnv.SITE_CODES_EMAIL_FAKE = undefined;
        await expect(sendSarohBillingEmail(mail)).resolves.toBe(
            "not-configured",
        );
        expect(createTransport).not.toHaveBeenCalled();
        expect(connect).not.toHaveBeenCalled();
        expect(info).not.toHaveBeenCalled();
    });

    it("sends nothing to nobody", async () => {
        await expect(sendSarohBillingEmail({ ...mail, to: [] })).resolves.toBe(
            "not-configured",
        );
        expect(info).not.toHaveBeenCalled();
    });
});

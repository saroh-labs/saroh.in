import { sendable } from "./provider.port";

// F2: rows saved before SendGrid, SMTP and Twilio were refused stay
// CONNECTED in the table, but nothing can send through them.
describe("sendable", () => {
    it.each([
        [{ status: "CONNECTED", channel: "EMAIL", provider: "RESEND" }, true],
        [{ status: "CONNECTED", channel: "WHATSAPP", provider: "META" }, true],
        [
            { status: "CONNECTED", channel: "EMAIL", provider: "SENDGRID" },
            false,
        ],
        [{ status: "CONNECTED", channel: "EMAIL", provider: "SMTP" }, false],
        [
            { status: "CONNECTED", channel: "WHATSAPP", provider: "TWILIO" },
            false,
        ],
        [{ status: "CONNECTED", channel: "SMS", provider: "RESEND" }, false],
        [{ status: "DISABLED", channel: "EMAIL", provider: "RESEND" }, false],
        [null, false],
    ])("%j → %s", (row, expected) => {
        expect(sendable(row)).toBe(expected);
    });
});

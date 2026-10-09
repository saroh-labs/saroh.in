import type { AddressInfo, Socket } from "node:net";
import { createServer } from "node:net";

import nodemailer from "nodemailer";

import {
    outcomeOfError,
    SAROH_BUSINESS_FROM_DEFAULT,
    sarohBusinessMessage,
    sendSarohBusinessEmail,
} from "./saroh-email.sender";

/** Visibly fake values: nothing here connects anywhere. */
const email = {
    organizationId: "org_kavi1",
    businessName: "Kavi Dental",
    fallbackName: "Your booking",
    contactEmail: "frontdesk@kavi.example",
    to: "customer@example.test",
    subject: "You're booked with Kavi Dental",
    html: "<p>See you soon.</p>",
};

const from = {
    from: SAROH_BUSINESS_FROM_DEFAULT,
    configurationSet: "saroh-business",
};

describe("sarohBusinessMessage", () => {
    it("sends in the business's name from the notify subdomain, tagged and replying to the business", () => {
        const message = sarohBusinessMessage(email, from);
        expect(message.from).toEqual({
            name: "Kavi Dental via Saroh",
            address: "bookings@notify.saroh.in",
        });
        expect(message.replyTo).toBe("frontdesk@kavi.example");
        expect(
            sarohBusinessMessage(
                { ...email, contactEmail: "  hi@kavi.example " },
                from,
            ).replyTo,
        ).toBe("hi@kavi.example");
        expect(message.headers).toEqual({
            "X-SES-CONFIGURATION-SET": "saroh-business",
            "X-SES-MESSAGE-TAGS": "organization=org_kavi1",
        });
        expect(message.to).toBe("customer@example.test");
        expect(message.subject).toBe(email.subject);
    });

    it("cleans a business name that carries a link, a domain or a line break", () => {
        const message = sarohBusinessMessage(
            {
                ...email,
                businessName:
                    "Kavi\r\nBcc: x https://evil.example verify-at bank.example",
            },
            from,
        );
        const name = (message.from as { name: string }).name;
        expect(name).not.toMatch(/https?:|evil|bank\.example|[\r\n]/u);
        expect(name.endsWith(" via Saroh")).toBe(true);
    });

    it("falls back when nothing of the name survives", () => {
        const message = sarohBusinessMessage(
            { ...email, businessName: "www.example.com" },
            from,
        );
        expect((message.from as { name: string }).name).toBe(
            "Your booking via Saroh",
        );
    });

    it("leaves Reply-To out with no clean contact address", () => {
        for (const contactEmail of [
            null,
            "",
            "not an address",
            "a@b.example\r\nBcc: c@d.example",
            "a@b.example, c@d.example",
            "Kavi <hello@kavi.example>",
        ]) {
            const message = sarohBusinessMessage(
                { ...email, contactEmail },
                from,
            );
            expect(message.replyTo).toBeUndefined();
        }
    });

    it("keeps the tag to the characters SES allows and drops an unset configuration set", () => {
        const message = sarohBusinessMessage(
            { ...email, organizationId: "org:1/2" },
            { from: SAROH_BUSINESS_FROM_DEFAULT },
        );
        expect(message.headers).toEqual({
            "X-SES-MESSAGE-TAGS": "organization=org_1_2",
        });
    });
});

/**
 * Nodemailer's errors as 10.0.10 raises them (shapes taken from real
 * sessions against a stub server, below): the stage is never on the error.
 */
const SHAPES = {
    droppedAfter354: {
        code: "ECONNECTION",
        command: "CONN",
        message: "Connection closed unexpectedly",
    },
    resetAfter354: {
        code: "ESOCKET",
        command: "CONN",
        message: "read ECONNRESET",
        syscall: "read",
    },
    silentAfter354: { code: "ETIMEDOUT", command: "CONN", message: "Timeout" },
    rejected: {
        code: "EMESSAGE",
        command: "DATA",
        responseCode: 451,
        message: "Message failed: 451 try later",
    },
    closedWith421: {
        code: "ECONNECTION",
        command: "CONN",
        responseCode: 421,
        message: "Connection closed unexpectedly: 421 closing",
    },
    refused: {
        code: "ESOCKET",
        command: "CONN",
        message: "connect ECONNREFUSED 127.0.0.1:2525",
        syscall: "connect",
    },
    noHost: {
        code: "EDNS",
        command: "CONN",
        message: "getaddrinfo ENOTFOUND smtp.invalid",
        syscall: "getaddrinfo",
    },
    connectTimeout: {
        code: "ETIMEDOUT",
        command: "CONN",
        message: "Connection timeout",
    },
    noGreeting: {
        code: "ETIMEDOUT",
        command: "CONN",
        message: "Greeting never received",
    },
    loginRefused: {
        code: "EAUTH",
        command: "AUTH PLAIN",
        responseCode: 535,
        message: "Invalid login: 535 bad",
    },
    tls: { code: "ETLS", command: "CONN", message: "Error initiating TLS" },
};

const errorOf = (shape: Record<string, unknown>) =>
    Object.assign(new Error(String(shape.message)), shape);

describe("outcomeOfError", () => {
    it("is a failure when the server replied 4xx or 5xx", () => {
        expect(outcomeOfError(errorOf(SHAPES.rejected))).toBe("failed");
        expect(outcomeOfError(errorOf(SHAPES.closedWith421))).toBe("failed");
        expect(outcomeOfError({ responseCode: 554, code: "EMESSAGE" })).toBe(
            "failed",
        );
    });

    it("is unknown for a drop mid-session with no reply: nodemailer can't say whether it was after 354", () => {
        expect(outcomeOfError(errorOf(SHAPES.droppedAfter354))).toBe("unknown");
        expect(outcomeOfError(errorOf(SHAPES.resetAfter354))).toBe("unknown");
        expect(outcomeOfError(errorOf(SHAPES.silentAfter354))).toBe("unknown");
    });

    it("is a failure for what only happens before the hand-over", () => {
        for (const shape of [
            SHAPES.refused,
            SHAPES.noHost,
            SHAPES.connectTimeout,
            SHAPES.noGreeting,
            SHAPES.loginRefused,
            SHAPES.tls,
            { code: "ECONNREFUSED" },
            { code: "ENOTFOUND" },
        ]) {
            expect(outcomeOfError(errorOf(shape))).toBe("failed");
        }
    });

    it("is a failure for anything unrecognised", () => {
        expect(outcomeOfError({ code: "EENVELOPE" })).toBe("failed");
        expect(outcomeOfError(new Error("boom"))).toBe("failed");
        expect(outcomeOfError(undefined)).toBe("failed");
    });
});

/**
 * A stub SMTP server on loopback that answers up to "354", then does
 * `afterData` with the first line of the message: the real nodemailer
 * error, not a hand-built one.
 */
async function stubServer(
    afterData: (socket: Socket) => void,
): Promise<{ port: number; close: () => Promise<void> }> {
    const server = createServer((socket) => {
        socket.on("error", () => undefined);
        socket.write("220 stub ESMTP\r\n");
        let inData = false;
        let buffer = "";
        socket.on("data", (chunk) => {
            buffer += chunk.toString();
            let end = buffer.indexOf("\r\n");
            while (end >= 0) {
                const line = buffer.slice(0, end);
                buffer = buffer.slice(end + 2);
                end = buffer.indexOf("\r\n");
                if (inData) {
                    afterData(socket);
                    return;
                }
                if (/^EHLO/i.test(line)) socket.write("250 stub\r\n");
                else if (/^(MAIL|RCPT)/i.test(line)) socket.write("250 ok\r\n");
                else if (/^DATA/i.test(line)) {
                    inData = true;
                    socket.write("354 go ahead\r\n");
                }
            }
        });
    });
    await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
    );
    const { port } = server.address() as AddressInfo;
    return {
        port,
        close: () => new Promise((resolve) => server.close(() => resolve())),
    };
}

async function sendThrough(port: number): Promise<unknown> {
    const transport = nodemailer.createTransport({
        host: "127.0.0.1",
        port,
        secure: false,
        ignoreTLS: true,
        socketTimeout: 300,
        connectionTimeout: 1_000,
        greetingTimeout: 1_000,
    });
    try {
        await transport.sendMail({
            from: "bookings@notify.example",
            to: "customer@example.test",
            subject: "s",
            text: "hi",
        });
        return null;
    } catch (err) {
        return err;
    } finally {
        transport.close();
    }
}

describe("outcomeOfError against a real nodemailer session", () => {
    it("a connection closed after 354 has no responseCode, and is unknown", async () => {
        const stub = await stubServer((socket) => socket.destroy());
        try {
            const err = await sendThrough(stub.port);
            expect(err).toMatchObject({ code: "ECONNECTION", command: "CONN" });
            expect(err).not.toHaveProperty("responseCode");
            expect(outcomeOfError(err)).toBe("unknown");
        } finally {
            await stub.close();
        }
    });

    it("a server gone silent after 354 times out as unknown", async () => {
        const stub = await stubServer(() => undefined);
        try {
            const err = await sendThrough(stub.port);
            expect(err).toMatchObject({
                code: "ETIMEDOUT",
                message: "Timeout",
            });
            expect(outcomeOfError(err)).toBe("unknown");
        } finally {
            await stub.close();
        }
    });

    it("a refused connection is a failure, safe to retry", async () => {
        const stub = await stubServer(() => undefined);
        await stub.close();
        const err = await sendThrough(stub.port);
        expect(err).toMatchObject({ code: "ESOCKET", syscall: "connect" });
        expect(outcomeOfError(err)).toBe("failed");
    });
});

describe("sendSarohBusinessEmail", () => {
    it("reports sent when SES takes it", async () => {
        const sendMail = jest.fn().mockResolvedValue({});
        await expect(sendSarohBusinessEmail(email, { sendMail })).resolves.toBe(
            "sent",
        );
        expect(sendMail).toHaveBeenCalledTimes(1);
    });

    it("reports the outcome and never the provider's words", async () => {
        const sendMail = jest.fn().mockRejectedValue(
            Object.assign(new Error("554 Message rejected: secret detail"), {
                responseCode: 554,
            }),
        );
        await expect(sendSarohBusinessEmail(email, { sendMail })).resolves.toBe(
            "failed",
        );
    });

    it("is not configured with no SMTP unless NODE_ENV was declared development", async () => {
        await expect(
            sendSarohBusinessEmail(email, null, "production"),
        ).resolves.toBe("not-configured");
        await expect(
            sendSarohBusinessEmail(email, null, undefined),
        ).resolves.toBe("not-configured");
    });

    it("counts as sent with no SMTP in declared development", async () => {
        await expect(
            sendSarohBusinessEmail(email, null, "development"),
        ).resolves.toBe("sent");
    });
});

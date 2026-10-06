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
    subject: "Your booking with Kavi Dental is confirmed",
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

describe("outcomeOfError", () => {
    it("is a failure when the server rejected the message", () => {
        expect(outcomeOfError({ responseCode: 554, code: "EMESSAGE" })).toBe(
            "failed",
        );
        expect(outcomeOfError({ responseCode: 535, code: "EAUTH" })).toBe(
            "failed",
        );
    });

    it("is unknown when the connection dropped after SES started taking it", () => {
        // Nodemailer's shape: closed unexpectedly, last reply attached.
        expect(
            outcomeOfError({
                code: "ECONNECTION",
                command: "CONN",
                response: "354 End data with <CR><LF>.<CR><LF>",
                responseCode: 354,
            }),
        ).toBe("unknown");
    });

    it("is unknown on an inactivity timeout mid-session", () => {
        expect(
            outcomeOfError(
                Object.assign(new Error("Timeout"), {
                    code: "ETIMEDOUT",
                    command: "CONN",
                }),
            ),
        ).toBe("unknown");
    });

    it("is a failure before the hand-over, or for anything unrecognised", () => {
        for (const message of [
            "Connection timeout",
            "Greeting never received",
        ]) {
            expect(
                outcomeOfError(
                    Object.assign(new Error(message), {
                        code: "ETIMEDOUT",
                        command: "CONN",
                    }),
                ),
            ).toBe("failed");
        }
        expect(outcomeOfError({ code: "ECONNECTION", command: "CONN" })).toBe(
            "failed",
        );
        expect(outcomeOfError(new Error("boom"))).toBe("failed");
        expect(outcomeOfError(undefined)).toBe("failed");
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

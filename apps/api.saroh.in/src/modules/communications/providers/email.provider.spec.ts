import { EmailCommsProvider } from "./email.provider";

// DEC-083: which email providers carry the invoice PDF, and how it is sent.
// `fetch` is stubbed: no network.
describe("EmailCommsProvider attachments", () => {
    const fetchMock = jest.fn();
    const realFetch = global.fetch;

    beforeEach(() => {
        fetchMock.mockReset();
        fetchMock.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ id: "em_1" }),
        });
        global.fetch = fetchMock as unknown as typeof fetch;
    });
    afterAll(() => {
        global.fetch = realFetch;
    });

    it("Resend takes attachments; the SendGrid and SMTP relays are not given any", () => {
        const email = new EmailCommsProvider();
        expect(email.takesAttachments("RESEND")).toBe(true);
        expect(email.takesAttachments("SENDGRID")).toBe(false);
        expect(email.takesAttachments("SMTP")).toBe(false);
    });

    it("sends a file base64-encoded with its name and type", async () => {
        await new EmailCommsProvider().send({
            to: "asha@example.com",
            subject: "Invoice",
            body: "<p>hi</p>",
            credentials: { apiKey: "re_test" },
            attachments: [
                {
                    fileName: "INV-0042.pdf",
                    contentType: "application/pdf",
                    content: Buffer.from("%PDF"),
                },
            ],
        });
        const sent = JSON.parse(
            (fetchMock.mock.calls[0][1] as { body: string }).body,
        ) as Record<string, unknown>;
        expect(sent.attachments).toEqual([
            {
                filename: "INV-0042.pdf",
                content: Buffer.from("%PDF").toString("base64"),
                content_type: "application/pdf",
            },
        ]);
    });

    it("a message without one sends no attachments field", async () => {
        await new EmailCommsProvider().send({
            to: "asha@example.com",
            body: "<p>hi</p>",
            credentials: { apiKey: "re_test" },
        });
        const sent = JSON.parse(
            (fetchMock.mock.calls[0][1] as { body: string }).body,
        ) as Record<string, unknown>;
        expect(sent).not.toHaveProperty("attachments");
    });
});

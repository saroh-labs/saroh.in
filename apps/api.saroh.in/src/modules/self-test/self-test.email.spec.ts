// Verifies the REAL email helper (not the mock the service spec uses) stamps
// every self-test message as a Saroh test. We supply fake SMTP env + a fake
// nodemailer transport so a subject/body are actually produced, WITHOUT any
// network: sendMail is a jest.fn we assert against.
const sendMailMock = jest.fn().mockResolvedValue(undefined);

jest.mock("nodemailer", () => ({
    __esModule: true,
    default: {
        createTransport: jest.fn(() => ({ sendMail: sendMailMock })),
    },
}));

jest.mock("../../env", () => ({
    env: {
        EMAIL_FROM: "Saroh <noreply@saroh.in>",
        SMTP_HOST: "smtp.example.com",
        SMTP_PORT: "465",
        SMTP_USER: "user",
        SMTP_PASS: "pass",
    },
}));

import { SAROH_TEST_LABEL, sendSelfTestEmail } from "../../common/email";

describe("sendSelfTestEmail labeling (S6-004)", () => {
    beforeEach(() => sendMailMock.mockClear());

    it("stamps [Saroh test] on the subject and prefixes a preview banner in the body", async () => {
        await sendSelfTestEmail("ada@example.com", {
            templateLabel: "Welcome email preview",
            html: "<h2>Welcome to Saroh</h2>",
        });

        expect(sendMailMock).toHaveBeenCalledTimes(1);
        const mail = sendMailMock.mock.calls[0][0] as {
            to: string;
            subject: string;
            html: string;
        };

        expect(SAROH_TEST_LABEL).toBe("[Saroh test]");
        expect(mail.to).toBe("ada@example.com");
        // Subject is unmistakably a Saroh test, never a production org message.
        expect(mail.subject).toBe("[Saroh test] Welcome email preview");
        // The body opens with the same test label so it can't be mistaken.
        expect(mail.html).toContain("[Saroh test]");
        expect(mail.html).toContain("<h2>Welcome to Saroh</h2>");
    });
});

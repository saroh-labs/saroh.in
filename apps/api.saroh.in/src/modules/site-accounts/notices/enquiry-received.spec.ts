// "We got your message" (DEC-174 U15, #1146): its words, the quote, and
// that it is email only, behind the ENQUIRY_REPLY switch.
import { noticeDefinition, renderNotice } from ".";
import { NOTICE_SENDS } from "../../communications/notice-settings";
import type { EnquiryReceivedNotice } from "./enquiry-received";
import { enquiryReceivedNotice } from "./enquiry-received";

const notice = (
    over: Partial<EnquiryReceivedNotice["enquiry"]> = {},
): EnquiryReceivedNotice => ({
    kind: "ENQUIRY_RECEIVED",
    enquiry: {
        business: "Rye & Co.",
        firstName: "Asha",
        message: "Do you open on Sundays?",
        ...over,
    },
});

describe("the enquiry auto-reply", () => {
    it("is registered, behind ENQUIRY_REPLY, which is marked as sent", () => {
        expect(noticeDefinition("ENQUIRY_RECEIVED")).toBe(
            enquiryReceivedNotice,
        );
        expect(enquiryReceivedNotice.setting).toBe("ENQUIRY_REPLY");
        expect(NOTICE_SENDS.ENQUIRY_REPLY).toBe(true);
    });

    it("is email only: never the account thread", () => {
        expect(enquiryReceivedNotice.emailOnly).toBe(true);
    });

    it("thanks them by name, says the business got it, and quotes their message", () => {
        const { subject, body } = renderNotice(notice());
        expect(subject).toBe("Rye & Co. got your message");
        expect(body).toContain("<p>Hi Asha,</p>");
        expect(body).toContain(
            "Thanks for getting in touch. Rye &amp; Co. got your message and will reply soon.",
        );
        expect(body).toContain("<p>You wrote:</p>");
        expect(body).toContain(
            "<blockquote>Do you open on Sundays?</blockquote>",
        );
    });

    it("promises no time to reply", () => {
        const { body } = renderNotice(notice());
        expect(body).not.toMatch(/\b(hours?|minutes?|days?|today)\b/i);
    });

    it("escapes what they typed and keeps their line breaks", () => {
        const { body } = renderNotice(
            notice({ message: "<script>x</script>\nSecond line" }),
        );
        expect(body).not.toContain("<script>");
        expect(body).toContain("&lt;script&gt;x&lt;/script&gt;<br>Second line");
    });

    it("with no name it says Hello, and with no message it quotes nothing", () => {
        const { body } = renderNotice(
            notice({ firstName: null, message: null }),
        );
        expect(body).toContain("<p>Hello,</p>");
        expect(body).not.toContain("You wrote:");
        expect(body).not.toContain("<blockquote>");
    });

    it("a load for another kind's payload reads nothing", async () => {
        await expect(
            enquiryReceivedNotice.load(
                {} as never,
                "org_1",
                { kind: "ORDER_READY", eventKey: "x" },
                new Date(),
            ),
        ).resolves.toBeNull();
    });
});

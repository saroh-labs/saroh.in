import { siteCodesSmtpSecure } from "./email";

/**
 * The code stream's SMTP connection (review M-3): a TLS hello on a STARTTLS
 * port fails every send, and with it every booking.
 */
describe("siteCodesSmtpSecure", () => {
    it("starts in TLS on 465 and upgrades with STARTTLS anywhere else", () => {
        expect(siteCodesSmtpSecure(465, undefined)).toBe(true);
        expect(siteCodesSmtpSecure(587, undefined)).toBe(false);
        expect(siteCodesSmtpSecure(2525, undefined)).toBe(false);
    });

    it("does what SITE_CODES_SMTP_SECURE says when it is set", () => {
        expect(siteCodesSmtpSecure(587, "true")).toBe(true);
        expect(siteCodesSmtpSecure(465, "false")).toBe(false);
    });
});

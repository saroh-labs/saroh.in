import { StaffInviteMailer } from "./staff-invite-mailer";

const mailer = new StaffInviteMailer();

describe("StaffInviteMailer.accountsBase (DEC-204)", () => {
    const production = { ACCOUNTS_URL: "https://accounts.saroh.in" };

    it("links an invite from the Global console to Global sign-in", () => {
        const base = mailer.accountsBase("GLOBAL", production);
        expect(base).toBe("https://accounts.saroh.tech");
        expect(mailer.link(base!, "t")).toBe(
            "https://accounts.saroh.tech/staff-invite/open?token=t",
        );
    });

    it("links an invite from the India console to India sign-in", () => {
        expect(mailer.accountsBase("INDIA", production)).toBe(
            "https://accounts.saroh.in",
        );
    });

    it("stays in the environment ACCOUNTS_URL names", () => {
        expect(
            mailer.accountsBase("INDIA", {
                ACCOUNTS_URL: "https://accounts.saroh.io",
            }),
        ).toBe("https://accounts.saroh.io");
    });

    it("keeps ACCOUNTS_URL on an address of no edition, and locally", () => {
        expect(mailer.accountsBase(null, production)).toBe(
            "https://accounts.saroh.in",
        );
        expect(
            mailer.accountsBase("GLOBAL", {
                ACCOUNTS_URL: "https://accounts.saroh.localhost",
            }),
        ).toBe("https://accounts.saroh.localhost");
    });

    it("can't say without ACCOUNTS_URL outside development", () => {
        expect(mailer.accountsBase("GLOBAL", {})).toBeNull();
    });
});

import { seesAccountManager } from "./business-account-manager";

// Who in a business sees "Your Saroh contact" (DEC-169, U26; owner, 19 Oct).
describe("seesAccountManager", () => {
    it("shows the manager to everyone but a Reviewer", () => {
        expect(seesAccountManager("OWNER")).toBe(true);
        expect(seesAccountManager("ADMIN")).toBe(true);
        expect(seesAccountManager("MEMBER")).toBe(true);
        expect(seesAccountManager("REVIEWER")).toBe(false);
    });
});

import { adminBase, managerSignalsEmail, managerSignalsSubject } from "./email";

describe("the account manager's daily email (#1199)", () => {
    const businesses = [
        {
            organizationId: "org-a",
            name: "Asha's Salon",
            signals: [
                {
                    kind: "NO_ACTIVITY" as const,
                    since: new Date("2026-10-10T06:00:00.000Z"),
                },
                {
                    kind: "PAYMENT_DISCONNECTED" as const,
                    since: new Date("2026-10-20T06:00:00.000Z"),
                },
            ],
        },
        {
            organizationId: "org-b",
            name: "Ravi's Studio",
            signals: [
                {
                    kind: "NO_TRADING" as const,
                    since: new Date("2026-10-01T06:00:00.000Z"),
                },
            ],
        },
    ];

    it("lists each business, its signals in plain words and its admin page", () => {
        const text = managerSignalsEmail(
            "Meera",
            businesses,
            "https://admin.saroh.in",
        );
        expect(text).toContain("Hi Meera,");
        expect(text).toContain("Asha's Salon");
        expect(text).toContain("- No team activity since 10 Oct 2026");
        expect(text).toContain("- Payments disconnected since 20 Oct 2026");
        expect(text).toContain("https://admin.saroh.in/businesses/org-a");
        expect(text).toContain("- No bookings or orders since 1 Oct 2026");
        expect(text).toContain("https://admin.saroh.in/businesses/org-b");
    });

    it("goes without links when the admin address is unknown", () => {
        expect(managerSignalsEmail(null, businesses, null)).not.toContain(
            "/businesses/",
        );
    });

    it("counts the businesses in the subject", () => {
        expect(managerSignalsSubject(1)).toBe(
            "1 of your businesses has gone quiet",
        );
        expect(managerSignalsSubject(2)).toBe(
            "2 of your businesses have gone quiet",
        );
    });

    it("takes the admin address from ADMIN_URL, or the local one in development", () => {
        expect(adminBase({ ADMIN_URL: "https://admin.saroh.io/" })).toBe(
            "https://admin.saroh.io",
        );
        expect(adminBase({ NODE_ENV: "development" })).toBe(
            "https://admin.saroh.localhost",
        );
        expect(adminBase({ NODE_ENV: "production" })).toBeNull();
    });
});

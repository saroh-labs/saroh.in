import { describe, expect, it } from "vitest";

import { signsInLine, unlinkConfirm, unlinkedLine } from "./site-account";

describe("signsInLine", () => {
    it("names the email to someone who may see contact details", () => {
        expect(
            signsInLine({ email: "farah@example.in", status: "ACTIVE" }, true),
        ).toBe("Signs in on your website as farah@example.in");
    });

    it("keeps the email from someone who may not", () => {
        expect(
            signsInLine({ email: "farah@example.in", status: "ACTIVE" }, false),
        ).toBe("Signs in on your website");
    });

    it("says when the account is blocked", () => {
        expect(
            signsInLine({ email: "farah@example.in", status: "BLOCKED" }, true),
        ).toBe("Blocked from signing in on your website as farah@example.in");
        expect(
            signsInLine(
                { email: "farah@example.in", status: "BLOCKED" },
                false,
            ),
        ).toBe("Blocked from signing in on your website");
    });
});

describe("unlinkConfirm", () => {
    it("names who, what moves, and what Farah keeps", () => {
        const { title, description } = unlinkConfirm("Farah Khan", {
            email: "farah@example.in",
            moves: [{ key: "bookings", count: 2, label: "2 bookings" }],
            sentence: "2 bookings they made online move with them.",
        });

        expect(title).toBe("farah@example.in isn't Farah Khan?");
        expect(description).toContain(
            "gets a customer record of their own and is signed out of your website.",
        );
        expect(description).toContain(
            "2 bookings they made online move with them.",
        );
        expect(description).toContain(
            "Farah Khan's email no longer counts as confirmed",
        );
        expect(description.endsWith("This cannot be undone.")).toBe(true);
    });
});

describe("unlinkedLine", () => {
    it("says where the account went", () => {
        expect(unlinkedLine("farah@example.in")).toBe(
            "Done. farah@example.in now has a customer record of their own.",
        );
    });
});

import type { EmailOutcome } from "../../common/email";
import { siteCodeEmail } from "../../common/email";
import { structuredLogger } from "../../common/logging/structured-logger";
import { maskEmail } from "./account-linking.service";
import { SiteCodeAlerts, SiteCodeDelivery } from "./code-delivery";
import { hashSessionToken } from "./sessions.service";
import { codeHashFor, destinationHashFor } from "./sign-in-codes.service";

/**
 * The parts of site sign-in that need no database (round-2 plan A, A2):
 * the keyed hashes, the send with its retries and alerts, the email body,
 * and the masked survivor email. The flows are `sign-in.controller.db.spec.ts`.
 */
describe("keyed hashes", () => {
    it("hashes a destination per business, whatever its case", () => {
        const a = destinationHashFor("org_a", "Asha@Example.in ");
        expect(a).toBe(destinationHashFor("org_a", "asha@example.in"));
        expect(a).not.toBe(destinationHashFor("org_b", "asha@example.in"));
        expect(a).toMatch(/^[0-9a-f]{64}$/);
        expect(a).not.toContain("asha");
    });

    it("binds a code's hash to its business and destination", () => {
        const dest = destinationHashFor("org_a", "asha@example.in");
        const hash = codeHashFor("org_a", dest, "123456");
        expect(hash).not.toBe(codeHashFor("org_b", dest, "123456"));
        expect(hash).not.toBe(codeHashFor("org_a", "other", "123456"));
        expect(hash).not.toContain("123456");
    });

    it("stores a session token only as its SHA-256", () => {
        expect(hashSessionToken("token")).toBe(
            "3c469e9d6c5875d37a43f353d4f88e61fcf812c66eee3457465a40b0da4153e0",
        );
    });
});

describe("SiteCodeDelivery", () => {
    const details = {
        code: "123456",
        businessName: "Kavi Dental",
        minutes: 10,
    };

    function delivery(outcomes: (EmailOutcome | Error)[]) {
        const alerts = new SiteCodeAlerts();
        const send = jest.fn(() => {
            const next = outcomes.shift() ?? "failed";
            return next instanceof Error
                ? Promise.reject(next)
                : Promise.resolve(next);
        });
        return {
            alerts,
            send,
            deliver: new SiteCodeDelivery(alerts, send, [0, 0]),
        };
    }

    let errors: jest.SpyInstance;
    beforeEach(() => {
        errors = jest.spyOn(structuredLogger, "error").mockImplementation();
    });
    afterEach(() => errors.mockRestore());

    it("sends once when the provider takes it", async () => {
        const d = delivery(["sent"]);
        await expect(d.deliver.deliver("org", "a@x.in", details)).resolves.toBe(
            true,
        );
        expect(d.send).toHaveBeenCalledTimes(1);
        expect(errors).not.toHaveBeenCalled();
    });

    it("retries twice, and a later success is a success", async () => {
        const d = delivery(["failed", new Error("timeout"), "sent"]);
        await expect(d.deliver.deliver("org", "a@x.in", details)).resolves.toBe(
            true,
        );
        expect(d.send).toHaveBeenCalledTimes(3);
        expect(d.alerts.failuresInWindow()).toBe(0);
    });

    it("gives up after three tries, counts it and logs the alert without the address or code", async () => {
        const d = delivery(["failed", "failed", "failed"]);
        await expect(
            d.deliver.deliver("org_1", "a@x.in", details),
        ).resolves.toBe(false);
        expect(d.send).toHaveBeenCalledTimes(3);
        expect(d.alerts.failuresInWindow()).toBe(1);
        expect(errors).toHaveBeenCalledWith("site_code_send_failed", {
            organizationId: "org_1",
            outcome: "failed",
            attempts: 3,
            failuresInWindow: 1,
        });
        const logged = JSON.stringify(errors.mock.calls);
        expect(logged).not.toContain("a@x.in");
        expect(logged).not.toContain("123456");
    });

    it("does not retry when no email is configured", async () => {
        const d = delivery(["not-configured"]);
        await expect(d.deliver.deliver("org", "a@x.in", details)).resolves.toBe(
            false,
        );
        expect(d.send).toHaveBeenCalledTimes(1);
        expect(errors).toHaveBeenCalledWith(
            "site_code_send_failed",
            expect.objectContaining({ outcome: "not-configured" }),
        );
    });
});

describe("SiteCodeAlerts", () => {
    let errors: jest.SpyInstance;
    beforeEach(() => {
        errors = jest.spyOn(structuredLogger, "error").mockImplementation();
    });
    afterEach(() => errors.mockRestore());

    const events = () => errors.mock.calls.map((c) => c[0] as string);

    it("raises 'failing' once when 3 sends fail within 5 minutes", () => {
        const alerts = new SiteCodeAlerts();
        alerts.sendFailed("org", "failed", 3, 0);
        alerts.sendFailed("org", "failed", 3, 60_000);
        expect(events()).not.toContain("site_code_send_failing");
        alerts.sendFailed("org", "failed", 3, 120_000);
        alerts.sendFailed("org", "failed", 3, 130_000);
        expect(
            events().filter((e) => e === "site_code_send_failing"),
        ).toHaveLength(1);
        expect(alerts.failuresInWindow(130_000)).toBe(4);
        expect(alerts.failuresInWindow(10 * 60_000)).toBe(0);
    });

    it("raises a ceiling or a missing challenge once per business and hour", () => {
        const alerts = new SiteCodeAlerts();
        alerts.ceilingPassed("org", "daily", 0);
        alerts.ceilingPassed("org", "daily", 60_000);
        alerts.ceilingPassed("org", "new-destinations", 60_000);
        alerts.ceilingPassed("other", "daily", 60_000);
        alerts.ceilingPassed("org", "daily", 61 * 60_000);
        alerts.challengeUnconfigured("org", 0);
        alerts.challengeUnconfigured("org", 1_000);
        expect(
            events().filter((e) => e === "site_codes_ceiling_passed"),
        ).toHaveLength(4);
        expect(
            events().filter((e) => e === "site_codes_challenge_unconfigured"),
        ).toHaveLength(1);
    });
});

describe("the code email", () => {
    it("escapes the business name and the code in the body", () => {
        const html = siteCodeEmail('Kavi <b>"Dental"</b>', "123456", 10);
        expect(html).toContain(
            "Your code for Kavi &lt;b&gt;&quot;Dental&quot;&lt;/b&gt;",
        );
        expect(html).not.toContain("<b>");
        expect(html).toContain(">123456<");
        expect(html).toContain("expires in 10 minutes");
        expect(html).toContain("This address sends only sign-in codes");
    });
});

describe("maskEmail", () => {
    it("keeps the first letter and the domain", () => {
        expect(maskEmail("farah@example.in")).toBe("f…@example.in");
        expect(maskEmail("nope")).toBe("…");
    });
});

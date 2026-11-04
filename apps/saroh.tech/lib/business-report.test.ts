import { afterEach, describe, expect, it, vi } from "vitest";

import { prefilledSite, reportProblem, sendReport } from "./business-report";

const good = {
    site: "shop.example.com",
    message: "They never sent my order.",
    email: "name@example.com",
    phone: "+44 20 7946 0958",
};

describe("a report", () => {
    it("names the first field at fault, in the form's order", () => {
        expect(reportProblem(good)).toBeNull();
        expect(reportProblem({ ...good, site: "not an address" })).toBe("site");
        expect(reportProblem({ ...good, message: "short", email: "x" })).toBe(
            "message",
        );
        expect(reportProblem({ ...good, email: "x" })).toBe("email");
    });

    it("wants a phone with its country code", () => {
        expect(reportProblem({ ...good, phone: "020 7946 0958" })).toBe(
            "phone",
        );
        expect(reportProblem({ ...good, phone: "+12" })).toBe("phone");
    });

    it("fills in the address a merchant site's link carries", () => {
        expect(prefilledSite("?site=shop.saroh.app")).toBe("shop.saroh.app");
        expect(prefilledSite("")).toBe("");
        expect(prefilledSite(`?site=${"a".repeat(254)}`)).toBe("");
    });

    describe("sending", () => {
        afterEach(() => vi.unstubAllGlobals());
        const answering = (status: number) =>
            vi.stubGlobal(
                "fetch",
                vi.fn(() => Promise.resolve(new Response("{}", { status }))),
            );

        it("posts to the API and reads its answer", async () => {
            answering(200);
            await expect(sendReport("https://api.test", good)).resolves.toBe(
                "sent",
            );
            expect(fetch).toHaveBeenCalledWith(
                "https://api.test/public/business-reports",
                expect.objectContaining({ method: "POST" }),
            );
            answering(429);
            await expect(sendReport("https://api.test", good)).resolves.toBe(
                "rate-limited",
            );
            answering(400);
            await expect(sendReport("https://api.test", good)).resolves.toBe(
                "site",
            );
            answering(500);
            await expect(sendReport("https://api.test", good)).resolves.toBe(
                "unavailable",
            );
        });

        it("says unavailable when the network fails", async () => {
            vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no")));
            await expect(sendReport("https://api.test", good)).resolves.toBe(
                "unavailable",
            );
        });
    });
});

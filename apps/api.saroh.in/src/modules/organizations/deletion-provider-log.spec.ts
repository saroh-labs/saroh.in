jest.mock("@saroh/database", () => ({
    prisma: { organization: { findUnique: jest.fn() } },
}));

import { prisma } from "@saroh/database";

import {
    businessLeaving,
    deletionProviderCallLine,
    errorResult,
    lifecycleLeaving,
    logDeletionProviderCall,
} from "./deletion-provider-log";

describe("deletion_provider_call (#921)", () => {
    it("is one line an operator can grep, every field named", () => {
        expect(
            deletionProviderCallLine({
                organizationId: "org_1",
                provider: "RAZORPAY",
                call: "billing.cancel",
                result: "ok",
                ref: "sub_123",
            }),
        ).toBe(
            "deletion_provider_call org=org_1 provider=razorpay call=billing.cancel result=ok ref=sub_123",
        );
    });

    it("says - for no ref, and squeezes anything that isn't an id's characters", () => {
        const line = deletionProviderCallLine({
            organizationId: "org_1",
            provider: "storage",
            call: "object.delete",
            result: "error:TypeError",
            ref: "asha@example.com secret=1",
        });
        expect(line).toContain("result=error:TypeError");
        // No address, no space, no second key=value smuggled in.
        expect(line).not.toContain("@");
        expect(line.split(" ")).toHaveLength(6);
        expect(
            deletionProviderCallLine({
                organizationId: "org_1",
                provider: "cloudflare",
                call: "hostname.remove",
                result: "ok",
            }),
        ).toMatch(/ ref=-$/);
    });

    it("logs a call that worked at INFO and one that didn't at WARN", () => {
        const logger = { log: jest.fn(), warn: jest.fn() };
        const base = {
            organizationId: "o",
            provider: "razorpay",
            call: "refund.send",
        };
        logDeletionProviderCall(logger, { ...base, result: "ok" });
        logDeletionProviderCall(logger, { ...base, result: "unknown" });
        expect(logger.log).toHaveBeenCalledTimes(1);
        expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    it("names an error by its class only", () => {
        expect(errorResult(new RangeError("card 4111 refused"))).toBe(
            "error:RangeError",
        );
        expect(errorResult("x")).toBe("error:unknown");
    });

    it("counts closing and deleted as on the way out, nothing else", async () => {
        expect(lifecycleLeaving("PENDING_DELETION")).toBe(true);
        expect(lifecycleLeaving("DELETED_RETAINED")).toBe(true);
        expect(lifecycleLeaving("ACTIVE")).toBe(false);
        expect(lifecycleLeaving("SUSPENDED")).toBe(false);
        (prisma.organization.findUnique as jest.Mock).mockResolvedValueOnce(
            null,
        );
        expect(await businessLeaving("gone")).toBe(false);
    });
});

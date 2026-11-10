import type { EntitlementService } from "../billing/entitlement.service";
import { CAPS_TTL_MS, CapsService, FALLBACK_RPM, rpmCap } from "./caps";

describe("CapsService", () => {
    function caps(map: Record<string, number | boolean>) {
        const getEntitlements = jest.fn().mockResolvedValue(map);
        return {
            getEntitlements,
            service: new CapsService({
                getEntitlements,
            } as unknown as EntitlementService),
        };
    }

    it("reads each surface's cap from its catalogue row", async () => {
        const { service } = caps({
            "api-mcp": 11,
            "api-secret": 22,
            "api-storefront": false,
        });
        expect(await service.rpm("org", "mcp")).toBe(11);
        expect(await service.rpm("org", "secret")).toBe(22);
        expect(await service.rpm("org", "storefront")).toBe(0);
    });

    it("caches a business's caps for the TTL", async () => {
        const { service, getEntitlements } = caps({ "api-secret": 5 });
        await service.rpm("org", "secret", 1_000);
        await service.rpm("org", "mcp", 1_000 + CAPS_TTL_MS - 1);
        expect(getEntitlements).toHaveBeenCalledTimes(1);
        await service.rpm("org", "secret", 1_000 + CAPS_TTL_MS);
        expect(getEntitlements).toHaveBeenCalledTimes(2);
        await service.rpm("other", "secret", 1_000 + CAPS_TTL_MS);
        expect(getEntitlements).toHaveBeenCalledTimes(3);
    });

    it("falls back when the catalogue has no number", () => {
        expect(rpmCap(undefined)).toBe(FALLBACK_RPM);
        expect(rpmCap(true)).toBe(FALLBACK_RPM);
    });
});

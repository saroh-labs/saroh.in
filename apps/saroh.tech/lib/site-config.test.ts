import { afterEach, describe, expect, it, vi } from "vitest";

// A deploy's build never falls back to the local stack (stage 10, U2).
const load = async () => {
    vi.resetModules();
    return (await import("@/site.config")).site;
};

describe("a deploy's build", () => {
    afterEach(() => vi.unstubAllEnvs());

    it("stops when it was given no hosts", async () => {
        vi.stubEnv("CF_DEPLOY", "1");
        vi.stubEnv("GLOBAL_DEV_DOMAIN", "");
        vi.stubEnv("GLOBAL_PRODUCTION_HOSTS", "");
        await expect(load()).rejects.toThrow(/CF_DEPLOY=1/);
    });

    it("builds with production's hosts", async () => {
        vi.stubEnv("CF_DEPLOY", "1");
        vi.stubEnv("GLOBAL_DEV_DOMAIN", "");
        vi.stubEnv("GLOBAL_PRODUCTION_HOSTS", "on");
        expect((await load()).apiUrl).toBe("https://api.saroh.tech");
    });

    it("a local build still uses the local stack", async () => {
        vi.stubEnv("CF_DEPLOY", "");
        vi.stubEnv("GLOBAL_DEV_DOMAIN", "");
        vi.stubEnv("GLOBAL_PRODUCTION_HOSTS", "");
        expect((await load()).apiUrl).toBe("https://api.saroh.localhost");
    });
});

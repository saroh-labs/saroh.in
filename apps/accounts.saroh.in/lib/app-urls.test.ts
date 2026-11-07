import { afterEach, describe, expect, it, vi } from "vitest";

// A production build with no explicit address: Global's accounts must hand a
// signed-in person to Global's app, never India's (stage 10, U1).
async function urls(edition?: string) {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("NEXT_PUBLIC_ACCOUNTS_URL", "");
    if (edition) vi.stubEnv("NEXT_PUBLIC_EDITION", edition);
    vi.resetModules();
    const { getAppUrl, getAccountsUrl } = await import("./app-urls");
    return { app: getAppUrl(), accounts: getAccountsUrl() };
}

describe("the production fallback follows the edition", () => {
    afterEach(() => vi.unstubAllEnvs());

    it("Global lands on saroh.tech", async () => {
        await expect(urls("GLOBAL")).resolves.toEqual({
            app: "https://app.saroh.tech",
            accounts: "https://accounts.saroh.tech",
        });
    });

    it("India, or no edition, is unchanged", async () => {
        const india = {
            app: "https://app.saroh.in",
            accounts: "https://accounts.saroh.in",
        };
        await expect(urls("INDIA")).resolves.toEqual(india);
        await expect(urls()).resolves.toEqual(india);
    });
});

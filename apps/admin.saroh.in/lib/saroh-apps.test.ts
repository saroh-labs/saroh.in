import { describe, expect, it } from "vitest";

import { sarohApps, sarohAppUrl } from "./saroh-apps";

const urls = (edition: "INDIA" | "GLOBAL") =>
    Object.fromEntries(sarohApps(edition).map((a) => [a.name, a.prodUrl]));

describe("sarohApps", () => {
    it("keeps India's addresses as they were", () => {
        expect(urls("INDIA")).toEqual({
            Application: "https://app.saroh.in",
            Accounts: "https://accounts.saroh.in",
            Sites: "https://saroh.app",
            Templates: "https://templates.saroh.in",
            Docs: "https://docs.saroh.in",
            UI: "https://ui.saroh.in",
            Website: "https://saroh.in",
        });
    });

    it("follows Global where it has its own, and shares the rest", () => {
        expect(urls("GLOBAL")).toEqual({
            Application: "https://app.saroh.tech",
            Accounts: "https://accounts.saroh.tech",
            Sites: "https://saroh.app",
            Templates: "https://templates.saroh.in",
            Docs: "https://docs.saroh.in",
            UI: "https://ui.saroh.in",
            Website: "https://saroh.tech",
        });
    });

    it("uses the local hosts on a .localhost console", () => {
        const app = {
            name: "Application",
            blurb: "",
            devUrl: "https://app.saroh.localhost",
            prodUrl: "https://app.saroh.tech",
        };
        expect(sarohAppUrl(app, "admin.saroh.localhost:443")).toBe(
            "https://app.saroh.localhost",
        );
        expect(sarohAppUrl(app, "admin.saroh.tech")).toBe(
            "https://app.saroh.tech",
        );
    });
});

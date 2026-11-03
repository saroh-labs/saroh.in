const mockEnv: { APP_URL?: string; NODE_ENV?: string } = {};
jest.mock("../env", () => ({ env: mockEnv }));
jest.mock("@saroh/database", () => ({ prisma: {} }));

import { appBase } from "./app-url";

process.env.GLOBAL_DEV_DOMAIN = "global-dev.example";

describe("appBase", () => {
    it("is the configured app without an edition", () => {
        mockEnv.APP_URL = "https://app.saroh.in/";
        expect(appBase()).toBe("https://app.saroh.in");
    });

    it("follows the edition, in the same environment", () => {
        mockEnv.APP_URL = "https://app.saroh.in";
        expect(appBase("INDIA")).toBe("https://app.saroh.in");
        expect(appBase("GLOBAL")).toBe("https://app.saroh.tech");
        mockEnv.APP_URL = "https://app.saroh.io";
        expect(appBase("INDIA")).toBe("https://app.saroh.io");
        expect(appBase("GLOBAL")).toBe("https://app.global-dev.example");
    });

    it("stays on a local stack's one app", () => {
        mockEnv.APP_URL = "https://app.saroh.localhost";
        expect(appBase("GLOBAL")).toBe("https://app.saroh.localhost");
    });
});

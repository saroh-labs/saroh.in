import { configuredProviders } from "./sign-in-options";

describe("configuredProviders", () => {
    it("offers nothing when no keys are set", () => {
        expect(configuredProviders({})).toEqual([]);
    });

    it("needs both keys of a provider", () => {
        expect(configuredProviders({ AUTH_GOOGLE_ID: "id" })).toEqual([]);
        expect(
            configuredProviders({
                AUTH_GOOGLE_ID: "id",
                AUTH_GOOGLE_SECRET: " ",
            }),
        ).toEqual([]);
    });

    it("offers each provider whose keys are set, Google first", () => {
        expect(
            configuredProviders({
                AUTH_GITHUB_ID: "a",
                AUTH_GITHUB_SECRET: "b",
                AUTH_GOOGLE_ID: "c",
                AUTH_GOOGLE_SECRET: "d",
            }),
        ).toEqual(["google", "github"]);
    });

    it("gives Global its own GitHub pair, and no GitHub without it (KTD5)", () => {
        const india = {
            AUTH_GITHUB_ID: "a",
            AUTH_GITHUB_SECRET: "b",
            AUTH_GOOGLE_ID: "c",
            AUTH_GOOGLE_SECRET: "d",
        };
        expect(configuredProviders(india, "GLOBAL")).toEqual(["google"]);
        expect(
            configuredProviders(
                { ...india, AUTH_GITHUB_GLOBAL_ID: "e" },
                "GLOBAL",
            ),
        ).toEqual(["google"]);
        expect(
            configuredProviders(
                {
                    AUTH_GOOGLE_ID: "c",
                    AUTH_GOOGLE_SECRET: "d",
                    AUTH_GITHUB_GLOBAL_ID: "e",
                    AUTH_GITHUB_GLOBAL_SECRET: "f",
                },
                "GLOBAL",
            ),
        ).toEqual(["google", "github"]);
        expect(configuredProviders(india, "INDIA")).toEqual([
            "google",
            "github",
        ]);
    });
});

/**
 * `ask` without a database: the guard that keeps it on this machine and out
 * of production, its arguments, and the settings file's check. The values
 * here are made up.
 */

import {
    assertLocalDev,
    parseArgs,
    parseSettingsFile,
    summariseCard,
} from "./ask";

const LOCAL = "postgresql://u:pw@localhost:5432/saroh-dev";
const REMOTE = "postgresql://u:pw@ep-example-host-1.aws.neon.tech/saroh-dev";

describe("the local-dev guard", () => {
    it("allows a database on this machine outside production", () => {
        expect(
            assertLocalDev({ NODE_ENV: "development", DATABASE_URL: LOCAL }),
        ).toEqual({ database: "saroh-dev", host: "localhost" });
    });

    it("refuses a database on another host, naming the host and never the URL", () => {
        let message = "";
        try {
            assertLocalDev({ NODE_ENV: "development", DATABASE_URL: REMOTE });
        } catch (error) {
            message = (error as Error).message;
        }
        expect(message).toContain("ep-example-host-1");
        expect(message).not.toContain("pw");
        expect(message).not.toContain("neon.tech");
    });

    it("refuses production even on this machine", () => {
        expect(() =>
            assertLocalDev({ NODE_ENV: "production", DATABASE_URL: LOCAL }),
        ).toThrow(/production/);
    });

    it("refuses when no database is set", () => {
        expect(() => assertLocalDev({ NODE_ENV: "development" })).toThrow();
    });
});

describe("the arguments", () => {
    it("reads an ask, with the question's words joined", () => {
        expect(
            parseArgs([
                "--business",
                "shop",
                "--as=a@example.com",
                "how",
                "many?",
            ]),
        ).toEqual({
            business: "shop",
            as: "a@example.com",
            question: "how many?",
        });
    });

    it("needs a business, a person and a question to ask", () => {
        expect(parseArgs(["--as", "a@example.com", "hi"])).toBeNull();
        expect(parseArgs(["--business", "shop", "hi"])).toBeNull();
        expect(
            parseArgs(["--business", "shop", "--as", "a@example.com"]),
        ).toBeNull();
        expect(parseArgs(["--nope", "x"])).toBeNull();
    });

    it("reads a settings setup, which takes no question", () => {
        expect(
            parseArgs(["--setup-settings", "s.json", "--as", "a@example.com"]),
        ).toEqual({ setupSettings: "s.json", as: "a@example.com" });
        expect(
            parseArgs([
                "--setup-settings",
                "s.json",
                "--as",
                "a@example.com",
                "hi",
            ]),
        ).toBeNull();
    });
});

describe("the settings file", () => {
    it("checks every key against its schema and keeps the rate apart", () => {
        const parsed = parseSettingsFile(
            JSON.stringify({
                "ai.halt": false,
                "askAi.maxRounds": 3,
                "ai.prices": {
                    "claude-haiku-5-5": {
                        input: 1,
                        output: 2,
                        cacheRead: 3,
                        cacheWrite5m: 4,
                        cacheWrite1h: 5,
                    },
                },
                "cli.rupeesPerUsd": 50,
                "something.else": 1,
            }),
        );
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.file.settings.map(([k]) => k)).toEqual([
            "ai.halt",
            "askAi.maxRounds",
            "ai.prices",
        ]);
        expect(parsed.file.rupeesPerUsd).toBe(50);
        expect(parsed.file.skipped).toEqual(["something.else"]);
    });

    it("refuses the whole file when any value fails, naming each", () => {
        const parsed = parseSettingsFile(
            JSON.stringify({
                "askAi.maxRounds": 0,
                "askAi.questions.model": "not-a-model",
                "askAi.questions.effort": "low",
                "cli.rupeesPerUsd": -1,
            }),
        );
        expect(parsed.ok).toBe(false);
        if (parsed.ok) return;
        expect(parsed.errors.map((e) => e.split(":")[0])).toEqual([
            "askAi.maxRounds",
            "askAi.questions.model",
            "cli.rupeesPerUsd",
        ]);
    });

    it("refuses what isn't a JSON object", () => {
        expect(parseSettingsFile("nope").ok).toBe(false);
        expect(parseSettingsFile("[1]").ok).toBe(false);
    });
});

it("summarises a card by its kind and field names", () => {
    expect(summariseCard("order", { id: "x", total: 1 })).toBe(
        "[card order: id, total]",
    );
});

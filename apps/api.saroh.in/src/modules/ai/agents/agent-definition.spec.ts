jest.mock("@saroh/database", () => ({ prisma: {} }));

import { agentVersion, statusWordsFor } from "./agent-definition";
import { ASK_AI_AGENT, ASK_AI_TOOLS } from "./ask-ai.agent";
import { formatBusinessBlock } from "./business-block";

describe("agent version", () => {
    it("is stable across runs", () => {
        expect(agentVersion(ASK_AI_AGENT)).toBe(
            agentVersion({ ...ASK_AI_AGENT }),
        );
        expect(agentVersion(ASK_AI_AGENT)).toMatch(/^[0-9a-f]{16}$/);
    });

    it("changes with the instructions, the tool order or the words", () => {
        const v = agentVersion(ASK_AI_AGENT);
        expect(
            agentVersion({ ...ASK_AI_AGENT, job: `${ASK_AI_AGENT.job}.` }),
        ).not.toBe(v);
        expect(
            agentVersion({ ...ASK_AI_AGENT, houseRules: "other rules" }),
        ).not.toBe(v);
        expect(
            agentVersion({
                ...ASK_AI_AGENT,
                tools: [...ASK_AI_TOOLS].reverse(),
            }),
        ).not.toBe(v);
        expect(
            agentVersion({
                ...ASK_AI_AGENT,
                statusWords: {
                    ...ASK_AI_AGENT.statusWords,
                    get_hours: { en: "x", hinglish: "x", hi: "x" },
                },
            }),
        ).not.toBe(v);
    });
});

describe("Ask AI's status words", () => {
    it.each(ASK_AI_TOOLS)("%s has words in each language", (tool) => {
        const w = ASK_AI_AGENT.statusWords[tool];
        expect(w.en).toMatch(/…$/);
        expect(w.hinglish).toMatch(/^[\x20-\x7e…]+$/);
        expect(w.hi).toMatch(/[ऀ-ॿ]/);
    });

    it("picks the person's language, English when matching", () => {
        expect(statusWordsFor(ASK_AI_AGENT, "list_bookings", "HINDI")).toBe(
            "बुकिंग देख रहे हैं…",
        );
        expect(statusWordsFor(ASK_AI_AGENT, "list_bookings", "MATCH")).toBe(
            "Reading your bookings…",
        );
        expect(statusWordsFor(ASK_AI_AGENT, "not_a_tool", "HINGLISH")).toBe(
            "Dekh rahe hain…",
        );
    });
});

describe("business block", () => {
    it("says the business's facts and nothing about customers", () => {
        const block = formatBusinessBlock({
            name: "Rye & Co.",
            trade: "salon",
            currency: "INR",
            zone: "Asia/Kolkata",
            now: new Date("2026-11-13T20:00:00Z"),
            role: "OWNER",
            modulesOn: ["Bookings", "Products"],
            language: "HINGLISH",
        });
        expect(block).toBe(
            [
                'Business: "Rye & Co."',
                "Kind of business: salon",
                "Currency: INR",
                "Time zone: Asia/Kolkata",
                // 01:30 the next day in the business's zone.
                "Today: Saturday, 14 Nov 2026",
                "The person asking is: OWNER",
                "Modules on: Bookings, Products",
                "Answer in: Hinglish (Hindi in Latin letters, mixed with English as people speak)",
            ].join("\n"),
        );
    });
});

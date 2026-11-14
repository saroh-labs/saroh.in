import { aiProviderFakeAllowed, ScriptedAiProvider } from "./fake-script";
import type { AiEvent, AiMessage, AiStreamRequest } from "./provider.port";

const ask = (messages: AiMessage[]): AiStreamRequest => ({
    model: "claude-haiku-5-5",
    system: [],
    messages,
    tools: [],
    effort: "low",
    maxTokens: 100,
});

async function all(
    request: AiStreamRequest,
    signal = new AbortController().signal,
): Promise<AiEvent[]> {
    const out: AiEvent[] = [];
    for await (const e of new ScriptedAiProvider().stream(request, signal))
        out.push(e);
    return out;
}

describe("the scripted Ask AI provider", () => {
    it("is honoured only in a test run, never in production", () => {
        expect(aiProviderFakeAllowed("1", { nodeEnvs: ["test"] })).toBe(true);
        expect(
            aiProviderFakeAllowed("1", { nodeEnvs: [undefined], ci: "1" }),
        ).toBe(true);
        expect(
            aiProviderFakeAllowed("1", { nodeEnvs: ["production"], ci: "1" }),
        ).toBe(false);
        expect(aiProviderFakeAllowed(undefined, { nodeEnvs: ["test"] })).toBe(
            false,
        );
    });

    it("asks for the script's tool, then answers after its result", async () => {
        const q: AiMessage = {
            role: "user",
            text: "How many bookings this week?",
        };
        const first = await all(ask([q]));
        expect(first[0]).toMatchObject({
            type: "tool-call",
            call: {
                name: "get_business_summary",
                input: { period: "this_week" },
            },
        });
        expect(first.at(-1)).toMatchObject({ reason: "tool-calls" });

        const second = await all(
            ask([
                q,
                { role: "assistant", toolCalls: [] },
                { role: "tool", results: [] },
            ]),
        );
        const text = second
            .flatMap((e) => (e.type === "text-delta" ? [e.text] : []))
            .join("");
        expect(text).toContain("bookings");
        expect(second.at(-1)).toMatchObject({ reason: "stop" });
    });

    it("drafts the product the question names", async () => {
        const events = await all(
            ask([{ role: "user", text: "Add a product called Mug 7 at 250" }]),
        );
        expect(events[0]).toMatchObject({
            call: {
                name: "create_product",
                input: { name: "Mug 7", price: 250 },
            },
        });
    });

    it("stops at once while it waits", async () => {
        const stop = new AbortController();
        const run = all(
            ask([{ role: "user", text: "Stop test" }]),
            stop.signal,
        );
        stop.abort();
        expect(await run).toEqual([{ type: "aborted" }]);
    });

    it("answers anything else in plain words", async () => {
        const events = await all(ask([{ role: "user", text: "Hello?" }]));
        expect(events.some((e) => e.type === "text-delta")).toBe(true);
    });
});

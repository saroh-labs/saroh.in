import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Ask AI's question proxy (plan 2026-11-13-001 U9): the API's events pass
 * through as they arrive, with only three headers of ours and never the
 * API's cookies; the business is the one open (the cookie, checked
 * against the person's memberships), never one the body names; off with
 * the screen switch. The real `lib/api/http.ts` builds the call.
 */
const env = vi.hoisted(() => ({
    NODE_ENV: "test",
    API_URL: "https://api.test",
}));
const state = vi.hoisted(() => ({ on: true }));

vi.mock("@/env", () => ({ env }));
vi.mock("@/lib/edition", () => ({ EDITION: "INDIA" }));
vi.mock("@/lib/ask-ai/ask-ai-switch", () => ({ askAiOn: () => state.on }));
vi.mock("next/headers", () => ({
    headers: () =>
        Promise.resolve(
            new Headers({
                cookie: "session=s1; active_org=org_open",
                host: "app.saroh.in",
            }),
        ),
    cookies: () =>
        Promise.resolve({
            get: (name: string) =>
                name === "active_org" ? { value: "org_open" } : undefined,
        }),
}));

import { POST } from "./route";

const encoder = new TextEncoder();

/** An upstream answer whose second chunk waits until `release` is called. */
function slowStream() {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
        release = resolve;
    });
    const body = new ReadableStream<Uint8Array>({
        async start(controller) {
            controller.enqueue(encoder.encode("event: turn\ndata: {}\n\n"));
            await held;
            controller.enqueue(encoder.encode("event: done\ndata: {}\n\n"));
            controller.close();
        },
    });
    return { body, release };
}

const fetchMock = vi.fn();

function answer(upstream: Response) {
    fetchMock.mockImplementation((url: string) =>
        Promise.resolve(
            url.endsWith("/organizations")
                ? Response.json([{ id: "org_open" }, { id: "org_other" }])
                : upstream,
        ),
    );
}

const ask = (body: unknown) =>
    POST(
        new Request("https://app.saroh.in/api/ask-ai/turns", {
            method: "POST",
            body: JSON.stringify(body),
        }),
    );

beforeEach(() => {
    vi.clearAllMocks();
    state.on = true;
    vi.stubGlobal("fetch", fetchMock);
});

describe("POST /api/ask-ai/turns", () => {
    it("streams the API's events through before the turn ends", async () => {
        const { body, release } = slowStream();
        answer(
            new Response(body, {
                headers: { "content-type": "text/event-stream" },
            }),
        );
        const res = await ask({ question: "Kal?" });
        if (!res.body) throw new Error("expected a stream");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        // The first event arrives while the API is still answering.
        const first = await reader.read();
        expect(decoder.decode(first.value)).toBe("event: turn\ndata: {}\n\n");
        release();
        const second = await reader.read();
        expect(decoder.decode(second.value)).toBe("event: done\ndata: {}\n\n");
        expect((await reader.read()).done).toBe(true);
    });

    it("answers only its own three headers, never the API's cookies", async () => {
        const upstream = new Response("event: done\ndata: {}\n\n", {
            headers: {
                "content-type": "text/event-stream; charset=utf-8",
                "x-powered-by": "Express",
                "x-correlation-id": "c1",
            },
        });
        // A cookie the API might set must never reach the browser from here.
        upstream.headers.append("set-cookie", "session=leak; Path=/");
        answer(upstream);
        const res = await ask({ question: "Kal?" });

        expect(Object.fromEntries(res.headers)).toEqual({
            "content-type": "text/event-stream",
            "cache-control": "no-store",
            "x-accel-buffering": "no",
        });
        expect(res.headers.get("set-cookie")).toBeNull();
    });

    it("asks the business open, from the cookie, not one the body names", async () => {
        answer(new Response("", { headers: {} }));
        await ask({ question: "Kal?", organizationId: "org_other" });

        const call = fetchMock.mock.calls.find(([url]) =>
            String(url).endsWith("/ask-ai/turns"),
        ) as [string, RequestInit];
        expect(call[0]).toBe(
            "https://api.test/organizations/org_open/ask-ai/turns",
        );
        const sent = call[1].headers as Record<string, string>;
        expect(sent["x-organization-id"]).toBe("org_open");
        expect(sent.cookie).toBe("session=s1; active_org=org_open");
        expect(sent.origin).toBe("https://app.saroh.in");
        // No 20-second write limit on a stream: the signal is the browser's.
        expect(call[1].signal).toBeInstanceOf(AbortSignal);
        expect(call[1].signal?.aborted).toBe(false);
    });

    it("passes an API refusal on as JSON, with no cookie", async () => {
        const refusal = Response.json(
            { error: { message: "That conversation isn't here" } },
            { status: 404, headers: { "set-cookie": "session=leak" } },
        );
        answer(refusal);
        const res = await ask({ question: "Kal?", conversationId: "c_x" });

        expect(res.status).toBe(404);
        expect(res.headers.get("set-cookie")).toBeNull();
        expect(await res.json()).toEqual({
            error: { message: "That conversation isn't here" },
        });
    });

    it("is a 404 with the switch off, and calls nothing", async () => {
        state.on = false;
        const res = await ask({ question: "Kal?" });

        expect(res.status).toBe(404);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

import { describe, expect, it } from "vitest";

import { readAskAiEvents } from "./stream";

/**
 * Ask AI's stream reader (plan 2026-11-13-001 U10): frames split anywhere
 * across chunks still arrive whole and in order; keepalive comments and
 * anything that isn't one of Saroh's events are dropped.
 */
const encoder = new TextEncoder();

function streamOf(chunks: string[]) {
    return new ReadableStream<Uint8Array>({
        start(controller) {
            for (const c of chunks) controller.enqueue(encoder.encode(c));
            controller.close();
        },
    });
}

async function all(chunks: string[]) {
    const out = [];
    for await (const e of readAskAiEvents(streamOf(chunks))) out.push(e);
    return out;
}

describe("readAskAiEvents", () => {
    it("joins a frame split across chunks, in order", async () => {
        const events = await all([
            'event: turn\ndata: {"type":"turn","turnId":"t1","conver',
            'sationId":"c1"}\n\nevent: text-delta\ndata: {"type":"text-delta","text":"46 "}\n',
            '\nevent: text-delta\ndata: {"type":"text-delta","text":"bookings"}\n\n',
        ]);
        expect(events).toEqual([
            { type: "turn", turnId: "t1", conversationId: "c1" },
            { type: "text-delta", text: "46 " },
            { type: "text-delta", text: "bookings" },
        ]);
    });

    it("skips keepalives, unknown events and broken JSON", async () => {
        const events = await all([
            ":keepalive\n\n",
            'event: x\ndata: {"type":"html","html":"<img src=x>"}\n\n',
            "event: text-delta\ndata: {not json\n\n",
            'event: status\ndata: {"type":"status","tool":"t","words":"Reading…"}',
        ]);
        expect(events).toEqual([
            { type: "status", tool: "t", words: "Reading…" },
        ]);
    });
});

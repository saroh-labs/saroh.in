import type { AskAiEvent } from "@saroh/api-contract";
import { askAiEvent } from "@saroh/api-contract";

/**
 * Ask AI's answer as it arrives (plan 2026-11-13-001 U10): the route
 * handler's server-sent events, read off a `fetch` body (EventSource can't
 * POST). Each frame is `event: <type>` and `data: <json>`, ended by a blank
 * line; `:keepalive` comments and anything that isn't one of Saroh's events
 * are skipped, so nothing the panel draws is unchecked.
 */
export async function* readAskAiEvents(
    body: ReadableStream<Uint8Array>,
): AsyncGenerator<AskAiEvent> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
        for (;;) {
            const { value, done } = await reader.read();
            buffer += decoder.decode(value, { stream: !done });
            let end = buffer.indexOf("\n\n");
            while (end !== -1) {
                const event = parseFrame(buffer.slice(0, end));
                buffer = buffer.slice(end + 2);
                if (event) yield event;
                end = buffer.indexOf("\n\n");
            }
            if (done) break;
        }
        const last = parseFrame(buffer);
        if (last) yield last;
    } finally {
        reader.releaseLock();
    }
}

function parseFrame(frame: string): AskAiEvent | null {
    const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
    if (!data) return null;
    try {
        const parsed = askAiEvent.safeParse(JSON.parse(data));
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

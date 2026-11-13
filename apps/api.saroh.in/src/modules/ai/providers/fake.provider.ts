import type { AiEvent, AiProvider, AiStreamRequest } from "./provider.port";

/**
 * A provider that plays back scripted rounds, for unit and db specs: each
 * `stream()` call takes the next script. It records every request so a spec
 * can check what would have been sent, and stops at once when the signal
 * fires, as the real adapter does.
 */
export class FakeAiProvider implements AiProvider {
    readonly requests: AiStreamRequest[] = [];
    private next = 0;

    constructor(private readonly rounds: AiEvent[][]) {}

    async *stream(
        request: AiStreamRequest,
        signal: AbortSignal,
    ): AsyncIterable<AiEvent> {
        this.requests.push(request);
        const round = this.rounds[this.next++] as AiEvent[] | undefined;
        if (!round) throw new Error("FakeAiProvider: no scripted round left");
        for (const event of round) {
            if (signal.aborted) {
                yield { type: "aborted" };
                return;
            }
            yield event;
            // Let the caller act (abort) between events, like a real stream.
            await Promise.resolve();
        }
    }
}

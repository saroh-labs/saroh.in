import type { ScrubbedError } from "./scrub";

/**
 * PostHog's `$exception` event, built by hand for the servers that post it
 * over HTTP (posthog.com/docs/error-tracking/installation/manual). Frames use
 * the documented "custom" platform: `platform`, `lang` and `function` are
 * required; the rest is optional.
 */

export interface ExceptionFrame {
    platform: "custom";
    lang: "javascript";
    function: string;
    filename?: string;
    lineno?: number;
    colno?: number;
    in_app: boolean;
    resolved: true;
}

export interface ExceptionEntry {
    type: string;
    value: string;
    mechanism: { handled: boolean; synthetic: boolean };
    stacktrace?: { type: "raw"; frames: ExceptionFrame[] };
}

/** `    at fn (file:12:34)` or `    at file:12:34`, as V8 writes a stack. */
const V8_FRAME = /^\s*at (?:(.+?) \()?(.*?)(?::(\d+))?(?::(\d+))?\)?\s*$/u;

/** A scrubbed stack's frames, oldest call first as the tracker expects. */
export function parseStack(stack: string | undefined): ExceptionFrame[] {
    if (!stack) return [];
    const frames: ExceptionFrame[] = [];
    for (const line of stack.split("\n")) {
        if (!/^\s*at /u.test(line)) continue;
        const match = V8_FRAME.exec(line);
        if (!match) continue;
        const [, fn, file, lineno, colno] = match;
        const filename = file && file !== "<anonymous>" ? file : undefined;
        frames.push({
            platform: "custom",
            lang: "javascript",
            function: (fn ? fn.trim() : "") || "<anonymous>",
            ...(filename ? { filename } : {}),
            ...(lineno ? { lineno: Number(lineno) } : {}),
            ...(colno ? { colno: Number(colno) } : {}),
            in_app: !filename || !/node_modules|^node:/u.test(filename),
            resolved: true,
        });
    }
    return frames.reverse();
}

/** The `$exception_list` for one scrubbed error. */
export function exceptionList(
    error: ScrubbedError,
    handled: boolean,
): ExceptionEntry[] {
    const frames = parseStack(error.stack);
    return [
        {
            type: error.name,
            value: error.message,
            mechanism: { handled, synthetic: false },
            ...(frames.length
                ? { stacktrace: { type: "raw" as const, frames } }
                : {}),
        },
    ];
}

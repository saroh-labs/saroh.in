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

/** The longest stack line read; a longer one is not a frame worth parsing. */
const MAX_FRAME_LINE = 1_000;

/** A trailing `:123` taken off `text`, when there is one. */
function takeNumber(text: string): { rest: string; value?: number } {
    const colon = text.lastIndexOf(":");
    if (colon < 0) return { rest: text };
    const digits = text.slice(colon + 1);
    if (digits === "" || digits.length > 9) return { rest: text };
    for (const ch of digits) if (ch < "0" || ch > "9") return { rest: text };
    return { rest: text.slice(0, colon), value: Number(digits) };
}

/**
 * One line of a V8 stack: `    at fn (file:12:34)` or `    at file:12:34`.
 * Read by hand, not with a regular expression: a pattern with several
 * optional, overlapping groups backtracks polynomially on a crafted line,
 * and a stack is text someone else can shape.
 */
function parseFrame(
    raw: string,
): { fn?: string; file?: string; lineno?: number; colno?: number } | null {
    if (raw.length > MAX_FRAME_LINE) return null;
    const line = raw.trim();
    if (!line.startsWith("at ")) return null;
    let rest = line.slice(3).trim();
    let fn: string | undefined;
    if (rest.endsWith(")")) {
        const open = rest.lastIndexOf(" (");
        if (open >= 0) {
            fn = rest.slice(0, open).trim();
            rest = rest.slice(open + 2, -1);
        }
    }
    const col = takeNumber(rest);
    const row = col.value === undefined ? col : takeNumber(col.rest);
    // `file:12` alone is a line; `file:12:34` is a line and a column.
    const lineno = row.value ?? col.value;
    const colno = row.value === undefined ? undefined : col.value;
    return { fn, file: row.rest, lineno, colno };
}

/** A scrubbed stack's frames, oldest call first as the tracker expects. */
export function parseStack(stack: string | undefined): ExceptionFrame[] {
    if (!stack) return [];
    const frames: ExceptionFrame[] = [];
    for (const line of stack.split("\n")) {
        const frame = parseFrame(line);
        if (!frame) continue;
        const { fn, file, lineno, colno } = frame;
        const filename = file && file !== "<anonymous>" ? file : undefined;
        frames.push({
            platform: "custom",
            lang: "javascript",
            function: (fn ? fn.trim() : "") || "<anonymous>",
            ...(filename ? { filename } : {}),
            ...(lineno ? { lineno } : {}),
            ...(colno ? { colno } : {}),
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

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Every outbound call the API makes has a timeout: a `fetch` passes a
 * `signal` (`providerCallSignal()` or `AbortSignal.timeout`), and an SMTP
 * transport sets nodemailer's timeouts (`SEND_TIMEOUTS`, `POOLED_SEND`).
 * Without one, a provider that accepts the connection and never answers
 * holds the request or the job lane for minutes (DEV_LEARNINGS,
 * 26 Nov 2026).
 *
 * A call whose options are built elsewhere is listed with where its timeout
 * is set.
 */
const SET_ELSEWHERE: Record<string, string> = {
    // A client's injectable `fetchFn`: the caller's init carries the signal.
    "fetch(input, init)": "passes through the caller's init",
    "this.fetchFn(hook.url, requestFor(hook))":
        "requestFor (pricing/revalidate-site.job.ts) sets the signal",
    "createTransport(options)": "siteCodesTransportOptions spreads POOLED_SEND",
};

const SRC = join(__dirname, "..");
const CALL =
    /(?<![\w.])(?:this\.)?(?:fetch|fetchFn|fetchImpl)\(|createTransport\(/g;

function sources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return sources(path);
        return entry.name.endsWith(".ts") && !entry.name.endsWith(".spec.ts")
            ? [path]
            : [];
    });
}

/** The call's text from its name to its closing parenthesis. */
function callAt(text: string, start: number, open: number): string {
    let depth = 0;
    for (let i = open; i < text.length; i++) {
        if (text[i] === "(") depth += 1;
        if (text[i] === ")" && --depth === 0) return text.slice(start, i + 1);
    }
    return text.slice(start);
}

function untimed(): string[] {
    return sources(SRC).flatMap((path) =>
        untimedIn(relative(SRC, path), readFileSync(path, "utf8")),
    );
}

function untimedIn(file: string, text: string): string[] {
    const found: string[] = [];
    for (const match of text.matchAll(CALL)) {
        const start = match.index ?? 0;
        const line = text.slice(text.lastIndexOf("\n", start) + 1, start);
        if (/^\s*(\*|\/\/)/.test(line)) continue;
        const open = start + match[0].length - 1;
        const call = callAt(text, start, open);
        const compact = call.replace(/\s+/g, " ");
        const named = Object.keys(SET_ELSEWHERE).some((k) =>
            compact.includes(k),
        );
        const timed = /signal|Timeout|TIMEOUTS|POOLED_SEND/.test(call);
        if (!named && !timed) {
            const lineNo = text.slice(0, start).split("\n").length;
            found.push(`${file}:${lineNo} ${compact.slice(0, 80)}`);
        }
    }
    return found;
}

describe("outbound calls have a timeout", () => {
    it("every fetch passes a signal and every SMTP transport sets its timeouts", () => {
        expect(untimed()).toEqual([]);
    });

    it("finds a call without one, and passes one with a signal", () => {
        const text = [
            'await fetch(url, { method: "POST" });',
            "await this.fetchFn(url, { signal: providerCallSignal() });",
            "nodemailer.createTransport({ host, auth });",
        ].join("\n");
        expect(untimedIn("x.ts", text)).toEqual([
            'x.ts:1 fetch(url, { method: "POST" })',
            "x.ts:3 createTransport({ host, auth })",
        ]);
    });
});

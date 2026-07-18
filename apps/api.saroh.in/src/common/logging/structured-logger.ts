import { getCorrelationId } from "./request-context";

/**
 * Minimal structured (one-JSON-object-per-line) logger. Writes machine-parsable
 * records to stdout/stderr so a log aggregator can index by `correlationId`,
 * `statusCode`, etc. Deliberately lightweight (no external dependency) — it is
 * only ever handed already-safe fields; callers redact via ./redact first.
 *
 * `console` is restricted by lint and Nest's Logger reformats/decorates lines,
 * so we emit through process streams to keep each line valid JSON.
 */
export type LogLevel = "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

function write(level: LogLevel, event: string, fields: LogFields): void {
    const record: LogFields = {
        timestamp: new Date().toISOString(),
        level,
        event,
        correlationId: getCorrelationId(),
        ...fields,
    };
    const line = `${JSON.stringify(record)}\n`;
    if (level === "error") {
        process.stderr.write(line);
    } else {
        process.stdout.write(line);
    }
}

export const structuredLogger = {
    info: (event: string, fields: LogFields = {}): void =>
        write("info", event, fields),
    warn: (event: string, fields: LogFields = {}): void =>
        write("warn", event, fields),
    error: (event: string, fields: LogFields = {}): void =>
        write("error", event, fields),
};

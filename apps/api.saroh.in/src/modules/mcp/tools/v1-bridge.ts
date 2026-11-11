import { HttpException } from "@nestjs/common";
import type { Money } from "@saroh/api-contract";
import type { z } from "zod";

import type { KeyedRequest } from "../../api-keys/api-key.guard";
import type { McpCall } from "../tool-registry";
import { ToolError } from "../tool-registry";

/**
 * How the U12 tools reach U8's `/v1` handlers (plan 2026-11-10-001): the
 * catalogue and day-to-day tools call the same controller methods, so the
 * same `authorize`, service calls, views and sensitive-field allowlist hold,
 * and a create's `request_id` is U8's `Idempotency-Key`, kept per
 * connection and per tool.
 */

/**
 * The request a `/v1` handler's `once()` reads: the tool as its route, the
 * connection as its key, and `request_id` as the Idempotency-Key.
 */
export function viaV1(
    call: McpCall,
    tool: string,
    requestId?: string,
): KeyedRequest {
    return {
        headers: requestId ? { "idempotency-key": requestId } : {},
        method: "MCP",
        path: tool,
        apiKey: { id: `mcp:${call.connection.id}` },
    } as unknown as KeyedRequest;
}

/**
 * A `/v1` body, checked by its contract as the route's pipe would: a tool's
 * input maps onto it, and anything the route refuses is a tool error.
 */
export function v1Body<S extends z.ZodType>(
    schema: S,
    value: z.input<S>,
): z.output<S> {
    const parsed = schema.safeParse(value);
    if (parsed.success) return parsed.data;
    throw new ToolError(
        parsed.error.issues
            .map((i) => `${i.path.join(".") || "input"}: ${i.message}`)
            .join("; "),
        "Fix the input and call the tool again.",
    );
}

/** A price set in the main unit (180.5) as minor units (18050). */
export const toMinor = (price: number) => Math.round(price * 100);

/** Money as a person reads it: "INR 180.00". */
export const money = (m: Money) =>
    `${m.currency} ${(m.amountMinor / 100).toFixed(2)}`;

/** An instant in a time zone, as a person reads it: "Thu 14 Nov, 15:30". */
export function when(at: string | Date, timezone: string): string {
    const opts: Intl.DateTimeFormatOptions = {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    };
    try {
        return new Intl.DateTimeFormat("en-GB", {
            ...opts,
            timeZone: timezone,
        }).format(new Date(at));
    } catch {
        return `${new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }).format(new Date(at))} UTC`;
    }
}

/** A 4xx from a service: the refusal a person would read in the app. */
export const isRefusal = (error: unknown): error is HttpException =>
    error instanceof HttpException &&
    error.getStatus() >= 400 &&
    error.getStatus() < 500;

/** Long customer text cut for a list; the get tool has all of it. */
export const cut = (text: string, max: number) =>
    text.length > max ? `${text.slice(0, max - 1)}…` : text;

/** The default page size every list tool uses. */
export const PAGE = 20;

/** A time a tool was given, checked: ISO 8601 that names a real instant. */
export function instantOf(value: string, field: string): Date {
    const at = new Date(value);
    if (Number.isNaN(at.getTime())) {
        throw new ToolError(
            `${field}: not a time.`,
            "Send ISO 8601 with an offset, like 2026-11-14T15:30:00+05:30.",
        );
    }
    return at;
}

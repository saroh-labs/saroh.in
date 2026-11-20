import type { CalendarRead } from "./types";

const record = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Why the status read was refused, from its status and body (any of the
 * API's envelopes). A 404 is the switch off ("isn't available yet"), never
 * a failure; a 403 is the plan when it says `MODULE_LOCKED`, else the role;
 * a 503 is Google not set up on this server, in the API's words.
 */
export function refusalOf(status: number, body: unknown): CalendarRead {
    const outer = record(body) ? body : {};
    const inner = record(outer.error) ? outer.error : outer;
    const details = record(inner.details)
        ? inner.details
        : record(outer.details)
          ? outer.details
          : {};
    if (status === 404) return { kind: "off" };
    if (status === 403) {
        if (details.code === "NOT_ON_DIARY") {
            return {
                kind: "off-diary",
                message:
                    typeof inner.message === "string" && inner.message
                        ? inner.message
                        : "Only someone who takes bookings can connect a calendar.",
            };
        }
        if (details.code !== "MODULE_LOCKED") return { kind: "denied" };
        const up = record(details.upgradeTo) ? details.upgradeTo : null;
        return {
            kind: "plan",
            upgradeTo:
                up &&
                typeof up.planId === "string" &&
                typeof up.name === "string"
                    ? { planId: up.planId, name: up.name }
                    : null,
        };
    }
    if (status === 503) {
        const message =
            typeof inner.message === "string" && inner.message
                ? inner.message
                : "Google Calendar can't be connected right now.";
        return { kind: "unavailable", message };
    }
    return { kind: "failed" };
}

/**
 * Your alerts (Settings → Your profile, "What you hear about"): which things
 * Saroh tells YOU about, and where — the bell, email or WhatsApp. Per person,
 * per business: your team picks their own.
 *
 * SEAM. Nothing stores these choices yet. `getAlertPreferences` returns
 * `not-available`, and the page shows the grid with every switch off and
 * disabled, and a line saying the choices can't be saved yet — never a set of
 * defaults dressed up as the person's own.
 *
 * Expected API (api.saroh.in, the signed-in user within the active
 * organization; no extra permission — it is your own):
 *
 *   GET   /organizations/:organizationId/me/alerts
 *     → { alerts: Record<AlertKey, Record<AlertChannel, boolean>> }
 *   PATCH /organizations/:organizationId/me/alerts
 *     { alert: AlertKey, channel: AlertChannel, on: boolean }
 *     → the same shape, after the change
 *
 * A channel the business cannot send on (WhatsApp with no sender connected)
 * should come back with the reason, so the switch can say why it is off:
 *   → { alerts, unavailable?: Partial<Record<AlertChannel, string>> }
 *
 * Pure: safe in server and client components.
 */

export const ALERT_CHANNELS = ["bell", "email", "whatsapp"] as const;
export type AlertChannel = (typeof ALERT_CHANNELS)[number];

export const ALERT_CHANNEL_LABELS: Record<AlertChannel, string> = {
    bell: "Bell",
    email: "Email",
    whatsapp: "WhatsApp",
};

/** The alerts the design lists, in its order and words. */
export const ALERTS = [
    {
        key: "order",
        label: "New order",
        note: "When someone buys online or at the counter",
    },
    {
        key: "booking",
        label: "New booking",
        note: "Including changes and cancellations",
    },
    {
        key: "failed",
        label: "Payment failed",
        note: "A subscription or invoice didn't go through",
    },
    {
        key: "team",
        label: "Someone joins the team",
        note: "When an invite is accepted",
    },
    {
        key: "weekly",
        label: "Monday summary",
        note: "Last week's sales and bookings",
    },
] as const;
export type AlertKey = (typeof ALERTS)[number]["key"];

/** What the API returns; a key or channel it leaves out reads as off. */
export type AlertMatrix = Partial<
    Record<AlertKey, Partial<Record<AlertChannel, boolean>>>
>;

export type AlertPreferencesRead =
    { status: "ok"; alerts: AlertMatrix } | { status: "not-available" };

/** SEAM — see the module note. The API does not keep these yet. */
export function getAlertPreferences(): Promise<AlertPreferencesRead> {
    return Promise.resolve({ status: "not-available" });
}

export interface AlertCell {
    channel: AlertChannel;
    on: boolean;
    /** Off and not changeable. */
    disabled: boolean;
    /** What a screen reader hears: "New order by Email, off". */
    label: string;
}

export interface AlertRow {
    key: AlertKey;
    label: string;
    note: string;
    cells: AlertCell[];
}

/**
 * The grid as the page draws it. With no preferences to read, every switch
 * is off and disabled, and says why rather than "off" — off would be a claim
 * about what this person hears.
 */
export function alertRows(read: AlertPreferencesRead): AlertRow[] {
    return ALERTS.map((alert) => ({
        key: alert.key,
        label: alert.label,
        note: alert.note,
        cells: ALERT_CHANNELS.map((channel) => {
            const name = `${alert.label} by ${ALERT_CHANNEL_LABELS[channel]}`;
            if (read.status !== "ok") {
                return {
                    channel,
                    on: false,
                    disabled: true,
                    label: `${name}, can't be chosen yet`,
                };
            }
            const on = read.alerts[alert.key]?.[channel] ?? false;
            return {
                channel,
                on,
                disabled: false,
                label: `${name}, ${on ? "on" : "off"}`,
            };
        }),
    }));
}

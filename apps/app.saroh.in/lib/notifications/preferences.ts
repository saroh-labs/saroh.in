import type { ConnectLock } from "@/lib/providers/connect-lock";

/**
 * Your alerts (Settings → Your profile, "What you hear about"): which things
 * Saroh tells YOU about, and where. Per person, per business: your team picks
 * their own (round-2 F14).
 *
 * The API (api.saroh.in, always the signed-in person, in the active
 * business; no id in the path, so nobody can read or change another's):
 *
 *   GET   /organizations/:organizationId/me/alerts
 *   PATCH /organizations/:organizationId/me/alerts
 *     { alert, channel, on }  → the same view, after the change
 *
 * It offers only the rows the person's role reads, of modules the business
 * has on, and says what each channel can do for them here. Only channels
 * that can deliver are offered:
 * - the bell, to someone whose role sees the inbox;
 * - email, through the business's own connected provider — otherwise the
 *   column is off, with "Connect email in Providers";
 * - WhatsApp appears only once a WhatsApp provider is connected, and even
 *   then can't be switched on: Saroh keeps no WhatsApp number for a team
 *   member, and says so.
 * There is no SMS, and no Monday summary (nothing sends one yet).
 *
 * An older API with no alerts (404) reads `not-available`: the grid is drawn
 * off and disabled, with a line saying why — never defaults dressed up as the
 * person's own.
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

/** The alerts the design lists, in its order and words, less the Monday summary. */
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
    // Not in the design: a test release's scheduled go-live (DEC-071, T10).
    // The API offers it only to who can publish, with test releases on.
    {
        key: "site",
        label: "Website goes live",
        note: "When a scheduled go-live runs, or couldn't",
    },
] as const;
export type AlertKey = (typeof ALERTS)[number]["key"];

/** Why a channel can't be used here. */
export type ChannelUnavailable = "NO_INBOX" | "NO_PROVIDER" | "NO_NUMBER";

export type ChannelState =
    { available: true } | { available: false; reason: ChannelUnavailable };

/** `GET /organizations/:id/me/alerts`. */
export interface AlertPreferences {
    /** Only the rows this person is offered. */
    alerts: { key: AlertKey; channels: Record<AlertChannel, boolean> }[];
    channels: Record<AlertChannel, ChannelState>;
    /** They may connect a provider themselves. */
    canConnect: boolean;
}

export type AlertPreferencesRead =
    { status: "ok"; prefs: AlertPreferences } | { status: "not-available" };

/** One switch, as the API takes it. */
export interface AlertChange {
    alert: AlertKey;
    channel: AlertChannel;
    on: boolean;
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

/** A line under the heading saying why something can't be switched on. */
export interface AlertNote {
    id: "not-available" | "email" | "whatsapp" | "nothing";
    text: string;
    /** Where to fix it, when this person can. */
    link?: { label: string; href: string };
}

export interface AlertGrid {
    /** The columns drawn: the bell only for someone who sees it; WhatsApp only once connected. */
    columns: AlertChannel[];
    rows: AlertRow[];
    notes: AlertNote[];
}

const PROVIDERS_HREF = "/settings/providers";

const alertOf = (key: AlertKey) =>
    ALERTS.find((a) => a.key === key) ?? ALERTS[0];

/** "New order", for a toast or a label. */
export function alertLabel(key: AlertKey): string {
    return alertOf(key).label;
}

/** Why a cell is off and fixed, for a screen reader. */
const UNAVAILABLE_WORDS: Record<ChannelUnavailable, string> = {
    NO_INBOX: "your role has no bell",
    NO_PROVIDER: "no provider connected",
    NO_NUMBER: "no WhatsApp number for you",
};

/**
 * The grid as the page draws it. With no preferences to read (an older API),
 * every switch is off and disabled, and says why rather than "off" — off
 * would be a claim about what this person hears.
 */
export function alertGrid(
    read: AlertPreferencesRead,
    /**
     * The plan won't let the business connect its own email (DEC-091,
     * UX-006): the email line says the plan, with See plans, not "Connect
     * email in Providers" — a dead end on such a plan. Null: no lock, or
     * the plan unread.
     */
    emailLock: Pick<ConnectLock, "upgrade" | "cta" | "href"> | null = null,
): AlertGrid {
    if (read.status !== "ok") {
        return {
            columns: [...ALERT_CHANNELS],
            // The design's rows only: the Website row is offered by the API
            // alone, to who can publish with test releases on (DEC-057).
            rows: ALERTS.filter((alert) => alert.key !== "site").map(
                (alert) => ({
                    key: alert.key,
                    label: alert.label,
                    note: alert.note,
                    cells: ALERT_CHANNELS.map((channel) => ({
                        channel,
                        on: false,
                        disabled: true,
                        label: `${alert.label} by ${ALERT_CHANNEL_LABELS[channel]}, can't be chosen yet`,
                    })),
                }),
            ),
            notes: [
                {
                    id: "not-available",
                    text: "Choosing your alerts isn't switched on yet, so these can't be changed or saved.",
                },
            ],
        };
    }

    const { prefs } = read;
    const { bell, whatsapp } = prefs.channels;
    const columns = ALERT_CHANNELS.filter((channel) => {
        if (channel === "bell") return bell.available;
        if (channel === "whatsapp") {
            return !whatsapp.available && whatsapp.reason !== "NO_PROVIDER";
        }
        return true;
    });

    const rows = prefs.alerts.map((row) => {
        const alert = alertOf(row.key);
        return {
            key: row.key,
            label: alert.label,
            note: alert.note,
            cells: columns.map((channel) => {
                const state = prefs.channels[channel];
                const name = `${alert.label} by ${ALERT_CHANNEL_LABELS[channel]}`;
                if (!state.available) {
                    return {
                        channel,
                        on: false,
                        disabled: true,
                        label: `${name}, off — ${UNAVAILABLE_WORDS[state.reason]}`,
                    };
                }
                const on = row.channels[channel];
                return {
                    channel,
                    on,
                    disabled: false,
                    label: `${name}, ${on ? "on" : "off"}`,
                };
            }),
        };
    });

    const notes: AlertNote[] = [];
    if (rows.length === 0) {
        notes.push({
            id: "nothing",
            text: "Nothing here reaches your role in this business yet.",
        });
    }
    if (rows.length > 0 && !prefs.channels.email.available) {
        notes.push(
            emailLock
                ? {
                      id: "email",
                      // True of team alerts (they need the business's own
                      // provider); Saroh's own enquiry email to owners and
                      // admins is apart, and still goes (UX-006).
                      text: `Email alerts go out through your business's own email provider, which comes with ${emailLock.upgrade ?? "a paid plan"}. Saroh still emails owners and admins about each new enquiry.`,
                      ...(prefs.canConnect
                          ? {
                                link: {
                                    label: emailLock.cta,
                                    href: emailLock.href,
                                },
                            }
                          : {}),
                  }
                : prefs.canConnect
                  ? {
                        id: "email",
                        text: "Email alerts go out through your business's own email provider, and none is connected.",
                        link: {
                            label: "Connect email in Providers",
                            href: PROVIDERS_HREF,
                        },
                    }
                  : {
                        id: "email",
                        text: "Email alerts go out through the business's own email provider. Ask an owner to connect email in Providers.",
                    },
        );
    }
    if (rows.length > 0 && columns.includes("whatsapp")) {
        notes.push({
            id: "whatsapp",
            text: "WhatsApp is connected, but Saroh doesn't keep a WhatsApp number for you, so alerts can't go there.",
        });
    }
    return { columns, rows, notes };
}

/** What a switch reads as in the grid now. */
export function alertValue(
    prefs: AlertPreferences,
    alert: AlertKey,
    channel: AlertChannel,
): boolean | null {
    return prefs.alerts.find((a) => a.key === alert)?.channels[channel] ?? null;
}

/** The grid with one switch flipped, before the API has answered. */
export function withAlert(
    prefs: AlertPreferences,
    change: AlertChange,
): AlertPreferences {
    return {
        ...prefs,
        alerts: prefs.alerts.map((a) =>
            a.key === change.alert
                ? {
                      ...a,
                      channels: { ...a.channels, [change.channel]: change.on },
                  }
                : a,
        ),
    };
}

/** "Email on for New order": what the toast says a save did. */
export function alertSaved(change: AlertChange): string {
    return `${ALERT_CHANNEL_LABELS[change.channel]} ${change.on ? "on" : "off"} for ${alertLabel(change.alert)}`;
}

/** Said when the switch has changed under the Undo (as Settings says it, F12). */
export const ALERT_CHANGED_SINCE = "Changed since — reload";

/**
 * The Undo for a save (F12): the same switch put back, refused if it no
 * longer reads as this save left it — another tab, say.
 */
export function alertUndo(change: AlertChange): {
    back: AlertChange;
    expect: boolean;
} {
    return { back: { ...change, on: !change.on }, expect: change.on };
}

export function alertUndoRefusal(
    undo: { back: AlertChange; expect: boolean },
    current: AlertPreferences,
): string | null {
    return alertValue(current, undo.back.alert, undo.back.channel) ===
        undo.expect
        ? null
        : ALERT_CHANGED_SINCE;
}

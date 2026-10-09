import type {
    BusinessPlan,
    BusinessPresence,
    BusinessView,
    PresenceAddress,
    SiteTrackersRow,
} from "./businesses";
import { plural } from "./format";
import { planLine } from "./plan-words";

/**
 * "What they see" on the business page (owner, 9 Oct): what the merchant
 * can use now, one plain line per area, worded from what the API already
 * resolved for the page — the modules panel, the plan's catalogue rows,
 * the trackers panel and the presence panel. It decides nothing: an area
 * whose panel failed or is missing says so rather than guessing.
 * Client-safe (types only from `businesses`).
 */

export interface SeeLine {
    area: string;
    text: string;
}

const UNKNOWN = "Couldn’t be read just now";

/** The whole summary, in the order the panel shows it. */
export function whatTheySee(view: BusinessView): SeeLine[] {
    const plan = view.plan.status === "ok" ? view.plan.data : null;
    const presence = view.presence?.status === "ok" ? view.presence.data : null;
    const sites = view.sites?.status === "ok" ? view.sites.data : null;
    const lines: SeeLine[] = [
        { area: "Plan", text: plan ? planWords(plan) : UNKNOWN },
        {
            area: "Modules",
            text:
                view.modules.status === "ok"
                    ? moduleWords(view.modules.data)
                    : UNKNOWN,
        },
    ];
    const locked = plan ? lockedWords(plan) : null;
    if (locked) lines.push({ area: "Not available to them", text: locked });
    lines.push(
        {
            area: "Payments",
            text: presence ? paymentWords(presence.payments) : UNKNOWN,
        },
        {
            area: "Website",
            text: presence ? websiteWords(presence.sites) : UNKNOWN,
        },
        {
            area: "Trackers",
            text: sites ? trackerWords(sites, plan) : UNKNOWN,
        },
    );
    return lines;
}

export function planWords(plan: BusinessPlan): string {
    if (plan.effective) return planLine(plan.effective);
    return plan.subscription
        ? plan.subscription.plan.name
        : "No plan — the free floor applies";
}

/** "On: Website, CRM. Off: Courses." from the business's own switches. */
export function moduleWords(
    modules: { label: string; status: string }[],
): string {
    const on = modules.filter((m) => m.status === "ENABLED");
    const off = modules.filter((m) => m.status !== "ENABLED");
    const parts = [
        on.length > 0
            ? `On: ${on.map((m) => m.label).join(", ")}.`
            : "None switched on.",
    ];
    if (off.length > 0) {
        parts.push(`Off: ${off.map((m) => m.label).join(", ")}.`);
    }
    return parts.join(" ");
}

/**
 * The catalogue rows that are off for them, with the plan's reason:
 * "Blog (not in their plan, shown locked), Courses (removed by Saroh,
 * hidden)". Null when every row is on, or the catalogue doesn't reach them.
 */
export function lockedWords(plan: BusinessPlan): string | null {
    const off = (plan.catalogue?.modules ?? []).filter((m) => m.state !== "on");
    if (off.length === 0) return null;
    return off
        .map((m) => {
            const why = m.override
                ? lowerFirst(m.override)
                : "not in their plan";
            const how = m.state === "locked" ? "shown locked" : "hidden";
            return `${m.name} (${why}, ${how})`;
        })
        .join(", ");
}

const PROVIDER_NAME: Record<string, string> = {
    RAZORPAY: "Razorpay",
    CASHFREE: "Cashfree",
};

export function providerName(provider: string): string {
    const key = provider.toUpperCase();
    return PROVIDER_NAME[key] ?? key.charAt(0) + key.slice(1).toLowerCase();
}

/** Whether a payment provider is connected, yes or no. Never a key. */
export function paymentWords(payments: BusinessPresence["payments"]): string {
    const connected = payments.filter((p) => p.connected);
    if (connected.length === 0) return "Not connected";
    return `Connected: ${connected
        .map((p) =>
            p.needsAttention
                ? `${providerName(p.provider)} (its keys were refused — they need entering again)`
                : providerName(p.provider),
        )
        .join(", ")}`;
}

export function websiteWords(sites: BusinessPresence["sites"]): string {
    if (sites.length === 0) return "No site yet";
    const live = sites.filter((s) => s.published);
    if (live.length === 0) {
        return `Not published — ${plural(sites.length, "site")}, none live`;
    }
    const names = live.map((s) => s.name).join(", ");
    return live.length === sites.length
        ? `Published: ${names}`
        : `Published: ${names} (${sites.length - live.length} not published)`;
}

/**
 * Trackers on or off: switched off by Saroh, off because their plan
 * doesn't include them, on, or none set up.
 */
export function trackerWords(
    sites: SiteTrackersRow[],
    plan: BusinessPlan | null,
): string {
    const switchedOff = sites.filter((s) => s.switchedOff);
    if (switchedOff.length > 0) {
        return `Off — switched off by Saroh on ${switchedOff
            .map((s) => s.name)
            .join(", ")}`;
    }
    const total = sites.reduce((sum, s) => sum + s.trackersOn, 0);
    if (total === 0) return "Off — none set up";
    const row = plan?.catalogue?.modules.find(
        (m) => m.moduleId === "site-trackers",
    );
    if (row && row.state !== "on") {
        return `Off — not in their plan (${plural(total, "tracker")} set up)`;
    }
    return `On — ${plural(total, "tracker")}`;
}

/** "Their own domain" or "Web address", beside a live link. */
export function addressLabel(address: PresenceAddress): string {
    return address.kind === "own-domain" ? "Their own domain" : "Web address";
}

/** `https://northwind.saroh.app` → `northwind.saroh.app`, for the link text. */
export function addressHost(url: string): string {
    return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function lowerFirst(text: string): string {
    return text.charAt(0).toLowerCase() + text.slice(1);
}

import type { ApiUsageView } from "@saroh/api-contract";

/**
 * Settings › API and AI apps' own tabs (R9, "API and AI apps" boards):
 * AI assistants, Connections (API keys), Notifications to your systems
 * (webhooks) and Usage, each its own address. Everyone connects their own
 * assistant and reads Usage; Connections is `apikey:manage` (the Owner)
 * and Notifications `webhook:manage`. A tab whose switch is off is left
 * out once the API has said so (`usage`); before that, by permission alone.
 * Ask AI (DEC-220, plan 2026-11-13-001 U11) comes first, Owner and Admin
 * (`module:manage`), under its own switch; the other four under the API
 * area's, so either switch on opens the area.
 */

export const DEVELOPERS_HREF = "/settings/developers";

export type DevelopersTab = "ask-ai" | "ai" | "keys" | "webhooks" | "usage";

export interface DevelopersTabItem {
    tab: DevelopersTab;
    label: string;
    /** The developer's word for it, quieter, after the label. */
    term?: string;
    /** The desk's tab. The phone's list opens AI assistants at `/ai`. */
    href: string;
}

export const ASK_AI_SETTINGS_HREF = `${DEVELOPERS_HREF}/ask-ai`;

export const DEVELOPERS_TABS: readonly DevelopersTabItem[] = [
    { tab: "ask-ai", label: "Ask AI", href: ASK_AI_SETTINGS_HREF },
    { tab: "ai", label: "AI assistants", href: DEVELOPERS_HREF },
    {
        tab: "keys",
        label: "Connections",
        term: "API keys",
        href: `${DEVELOPERS_HREF}/keys`,
    },
    {
        tab: "webhooks",
        label: "Notifications to your systems",
        term: "webhooks",
        href: `${DEVELOPERS_HREF}/webhooks`,
    },
    { tab: "usage", label: "Usage", href: `${DEVELOPERS_HREF}/usage` },
];

export function developersTabsFor(
    actions: readonly string[] | null | undefined,
    usage: ApiUsageView | null,
    /** The build's two screen switches (`apiAreaOn`, `askAiOn`). */
    on: { apiArea: boolean; askAi: boolean } = {
        apiArea: true,
        askAi: false,
    },
): DevelopersTabItem[] {
    const may = (a: string) => actions?.includes(a) ?? false;
    return DEVELOPERS_TABS.filter((t) => {
        if (t.tab === "ask-ai") return on.askAi && may("module:manage");
        if (!on.apiArea) return false;
        if (t.tab === "keys") {
            return (
                may("apikey:manage") &&
                (!usage || Boolean(usage.keys?.kinds.length))
            );
        }
        if (t.tab === "webhooks") {
            return may("webhook:manage") && usage?.webhooks !== null;
        }
        return true;
    });
}

/** The tab an address is: `/settings/developers/ai` is AI assistants too. */
export function developersTabOf(pathname: string): DevelopersTab | "index" {
    const rest = pathname.slice(DEVELOPERS_HREF.length).replace(/^\//, "");
    const first = rest.split("/")[0];
    if (
        first === "ask-ai" ||
        first === "keys" ||
        first === "webhooks" ||
        first === "usage" ||
        first === "ai"
    ) {
        return first;
    }
    return "index";
}

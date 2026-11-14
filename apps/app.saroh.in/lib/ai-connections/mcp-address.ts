import { env } from "@/env";
import { MARKETING_URL } from "@/lib/help/links";

/**
 * The MCP server's address for this deployment (plan 2026-11-10-001, R1):
 * the API's own host with `mcp.` for `api.`, so each edition and
 * environment names its own (`mcp.<edition>/mcp`) and no domain is written
 * here. Null when the API's address has no `api.` to swap.
 */
export function mcpAddressOf(apiUrl: string | undefined): string | null {
    if (!apiUrl) return null;
    try {
        const url = new URL(apiUrl);
        if (!url.hostname.startsWith("api.")) return null;
        url.hostname = `mcp.${url.hostname.slice(4)}`;
        return `${url.origin}/mcp`;
    } catch {
        return null;
    }
}

export function mcpAddress(): string | null {
    return mcpAddressOf(env.NEXT_PUBLIC_API_URL ?? env.API_URL);
}

/**
 * Where each known app adds a connector. The person pastes the address
 * there and signs in to Saroh when it asks.
 */
export const CONNECT_IN = {
    claude: "https://claude.ai/settings/connectors",
    chatgpt: "https://chatgpt.com/#settings/Connectors",
} as const;

/** The help article that walks through every other app, one anchor each. */
const OTHER_APPS_HELP = `${MARKETING_URL}/help/connect-other-ai-apps`;

export interface AiAppEntry {
    key: string;
    name: string;
    /** A quieter word under the name ("by Mistral"). */
    sub?: string;
    /** Its own connectors page, or its part of the help article. */
    connectIn: string;
    /**
     * Whether its sign-in has been walked through on dev (release
     * visibility, ticket 11). Until then it is never offered: not here,
     * not on saroh.in's Integrations (U7 reads the same list).
     */
    liveOnDev: boolean;
}

const other = (key: string, name: string, sub?: string): AiAppEntry => ({
    key,
    name,
    sub,
    connectIn: `${OTHER_APPS_HELP}#${key}`,
    liveOnDev: false,
});

/**
 * Every AI app Saroh names, in the order the boards draw them. One list
 * for the AI assistants empty state and the marketing site's AI apps
 * group, so an app is turned on once, after its dev walk.
 */
export const AI_APPS: readonly AiAppEntry[] = [
    {
        key: "claude",
        name: "Claude",
        connectIn: CONNECT_IN.claude,
        liveOnDev: true,
    },
    {
        key: "chatgpt",
        name: "ChatGPT",
        connectIn: CONNECT_IN.chatgpt,
        liveOnDev: true,
    },
    other("perplexity", "Perplexity"),
    other("le-chat", "Le Chat", "by Mistral"),
    other("zapier", "Zapier"),
    other("make", "Make"),
    other("n8n", "n8n"),
    other("coding-tools", "Coding tools"),
];

/** The apps that may be offered now. */
export const liveAiApps = () => AI_APPS.filter((app) => app.liveOnDev);

/**
 * Whether the Website pages tab offers "Edit your site from your AI
 * assistant" (release visibility U14, board VAWebsite): only while this
 * person has no assistant of their own connected. Null (the list couldn't
 * be read) offers nothing; the caller checks the switch and edit rights.
 */
export function offersAssistantWayIn(
    connections: readonly { person: { id: string } }[] | null,
    selfId: string,
): boolean {
    return (
        connections !== null && !connections.some((c) => c.person.id === selfId)
    );
}

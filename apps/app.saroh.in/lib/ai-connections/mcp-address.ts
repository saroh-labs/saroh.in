import { env } from "@/env";

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

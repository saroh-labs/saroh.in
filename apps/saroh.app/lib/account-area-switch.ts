import { env } from "@/env";

/**
 * The account area's switch (`SITE_ACCOUNT_AREA`), on its own so the edge
 * middleware can read it: `account-area.ts`, where the switch is described
 * and which every page imports it from, pulls in the Node-only session code
 * that the edge runtime cannot load.
 */
export function accountAreaOn(): boolean {
    return env.SITE_ACCOUNT_AREA === "on";
}

/**
 * Whether a tenant path is the account area: `/account` and every page
 * under it, not a page that merely starts with the word.
 */
export function isAccountPath(path: string): boolean {
    return path === "/account" || path.startsWith("/account/");
}

"use server";

import type { CreateApiKeyBody } from "@saroh/api-contract";

import {
    createApiKey as create,
    revokeApiKey as revoke,
    rollApiKey as roll,
} from "./service";

/**
 * Server Actions for Connections (API keys). Thin: the API checks
 * `apikey:manage`, the switch, the plan and the cap, and keeps a key to
 * its maker's powers; its refusal comes back for the sheet to say.
 */

export async function createApiKey(body: CreateApiKeyBody) {
    return create(body);
}

export async function rollApiKey(id: string) {
    return roll(id);
}

export async function revokeApiKey(id: string) {
    return revoke(id);
}

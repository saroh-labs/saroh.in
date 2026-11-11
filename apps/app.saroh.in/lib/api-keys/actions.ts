"use server";

import type { CreateApiKeyBody, UpdateApiKeyBody } from "@saroh/api-contract";

import {
    createApiKey as create,
    revokeApiKey as revoke,
    rollApiKey as roll,
    updateApiKey as update,
} from "./service";

/**
 * Server Actions for Connections (API keys). Thin: the API checks
 * `apikey:manage`, the switch, the plan and the cap, and keeps a key to
 * its maker's powers; its refusal comes back for the sheet to say.
 */

export async function createApiKey(body: CreateApiKeyBody) {
    return create(body);
}

export async function updateApiKey(id: string, body: UpdateApiKeyBody) {
    return update(id, body);
}

export async function rollApiKey(id: string) {
    return roll(id);
}

export async function revokeApiKey(id: string) {
    return revoke(id);
}

"use server";

import type { CreateApiKeyBody, UpdateApiKeyBody } from "@saroh/api-contract";

import { writeAsOrg } from "@/lib/api/assert-active-org";

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
 *
 * On React Query (DEC-259) the tab's business comes last: a moved tab is
 * refused (`writeAsOrg`). A new or replaced key's token is in this answer
 * only, shown once by the sheet; no read ever carries it.
 */

const as = <R>(orgId: string | undefined, write: () => Promise<R>) =>
    orgId ? writeAsOrg(orgId, write) : write();

export async function createApiKey(body: CreateApiKeyBody, orgId?: string) {
    return as(orgId, () => create(body));
}

export async function updateApiKey(
    id: string,
    body: UpdateApiKeyBody,
    orgId?: string,
) {
    return as(orgId, () => update(id, body));
}

export async function rollApiKey(id: string, orgId?: string) {
    return as(orgId, () => roll(id));
}

export async function revokeApiKey(id: string, orgId?: string) {
    return as(orgId, () => revoke(id));
}

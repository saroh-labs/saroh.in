"use server";

import { writeAsOrgIfSent } from "@/lib/api/assert-active-org";

import {
    confirmPublishRequest as confirmApi,
    declinePublishRequest as declineApi,
} from "./publish-requests-api";

/** Server Actions for the publish request screen (DEC-215): thin wrappers. */

/** `orgId`: the tab's business, from a React Query screen (DEC-259). */
export async function confirmPublishRequest(
    siteId: string,
    requestId: string,
    orgId?: string,
) {
    const write = () => confirmApi(siteId, requestId);
    return writeAsOrgIfSent(orgId, write);
}

export async function declinePublishRequest(
    siteId: string,
    requestId: string,
    orgId?: string,
) {
    const write = () => declineApi(siteId, requestId);
    return writeAsOrgIfSent(orgId, write);
}

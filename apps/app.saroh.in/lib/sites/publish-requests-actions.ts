"use server";

import {
    confirmPublishRequest as confirmApi,
    declinePublishRequest as declineApi,
} from "./publish-requests-api";

/** Server Actions for the publish request screen (DEC-215): thin wrappers. */

export async function confirmPublishRequest(siteId: string, requestId: string) {
    return confirmApi(siteId, requestId);
}

export async function declinePublishRequest(siteId: string, requestId: string) {
    return declineApi(siteId, requestId);
}

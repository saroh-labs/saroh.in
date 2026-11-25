"use server";

import { writeAsOrg } from "@/lib/api/assert-active-org";

import {
    disconnectAiConnection as disconnect,
    readAiActivity as read,
    rollBackAiSiteDraft as rollBack,
} from "./service";

/** On React Query (DEC-259) a write takes the tab's business last (`writeAsOrg`). */
const as = <R>(orgId: string | undefined, write: () => Promise<R>) =>
    orgId ? writeAsOrg(orgId, write) : write();

/** Disconnect: the API lets anyone end their own, and the Owner anyone's. */
export async function disconnectAiConnection(id: string, orgId?: string) {
    return as(orgId, () => disconnect(id));
}

/** A read: what the connection changed, when its sheet opens or for more. */
export async function readAiActivity(id: string, cursor?: string) {
    return read(id, cursor);
}

/** Draft only; refused when the draft changed outside the connection since. */
export async function rollBackAiSiteDraft(
    id: string,
    siteId: string,
    orgId?: string,
) {
    return as(orgId, () => rollBack(id, siteId));
}

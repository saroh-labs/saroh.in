"use server";

import { writeAsOrg } from "@/lib/api/assert-active-org";

import {
    disconnectAiConnection as disconnect,
    rollBackAiSiteDraft as rollBack,
} from "./service";

/** On React Query (DEC-259) a write takes the tab's business last (`writeAsOrg`). */
const as = <R>(orgId: string | undefined, write: () => Promise<R>) =>
    orgId ? writeAsOrg(orgId, write) : write();

/** Disconnect: the API lets anyone end their own, and the Owner anyone's. */
export async function disconnectAiConnection(id: string, orgId?: string) {
    return as(orgId, () => disconnect(id));
}

/** Draft only; refused when the draft changed outside the connection since. */
export async function rollBackAiSiteDraft(
    id: string,
    siteId: string,
    orgId?: string,
) {
    return as(orgId, () => rollBack(id, siteId));
}

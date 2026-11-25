import "server-only";

import { activeOrganizationOnce } from "@/lib/organizations/service";
import type { ServerRead } from "@/lib/query/route";
import type { NoAsk } from "@/lib/settings/queries";

import { shareRead } from "./queries";
import type { QrScreen } from "./screen";
import { readQrScreen } from "./screen";

/**
 * Share: whoever may read the website (`site:read`); without resolved
 * permissions (an older answer), everyone in the business, as the page's
 * module gate let them. The API judges every read and save again.
 */
export async function mayReadShare(): Promise<boolean> {
    const org = await activeOrganizationOnce();
    if (!org) return false;
    return org.actions ? org.actions.includes("site:read") : true;
}

export const shareServer: ServerRead<NoAsk, QrScreen> = {
    read: shareRead,
    service: async () => readQrScreen(await activeOrganizationOnce()),
};

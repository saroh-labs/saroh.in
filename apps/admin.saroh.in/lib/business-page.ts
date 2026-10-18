import { cache } from "react";

import {
    getBusinessOverview,
    getBusinessSummary,
    getBusinessView,
    getModuleState,
    listPlans,
} from "./businesses";
import { requireStaff } from "./console";

/**
 * The business page's reads (admin plan U2), each made once per request
 * however many of the layout, the tab and the title ask for it.
 *
 * The header and Overview stand on the directory row (`readSummary`,
 * `organization:read`, no support session). The other tabs read the
 * business's details (`readView`), which need an open support session; a
 * tab asks for it only when it is drawn.
 */

/** The gate the whole page opens with: staff holding `organization:read`. */
export const businessGate = cache(() => requireStaff("organization:read"));

/** The directory row; null when there is none, or it can't be read. */
export const readSummary = cache((organizationId: string) =>
    getBusinessSummary(organizationId).catch(() => null),
);

/** The business's details behind the support session. Throws on an outage. */
export const readView = cache((organizationId: string) =>
    getBusinessView(organizationId),
);

/** Each module's true state (U1); a failed panel on a refusal or outage. */
export const readModuleState = cache((organizationId: string) =>
    getModuleState(organizationId),
);

/**
 * The Overview's one read (U3): its cards, and the badges the layout puts
 * on the tabs. Throws on an outage; null on a refusal.
 */
export const readOverview = cache((organizationId: string) =>
    getBusinessOverview(organizationId),
);

/** The plans an operator may move a business to; none when unread. */
export const readPlans = cache(
    async () => (await listPlans().catch(() => null)) ?? [],
);

/**
 * A tab's title: its own name, then the business's, so several open at
 * once can be told apart. A business's name, never a person's.
 */
export async function tabTitle(
    tab: string,
    organizationId: string,
): Promise<string> {
    const summary = await readSummary(organizationId);
    return summary ? `${tab} · ${summary.name}` : tab;
}

/** What every tab's page and title are handed. */
export interface BusinessTabProps {
    params: Promise<{ organizationId: string }>;
}

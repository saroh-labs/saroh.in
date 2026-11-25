import "server-only";

import { moduleAccess } from "@/lib/modules/guard";
import type { resolveActiveOrganization } from "@/lib/organizations/service";
import { activeOrganizationOnce } from "@/lib/organizations/service";
import type { ServerRead } from "@/lib/query/route";

import type { ReviewInvitesRead, ReviewsRead } from "./queries";
import { productReviewsRead, reviewInvitesRead } from "./queries";
import {
    invitableOrders,
    listReviews,
    reviewEmailSetup,
    reviewSummary,
} from "./service";

type Org = Awaited<ReturnType<typeof resolveActiveOrganization>>;
type NoParams = Parameters<typeof productReviewsRead.key>[1];

/** What the API resolved this person may do; the role's name only for an older answer. */
function may(organization: Org, action: string): boolean {
    return organization?.actions
        ? organization.actions.includes(action)
        : organization?.role === "OWNER" || organization?.role === "ADMIN";
}

/** Read reviews (`product-review:read`; before permissions, anyone but a Reviewer). */
export function canReadReviews(organization: Org): boolean {
    return organization?.actions
        ? organization.actions.includes("product-review:read")
        : organization?.role !== "REVIEWER";
}

/** Reply, hide and invite: `product-review:write`, and orders to invite from. */
export function canWriteReviews(organization: Org): boolean {
    return (
        may(organization, "product-review:write") &&
        may(organization, "order:read")
    );
}

async function sellOn(): Promise<boolean> {
    const access = await moduleAccess("COMMERCE");
    return access.state === "available" || access.state === "unknown";
}

/** Who reads `/api/product-reviews`: as the Reviews tab is offered, while Sell is on. */
export async function mayReadReviews(): Promise<boolean> {
    const organization = await activeOrganizationOnce();
    if (!organization || !canReadReviews(organization)) return false;
    return sellOn();
}

/** Who reads `/api/product-reviews/invites`: as Invite reviews is offered. */
export async function mayInviteReviews(): Promise<boolean> {
    const organization = await activeOrganizationOnce();
    if (!organization || !canWriteReviews(organization)) return false;
    return sellOn();
}

/** Every review, newest first, with the ratings (unread ratings: none shown). */
async function readReviews(): Promise<ReviewsRead> {
    const [reviews, ratings] = await Promise.all([
        listReviews(),
        reviewSummary().catch(() => []),
    ]);
    return { reviews, ratings };
}

async function readInvites(): Promise<ReviewInvitesRead> {
    const [orders, setup] = await Promise.all([
        invitableOrders(),
        reviewEmailSetup().catch(() => null),
    ]);
    // Only what the sheet says: nothing else of the provider crosses.
    const emailSetup = setup
        ? { connected: setup.connected, canConnect: setup.canConnect }
        : null;
    return { orders, emailSetup };
}

export const productReviewsServer: ServerRead<NoParams, ReviewsRead> = {
    read: productReviewsRead,
    service: readReviews,
};

export const reviewInvitesServer: ServerRead<NoParams, ReviewInvitesRead> = {
    read: reviewInvitesRead,
    service: readInvites,
};

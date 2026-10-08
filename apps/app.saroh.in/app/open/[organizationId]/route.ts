import { redirect } from "next/navigation";

import { setActiveOrganization } from "@/lib/organizations/actions";
import { NOT_YOURS_HREF } from "@/lib/organizations/choose";

/**
 * Open one business: the door accounts.saroh.in's "Your businesses" list
 * links through.
 *
 * The workspace keeps the open business in its own httpOnly cookie, which no
 * other app can write, so choosing happens there and opening happens here.
 * The guard is `setActiveOrganization`'s: the caller must be a member, checked
 * against the API, so a hand-typed id for someone else's business is refused
 * and the person is sent back to choose again. Nothing but the choice of
 * business changes, and only among businesses they already belong to.
 *
 * Refused, it says so (UX-084): the workspace's own chooser, with a line
 * that the link opens a business they're not in. It used to send them to
 * accounts' business list, which is parked, with no word of why.
 */
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ organizationId: string }> },
) {
    const { organizationId } = await params;
    const result = await setActiveOrganization(organizationId);
    redirect(result.ok ? "/" : NOT_YOURS_HREF);
}

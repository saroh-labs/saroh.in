import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { env } from "@/env";
import { setActiveOrganization } from "@/lib/organizations/actions";
import {
    NOT_YOURS_HREF,
    PAUSED_ERROR,
    PAUSED_HREF,
} from "@/lib/organizations/choose";
import {
    encodeJoined,
    JOINED_COOKIE,
    JOINED_MAX_AGE_SECONDS,
    joinedLine,
    safeArrival,
} from "@/lib/organizations/joined";

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
 *
 * It is also where an accepted invitation arrives (UX audit, 10 Oct):
 * `?joined=1&to=/path`. A page can't write the open business while it
 * draws, and a location's invitation never switched to its business at
 * all, so both kinds of invitation come through here. `to` is where they
 * go on to, and only ever a path in this app. `joined` leaves the one-time
 * line that says which business they joined and as what
 * (`lib/organizations/joined.ts`).
 */
export async function GET(
    request: Request,
    { params }: { params: Promise<{ organizationId: string }> },
) {
    const { organizationId } = await params;
    const query = new URL(request.url).searchParams;
    const result = await setActiveOrganization(organizationId);
    if (result.ok && query.get("joined") === "1") {
        (await cookies()).set(
            JOINED_COOKIE,
            encodeJoined(joinedLine(result.data)),
            {
                // Read and cleared by the page that shows it.
                httpOnly: false,
                sameSite: "lax",
                secure: env.NODE_ENV === "production",
                path: "/",
                maxAge: JOINED_MAX_AGE_SECONDS,
            },
        );
    }
    // A business whose door is paused for them (#800) says so on the chooser.
    redirect(
        result.ok
            ? safeArrival(query.get("to"))
            : result.error === PAUSED_ERROR
              ? PAUSED_HREF
              : NOT_YOURS_HREF,
    );
}

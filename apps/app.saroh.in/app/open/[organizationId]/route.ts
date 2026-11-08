import type { Edition } from "@saroh/edition";
import { EDITIONS, environmentOfHost, hostsFor, urlOf } from "@saroh/edition";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { env } from "@/env";
import { apiFetch } from "@/lib/api/http";
import { EDITION } from "@/lib/edition";
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
 *
 * A member's business on the other edition (KTD12) isn't in this app's
 * list; the API, asked for it, says `edition_address` only after it has
 * checked membership, and only then are they sent to that edition's own
 * app, at its fixed address for this environment, never one read from the
 * request. A stranger is refused before that and stays on the not-yours page.
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
    if (!result.ok && result.error !== PAUSED_ERROR) {
        const elsewhere = await otherEditionDoor(organizationId, query);
        if (elsewhere) redirect(elsewhere);
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

/** A business id as the API makes them; anything else is never sent on. */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * The same door on the other edition's app, when the API refuses this
 * business only for being the other edition's; otherwise null.
 */
async function otherEditionDoor(
    organizationId: string,
    query: URLSearchParams,
): Promise<string | null> {
    if (!ID.test(organizationId)) return null;
    // The API this app talks to (`lib/api/http.ts`) says which environment
    // it is; a local one belongs to none, and has one app.
    const api =
        env.API_URL ??
        env.NEXT_PUBLIC_API_URL ??
        env.NEXT_PUBLIC_BETTER_AUTH_URL;
    const environment = api ? environmentOfHost(new URL(api).host) : null;
    const other = EDITIONS.find((e): e is Edition => e !== EDITION);
    if (!environment || !other) return null;

    const res = await apiFetch(`/organizations/${organizationId}`);
    if (res.status !== 403) return null;
    const body = (await res.json().catch(() => null)) as {
        error?: { details?: { reason?: unknown } };
    } | null;
    if (body?.error?.details?.reason !== "edition_address") return null;

    const door = new URL(
        `/open/${organizationId}`,
        urlOf(hostsFor(other, environment).app),
    );
    const to = query.get("to");
    if (to) door.searchParams.set("to", safeArrival(to));
    return door.toString();
}

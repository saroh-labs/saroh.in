import { withDevAccess } from "@saroh/auth/dev-access";
import { NextResponse } from "next/server";

import { helpHostRedirect, helpHostTarget } from "@/lib/help-host";
import { builtContext } from "@/lib/resources-context";

const site = withDevAccess(() => NextResponse.next());

// help.saroh.in (and help.saroh.io on dev) is served by this project and
// sent on to Help on www (`lib/help-host.ts`), before the dev key gate, which
// then guards the www address it lands on. Everything else: the site has no
// sign-in, so this only keeps the dev environment to browsers holding its key
// (withDevAccess) and passes every other request on.
// Typed from the gate itself: @saroh/auth resolves its own copy of `next`,
// whose NextRequest type is not this app's.
export default function proxy(request: Parameters<typeof site>[0]) {
    const www = helpHostTarget(request.headers.get("host"));
    if (www) {
        // 307 to the home page until this build has Help, 308 to Help from
        // then on (`lib/help-host.ts`). Asked of the build, not the clock.
        const { path, status } = helpHostRedirect(
            request.nextUrl.pathname,
            builtContext(),
        );
        return NextResponse.redirect(`https://${www}${path}`, status);
    }
    return site(request);
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

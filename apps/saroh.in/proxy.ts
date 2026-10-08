import { withDevAccess } from "@saroh/auth/dev-access";
import { NextResponse } from "next/server";

import { helpHostPath, helpHostTarget } from "@/lib/help-host";
import { resourcesContext } from "@/lib/resources-context";

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
        const path = helpHostPath(request.nextUrl.pathname, resourcesContext());
        // Temporary (307): a browser keeps a permanent one, and before 17 Oct
        // this goes to the home page, which must not stick after Help opens.
        return NextResponse.redirect(`https://${www}${path}`, 307);
    }
    return site(request);
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

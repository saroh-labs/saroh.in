import { withDevAccess } from "@saroh/auth/dev-access";
import { NextResponse } from "next/server";

// The site has no sign-in, so this only keeps the dev environment to browsers
// holding its key (withDevAccess); everywhere else it passes every request on.
export default withDevAccess(() => NextResponse.next());

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

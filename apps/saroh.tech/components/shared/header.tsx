import { MENUS } from "@/lib/nav";
import { signInHref, signupHref } from "@/site.config";

import { SiteNav } from "./site-nav";

/** saroh.tech's own header: the menus are read here, so none goes to the browser twice. */
export function Header() {
    return (
        <SiteNav
            menus={MENUS}
            signIn={signInHref}
            start={signupHref("nav")}
            startInSheet={signupHref("nav-sheet")}
        />
    );
}

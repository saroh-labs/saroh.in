"use client";

import { redirect, usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * The pages someone with no business here can use: opening an invitation
 * or a join link, and their own profile. Every other page is a business's.
 */
const WITHOUT_A_BUSINESS = ["/invitations/", "/join/", "/settings/profile"];

export function opensWithoutBusiness(path: string): boolean {
    return WITHOUT_A_BUSINESS.some((p) => path.startsWith(p));
}

/**
 * A signed-in person with no business on this edition (none at all, or
 * only the other edition's, B5) is sent to setup from any business page,
 * as Home does, rather than shown "Couldn't load your business details".
 * The shell has no path on the server, so the check is here, at render:
 * the server render of this component answers with the redirect.
 */
export function SetupFirst({ children }: { children: ReactNode }) {
    if (!opensWithoutBusiness(usePathname())) redirect("/onboarding");
    return children;
}

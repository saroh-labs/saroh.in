import type { CanActivate } from "@nestjs/common";
import { Injectable, NotFoundException } from "@nestjs/common";

import { env } from "../../env";

/**
 * The Website area switch (owner, 20-21 Nov 2026, DEC-240): the one switch.
 * `WEBSITE_AREA=on` is on; unset is on only under `NODE_ENV=development`.
 * The app has no switch of its own: it asks `GET /website-area` on each
 * request (`website-area.controller.ts`; the app's
 * `lib/sites/website-area-switch.ts`), so the
 * two can never disagree.
 *
 * Off, everything behaves as before the area: a site publishes whole and
 * "Publishing needs approval" refuses it whole (DEC-071; `publishSite`,
 * `createApproval`), posts publish as before (O7, `content/post-approval.ts`),
 * and every route the area added answers 404 through the guard below.
 * Removed once the area has been on in production for a release.
 *
 * `env` is read on every call, so a test can switch it.
 */
export function websiteAreaOn(): boolean {
    if (env.WEBSITE_AREA) return env.WEBSITE_AREA === "on";
    return env.NODE_ENV === "development";
}

/** 404 for a route that exists only with the Website area on. */
@Injectable()
export class WebsiteAreaSwitchGuard implements CanActivate {
    canActivate(): boolean {
        if (!websiteAreaOn()) throw new NotFoundException();
        return true;
    }
}

import type { CanActivate } from "@nestjs/common";
import { Injectable, NotFoundException } from "@nestjs/common";

import { env } from "../../env";

/**
 * The API half of the Website area switch (owner, 20 Nov 2026): the
 * editor's new rules apply only where the area is on. `WEBSITE_AREA=on` is
 * on; unset is on only under `NODE_ENV=development`, as the app's
 * `NEXT_PUBLIC_WEBSITE_AREA` (`lib/sites/website-area-switch.ts`).
 * Readers: post approval (O7, `content/post-approval.ts` and this guard on
 * its three routes). Removed with the app's switch once the area has been on
 * in production for a release.
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

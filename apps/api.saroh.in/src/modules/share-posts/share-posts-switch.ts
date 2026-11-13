import type { CanActivate } from "@nestjs/common";
import { Injectable, NotFoundException } from "@nestjs/common";

import { env } from "../../env";

/**
 * The release switch for Share as a post and Create post (#1375, #1378,
 * DEC-217). `SHARE_POSTS=on` serves the share pictures, the signed-in
 * booking card and own posts; any other value, unset included, answers
 * 404 as if the routes did not exist. An environment switch, as
 * `SITE_ACCOUNT_AREA`, because it gates a release, not a business.
 * Readers: this guard on the module's three controllers, and the app's
 * `NEXT_PUBLIC_SHARE_POSTS` (`lib/share-item/share-posts-switch.ts`).
 * Removed with them once it has been on in production for a release.
 *
 * `env` is read on every call, so a test can switch it.
 */
export function sharePostsOn(): boolean {
    return env.SHARE_POSTS === "on";
}

/** 404 for every share route while the switch is off. */
@Injectable()
export class SharePostsSwitchGuard implements CanActivate {
    canActivate(): boolean {
        if (!sharePostsOn()) throw new NotFoundException();
        return true;
    }
}

import type { CanActivate } from "@nestjs/common";
import { Injectable, NotFoundException } from "@nestjs/common";

import { env } from "../../env";

/**
 * The switch for the customer account area on merchant sites (round-2 plan
 * A, A5; waves plan, release boundary 4).
 *
 * The account area (Home and Me here; bookings, orders, plan and messages
 * from A6–A8 and A13) ships dark: `SITE_ACCOUNT_AREA=on` serves it, and any
 * other value — unset included — answers 404, as if the routes did not
 * exist. It is an environment flag, not a `FeatureFlag` row, because it
 * gates a release, not a business: it goes on once for every site, after
 * wave 4, and is deleted with its readers once it has been on for a
 * release (readers: this file, `saroh.app/lib/account-area.ts`).
 *
 * Sign-in itself (A2/A3) and booking signed in (A9) are not behind it:
 * they are live on every site.
 *
 * `env` is read on every call, so a test can switch it.
 */
export function accountAreaOn(): boolean {
    return env.SITE_ACCOUNT_AREA === "on";
}

/** 404 for every account-area route while the switch is off. */
@Injectable()
export class AccountAreaGuard implements CanActivate {
    canActivate(): boolean {
        if (!accountAreaOn()) throw new NotFoundException();
        return true;
    }
}

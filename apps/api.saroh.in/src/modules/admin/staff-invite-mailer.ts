import { Injectable } from "@nestjs/common";
import type { Edition } from "@saroh/edition";
import { environmentOfHost, hostsFor, urlOf } from "@saroh/edition";

import type { EmailOutcome } from "../../common/email";
import { accountsBase, sendStaffInviteEmail } from "../../common/email";
import { env } from "../../env";
import { STAFF_INVITE_VALID_DAYS } from "./staff-invite";

/**
 * Sends a staff invite's email (admin console U24). Its own provider so the
 * integration specs can stand in for it and read the token a real send
 * would carry, which nothing else ever sees.
 */
@Injectable()
export class StaffInviteMailer {
    /**
     * Where accounts is, or null when this instance can't say. Sent from a
     * console, the accounts of its edition in the same environment as
     * `ACCOUNTS_URL` (DEC-204), so a Global invite opens Global sign-in.
     */
    accountsBase(
        edition: Edition | null = null,
        source: { ACCOUNTS_URL?: string; NODE_ENV?: string } = env,
    ): string | null {
        const environment =
            edition && source.ACCOUNTS_URL
                ? environmentOfHost(new URL(source.ACCOUNTS_URL).host)
                : null;
        return accountsBase(
            source,
            edition && environment
                ? urlOf(hostsFor(edition, environment).accounts)
                : undefined,
        );
    }

    /**
     * The link opens accounts' swap route, which trades the token for a
     * short-lived httpOnly cookie and sends the browser on to a clean
     * address (`apps/accounts.saroh.in/app/staff-invite/open/route.ts`).
     */
    link(base: string, token: string): string {
        return `${base}/staff-invite/open?token=${encodeURIComponent(token)}`;
    }

    send(
        to: string,
        details: {
            base: string;
            token: string;
            name: string;
            invitedByName: string | null;
        },
    ): Promise<EmailOutcome> {
        return sendStaffInviteEmail(to, {
            url: this.link(details.base, details.token),
            name: details.name,
            invitedByName: details.invitedByName,
            validDays: STAFF_INVITE_VALID_DAYS,
        });
    }
}

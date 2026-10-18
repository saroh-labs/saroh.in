import { Injectable } from "@nestjs/common";

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
    /** Where accounts is, or null when this instance can't say. */
    accountsBase(): string | null {
        return accountsBase(env);
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

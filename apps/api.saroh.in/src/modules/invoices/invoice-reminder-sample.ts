import { prisma } from "@saroh/database";

import { dayWords, moneyWordsMinor } from "../../common/words-format";
import {
    renderTransactional,
    SECRET_LINK_SLOT,
} from "../communications/transactional";
import {
    businessPayInstructionsOf,
    payWaysWords,
} from "../organizations/business-pay-instructions";
import type { SendRow } from "./invoice-send.service";
import { firstName } from "./invoice-send.service";
import { isPastDue, leftToPayCents } from "./invoice-state";

/**
 * The reminder one customer gets, as the words a person reads: the
 * `INVOICE_REMINDER` email itself, rendered with the same vars `remind`
 * queues, its link named rather than minted. Remind many's preview shows
 * it as "What they get" (Home's Remind all, DEC-171, U8, board
 * `HARemindD`), so the sheet never paraphrases what goes.
 */
export async function reminderSample(
    organizationId: string,
    row: SendRow,
    payOnline: boolean,
    zone: string,
    now: Date,
): Promise<string> {
    const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { name: true },
    });
    const { body } = renderTransactional("INVOICE_REMINDER", {
        business: org?.name ?? "",
        firstName: firstName(row),
        number: row.number ?? "",
        total: moneyWordsMinor(leftToPayCents(row), row.currency),
        dueOn: row.dueAt ? dayWords(row.dueAt, zone, { year: true }) : null,
        overdue: isPastDue(row, now),
        payOnline,
        ...(payOnline
            ? {}
            : {
                  payWays: payWaysWords(
                      await businessPayInstructionsOf(organizationId),
                  ),
              }),
    });
    return plainWords(body);
}

/** The email's HTML as the words a person reads, the link named. */
export function plainWords(html: string): string {
    return (
        html
            .split(SECRET_LINK_SLOT)
            .join("[their own link]")
            .replace(/<a [^>]*>[^<]*<\/a>/g, "[their own link]")
            .replace(/<br\s*\/?>/g, " ")
            .replace(/<\/p>\s*/g, "\n")
            // A space, never nothing: a tag can't be rebuilt from what is left,
            // and the lines are trimmed below.
            .replace(/<[^>]+>/g, " ")
            .replace(/&#39;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&amp;/g, "&")
            .split("\n")
            .map((line) => line.replace(/\s+/g, " ").trim())
            .filter(Boolean)
            .join("\n")
    );
}

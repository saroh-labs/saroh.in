import type { Prisma } from "@saroh/database";

import { dayWords, isTimeZone, timeWords } from "../../../common/words-format";
import type { NoticeKind as NoticeSettingKind } from "../../communications/notice-settings";
import type { NoticeTemplate } from "../../communications/transactional";
import type { CustomerNotifyPayload } from "../customer-notify-queue";

/**
 * What one kind of customer notice is (DEC-174, U2 #1133): one file under
 * `notices/` per kind or family, registered in `notices/index.ts`, so a
 * new notice is a new file and one line in the index, never an edit to the
 * `customer.notify` handler or to another notice's words.
 *
 * Everything here is the notice's own: what it is about (read fresh when
 * the job runs), the sentence its account-thread message carries, the
 * email's subject line and links, and the switch that turns it off. The
 * handler does the rest the same way for every kind: once per event, the
 * contact resolved (merge, removal), the thread, the email through the
 * business's own provider, consent.
 */

type Tx = Prisma.TransactionClient;

/** Every notice's values carry the template they are. */
export interface NoticeVarsBase {
    kind: NoticeTemplate;
}

/** What a notice is about, read fresh when it runs. */
export interface NoticeSubject<V extends NoticeVarsBase = NoticeVarsBase> {
    contactId: string;
    vars: V;
    bookingId?: string;
    orderId?: string;
    /** The service a lapsed hold was for: "Book again" opens it (#1137). */
    serviceId?: string;
    /** The invoice it asks to be paid, recorded on the email (U10). */
    invoiceId?: string;
}

/** A link in the email, with the words above it. */
export interface NoticeLinkLine {
    lead: string;
    /** Only a web address is ever a link; anything else is dropped. */
    url: string | null;
}

export interface NoticeDefinition<V extends NoticeVarsBase> {
    /**
     * The business's switch that stops it (U1, `notice-settings.ts`), or
     * null: no switch of its own. The notices that existed before DEC-174
     * have none (A1): the provider and "Updates in Messages" are their
     * controls. A kind named here counts as sent for the switches screen
     * (`noticeSenderShipped`).
     */
    setting: NoticeSettingKind | null;
    /** Read what it is about now; null: nobody is told. */
    load(
        tx: Tx,
        organizationId: string,
        payload: CustomerNotifyPayload,
        now: Date,
    ): Promise<NoticeSubject<V> | null>;
    /** The account thread's sentence, and the email's lead. Plain text. */
    sentence(vars: V): string;
    /** The email's subject line. Plain text. */
    subject(vars: V): string;
    /** Who it is from and who it greets. */
    names(vars: V): { business: string; firstName: string | null };
    /** Links the email carries before the way back (a tracking page). */
    links?(vars: V): NoticeLinkLine[];
    /** The way back to it on the business's own site. */
    backLink?(vars: V): NoticeLinkLine | null;
    /** The vars with the way back put in (`notice-link.ts`). */
    withLink?(vars: V, link: string): V;
    /**
     * Words the customer wrote, quoted back under the email's lead (the
     * enquiry auto-reply's message). Plain text; null: no quote.
     */
    quote?(vars: V): NoticeQuote | null;
    /**
     * Email only, never the account thread: someone the notice answers is
     * not yet a customer with an account (the enquiry auto-reply). With no
     * provider it reaches nobody, so nothing is claimed or written.
     */
    emailOnly?: boolean;
    /**
     * A secret link the email carries (a fresh pay link, DEC-110), with the
     * words above it. `make` runs on the job's transaction only when the
     * email really goes (not for a customer who turned email off), and the
     * link is put in at send time: the stored body holds the slot, never
     * the token (`SECRET_LINK_SLOT`). The thread's sentence has none.
     */
    secretLink?: {
        lead(vars: V): string;
        make(
            tx: Tx,
            organizationId: string,
            subject: NoticeSubject<V>,
        ): Promise<string>;
    };
}

/** A quote in the email: the words above it, and what they wrote. */
export interface NoticeQuote {
    lead: string;
    text: string;
}

/** Declare a notice: only checks its shape. */
export function defineNotice<V extends NoticeVarsBase>(
    definition: NoticeDefinition<V>,
): NoticeDefinition<V> {
    return definition;
}

// ---- Shared words and reads ------------------------------------------------

/** "Tue 6 Oct at 11:00 am", in the business's zone. */
export function noticeWhen(at: Date, timeZone: string): string {
    const zone = isTimeZone(timeZone) ? timeZone : "Asia/Kolkata";
    return `${dayWords(at, zone, { weekday: true })} at ${timeWords(at, zone)}`;
}

/** "Asha" from "Asha Rao"; null for none. */
export function firstWord(name: string | null | undefined): string | null {
    const first = name?.trim().split(/\s+/)[0] ?? "";
    return first === "" ? null : first;
}

export async function businessName(
    tx: Pick<Tx, "organization">,
    organizationId: string,
): Promise<string> {
    const org = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { name: true },
    });
    return org?.name ?? "";
}

/** Only a web address is ever a link; anything else stays words. */
export function safeLink(url: string | null | undefined): string | null {
    if (!url) return null;
    try {
        const parsed = new URL(url);
        return parsed.protocol === "https:" || parsed.protocol === "http:"
            ? parsed.toString()
            : null;
    } catch {
        return null;
    }
}

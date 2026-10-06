import { Logger } from "@nestjs/common";
import type { SendMailOptions, Transporter } from "nodemailer";
import nodemailer from "nodemailer";
import { z } from "zod";

import type { EmailOutcome } from "../../../common/email";
import { identitySmtpOptions } from "../../../common/email";
import { declaredNodeEnv, env } from "../../../env";
import {
    cleanBusinessName,
    codeSenderName,
} from "../../site-accounts/sender-name";

/**
 * Saroh's own sender for a business's email, used while the business has no
 * email provider of its own (DEC-086). Not a `CommsProvider`: there is no
 * credentials row, so nothing in Settings → Providers can look as if the
 * business connected Saroh.
 *
 * It sends from a subdomain kept apart from sign-in and code mail
 * (`notify.saroh.in`, its own DKIM and MAIL FROM), on its own SES
 * configuration set, tagged with the business, so a complaint can be traced
 * to the business that caused it. It connects on the identity `SMTP_*` set
 * (`identitySmtpOptions`).
 *
 * The display name is the business's cleaned name (`sender-name.ts`), and
 * Reply-To is the business's contact email when it is one clean address.
 * Subject and body come rendered and already cleaned by the caller.
 */
export const SAROH_BUSINESS_FROM_DEFAULT = "bookings@notify.saroh.in";

/**
 * How a send went. `unknown` is a connection lost after the message was
 * handed over: SES may have taken it, so a retry could email the customer
 * twice, and the caller must not retry it.
 */
export type SarohSendOutcome = EmailOutcome | "unknown";

export interface SarohBusinessEmail {
    organizationId: string;
    /** As the business typed it; cleaned here for the display name. */
    businessName: string;
    /** Stands in when nothing of the name survives cleaning. */
    fallbackName: string;
    /** `BusinessProfile.contactEmail`, if any. */
    contactEmail: string | null;
    to: string;
    subject: string;
    html: string;
}

const ADDRESS = z.string().email();

/** One clean address, or null: a header must never carry a line break. */
function replyToAddress(contactEmail: string | null): string | null {
    if (!contactEmail) return null;
    const trimmed = contactEmail.trim();
    if (/[\s,;<>"]/u.test(trimmed)) return null;
    return ADDRESS.safeParse(trimmed).success ? trimmed : null;
}

/** SES tag values allow letters, digits, `_` and `-` only. */
function tagValue(value: string): string {
    return value.replace(/[^A-Za-z0-9_-]/gu, "_").slice(0, 256);
}

/** The message as it goes to SES. */
export function sarohBusinessMessage(
    email: SarohBusinessEmail,
    options: { from: string; configurationSet?: string },
): SendMailOptions {
    const name = cleanBusinessName(email.businessName, email.fallbackName);
    const replyTo = replyToAddress(email.contactEmail);
    const headers: Record<string, string> = {
        "X-SES-MESSAGE-TAGS": `organization=${tagValue(email.organizationId)}`,
    };
    if (options.configurationSet) {
        headers["X-SES-CONFIGURATION-SET"] = options.configurationSet;
    }
    return {
        from: { name: codeSenderName(name), address: options.from },
        to: email.to,
        subject: email.subject,
        html: email.html,
        headers,
        ...(replyTo ? { replyTo } : {}),
    };
}

/**
 * Whether a send that threw may still have reached SES. Nodemailer tags
 * every timeout and dropped connection `CONN`, so the stage comes from the
 * server's last reply instead:
 * - a 4xx or 5xx reply is a rejection: `failed`, safe to retry;
 * - a connection lost after "354" (SES had started taking the message), or
 *   a plain inactivity timeout mid-session, may have been delivered:
 *   `unknown`, never retried, so the customer is not emailed twice;
 * - anything before the hand-over (connect, greeting, login) is `failed`.
 */
export function outcomeOfError(error: unknown): SarohSendOutcome {
    if (typeof error !== "object" || error === null) return "failed";
    const e = error as {
        responseCode?: unknown;
        code?: unknown;
        message?: unknown;
    };
    if (typeof e.responseCode === "number") {
        return e.responseCode === 354 ? "unknown" : "failed";
    }
    if (e.code === "ETIMEDOUT" && e.message === "Timeout") return "unknown";
    return "failed";
}

type Sender = Pick<Transporter, "sendMail">;

let shared: Sender | null | undefined;

function defaultTransport(): Sender | null {
    if (shared === undefined) {
        // Its own pool on the identity SMTP set, so a burst of business
        // email never queues behind sign-in codes.
        const options = identitySmtpOptions(env);
        shared = options ? nodemailer.createTransport(options) : null;
    }
    return shared;
}

const logger = new Logger("SarohBusinessEmail");

/**
 * Send one business email through Saroh. Awaited, and it says how it went.
 * Only the outcome and the business are logged: never the address, the
 * subject, the credentials or the provider's reply.
 *
 * With no SMTP the message counts as sent only where `NODE_ENV` was
 * declared `development` (`declaredNodeEnv`, never the schema's default), so
 * a host that forgot to set it reports `not-configured` instead of a send
 * that never left.
 */
export async function sendSarohBusinessEmail(
    email: SarohBusinessEmail,
    transport: Sender | null = defaultTransport(),
    nodeEnv: string | undefined = declaredNodeEnv,
): Promise<SarohSendOutcome> {
    const outcome = await send(email, transport, nodeEnv);
    if (outcome !== "sent") {
        logger.warn(
            `saroh_business_email_${outcome.replace("-", "_")} org=${email.organizationId}`,
        );
    }
    return outcome;
}

async function send(
    email: SarohBusinessEmail,
    transport: Sender | null,
    nodeEnv: string | undefined,
): Promise<SarohSendOutcome> {
    if (!transport) {
        if (nodeEnv !== "development") return "not-configured";
        logger.log(
            `saroh_business_email_dev_no_smtp org=${email.organizationId}`,
        );
        return "sent";
    }
    try {
        await transport.sendMail(
            sarohBusinessMessage(email, {
                from:
                    env.SAROH_BUSINESS_EMAIL_FROM ??
                    SAROH_BUSINESS_FROM_DEFAULT,
                configurationSet: env.SAROH_BUSINESS_EMAIL_CONFIG_SET,
            }),
        );
        return "sent";
    } catch (error) {
        return outcomeOfError(error);
    }
}

import type { Transporter } from "nodemailer";
import nodemailer from "nodemailer";

import { declaredNodeEnv, env } from "../env";
import {
    codeSenderName,
    codeSubject,
} from "../modules/site-accounts/sender-name";
import type { WelcomeMail } from "./email-welcome";
import { welcomeEmail } from "./email-welcome";
import { siteCodesFakeAllowed, writeSiteCodeOutbox } from "./site-code-outbox";
import { dayWords } from "./words-format";

const FROM =
    env.EMAIL_FROM ?? env.SENDER_EMAIL_ID ?? "Saroh <noreply@saroh.in>";

function getTransporter(): Transporter | null {
    const host = env.SMTP_HOST ?? env.SMTP_HOSTNAME;
    const port = env.SMTP_PORT;
    const user = env.SMTP_USER ?? env.USER_ACCOUNT;
    const pass = env.SMTP_PASS ?? env.USER_PASSWORD;

    if (host && user && pass) {
        return nodemailer.createTransport({
            host,
            port: port ? Number(port) : 465,
            secure: env.SMTP_SECURE !== "false",
            auth: { user, pass },
        });
    }
    if (user && pass) {
        return nodemailer.createTransport({
            service: "Gmail",
            host: "smtp.gmail.com",
            port: 465,
            secure: true,
            auth: { user, pass },
        });
    }
    return null;
}

const transporter = getTransporter();

// Minimal inline HTML. The richer React-Email templates in @saroh/emails need
// that package to ship a build (it currently exports raw .tsx, unusable from
// plain Node) — wiring them is a follow-up; links are delivered fine here.
/**
 * Escape a value before it lands in the HTML above.
 *
 * These bodies carry tenant-chosen text — an organization's name, a site's
 * name — which is to say text a stranger can choose. Interpolating it raw put
 * whatever they typed into an email we send in our own name.
 */
function esc(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function actionEmail(heading: string, body: string, url: string, cta: string) {
    const href = esc(url);
    return `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
  <h2>${esc(heading)}</h2>
  <p>${esc(body)}</p>
  <p><a href="${href}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;border-radius:6px">${esc(cta)}</a></p>
  <p style="color:#666;font-size:12px">Or paste this link: ${href}</p>
</div>`;
}

export function sendPasswordResetEmail(
    to: string,
    resetUrl: string,
): Promise<void> {
    if (!transporter) {
        console.info(`[Password reset] (no SMTP) ${to}: ${resetUrl}`);
        return Promise.resolve();
    }
    void transporter.sendMail({
        from: FROM,
        to,
        subject: "Reset your Saroh password",
        html: actionEmail(
            "Reset your password",
            "Click below to choose a new password.",
            resetUrl,
            "Reset password",
        ),
    });
    return Promise.resolve();
}

/**
 * Where the sign-in pages are, for a link in an email: `ACCOUNTS_URL`, else
 * the origin the request came from (already checked against the trusted
 * list by the caller), else the local accounts app in development. Null
 * when this instance cannot say, and the email goes without buttons.
 */
export function accountsBase(
    source: { ACCOUNTS_URL?: string; NODE_ENV?: string },
    origin?: string,
): string | null {
    const base =
        source.ACCOUNTS_URL ??
        origin ??
        (source.NODE_ENV === "development"
            ? "https://accounts.saroh.localhost"
            : undefined);
    return base ? base.replace(/\/$/, "") : null;
}

export const EXISTING_ACCOUNT_SUBJECT = "You already have a Saroh account";

const BUTTON =
    "display:inline-block;padding:10px 16px;text-decoration:none;border-radius:6px";

/**
 * What the owner of an address reads when someone signs up with it again
 * (UX audit, 10 Oct). The sign-up screen says "Check your email" either
 * way, so this is the only place that can say an account already exists:
 * it reaches the mailbox's owner and nobody else.
 */
export function existingAccountEmail(to: string, base: string | null): string {
    const buttons = base
        ? `<p><a href="${esc(`${base}/login?email=${encodeURIComponent(to)}`)}" style="${BUTTON};background:#111;color:#fff">Sign in</a>
  &nbsp;<a href="${esc(`${base}/forgot-password`)}" style="${BUTTON};border:1px solid #111;color:#111">Reset password</a></p>`
        : "<p>Open Saroh and choose Sign in. If you have forgotten your password, choose Forgot it? on that page.</p>";
    return `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
  <h2>${esc(EXISTING_ACCOUNT_SUBJECT)}</h2>
  <p>Someone, probably you, tried to sign up for Saroh with this email address. It already has an account, so no new one was made.</p>
  <p>Sign in to carry on. If you have forgotten your password, reset it.</p>
  ${buttons}
  <p style="color:#666;font-size:12px">If this wasn't you, you can ignore this email. Nobody got into your account.</p>
</div>`;
}

/** See {@link existingAccountEmail}. Console-only without SMTP, like its neighbours. */
export function sendExistingAccountEmail(
    to: string,
    origin?: string,
): Promise<void> {
    const base = accountsBase(env, origin);
    if (!transporter) {
        console.info(
            `[Existing account] (no SMTP) ${to}: ${base ? `${base}/login` : "no accounts address"}`,
        );
        return Promise.resolve();
    }
    void transporter.sendMail({
        from: FROM,
        to,
        subject: EXISTING_ACCOUNT_SUBJECT,
        html: existingAccountEmail(to, base),
    });
    return Promise.resolve();
}

/** A code, rendered big and monospaced so it is easy to read off and retype. */
function codeEmail(
    heading: string,
    body: string,
    otp: string,
    minutes: number,
) {
    return `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
  <h2>${heading}</h2>
  <p>${body}</p>
  <p style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:32px;font-weight:700;letter-spacing:8px;padding:16px 0">${otp}</p>
  <p style="color:#666;font-size:12px">This code expires in ${minutes} minutes. If you didn't request it, you can ignore this email.</p>
</div>`;
}

/**
 * "‹Business› is set up on Saroh" to whoever created it (`email-welcome.ts`
 * has the words and the rules). Awaited and it says how it went, though the
 * caller only logs: a welcome that didn't leave never undoes a business.
 * With no SMTP the log names the subject and never the address.
 */
export async function sendWelcomeEmail(
    to: string,
    mail: WelcomeMail,
): Promise<EmailOutcome> {
    const { subject, html } = welcomeEmail(mail);
    if (!transporter) {
        console.info(`[Welcome] (no SMTP) not sent: ${subject}`);
        return "not-configured";
    }
    try {
        await transporter.sendMail({ from: FROM, to, subject, html });
        return "sent";
    } catch {
        return "failed";
    }
}

export const SIGN_IN_CODE_SUBJECT = "Your Saroh sign-in code";

/** A code email's subject and body, for one kind of code. */
export function verificationOtpEmail(
    type: VerificationOtpType,
    otp: string,
    expiresInSeconds: number,
): { subject: string; html: string } {
    const copy = OTP_COPY[type];
    const minutes = Math.max(1, Math.round(expiresInSeconds / 60));
    return {
        subject: copy.subject,
        html: codeEmail(copy.heading, copy.body, otp, minutes),
    };
}

const OTP_COPY: Record<
    VerificationOtpType,
    { subject: string; heading: string; body: string }
> = {
    "email-verification": {
        subject: "Your Saroh verification code",
        heading: "Verify your email",
        body: "Enter this code to finish setting up your Saroh account.",
    },
    // Signing up and signing in (owner, 10 Oct 2026): one email for both,
    // because asking for a code must not say whether the address has an
    // account. The heading is the subject, and the body names the screen
    // the person is looking at ("Check your email").
    "sign-in": {
        subject: SIGN_IN_CODE_SUBJECT,
        heading: SIGN_IN_CODE_SUBJECT,
        body: "Enter this code on the Saroh page that says Check your email. New to Saroh? The same code creates your account.",
    },
    // Also what sets a first password from the account page.
    "forget-password": {
        subject: "Your Saroh password code",
        heading: "Your Saroh password code",
        body: "Enter this code to set a new password.",
    },
    "change-email": {
        subject: "Your Saroh email change code",
        heading: "Confirm your new email",
        body: "Enter this code to confirm the change to your account's email address.",
    },
};

export type VerificationOtpType =
    "sign-in" | "email-verification" | "forget-password" | "change-email";

/**
 * Deliver a one-time code. This is what a signing-up user actually receives —
 * the link sender below is no longer on the signup path (see the `emailOTP`
 * plugin config in @saroh/auth).
 *
 * The console fallback prints the code so local dev, which has no SMTP, can
 * still complete a signup. Where the fake code transport is allowed (never in
 * production, `siteCodesFakeAllowed`), it also leaves the code in the
 * temp-directory outbox, so a browser test can sign up a new account from
 * the marketing site end to end (plan U27, `signup-from-marketing.spec.ts`).
 */
export function sendVerificationOtpEmail(
    to: string,
    otp: string,
    type: VerificationOtpType,
    expiresInSeconds: number,
): Promise<void> {
    const mail = verificationOtpEmail(type, otp, expiresInSeconds);
    if (!transporter) {
        console.info(`[${mail.subject}] (no SMTP) ${to}: code ${otp}`);
        if (siteCodesFakeAllowed(declaredNodeEnv, env.SITE_CODES_EMAIL_FAKE)) {
            writeSiteCodeOutbox(to, otp);
        }
        return Promise.resolve();
    }
    void transporter.sendMail({
        from: FROM,
        to,
        subject: mail.subject,
        html: mail.html,
    });
    return Promise.resolve();
}

// A link-based `sendVerificationEmail` used to live here. Email verification is
// now code-based end to end (see `sendVerificationOtpEmail` above and the
// emailOTP plugin in @saroh/auth), and defining a link sender at all would have
// suppressed the plugin's code sender — so it is gone rather than left unused.

/**
 * Approve an email change. Deliberately addressed to the account's CURRENT
 * address — the holder of the existing mailbox authorizes the move — and it
 * names the destination so a victim of an unauthorized attempt can see where
 * their account was about to go.
 */
export function sendChangeEmailConfirmationEmail(
    to: string,
    confirmUrl: string,
    newEmail: string,
): Promise<void> {
    if (!transporter) {
        console.info(
            `[Change email] (no SMTP) ${to} -> ${newEmail}: ${confirmUrl}`,
        );
        return Promise.resolve();
    }
    void transporter.sendMail({
        from: FROM,
        to,
        subject: "Confirm your new Saroh email address",
        html: actionEmail(
            "Confirm your email change",
            `We received a request to change your Saroh sign-in email to ${newEmail}. ` +
                "Confirm below if that was you. If it wasn't, ignore this email. Nothing changes.",
            confirmUrl,
            "Confirm change",
        ),
    });
    return Promise.resolve();
}

/**
 * Saroh staff changed this account's sign-in email (admin console U9). Sent
 * to the OLD address, naming the new one only masked (`maskEmail`), so the
 * mailbox's owner can tell it wasn't them without the notice handing out
 * where the account went. The new address gets no code for 24 hours unless
 * a second staff member confirms, so there is time to answer.
 */
export function sendSignInEmailChangedNotice(
    to: string,
    maskedNewEmail: string,
): Promise<void> {
    const html = signInEmailChangedEmail(maskedNewEmail);
    if (!transporter) {
        console.info(`[Sign-in email changed] (no SMTP) notice to ${to}`);
        return Promise.resolve();
    }
    void transporter.sendMail({
        from: FROM,
        to,
        subject: "Your Saroh sign-in email was changed",
        html,
    });
    return Promise.resolve();
}

/** The notice's body; the masked address is escaped like any value. */
export function signInEmailChangedEmail(maskedNewEmail: string): string {
    return `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
  <h2>Your sign-in email was changed</h2>
  <p>Saroh support changed the email you sign in to Saroh with, at your request, to ${esc(maskedNewEmail)}. This address won't sign you in any more.</p>
  <p>If you didn't ask for this, reply to this email or write to Saroh support straight away. The new address can't sign in for 24 hours unless a second person at Saroh confirms the change, so there is time to stop it.</p>
</div>`;
}

/** Confirm account deletion. Irreversible, so it always requires this link. */
export function sendDeleteAccountEmail(
    to: string,
    confirmUrl: string,
): Promise<void> {
    if (!transporter) {
        console.info(`[Delete account] (no SMTP) ${to}: ${confirmUrl}`);
        return Promise.resolve();
    }
    void transporter.sendMail({
        from: FROM,
        to,
        subject: "Confirm deleting your Saroh account",
        html: actionEmail(
            "Confirm account deletion",
            "This permanently deletes your Saroh account and cannot be undone. " +
                "If you didn't request this, ignore this email. Nothing is deleted.",
            confirmUrl,
            "Delete my account",
        ),
    });
    return Promise.resolve();
}

/**
 * Notify an org OWNER/ADMIN that a new enquiry (Lead) landed. Fired by the
 * `enquiry.notify` job handler (S3-006), once per recipient. Mirrors the other
 * `send*` helpers: console-fallback when no SMTP is configured, and never
 * throws on the console path so the durable in-app Notification is the source
 * of truth even without mail.
 */
export function sendEnquiryNotificationEmail(
    to: string,
    details: {
        contactName: string;
        formName: string;
        leadUrl: string;
        /** A short line of what they wrote (UX-002); null when nothing but an address. */
        message?: string | null;
    },
): Promise<void> {
    const { contactName, formName, leadUrl, message } = details;
    if (!transporter) {
        console.info(
            `[New enquiry] (no SMTP) ${to}: ${contactName} via ${formName} -> ${leadUrl}`,
        );
        return Promise.resolve();
    }
    void transporter.sendMail({
        from: FROM,
        to,
        subject: `New enquiry from ${contactName}`,
        html: actionEmail(
            `New enquiry from ${contactName}`,
            message
                ? `${contactName} wrote through the "${formName}" form: “${message}” Open the lead to reply.`
                : `${contactName} submitted the "${formName}" form. Open the lead to follow up.`,
            leadUrl,
            "View lead",
        ),
    });
    return Promise.resolve();
}

/** What a team alert email says, worded by `notifications/team-alert.handler.ts`. */
export interface TeamAlertMail {
    subject: string;
    heading: string;
    body: string;
    /** Where it opens in the workspace; none when there is nowhere to open. */
    url: string | null;
    /** The button's words; "Open it in Saroh" when not said. */
    cta?: string;
    /** Why they got it, and where to change it. */
    footer: string;
}

/**
 * A team alert (round-2 F14: a new order, a booking, a failed payment,
 * someone joining, a scheduled go-live, a provider that refused its keys,
 * a website review) to one person on a business's team. The only mail
 * helper for the team's alerts: every one goes through
 * `notifications/team-alert.handler.ts`.
 * Saroh telling a business about its own business, so Saroh sends it, as
 * the new-enquiry alert above, whether or not the business has an email
 * provider (DEC-011, amended 2026-10-07).
 *
 * Sent in Saroh's own name, so the handler words it in fixed words and the
 * business's cleaned names only (`site-accounts/sender-name.ts`), never
 * text a customer typed; everything is escaped again here. Console
 * fallback with no SMTP, like the other `send*` helpers.
 */
export function sendTeamAlertEmail(
    to: string,
    mail: TeamAlertMail,
): Promise<void> {
    if (!transporter) {
        console.info(
            `[Team alert] (no SMTP) ${to}: ${mail.subject}${mail.url ? ` -> ${mail.url}` : ""}`,
        );
        return Promise.resolve();
    }
    const button = mail.url
        ? `<p><a href="${esc(mail.url)}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;border-radius:6px">${esc(mail.cta ?? "Open it in Saroh")}</a></p>`
        : "";
    void transporter.sendMail({
        from: FROM,
        to,
        subject: mail.subject,
        html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
  <h2>${esc(mail.heading)}</h2>
  <p>${esc(mail.body)}</p>
  ${button}
  <p style="color:#666;font-size:12px">${esc(mail.footer)}</p>
</div>`,
    });
    return Promise.resolve();
}

/** What the "your data is ready" email says (DEC-120). */
export interface DataExportReadyMail {
    /** The business's name; escaped here. */
    businessName: string;
    /** The signed link to the zip itself. */
    url: string;
    /** When that link stops working. */
    linkExpiresAt: Date;
    /** Until when the workspace can make a new link. */
    keptUntil: Date;
    /** Settings › Your data in the workspace. */
    workspaceUrl: string;
}

function dayOf(date: Date): string {
    return dayWords(date, "Asia/Kolkata", { year: true });
}

/**
 * "Your data is ready" to the owner who asked for it (DEC-120): Saroh
 * speaking to its own user about their own business (DEC-011 amended
 * 2026-10-07, sent as DEC-085 has it), so Saroh sends it, provider or not.
 * The link is a signed one to the zip that stops working after a day; the
 * workspace makes a new one until the zip is deleted. Awaited, so the job
 * knows whether it went. Without SMTP the log says so and never prints
 * the link: the link is the data.
 */
export async function sendDataExportReadyEmail(
    to: string,
    mail: DataExportReadyMail,
): Promise<"sent" | "not-configured" | "failed"> {
    // One line: a name is tenant text, and a subject takes no line break.
    const name = mail.businessName.replace(/\s+/g, " ").trim().slice(0, 80);
    const subject = `Your data from ${name} is ready`;
    if (!transporter) {
        console.info(`[Data export] (no SMTP) ready email not sent to ${to}`);
        return "not-configured";
    }
    const html = `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
  <h2>${esc(subject)}</h2>
  <p>${esc(`Everything ${name} keeps in Saroh is in one zip file: customers, orders, invoices and credit notes, bookings, products and stock, memberships, class packs, courses and enquiries as spreadsheets (CSV), and the photos and videos you uploaded.`)}</p>
  <p><a href="${esc(mail.url)}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;border-radius:6px">Download your data</a></p>
  <p>${esc(`This link works until ${dayOf(mail.linkExpiresAt)}. After that, download it from Settings › Your data in Saroh until ${dayOf(mail.keptUntil)}, when the file is deleted.`)}</p>
  <p><a href="${esc(mail.workspaceUrl)}">Open Settings › Your data</a></p>
  <p style="color:#666;font-size:12px">${esc("You asked for this from your business's Settings in Saroh. The file holds your customers' details, so keep it somewhere safe.")}</p>
</div>`;
    try {
        await transporter.sendMail({ from: FROM, to, subject, html });
        return "sent";
    } catch {
        return "failed";
    }
}

/**
 * Tell an owner or admin a customer wrote from their account on the
 * business's site (UX-014). Sent by the `customer-message.notify` job, once
 * per recipient, the way an enquiry's notice is: console fallback with no
 * SMTP, and the in-app notice stays the record. Every value is escaped in
 * the body (`actionEmail`); the subject is kept to one line.
 */
export function sendCustomerMessageNotificationEmail(
    to: string,
    details: {
        customerName: string;
        /** A short line of what they wrote. */
        message: string;
        threadUrl: string;
    },
): Promise<void> {
    const { customerName, message, threadUrl } = details;
    const name = customerName.replace(/[\r\n]+/g, " ").trim();
    if (!transporter) {
        console.info(
            `[Customer message] (no SMTP) ${to}: ${name} -> ${threadUrl}`,
        );
        return Promise.resolve();
    }
    void transporter.sendMail({
        from: FROM,
        to,
        subject: `${name} sent you a message`,
        html: actionEmail(
            `${name} sent you a message`,
            `${name} wrote from their account on your website: “${message}” They see your reply when they sign in there.`,
            threadUrl,
            "Read and reply",
        ),
    });
    return Promise.resolve();
}

/**
 * Marker prefix that stamps every self-test/preview email (S6-004). It is
 * applied to BOTH the subject and the top of the body so the message can never
 * be mistaken for production Organization delivery — a template preview goes
 * out via Saroh's OWN transactional transporter, addressed only to the
 * requesting user's own verified account email.
 */
export const SAROH_TEST_LABEL = "[Saroh test]";

/**
 * Send a Saroh self-test / template-preview email (S6-004).
 *
 * SECURITY: this helper deliberately has NO template/recipient business logic —
 * the caller (SelfTestService) hard-binds `to` to the authenticated user's own
 * verified account email and renders one of a fixed set of built-in preview
 * templates. Every message is loudly labeled `[Saroh test]` in the subject and
 * again at the head of the body so it is unmistakably a Saroh preview and never
 * a production Organization message. Console-fallback when no SMTP is
 * configured, mirroring the other `send*` helpers.
 */
export function sendSelfTestEmail(
    to: string,
    details: { templateLabel: string; html: string },
): Promise<void> {
    const { templateLabel, html } = details;
    const subject = `${SAROH_TEST_LABEL} ${templateLabel}`;
    const bodyHtml = `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
  <p style="background:#fffbe6;border:1px solid #f0d000;border-radius:6px;padding:8px 12px;color:#665500;font-size:13px;margin:0 0 16px">
    ${SAROH_TEST_LABEL} This is a Saroh preview email sent only to your own
    verified account address. It is not a real message from any business.
  </p>
  ${html}
</div>`;

    if (!transporter) {
        console.info(`[Saroh self-test] (no SMTP) ${to}: ${subject}`);
        return Promise.resolve();
    }
    void transporter.sendMail({
        from: FROM,
        to,
        subject,
        html: bodyHtml,
    });
    return Promise.resolve();
}

export function sendStoreInvitationEmail(
    to: string,
    acceptUrl: string,
    storeName: string,
): Promise<void> {
    if (!transporter) {
        console.info(
            `[Store invite] (no SMTP) ${to} -> ${storeName}: ${acceptUrl}`,
        );
        return Promise.resolve();
    }
    void transporter.sendMail({
        from: FROM,
        to,
        subject: `You've been invited to ${storeName} on Saroh`,
        html: actionEmail(
            `Join ${storeName}`,
            `You've been invited to collaborate on ${storeName}. Accept below to join the team.`,
            acceptUrl,
            "Accept invitation",
        ),
    });
    return Promise.resolve();
}

/**
 * Invite someone to an ORGANIZATION (#276) — the tenant root, not a store.
 *
 * The subject names the workspace because the recipient often knows the
 * business and has never heard of Saroh: an outside reviewer asked to look at
 * a client's site should not have to guess what the email is about.
 */
export function sendOrganizationInvitationEmail(
    to: string,
    acceptUrl: string,
    organizationName: string,
): Promise<void> {
    if (!transporter) {
        console.info(
            `[Workspace invite] (no SMTP) ${to} -> ${organizationName}: ${acceptUrl}`,
        );
        return Promise.resolve();
    }
    void transporter.sendMail({
        from: FROM,
        to,
        subject: `You've been invited to ${organizationName} on Saroh`,
        html: actionEmail(
            `Join ${organizationName}`,
            `You've been invited to work on ${organizationName} in Saroh. Accept below to join. The link expires in a week.`,
            acceptUrl,
            "Accept invitation",
        ),
    });
    return Promise.resolve();
}

/** Whether an email actually left, for a sender that has to know. */
export type EmailOutcome = "sent" | "not-configured" | "failed";

/**
 * The opening-day invite off the waitlist (marketing plan U31): "Your Saroh
 * invite", with a link that is the invitee's alone. Awaited and it says how
 * it went: the batch records an invite as sent
 * only once its email has left.
 *
 * With no SMTP it never leaves the process: where the fake transport is
 * allowed (development, or `SITE_CODES_EMAIL_FAKE` named off production,
 * `siteCodesFakeAllowed`), `log` prints it and counts it sent and `fail`
 * fails it; anywhere else nothing left. `businessName` is what the visitor
 * typed, so it is escaped. The email names no offer length or price: the
 * waitlist page says what the offer is.
 */
export async function sendWaitlistLaunchInviteEmail(
    to: string,
    details: { url: string; businessName: string | null; validDays: number },
): Promise<EmailOutcome> {
    const { url, businessName, validDays } = details;
    if (!transporter) {
        if (siteCodesFakeAllowed(declaredNodeEnv, env.SITE_CODES_EMAIL_FAKE)) {
            if (env.SITE_CODES_EMAIL_FAKE === "fail") return "failed";
            console.info(`[Saroh invite] (no SMTP) ${to}: ${url}`);
            return "sent";
        }
        return "not-configured";
    }
    try {
        await transporter.sendMail({
            from: FROM,
            to,
            subject: LAUNCH_INVITE_SUBJECT,
            html: launchInviteEmail(url, businessName, validDays),
        });
        return "sent";
    } catch {
        return "failed";
    }
}

export const LAUNCH_INVITE_SUBJECT = "Your Saroh invite";

/** The invite's body; every value in it is escaped. */
export function launchInviteEmail(
    url: string,
    businessName: string | null,
    validDays: number,
): string {
    const href = esc(url);
    const what = businessName ? esc(businessName) : "your business";
    return `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
  <h2>Saroh is open, and you're in</h2>
  <p>You joined the waitlist and we promised one email, on opening day. This is it.</p>
  <p>Create your account with this email address and set up ${what}. It starts on the launch offer from the waitlist page, and you add no payment details to begin.</p>
  <p><a href="${href}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;border-radius:6px">Set up ${what}</a></p>
  <p style="color:#666;font-size:12px">The link is yours alone: it works once, with this email address, for ${validDays} days. Or paste it: ${href}</p>
</div>`;
}

// ---------------------------------------------------------------------------
// Saroh's own billing mail (pricing catalogue U17)
// ---------------------------------------------------------------------------

/** One Saroh billing email: an invoice, a failed payment, a trial ending. */
export interface SarohBillingEmail {
    to: string[];
    subject: string;
    html: string;
    /** Where a reply goes (`SAROH_BILLING_EMAIL`), when set. */
    replyTo?: string | null;
    attachments?: { filename: string; content: Buffer }[];
}

/**
 * Send Saroh's own billing mail to a business (U17): Saroh billing the
 * business for its plan, from Saroh's identity transport. Awaited, and it
 * says how it went, because the `billing.email` job retries a failure and
 * records a send.
 *
 * With no SMTP it never reaches the network: the fake transport the code
 * email uses (`SITE_CODES_EMAIL_FAKE`, development by default) logs the
 * subject and how many it was for — never the addresses or the body — or
 * fails every send with `fail`. Anywhere else with no SMTP, nothing left.
 */
export async function sendSarohBillingEmail(
    email: SarohBillingEmail,
): Promise<EmailOutcome> {
    if (email.to.length === 0) return "not-configured";
    if (!transporter) {
        if (siteCodesFakeAllowed(declaredNodeEnv, env.SITE_CODES_EMAIL_FAKE)) {
            if (env.SITE_CODES_EMAIL_FAKE === "fail") return "failed";
            const files = email.attachments?.length ?? 0;
            console.info(
                `[Saroh billing] (no SMTP) ${email.subject} to ${email.to.length} recipient(s)${files ? `, ${files} attachment(s)` : ""}`,
            );
            return "sent";
        }
        return "not-configured";
    }
    try {
        await transporter.sendMail({
            from: FROM,
            to: email.to,
            ...(email.replyTo ? { replyTo: email.replyTo } : {}),
            subject: email.subject,
            html: email.html,
            attachments: email.attachments?.map((a) => ({
                filename: a.filename,
                content: a.content,
                contentType: "application/pdf",
            })),
        });
        return "sent";
    } catch {
        return "failed";
    }
}

/**
 * The link preview tool's report (resources plan U2, KTD-5), to the address
 * the visitor typed to unlock it: plain text, Saroh's own words and the
 * facts the API read itself — never text the caller sent. Awaited, so the
 * page can say whether a copy went. Without SMTP it prints only in
 * development (the fake transport); elsewhere nothing leaves.
 */
export async function sendLinkReportEmail(
    to: string,
    subject: string,
    text: string,
): Promise<EmailOutcome> {
    if (!transporter) {
        if (env.NODE_ENV === "development") {
            console.info(`[Link report] (no SMTP) ${to}: ${subject}`);
            return "sent";
        }
        return "not-configured";
    }
    try {
        await transporter.sendMail({ from: FROM, to, subject, text });
        return "sent";
    } catch {
        return "failed";
    }
}

/** Where the team reads what people write to Saroh (DEC-101). */
export const CONTACT_INBOX = "contact@saroh.in";

/**
 * Tells the team a message came in from saroh.in/contact (DEC-137; owner,
 * 11 Oct 2026). Only ever to Saroh's own inbox, so the form can't be used
 * to make Saroh write to a stranger. Plain text: the writer's words are
 * never read as markup. The subject is Saroh's own words and nothing the
 * writer typed, and a reply goes straight to the writer.
 *
 * The message is already stored when this is called, so a failure loses
 * nothing: the caller logs the outcome and answers the visitor as sent.
 * Without SMTP it prints the subject only in development; elsewhere
 * nothing leaves.
 */
export async function sendContactMessageNotice(notice: {
    /** Saroh's own words for the topic: "A question before signing up". */
    topic: string;
    name: string;
    email: string;
    /** What kind of business, in Saroh's words; absent when not given. */
    kind?: string;
    message: string;
}): Promise<EmailOutcome> {
    const subject = `New message from saroh.in: ${notice.topic}`;
    if (!transporter) {
        if (env.NODE_ENV === "development") {
            console.info(`[Contact message] (no SMTP) ${subject}`);
            return "sent";
        }
        return "not-configured";
    }
    const text = [
        `From: ${notice.name} <${notice.email}>`,
        `About: ${notice.topic}`,
        ...(notice.kind ? [`Business: ${notice.kind}`] : []),
        "",
        notice.message,
        "",
        "Reply to this email to answer them. The message is also in the admin console, under Messages.",
    ].join("\n");
    try {
        await transporter.sendMail({
            from: FROM,
            to: CONTACT_INBOX,
            replyTo: notice.email,
            subject,
            text,
        });
        return "sent";
    } catch {
        return "failed";
    }
}

// ---------------------------------------------------------------------------
// Site sign-in codes (ADR-011; round-2 plan A, A2)
// ---------------------------------------------------------------------------

/**
 * The code email's own sending address, on Saroh's identity domain and apart
 * from workspace sign-in mail, so a complaint about one merchant's codes
 * cannot hurt the workspace's delivery.
 */
const SITE_CODES_FROM_ADDRESS = env.SITE_CODES_EMAIL_FROM ?? "codes@saroh.in";

/**
 * The code email's own transport: its own SMTP credentials (its sending
 * stream) when `SITE_CODES_SMTP_*` are set, else the identity SMTP
 * credentials. Either way a transport of its own with short timeouts, so a
 * stuck provider answers inside the request and the caller can retry.
 */
/**
 * Whether the code stream's own SMTP connection starts in TLS (review M-3).
 * `SITE_CODES_SMTP_SECURE` says so outright; unset, the port decides: 465
 * is implicit TLS, anything else (587, 25, 2525) starts plain and upgrades
 * with STARTTLS. Never `SMTP_SECURE`: that belongs to the identity stream,
 * whose port may differ, and a TLS hello on 587 fails every send.
 */
export function siteCodesSmtpSecure(
    port: number,
    secure: string | undefined,
): boolean {
    if (secure === "true") return true;
    if (secure === "false") return false;
    return port === 465;
}

type SiteCodesSmtpEnv = IdentitySmtpEnv &
    Pick<
        typeof env,
        | "SITE_CODES_SMTP_HOST"
        | "SITE_CODES_SMTP_PORT"
        | "SITE_CODES_SMTP_USER"
        | "SITE_CODES_SMTP_PASS"
        | "SITE_CODES_SMTP_SECURE"
    >;

/**
 * How every pooled Saroh send connects (codes, a business's email). Codes
 * and booking emails come in bursts, and a send that finds a connection still
 * open skips the TLS and login round trips. An idle connection still closes
 * after `socketTimeout`, so a lone send opens a fresh one; two at most keeps
 * a burst from opening a crowd of them at the provider. The short timeouts
 * let a stuck provider fail inside the request or job, so it can retry.
 */
export const POOLED_SEND = {
    pool: true as const,
    maxConnections: 2,
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 10_000,
};

type IdentitySmtpEnv = Pick<
    typeof env,
    | "SMTP_HOST"
    | "SMTP_HOSTNAME"
    | "SMTP_PORT"
    | "SMTP_SECURE"
    | "SMTP_USER"
    | "SMTP_PASS"
    | "USER_ACCOUNT"
    | "USER_PASSWORD"
>;

/**
 * A pooled transport on the identity `SMTP_*` set (in production, SES;
 * DEC-085), connecting as the identity transport does, or null with no SMTP.
 * Each caller makes its own pool from it, so one stream's burst never queues
 * behind another's.
 */
export function identitySmtpOptions(source: IdentitySmtpEnv) {
    const host = source.SMTP_HOST ?? source.SMTP_HOSTNAME;
    const user = source.SMTP_USER ?? source.USER_ACCOUNT;
    const pass = source.SMTP_PASS ?? source.USER_PASSWORD;
    if (!host || !user || !pass) return null;
    return {
        host,
        port: source.SMTP_PORT ? Number(source.SMTP_PORT) : 465,
        secure: source.SMTP_SECURE !== "false",
        auth: { user, pass },
        ...POOLED_SEND,
    };
}

/** The code transport's settings: its own SMTP set, else the identity one. */
export function siteCodesTransportOptions(source: SiteCodesSmtpEnv) {
    if (source.SITE_CODES_SMTP_HOST === undefined) {
        return identitySmtpOptions(source);
    }
    const host = source.SITE_CODES_SMTP_HOST;
    const user = source.SITE_CODES_SMTP_USER;
    const pass = source.SITE_CODES_SMTP_PASS;
    if (!host || !user || !pass) return null;
    const port = source.SITE_CODES_SMTP_PORT
        ? Number(source.SITE_CODES_SMTP_PORT)
        : 465;
    return {
        host,
        port,
        secure: siteCodesSmtpSecure(port, source.SITE_CODES_SMTP_SECURE),
        auth: { user, pass },
        ...POOLED_SEND,
    };
}

function getSiteCodesTransporter(): Transporter | null {
    const options = siteCodesTransportOptions(env);
    return options ? nodemailer.createTransport(options) : null;
}

const siteCodesTransporter = getSiteCodesTransporter();

/**
 * Send a customer their sign-in code for a business's site.
 *
 * `businessName` must already be cleaned (`site-accounts/sender-name.ts`):
 * it goes into the display name ("‹Business› via Saroh") and the subject
 * ("Your code for ‹Business›"), and is escaped again here for the body.
 *
 * Awaited, and it says how it went, because a code that did not leave is a
 * booking that cannot be made: the caller retries and alerts. Nothing here
 * logs the address or the code outside development.
 *
 * With no SMTP, development prints the code (the fake transport) and leaves
 * it in the temp-directory outbox a local browser test reads
 * (`site-code-outbox.ts`), or fails every send when
 * `SITE_CODES_EMAIL_FAKE=fail`. Outside development the fake runs only when
 * `SITE_CODES_EMAIL_FAKE` names it, and never in production; anywhere else
 * nothing left.
 */
export async function sendSiteSignInCodeEmail(
    to: string,
    details: { code: string; businessName: string; minutes: number },
): Promise<EmailOutcome> {
    const { code, businessName, minutes } = details;
    if (!siteCodesTransporter) {
        // NODE_ENV as declared, not the schema's default (review A-4).
        if (siteCodesFakeAllowed(declaredNodeEnv, env.SITE_CODES_EMAIL_FAKE)) {
            if (env.SITE_CODES_EMAIL_FAKE === "fail") return "failed";
            console.info(
                `[Site sign-in code] (no SMTP) ${to} for ${businessName}: code ${code}`,
            );
            // Where a browser test on this machine picks it up (A9).
            writeSiteCodeOutbox(to, code);
            return "sent";
        }
        return "not-configured";
    }
    try {
        await siteCodesTransporter.sendMail({
            from: {
                name: codeSenderName(businessName),
                address: SITE_CODES_FROM_ADDRESS,
            },
            to,
            subject: codeSubject(businessName),
            html: siteCodeEmail(businessName, code, minutes),
        });
        return "sent";
    } catch {
        return "failed";
    }
}

/** The code email's body; every value in it is escaped. */
export function siteCodeEmail(
    businessName: string,
    code: string,
    minutes: number,
): string {
    const name = esc(businessName);
    return `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
  <h2>Your code for ${name}</h2>
  <p>Enter this code on ${name}'s website to confirm it's you.</p>
  <p style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:32px;font-weight:700;letter-spacing:8px;padding:16px 0">${esc(code)}</p>
  <p style="color:#666;font-size:12px">This code expires in ${minutes} minutes. If you didn't ask for it, you can ignore this email.</p>
  <p style="color:#666;font-size:12px">${name}'s website runs on Saroh. This address sends only sign-in codes, and a notice if your sign-in email changes.</p>
</div>`;
}

/**
 * Tell the old address its sign-in email for a business's site changed
 * (ADR-011, "the one other identity mail"; round-2 plan A, A5). From the
 * code stream's own sender, in the business's name, as the code is.
 *
 * Nothing in it names the new address: whoever reads the old inbox learns
 * that the change happened and whom to ask, not where the account went.
 * `businessName` must already be cleaned (`site-accounts/sender-name.ts`).
 * With no SMTP, development logs that it went (the code's fake transport);
 * `SITE_CODES_EMAIL_FAKE=fail` fails it.
 */
export async function sendSiteEmailChangedEmail(
    to: string,
    details: { businessName: string },
): Promise<EmailOutcome> {
    const { businessName } = details;
    if (!siteCodesTransporter) {
        if (siteCodesFakeAllowed(declaredNodeEnv, env.SITE_CODES_EMAIL_FAKE)) {
            if (env.SITE_CODES_EMAIL_FAKE === "fail") return "failed";
            console.info(
                `[Site sign-in email changed] (no SMTP) notice to ${to} for ${businessName}`,
            );
            return "sent";
        }
        return "not-configured";
    }
    try {
        await siteCodesTransporter.sendMail({
            from: {
                name: codeSenderName(businessName),
                address: SITE_CODES_FROM_ADDRESS,
            },
            to,
            subject: emailChangedSubject(businessName),
            html: siteEmailChangedEmail(businessName),
        });
        return "sent";
    } catch {
        return "failed";
    }
}

/** "Your sign-in email for ‹Business› changed". */
export function emailChangedSubject(businessName: string): string {
    return `Your sign-in email for ${businessName} changed`;
}

/** The notice's body; every value in it is escaped. */
export function siteEmailChangedEmail(businessName: string): string {
    const name = esc(businessName);
    return `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
  <h2>Your sign-in email changed</h2>
  <p>The email you use to sign in on ${name}'s website was changed to another address. This address won't sign you in there any more.</p>
  <p>If you didn't make this change, contact ${name} straight away.</p>
  <p style="color:#666;font-size:12px">${name}'s website runs on Saroh. This address sends only sign-in codes, and a notice like this one if your sign-in email changes.</p>
</div>`;
}

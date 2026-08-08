import type { Transporter } from "nodemailer";
import nodemailer from "nodemailer";

import { env } from "../env";

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
function actionEmail(heading: string, body: string, url: string, cta: string) {
    return `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
  <h2>${heading}</h2>
  <p>${body}</p>
  <p><a href="${url}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;border-radius:6px">${cta}</a></p>
  <p style="color:#666;font-size:12px">Or paste this link: ${url}</p>
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

const OTP_COPY: Record<
    VerificationOtpType,
    { subject: string; heading: string; body: string }
> = {
    "email-verification": {
        subject: "Your Saroh verification code",
        heading: "Verify your email",
        body: "Enter this code to finish setting up your Saroh account.",
    },
    "sign-in": {
        subject: "Your Saroh sign-in code",
        heading: "Sign in to Saroh",
        body: "Enter this code to sign in.",
    },
    "forget-password": {
        subject: "Your Saroh password reset code",
        heading: "Reset your password",
        body: "Enter this code to choose a new password.",
    },
    "change-email": {
        subject: "Your Saroh email change code",
        heading: "Confirm your new email",
        body: "Enter this code to confirm the change to your account's email address.",
    },
};

export type VerificationOtpType =
    | "sign-in"
    | "email-verification"
    | "forget-password"
    | "change-email";

/**
 * Deliver a one-time code. This is what a signing-up user actually receives —
 * the link sender below is no longer on the signup path (see the `emailOTP`
 * plugin config in @saroh/auth).
 *
 * The console fallback prints the code so local dev, which has no SMTP, can
 * still complete a signup.
 */
export function sendVerificationOtpEmail(
    to: string,
    otp: string,
    type: VerificationOtpType,
    expiresInSeconds: number,
): Promise<void> {
    const copy = OTP_COPY[type];
    const minutes = Math.max(1, Math.round(expiresInSeconds / 60));
    if (!transporter) {
        console.info(`[${copy.heading}] (no SMTP) ${to}: code ${otp}`);
        return Promise.resolve();
    }
    void transporter.sendMail({
        from: FROM,
        to,
        subject: copy.subject,
        html: codeEmail(copy.heading, copy.body, otp, minutes),
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
                "Confirm below if that was you. If it wasn't, ignore this email — nothing changes.",
            confirmUrl,
            "Confirm change",
        ),
    });
    return Promise.resolve();
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
                "If you didn't request this, ignore this email — nothing is deleted.",
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
    details: { contactName: string; formName: string; leadUrl: string },
): Promise<void> {
    const { contactName, formName, leadUrl } = details;
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
            `${contactName} submitted the "${formName}" form. Open the lead to follow up.`,
            leadUrl,
            "View lead",
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
    verified account address. It is not a production message from any Organization.
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

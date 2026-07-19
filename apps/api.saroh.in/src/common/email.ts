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

export function sendVerificationEmail(
    to: string,
    verifyUrl: string,
): Promise<void> {
    if (!transporter) {
        console.info(`[Verify email] (no SMTP) ${to}: ${verifyUrl}`);
        return Promise.resolve();
    }
    void transporter.sendMail({
        from: FROM,
        to,
        subject: "Verify your Saroh email",
        html: actionEmail(
            "Verify your email",
            "Confirm your email address to finish setting up your Saroh account.",
            verifyUrl,
            "Verify email",
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

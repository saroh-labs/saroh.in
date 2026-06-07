import nodemailer, { type Transporter } from "nodemailer";

const FROM =
    process.env.EMAIL_FROM ??
    process.env.SENDER_EMAIL_ID ??
    "Saroh <noreply@saroh.in>";

function getTransporter(): Transporter | null {
    const host = process.env.SMTP_HOST ?? process.env.SMTP_HOSTNAME;
    const port = process.env.SMTP_PORT;
    const user = process.env.SMTP_USER ?? process.env.USER_ACCOUNT;
    const pass = process.env.SMTP_PASS ?? process.env.USER_PASSWORD;

    if (host && user && pass) {
        return nodemailer.createTransport({
            host,
            port: port ? Number(port) : 465,
            secure: process.env.SMTP_SECURE !== "false",
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

export async function sendPasswordResetEmail(
    to: string,
    resetUrl: string,
): Promise<void> {
    if (!transporter) {
        console.log(`[Password reset] (no SMTP) ${to}: ${resetUrl}`);
        return;
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
}

export async function sendVerificationEmail(
    to: string,
    verifyUrl: string,
): Promise<void> {
    if (!transporter) {
        console.log(`[Verify email] (no SMTP) ${to}: ${verifyUrl}`);
        return;
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
}

export async function sendStoreInvitationEmail(
    to: string,
    acceptUrl: string,
    storeName: string,
): Promise<void> {
    if (!transporter) {
        console.log(
            `[Store invite] (no SMTP) ${to} -> ${storeName}: ${acceptUrl}`,
        );
        return;
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
}

import { render } from "@react-email/components";
import { PasswordResetEmail } from "@saroh/emails/emails/password-reset";
import { VerificationEmail } from "@saroh/emails/emails/verification-email";
import type { Transporter } from "nodemailer";
import nodemailer from "nodemailer";

const FROM = process.env.EMAIL_FROM ?? process.env.SENDER_EMAIL_ID ?? "Saroh <noreply@saroh.in>";

function getTransporter(): Transporter | null {
    // Prefer explicit SMTP config
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

    // Gmail-style (same as email.saroh.in)
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

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    if (!transporter) {
        console.log(`[Password reset] (no SMTP) ${to}: ${resetUrl}`);
        return;
    }
    const html = await render(PasswordResetEmail({ resetUrl, userEmail: to }));
    void transporter.sendMail({
        from: FROM,
        to,
        subject: "Reset your Saroh password",
        html,
    });
}

export async function sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
    if (!transporter) {
        console.log(`[Verify email] (no SMTP) ${to}: ${verifyUrl}`);
        return;
    }
    const html = await render(VerificationEmail({ verifyUrl, userEmail: to }));
    void transporter.sendMail({
        from: FROM,
        to,
        subject: "Verify your Saroh email",
        html,
    });
}

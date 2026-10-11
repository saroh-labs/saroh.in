/**
 * The welcome email (UX audit, 10 Oct): one email when a business is
 * created, to the person who created it. Before it, nothing was sent after
 * sign-up at all, so a new owner who closed the tab had no way back but
 * memory.
 *
 * Saroh speaking to its own user about their own business (DEC-011), so
 * Saroh sends it, from the identity sender the sign-in code comes from.
 * Sent once, by onboarding, which runs once for a business. Never to
 * someone invited into a business: they did not set it up, and their
 * invitation already told them where they are.
 *
 * Pure, so the words are tested without a transport. The business's name is
 * text its owner typed, so it is kept to one line for the subject and
 * escaped in the body.
 */

/** What setup's "What will you do first?" can answer (`organizations/dto.ts`). */
export type WelcomeGoal =
    "COMMERCE" | "APPOINTMENTS" | "WEBSITE" | "CRM" | "INVOICE";

export interface WelcomeMail {
    businessName: string;
    /** What they chose to do first; absent when they will decide later. */
    goal?: WelcomeGoal | null;
    /** The business in the workspace: where "Open ‹Business›" goes. */
    openUrl: string;
    /** Its web address, `‹address›.saroh.app`, for the website's line. */
    address?: string | null;
}

function esc(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/** One line, and not a long one: a name is tenant text. */
export function oneLine(name: string): string {
    return name.replace(/\s+/g, " ").trim().slice(0, 80);
}

/** The next step for the goal they chose, as the email's first line. */
export function welcomeNextStep(mail: WelcomeMail): string {
    switch (mail.goal) {
        case "COMMERCE":
            return "Next, add your first product. A name and a price are enough to start selling.";
        case "APPOINTMENTS":
            return "Next, add your first service, so people can book time with you.";
        case "WEBSITE":
            return mail.address
                ? `Next, publish your site. Nobody can see ${mail.address}.saroh.app until you do.`
                : "Next, publish your site. Nobody can see it until you do.";
        case "CRM":
            return "Next, add your first contact. Everyone you deal with goes in one list.";
        case "INVOICE":
            return "Next, send your first invoice.";
        default:
            return "Next, pick what to do first. Home has the choices.";
    }
}

export function welcomeSubject(businessName: string): string {
    return `${oneLine(businessName)} is set up on Saroh`;
}

/** The email: its subject, the next step, and one button. */
export function welcomeEmail(mail: WelcomeMail): {
    subject: string;
    html: string;
    cta: string;
} {
    const name = oneLine(mail.businessName);
    const subject = welcomeSubject(name);
    const cta = `Open ${name}`;
    const href = esc(mail.openUrl);
    const html = `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
  <h2>${esc(subject)}</h2>
  <p>${esc(welcomeNextStep(mail))}</p>
  <p><a href="${href}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;border-radius:6px">${esc(cta)}</a></p>
  <p style="color:#666;font-size:12px">You are getting this because you set up ${esc(name)} on Saroh with this email address. Sign in with a code sent here, at any time.</p>
</div>`;
    return { subject, html, cta };
}

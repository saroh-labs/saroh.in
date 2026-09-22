import { env } from "../../env";

/**
 * Where a customer opens an invoice's pay link: the merchant-site renderer's
 * own apex, `/pay/<token>` — no Site is tied to an invoice, so there is no
 * tenant host to choose (the review link's rule). Kept out of the service so
 * the modules that issue invoices do not load the app's env.
 */
export function payLinkUrl(token: string): string {
    const base =
        env.RENDERER_URL ??
        (env.NODE_ENV === "development"
            ? "https://saroh.app.localhost"
            : "https://saroh.app");
    return `${base.replace(/\/$/, "")}/pay/${token}`;
}

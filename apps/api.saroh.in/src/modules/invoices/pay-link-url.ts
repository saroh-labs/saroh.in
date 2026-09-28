import { env } from "../../env";

/**
 * Where a customer opens an invoice's pay link: the merchant-site renderer's
 * own apex, `/pay/<token>` — no Site is tied to an invoice, so there is no
 * tenant host to choose (the review link's rule). Kept out of the service so
 * the modules that issue invoices do not load the app's env.
 */
export function payLinkUrl(token: string): string {
    return `${rendererBase()}/pay/${token}`;
}

/**
 * Where a customer opens an order's pay link (plan B, B11): the same apex,
 * `/pay/o/<token>` — an order's page, not an invoice's.
 */
export function orderPayLinkUrl(token: string): string {
    return `${rendererBase()}/pay/o/${token}`;
}

function rendererBase(): string {
    const base =
        env.RENDERER_URL ??
        (env.NODE_ENV === "development"
            ? "https://saroh.app.localhost"
            : "https://saroh.app");
    return base.replace(/\/$/, "");
}

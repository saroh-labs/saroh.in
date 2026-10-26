import type { ComponentType, LazyExoticComponent } from "react";
import { lazy } from "react";

/**
 * Every free tool's component, by slug (#1253): one line per tool, loaded
 * only on its own page. A tool is a client component, default-exported from
 * `src/tools/<slug>/index.tsx`, that takes no props. Tools with their own
 * page in apps/saroh.in (`inApp: true`) are not here.
 *
 * Plain module (no "use client"), so the server can list the slugs for the
 * checks; `lazy` only records the import until `<ToolSlot>` draws it.
 */
export const TOOLS: Readonly<
    Record<string, LazyExoticComponent<ComponentType>>
> = {
    "bill-of-supply-generator": lazy(
        () => import("./bill-of-supply-generator"),
    ),
    "business-card-qr-generator": lazy(
        () => import("./business-card-qr-generator"),
    ),
    "cancellation-policy-generator": lazy(
        () => import("./cancellation-policy-generator"),
    ),
    "gift-voucher-maker": lazy(() => import("./gift-voucher-maker")),
    "gst-calculator": lazy(() => import("./gst-calculator")),
    "gst-invoice-generator": lazy(() => import("./gst-invoice-generator")),
    "link-in-bio-page-maker": lazy(() => import("./link-in-bio-page-maker")),
    "loyalty-card-maker": lazy(() => import("./loyalty-card-maker")),
    "menu-qr-code-generator": lazy(() => import("./menu-qr-code-generator")),
    "no-show-cost-calculator": lazy(() => import("./no-show-cost-calculator")),
    "quotation-maker": lazy(() => import("./quotation-maker")),
    "receipt-maker": lazy(() => import("./receipt-maker")),
    "refund-policy-generator": lazy(() => import("./refund-policy-generator")),
    "review-qr-code-generator": lazy(
        () => import("./review-qr-code-generator"),
    ),
    "salon-rate-card-maker": lazy(() => import("./salon-rate-card-maker")),
    "upi-qr-code-generator": lazy(() => import("./upi-qr-code-generator")),
    "whatsapp-link-generator": lazy(() => import("./whatsapp-link-generator")),
    "whatsapp-message-templates": lazy(
        () => import("./whatsapp-message-templates"),
    ),
    "wifi-qr-code-generator": lazy(() => import("./wifi-qr-code-generator")),
};

export const hasTool = (slug: string) => Object.keys(TOOLS).includes(slug);

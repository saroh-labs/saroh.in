import type { ComponentType, LazyExoticComponent } from "react";
import { lazy } from "react";

/** Free tools' components by slug, as `<ToolSlot>` draws them. */
export type ToolRegistry = Readonly<
    Record<string, LazyExoticComponent<ComponentType>>
>;

/**
 * Every free tool's component, by slug (#1253): one line per tool, loaded
 * only on its own page. A tool is a client component, default-exported from
 * `src/tools/<slug>/index.tsx`, that takes no props. Tools with their own
 * page in apps/saroh.in (`inApp: true`) are not here.
 *
 * Plain module (no "use client"), so the server can list the slugs for the
 * checks; `lazy` only records the import until `<ToolSlot>` draws it.
 * Admin draws from it (`EveryToolSlot`); saroh.in never imports it: its
 * build writes its own registry of the tools it carries (U3, plan
 * 2026-11-01-001), each through `@saroh/search-pages/tools/<slug>`.
 */
export const TOOLS: ToolRegistry = {
    "bill-of-supply-generator": lazy(
        () => import("./bill-of-supply-generator"),
    ),
    "break-even-calculator": lazy(() => import("./break-even-calculator")),
    "business-card-qr-generator": lazy(
        () => import("./business-card-qr-generator"),
    ),
    "cancellation-policy-generator": lazy(
        () => import("./cancellation-policy-generator"),
    ),
    "gift-voucher-maker": lazy(() => import("./gift-voucher-maker")),
    "gst-calculator": lazy(() => import("./gst-calculator")),
    "gst-invoice-generator": lazy(() => import("./gst-invoice-generator")),
    "gstin-checker": lazy(() => import("./gstin-checker")),
    "gym-membership-plan-calculator": lazy(
        () => import("./gym-membership-plan-calculator"),
    ),
    "hsn-sac-code-finder": lazy(() => import("./hsn-sac-code-finder")),
    "link-in-bio-page-maker": lazy(() => import("./link-in-bio-page-maker")),
    "loyalty-card-maker": lazy(() => import("./loyalty-card-maker")),
    "menu-qr-code-generator": lazy(() => import("./menu-qr-code-generator")),
    "no-show-cost-calculator": lazy(() => import("./no-show-cost-calculator")),
    "profit-margin-calculator": lazy(
        () => import("./profit-margin-calculator"),
    ),
    "quotation-maker": lazy(() => import("./quotation-maker")),
    "receipt-maker": lazy(() => import("./receipt-maker")),
    "refund-policy-generator": lazy(() => import("./refund-policy-generator")),
    "review-qr-code-generator": lazy(
        () => import("./review-qr-code-generator"),
    ),
    "salon-rate-card-maker": lazy(() => import("./salon-rate-card-maker")),
    "staff-commission-calculator": lazy(
        () => import("./staff-commission-calculator"),
    ),
    "upi-qr-code-generator": lazy(() => import("./upi-qr-code-generator")),
    "whatsapp-link-generator": lazy(() => import("./whatsapp-link-generator")),
    "whatsapp-message-templates": lazy(
        () => import("./whatsapp-message-templates"),
    ),
    "wifi-qr-code-generator": lazy(() => import("./wifi-qr-code-generator")),
};

export const hasTool = (slug: string) => Object.keys(TOOLS).includes(slug);

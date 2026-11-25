import { matchRoute } from "@/lib/query/live-routes";

/**
 * The workspace's routes on React Query (DEC-259), registered by route glob
 * in the unit that moves them: an exact path, `[param]` for one segment
 * (`/commerce/orders`, `/commerce/orders/[orderId]`). A registered route
 * reads every changeable value from a query and never `router.refresh()`es
 * (`pnpm check:rq-refresh`), unless it is a chrome entry
 * (`chrome-refresh.ts`).
 *
 * `RQ_DOMAINS` names the domains whose reads are on React Query: a
 * component may not import their `service` or `read` modules (the app's
 * ESLint config), and their actions' `revalidatePath` calls are listed.
 *
 * Read as text by the checks and the lint: keep both lists plain string
 * literals.
 */
export const RQ_ROUTES: readonly string[] = [
    "/",
    "/calendar",
    "/bookings",
    "/bookings/all",
    "/bookings/availability",
    "/bookings/[bookingId]",
    "/commerce/products",
    "/commerce/products/[productId]",
    "/commerce/products/categories",
    "/commerce/products/settings",
    "/commerce/orders",
    "/commerce/orders/[orderId]",
    "/commerce/orders/tickets",
    "/billing/invoices",
    "/billing/invoices/[invoiceId]",
    "/billing/invoices/new",
    "/billing/invoices/[invoiceId]/edit",
    "/commerce/customers",
    "/contacts/[contactId]",
    "/commerce/stock",
    "/settings/people",
    "/settings/profile",
    "/settings/organization",
    "/settings/modules",
    "/settings/integrations",
    "/settings/billing",
    "/settings/share",
    "/settings/data",
    "/settings/activity",
    "/settings/developers",
    "/settings/developers/ai",
    "/settings/developers/ask-ai",
    "/settings/developers/keys",
    "/settings/developers/webhooks",
    "/settings/developers/usage",
    "/notifications",
    "/commerce/discounts",
    "/commerce/discounts/[discountId]",
    "/contacts",
    "/leads",
    "/leads/[leadId]",
    "/pipeline",
    "/commerce/locations",
    "/billing/subscriptions",
    "/billing/subscriptions/[subscriptionId]",
    "/billing/plans/[planId]",
    "/billing/plans/[planId]/edit",
    "/billing/plans/new",
    "/class-packs",
    "/class-packs/purchases",
    "/class-packs/[packId]",
    "/class-packs/[packId]/edit",
    "/class-packs/new",
    "/social",
    "/courses",
    "/courses/[courseId]",
    "/courses/new",
    "/courses/[courseId]/edit",
    "/services",
    "/services/new",
    "/services/[serviceId]",
    "/sites",
    "/sites/new",
    "/sites/[siteId]/overview",
    "/sites/[siteId]/pages",
    "/sites/[siteId]/posts",
    "/sites/[siteId]/writing",
    "/sites/[siteId]/settings",
    "/sites/[siteId]/forms",
    "/sites/[siteId]/forms/[formId]",
    "/sites/[siteId]/reach/links",
    "/sites/[siteId]/versions",
    "/sites/[siteId]/versions/[publicationId]",
    "/sites/[siteId]/releases/[releaseId]",
    "/sites/[siteId]/publish-requests/[requestId]",
];

export const RQ_DOMAINS: readonly string[] = [
    "home",
    "calendar",
    "bookings",
    "products",
    "orders",
    "invoices",
    "customers",
    "stock",
    "settings",
    "notifications",
    "discounts",
    "contacts",
    "leads",
    "stores",
    "subscriptions",
    "collections",
    "product-reviews",
    "class-packs",
    "social",
    "courses",
    "modules",
    "providers",
    "api-keys",
    "ai-connections",
    "data-export",
    "webhooks",
    "qr",
];

/** Whether `pathname` is one of {@link RQ_ROUTES}. */
export function isRqRoute(pathname: string | null | undefined): boolean {
    return !!pathname && RQ_ROUTES.some((glob) => matchRoute(glob, pathname));
}

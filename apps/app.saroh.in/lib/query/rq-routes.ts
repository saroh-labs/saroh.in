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
    "/commerce/products",
    "/commerce/products/[productId]",
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
    "/social",
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
    "social",
];

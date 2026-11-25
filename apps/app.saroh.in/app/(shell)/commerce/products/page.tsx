import { PausedNote } from "@/components/billing/paused-banner";
import { PlanLimitNotice } from "@/components/billing/plan-limit-notice";
import { CatalogueContainer } from "@/components/stores/catalogue/catalogue-container";
import { ReviewsContainer } from "@/components/stores/reviews/reviews-container";
import { rowNotice } from "@/lib/billing/access";
import { planMeter } from "@/lib/billing/meter";
import { activeCut, pausedListWords } from "@/lib/billing/paused";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { rememberedPageSize } from "@/lib/paging/remembered";
import {
    canReadReviews as mayReadReviews,
    canWriteReviews as mayWriteReviews,
} from "@/lib/product-reviews/access";
import {
    canReadOrders,
    canStockProducts,
    canWriteProducts,
} from "@/lib/products/access";
import { listHref, readListQuery } from "@/lib/products/list-query";
import { billingAccessOrNull, pausedOrNull } from "@/lib/saroh-billing/service";
import { requireSession } from "@/lib/session";
import { stockTrackingOnce } from "@/lib/stock/service";
import { readSiteSelling } from "@/lib/stores/location-selling";
import { listBusinessStores } from "@/lib/stores/service";
import { listStorefronts } from "@/lib/stores/storefronts";
import { sinceParam } from "@/lib/views/since";

/**
 * Sell → Products: the business's catalogue, across every storefront
 * (#519, #520).
 *
 * The address says what the list shows (`?view=`, `?q=`, `?storefront=`,
 * `?status=`, `?category=`, `?collection=`, `?page=`, `?size=`, or
 * `?tab=reviews`); this reads the page it asks for. With no size in the
 * address the page is as long as this browser last chose. The catalogue read failing fails the page (its
 * error boundary) — never an empty catalogue. Reviews failing leaves the
 * list and says their count is unknown.
 *
 * On React Query (DEC-259), loaded in the browser: only the gates and the
 * facts that decide what is offered (the storefronts, Track stock, the
 * plan, what is paused, whether the shop is live) are decided here. The
 * list's page, the reviews, the categories and the collections are the
 * containers' queries, read from the browser into the screen's frame.
 */
export const metadata = { title: "Products" };

export default async function CataloguePage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    await requireSession();
    const [storefronts, params, organization] = await Promise.all([
        listStorefronts().catch(() => null),
        searchParams,
        resolveActiveOrganization(),
    ]);
    // The business's locations, as anyone who may read them sees them
    // (UX-027). The catalogue is the business's, read org-scoped; the
    // stores a person is on (`GET /stores`) left staff who aren't on one
    // with "No location yet" while Stock showed its products. Those are
    // asked for only when the business's own can't be read.
    const stores = (
        storefronts && storefronts.length > 0
            ? storefronts
            : await listBusinessStores()
    ).map(({ id, name }) => ({ id, name }));
    // From what the API resolved this person may do; the role's name only as
    // the fallback for a response that predates permissions.
    const may = (action: string) =>
        organization?.actions
            ? organization.actions.includes(action)
            : organization?.role === "OWNER" || organization?.role === "ADMIN";
    const canReadReviews = mayReadReviews(organization);
    const canWriteReviews = mayWriteReviews(organization);
    const onReviews = params.tab === "reviews" && canReadReviews;

    const [remembered, tracking] = await Promise.all([
        rememberedPageSize("catalogue"),
        stockTrackingOnce(),
    ]);
    const query = readListQuery(params, remembered);
    // A storefront that isn't this business's (or closed) is no filter.
    if (query.storefront && !stores.some((s) => s.id === query.storefront)) {
        query.storefront = null;
    }

    const showInventory = tracking?.tracked !== false;

    if (onReviews) {
        const review =
            typeof params.review === "string" ? params.review : undefined;
        // From Home's "Last 24 hours" (F6): the reviews left since then.
        const since = sinceParam(params);
        return (
            <ReviewsContainer
                canWrite={canWriteReviews}
                may={{
                    connect: may("comms:manage"),
                    plans: may("billing:read"),
                }}
                hrefs={{
                    all: listHref(query, { view: "all" }),
                    collections: listHref(query, { view: "collections" }),
                    inventory: listHref(query, { view: "inventory" }),
                    reviews: "/commerce/products?tab=reviews",
                }}
                showInventory={showInventory}
                hasStores={stores.length > 0}
                since={since ? since.toISOString() : null}
                initialReviewId={review}
            />
        );
    }

    const [access, paused, selling] = await Promise.all([
        // The plan's product limit, shown before the work (UX-036);
        // unread, nothing is shown and the API still refuses.
        billingAccessOrNull(),
        // What a lower plan paused (#800): the rows' tags and why.
        pausedOrNull(),
        // Whether the online shop is live: Archive's line says "your
        // website" only then. Unread, it claims neither.
        readSiteSelling(),
    ]);
    const canWrite = canWriteProducts(organization);
    const pausedCut = activeCut(paused, "products");

    return (
        <CatalogueContainer
            defaultSize={remembered}
            showInventory={showInventory}
            showReviews={canReadReviews}
            stores={stores}
            notice={
                <>
                    {pausedCut ? (
                        <PausedNote className="mb-3">
                            {pausedListWords(
                                "product",
                                paused?.products.count ?? 0,
                            )}
                        </PausedNote>
                    ) : null}
                    {/* With products paused (#800) the note above says
                            the limit and links to Plan and billing: the
                            "reached your limit" card would say it again. */}
                    {pausedCut ? null : <PlanLimitNotice moduleId="products" />}
                </>
            }
            canWrite={canWrite}
            meter={canWrite ? planMeter(access, "products") : null}
            // The banner below the tabs says the limit from 80%, or the
            // paused note does (#800); the header then doesn't say it
            // again (#874). New product stays off at the limit.
            limitBannerShown={
                rowNotice(access, "products").on || pausedCut !== null
            }
            pausedCut={pausedCut}
            sellsOnline={
                selling.known
                    ? Boolean(selling.site?.sellsFrom && selling.site.origin)
                    : null
            }
            canStock={canStockProducts(organization)}
            canOrders={canReadOrders(organization)}
        />
    );
}

import { rememberedPageSize } from "@/lib/paging/remembered";
import { PartialRead } from "@saroh/ui/failed-read";

import { PausedNote } from "@/components/billing/paused-banner";
import { PlanLimitNotice } from "@/components/billing/plan-limit-notice";
import { CollectionsPanel } from "@/components/commerce/collections/collections-panel";
import { SinceNotice } from "@/components/shared/notices/since-notice";
import { PageContainer } from "@/components/shared/page/page-container";
import { CatalogueContainer } from "@/components/stores/catalogue/catalogue-container";
import type { ProductsTab } from "@/components/stores/catalogue/products-tabs";
import { ProductsTabs } from "@/components/stores/catalogue/products-tabs";
import { ReviewsView } from "@/components/stores/reviews/reviews-view";
import { rowNotice } from "@/lib/billing/access";
import { planMeter } from "@/lib/billing/meter";
import { activeCut, pausedListWords } from "@/lib/billing/paused";
import { listCollections } from "@/lib/collections/service";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { reviewEmailNote } from "@/lib/product-reviews/describe";
import {
    invitableOrders,
    listReviews,
    reviewEmailSetup,
    reviewSummary,
} from "@/lib/product-reviews/service";
import {
    canReadOrders,
    canStockProducts,
    canWriteProducts,
} from "@/lib/products/access";
import { choicesFrom } from "@/lib/products/filter-choices";
import { listHref, readListQuery } from "@/lib/products/list-query";
import type { CataloguePage } from "@/lib/products/service";
import { listCataloguePage, listCategories } from "@/lib/products/service";
import { listOptionNames } from "@/lib/products/settings";
import { billingAccessOrNull, pausedOrNull } from "@/lib/saroh-billing/service";
import { requireSession } from "@/lib/session";
import { stockTrackingOnce } from "@/lib/stock/service";
import { readSiteSelling } from "@/lib/stores/location-selling";
import { listBusinessStores } from "@/lib/stores/service";
import { listStorefronts } from "@/lib/stores/storefronts";
import { isSince, sinceParam } from "@/lib/views/since";

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
 * On React Query (DEC-259), loaded in the browser: the gates and side reads
 * are decided here; the list's page (`/api/products`,
 * `lib/products/access.ts`) is `CatalogueContainer`'s query, read from the
 * browser into the screen's frame, drawn at once with its rows as
 * skeletons, and every later one in place.
 */
export const metadata = { title: "Products" };

const NO_PAGE: CataloguePage = {
    items: [],
    nextCursor: null,
    total: 0,
    pageSize: 50,
    counts: { all: 0, collections: 0, inventory: 0 },
    storefronts: { everywhere: 0, byStorefront: [] },
    needs: [],
};

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
    const canReadReviews = organization?.actions
        ? may("product-review:read")
        : organization?.role !== "REVIEWER";
    const canWriteReviews = may("product-review:write") && may("order:read");
    const onReviews = params.tab === "reviews" && canReadReviews;

    const remembered = await rememberedPageSize("catalogue");
    const query = readListQuery(params, remembered);
    // A storefront that isn't this business's (or closed) is no filter.
    if (query.storefront && !stores.some((s) => s.id === query.storefront)) {
        query.storefront = null;
    }

    const [
        page,
        reviews,
        tracking,
        categories,
        collections,
        access,
        paused,
        selling,
    ] = await Promise.all([
        // The Reviews view still counts the chips: one row will do. The
        // list's page is the container's, read in the browser.
        onReviews && stores.length > 0
            ? listCataloguePage({ limit: 1 }).then((p) => p ?? NO_PAGE)
            : NO_PAGE,
        canReadReviews ? listReviews().catch(() => null) : Promise.resolve([]),
        stockTrackingOnce(),
        // The Filter's choices and the Collections chip's cards (#524).
        // Either failing leaves its part out, said, never the list.
        listCategories().catch(() => null),
        listCollections().catch(() => null),
        // The plan's product limit, shown before the work (UX-036);
        // unread, nothing is shown and the API still refuses.
        billingAccessOrNull(),
        // What a lower plan paused (#800): the rows' tags and why.
        pausedOrNull(),
        // Whether the online shop is live: Archive's line says "your
        // website" only then. Unread, it claims neither.
        readSiteSelling(),
    ]);
    // Named only while the list is narrowed to one (Settings › Options' count).
    const options = query.option
        ? await listOptionNames().catch(() => null)
        : undefined;
    const choices = choicesFrom(categories, collections, options);

    const active: ProductsTab = onReviews
        ? "reviews"
        : query.view === "collections" || query.view === "inventory"
          ? query.view
          : "all";
    // Reviews' own tabs; the list's are drawn from its query.
    const counts = page.counts;
    const tabs = (
        <ProductsTabs
            active={active}
            counts={{
                all: counts.all,
                collections: counts.collections,
                inventory: counts.inventory,
                reviews: reviews ? reviews.length : null,
            }}
            hrefs={{
                all: listHref(query, { view: "all" }),
                collections: listHref(query, { view: "collections" }),
                inventory: listHref(query, { view: "inventory" }),
                reviews: "/commerce/products?tab=reviews",
            }}
            showInventory={tracking?.tracked !== false}
            showReviews={canReadReviews}
        />
    );
    const notice =
        reviews === null ? (
            <PartialRead
                things="reviews"
                so="Their count can't be shown. It is not zero."
            />
        ) : null;

    if (onReviews) {
        const [invitable, emailSetup] = canWriteReviews
            ? await Promise.all([
                  invitableOrders().catch(() => []),
                  reviewEmailSetup().catch(() => null),
              ])
            : [[], null];
        // Invitations go only through the business's own email (D11).
        const emailNote = reviewEmailNote(emailSetup, {
            connect: may("comms:manage"),
            plans: may("billing:read"),
        });
        const review =
            typeof params.review === "string" ? params.review : undefined;
        // From Home's "Last 24 hours" (F6): the reviews left since then.
        const since = sinceParam(params);
        const shown = (reviews ?? []).filter((r) =>
            isSince(r.createdAt, since),
        );
        return (
            <PageContainer width="full">
                <ReviewsView
                    reviews={shown}
                    invitable={invitable}
                    canWrite={canWriteReviews}
                    emailNote={emailNote}
                    tabs={
                        since ? (
                            <>
                                {tabs}
                                <div className="mt-4">
                                    <SinceNotice
                                        count={shown.length}
                                        noun={{
                                            one: "review",
                                            other: "reviews",
                                        }}
                                        verb="left"
                                        clearHref="/commerce/products?tab=reviews"
                                    />
                                </div>
                            </>
                        ) : (
                            tabs
                        )
                    }
                    initialReviewId={review}
                />
            </PageContainer>
        );
    }

    const ratings = canReadReviews ? await reviewSummary().catch(() => []) : [];
    const canWrite = canWriteProducts(organization);
    const pausedCut = activeCut(paused, "products");

    return (
        <CatalogueContainer
            defaultSize={remembered}
            reviewsCount={reviews ? reviews.length : null}
            showInventory={tracking?.tracked !== false}
            showReviews={canReadReviews}
            stores={stores}
            notice={
                <>
                    {notice}
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
            ratings={ratings}
            choices={choices}
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
            collectionCount={collections ? collections.length : null}
            collectionsPanel={
                active === "collections" ? (
                    <CollectionsPanel
                        collections={collections}
                        categories={categories ?? []}
                        canWrite={canWrite}
                        activeId={query.collection}
                        hrefs={Object.fromEntries(
                            (collections ?? []).map((c) => [
                                c.id,
                                listHref(query, { collection: c.id }),
                            ]),
                        )}
                        clearHref={listHref(query, {
                            collection: null,
                        })}
                        openNew={params.new === "collection"}
                        closeNewHref={listHref(query)}
                    />
                ) : null
            }
        />
    );
}

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { PageHeader } from "@saroh/ui/page-header";
import { Camera, ExternalLink } from "lucide-react";
import Link from "next/link";

import { QrButton } from "@/components/qr/qr-button";
import { ViewerDate } from "@/components/shared/dates/viewer-date";
import { formatMoneyMajor } from "@/lib/format/money";
import { productEditHref, productHref } from "@/lib/products/links";
import type { ProductOverview } from "@/lib/products/overview";
import { priceLabel } from "@/lib/products/overview-rules";
import { whereItSells } from "@/lib/products/overview-words";
import { Notice } from "@saroh/ui/notice";

import { PhoneShopMenu } from "./phone-shop-menu";
import { ProductActions } from "./product-actions";

export const STATUS_BADGE = {
    PUBLISHED: { label: "Live", variant: "success" },
    DRAFT: { label: "Draft", variant: "draft" },
    ARCHIVED: { label: "Archived", variant: "neutral" },
} as const;

const FOCUS =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * Why "View on the shop" is off, said beside it (and in the phone's menu):
 * null when it opens, and for an archived or paused product, whose banner
 * or note under the header already says so — there it isn't offered.
 */
export function shopNote(
    status: ProductOverview["product"]["status"],
    shopUrl: string | null,
    paused: boolean,
): string | null {
    if (shopUrl || paused || status === "ARCHIVED") return null;
    return status === "PUBLISHED"
        ? "Its shop page opens once your online shop is live."
        : "Publish it first. A draft has no public page.";
}

/**
 * Before the header's button (#522): why the shop's page can't open yet,
 * the Team / Customer switch, its QR and "View on the shop".
 */
function ShopControls({
    overview,
    storeId,
    view,
    shopUrl = null,
    paused,
}: {
    overview: ProductOverview;
    storeId: string;
    view: "team" | "customer";
    /** Its page on the live online shop (`shopProductUrl`); null when none. */
    shopUrl?: string | null;
    paused: boolean;
}) {
    const { product } = overview;
    const note = shopNote(product.status, shopUrl, paused);
    return (
        <>
            {note ? (
                <span
                    id="shop-link-why"
                    role="status"
                    className="max-w-[300px] text-pretty text-[12px] text-muted-foreground"
                >
                    {note}
                </span>
            ) : null}
            <div
                role="group"
                aria-label="View as"
                className="flex rounded-lg bg-muted p-0.5"
            >
                {(["team", "customer"] as const).map((v) => (
                    <Link
                        key={v}
                        href={`${productHref(storeId, product.id)}${v === "customer" ? "&view=customer" : ""}`}
                        scroll={false}
                        aria-current={view === v ? "page" : undefined}
                        className={cn(
                            FOCUS,
                            "flex items-center rounded-md px-2.5 py-1 text-[12px] font-semibold coarse:min-h-11",
                            view === v
                                ? "bg-card text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {v === "team" ? "Team" : "Customer"} view
                    </Link>
                ))}
            </div>
            {shopUrl ? (
                // Its page is live, so a code for it has somewhere to go.
                <QrButton
                    compact="always"
                    variant="ghost"
                    className="size-7 rounded-[7px]"
                    link={{
                        mode: "saved",
                        kind: "PRODUCT",
                        ref: product.id,
                        url: shopUrl,
                        what: product.name,
                        from: "Product page",
                    }}
                />
            ) : null}
            {shopUrl ? (
                // Live on the shop (UX-082): open it as customers see it.
                <Button
                    size="xs"
                    asChild
                    variant="ghost"
                    className="gap-1.5 font-medium"
                >
                    <a
                        href={shopUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="View on the shop, opens in a new tab"
                    >
                        View on the shop
                        <ExternalLink aria-hidden className="size-3" />
                    </a>
                </Button>
            ) : note ? (
                // Off, with its reason beside it: no ↗, as it opens nothing.
                <Button
                    size="xs"
                    type="button"
                    variant="ghost"
                    disabled
                    aria-describedby="shop-link-why"
                    className="font-medium"
                >
                    View on the shop
                </Button>
            ) : null}
        </>
    );
}

/**
 * The product's page header: "Sell › Products › ‹name›", then who this
 * product is at a glance (#522): its cover — which opens Photos —
 * its name and saved status, then one line: what it sells for, its
 * category, where it sells and when it last changed. Its buttons follow
 * its state (`ProductActions`): Publish, Edit product or Sell again, and a
 * ⋯ menu. On a phone: the name, its state and one ⋯ for the shop page
 * and the Customer view; the buttons dock at the foot.
 */
export function ProductHeader({
    overview,
    storeId,
    photosHref,
    paused = false,
    view,
    shopUrl = null,
}: {
    overview: ProductOverview;
    storeId: string;
    photosHref: string;
    view: "team" | "customer";
    /** Its page on the live online shop (`shopProductUrl`); null when none. */
    shopUrl?: string | null;
    /**
     * Past the plan's products limit (#800): hidden from the site and
     * read-only. The note under the header says why.
     */
    paused?: boolean;
}) {
    const { product, price } = overview;
    const money = (amount: string) =>
        formatMoneyMajor(amount, product.currency);
    // Paused (#800) is the state customers meet: it replaces Live.
    const status = paused
        ? ({ label: "Paused", variant: "warning" } as const)
        : STATUS_BADGE[product.status];
    const places = product.storefronts ?? [];
    // The cover is the first photo; a video never stands in for it.
    const cover = product.images.find((i) => i.kind !== "video");
    const where = whereItSells(
        product.status,
        (product.storefronts ?? []).map((s) => s.name),
    );
    const meta = [
        priceLabel(price, money),
        product.category?.name ?? "no category",
        where,
    ].join(" · ");

    return (
        <div className="border-b border-border px-4 pb-4 pt-5 sm:px-[22px]">
            <PageHeader
                holdsData
                className="mb-0"
                breadcrumb={[
                    "Sell",
                    <Link key="list" href="/commerce/products">
                        Products
                    </Link>,
                    product.name,
                ]}
                title={product.name}
                badge={
                    <>
                        <Badge variant={status.variant} size="sm">
                            {status.label}
                        </Badge>
                        <PhoneShopMenu
                            productId={product.id}
                            storeId={storeId}
                            view={view}
                            shopUrl={shopUrl}
                            note={shopNote(product.status, shopUrl, paused)}
                        />
                    </>
                }
                description={
                    <p className="text-pretty text-[13px] tabular-nums text-muted-foreground">
                        {meta} · Changed{" "}
                        <ViewerDate
                            iso={overview.lastChanged}
                            variant="dayMonth"
                        />
                    </p>
                }
                meta={
                    // A phone has these in the ⋯ beside the state instead.
                    <div className="contents max-sm:hidden">
                        <ShopControls
                            overview={overview}
                            storeId={storeId}
                            view={view}
                            shopUrl={shopUrl}
                            paused={paused}
                        />
                    </div>
                }
                actions={
                    overview.canWrite ? (
                        <ProductActions
                            product={product}
                            storeId={storeId}
                            editHref={productEditHref(storeId, product.id)}
                            deleteFrom={
                                places.length > 1
                                    ? "every location that sells it"
                                    : (places[0]?.name ??
                                      overview.storefront.name)
                            }
                        />
                    ) : undefined
                }
                lead={
                    cover ? (
                        <Link
                            href={photosHref}
                            scroll={false}
                            aria-label="Cover photo, open Photos"
                            className={cn(
                                FOCUS,
                                "block size-14 shrink-0 overflow-hidden rounded-xl bg-muted",
                            )}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element -- a tenant's own photos, outside next/image's allowlist */}
                            <img
                                src={cover.url}
                                alt=""
                                className="size-full object-cover"
                            />
                        </Link>
                    ) : !overview.canWrite ? (
                        // Nothing to add for a role that can't: a plain tile.
                        <div
                            aria-hidden
                            className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"
                        >
                            <Camera className="size-[18px]" />
                        </div>
                    ) : (
                        <Link
                            href={photosHref}
                            scroll={false}
                            aria-label="Add a photo"
                            className={cn(
                                FOCUS,
                                "flex size-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-border-strong bg-muted/60 text-[10.5px] font-semibold text-muted-foreground hover:bg-muted",
                            )}
                        >
                            <Camera aria-hidden className="size-[18px]" />
                            Add
                        </Link>
                    )
                }
            />
        </div>
    );
}

/** For anyone who can't change the product: what they can do, and who can. */
export function AccessLine({ line }: { line: string }) {
    return <Notice layout="banner">{line}</Notice>;
}

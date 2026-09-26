"use client";

import { cn } from "@saroh/ui/lib/utils";
import { showError, showSuccess } from "@saroh/ui/toast";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { useLeaveGuard } from "@/components/sites/use-leave-guard";
import { currencySymbol } from "@/lib/format/money";
import { createProduct } from "@/lib/products/actions";
import { readOnlyBanner, sectionJumps } from "@/lib/products/editor-labels";
import type { SectionKey } from "@/lib/products/editor-sections";
import {
    partitionSections,
    saveHint,
    SECTION_ORDER,
} from "@/lib/products/editor-sections";
import { productEditHref } from "@/lib/products/links";
import type { ProductListingView } from "@/lib/products/listing-changes";
import type {
    ProductDetail,
    ProductOptionView,
    ProductStatus,
} from "@/lib/products/service";
import type { EffectiveDefaults } from "@/lib/products/settings";
import { effectiveDefaults } from "@/lib/products/settings-actions";
import { trackingControl } from "@/lib/products/tracking";

import { BasicsSection } from "./basics-section";
import type { CategoryChoice } from "./category-picker";
import { DescriptionSection } from "./description-section";
import { DetailsSection } from "./details-section";
import {
    LeaveDialog,
    NextSteps,
    ReadOnlyNote,
    StatusPill,
} from "./editor-parts";
import { ProductEditorProvider, useEditor } from "./editor-state";
import { MadeBySection } from "./made-by-section";
import { PhotosSection } from "./photos-section";
import { StockSection } from "./stock-section";
import { VariantsSection } from "./variants-section";
import { VisibilitySection } from "./visibility-section";

export interface ProductEditorProps {
    product: ProductDetail | null;
    storeId: string;
    storeName: string;
    currency: string;
    categories: CategoryChoice[];
    categoriesHref: string;
    options: ProductOptionView[];
    canWrite: boolean;
    /**
     * May count and move stock (`inventory:write`): without `canWrite`, a
     * stock-only role changes the Stock section alone and sees Track stock
     * locked (#525).
     */
    canStock: boolean;
    /** The viewer's role as the business names it, for the read-only note. */
    viewerRole: string;
    /** The business's open storefronts; "Sell it at" shows with more than one. */
    stores: { id: string; name: string }[];
    /** Where the product is sold, per storefront; null when not read. */
    listings: ProductListingView[] | null;
    /** The business's Track stock switch (#515); off, no Stock section. */
    businessTracks: boolean;
    /** Settings → SKUs, and this product's number for {N}. */
    sku: { pattern: string; suggest: boolean; n: number };
    /** Settings → Allergens; empty for a shop that sells no food. */
    allergens: { id: string; name: string }[];
    /**
     * Settings → Defaults for the product's category (All products while
     * creating one); null when they could not be read.
     */
    defaults: EffectiveDefaults | null;
}

const PRODUCTS_HREF = "/commerce/products";

/**
 * The full product editor (editor v2, #468 and #469). Every part of a
 * product on one page, each part saved on its own — the product, its
 * variants and its stock are different calls, so one Save pretending they
 * were one act let a bad variant block a price fix. Save all stays in the
 * header for several sections edited at once: it saves the ones that are
 * ready and names the ones that are not.
 *
 * Creating asks for a name and a price and nothing else. Variants and stock
 * are saved against the product, so they open here the moment it exists.
 */
export function ProductEditorV2(props: ProductEditorProps) {
    return (
        <ProductEditorProvider
            mode={props.product ? "edit" : "create"}
            canWrite={props.canWrite}
            canStock={props.canStock}
            sellsFood={props.allergens.length > 0}
        >
            <EditorBody {...props} />
        </ProductEditorProvider>
    );
}

function EditorBody({
    product,
    storeId,
    storeName,
    currency,
    categories,
    categoriesHref,
    options,
    canWrite,
    canStock,
    viewerRole,
    stores,
    listings,
    businessTracks,
    sku,
    allergens,
    defaults: initialDefaults,
}: ProductEditorProps) {
    const router = useRouter();
    const {
        mode,
        names,
        states,
        saving,
        saveSections,
        collectAll,
        afterCreateAll,
    } = useEditor();
    // A stock-only role changes the Stock section and nothing else.
    const canEdit = canWrite || canStock;
    const jumpNames = sectionJumps(allergens.length > 0);
    const creating = mode === "create";
    const symbol = currencySymbol(currency);
    const [createStatus, setCreateStatus] = useState<ProductStatus>("DRAFT");
    const [creatingNow, setCreatingNow] = useState(false);
    const [leaving, setLeaving] = useState(false);
    // Creating: what the chosen category starts a product with. Sections
    // take it for the fields the merchant hasn't touched.
    const [defaults, setDefaults] = useState(initialDefaults);
    const categoryAsked = useRef("");

    async function categoryChanged(categoryId: string) {
        if (!creating) return;
        categoryAsked.current = categoryId;
        const next = await effectiveDefaults(categoryId || null).catch(
            () => null,
        );
        // Only the latest pick counts; a slower earlier answer is dropped.
        if (next && categoryAsked.current === categoryId) setDefaults(next);
    }

    const dirty = SECTION_ORDER.filter((k) => states[k]?.dirty);
    const problems = Object.fromEntries(
        SECTION_ORDER.map((k) => [k, states[k]?.problem ?? ""]),
    ) as Record<SectionKey, string>;
    const { savable, stuck } = partitionSections(dirty, problems);

    // Creating: a name and a price, and nothing anywhere that needs a fix.
    const missing = creating ? (states.basics?.missing ?? "") : "";
    const createBad = SECTION_ORDER.some((k) => problems[k]);
    const firstBad = SECTION_ORDER.map((k) => problems[k]).find(Boolean) ?? "";

    useLeaveGuard(canEdit && dirty.length > 0 && !creatingNow);

    async function create() {
        if (!canWrite || createBad || creatingNow) return;
        setCreatingNow(true);
        const input = collectAll();
        let res: Awaited<ReturnType<typeof createProduct>>;
        try {
            res = await createProduct(storeId, {
                ...input,
                name: input.name ?? "",
                price: input.price ?? "",
                currency,
                status: createStatus,
            });
        } catch {
            setCreatingNow(false);
            showError(
                "Couldn't create it — the connection dropped. Everything you entered is still here.",
            );
            return;
        }
        if (!res.ok) {
            setCreatingNow(false);
            showError(res.error);
            return;
        }
        const photosOk = await afterCreateAll(res.data.id);
        showSuccess(
            `${
                createStatus === "PUBLISHED"
                    ? "Created and live on the shop."
                    : "Created as a draft."
            } Add variants and stock on the right if it needs them.${
                photosOk ? "" : " The photos didn't save — add them again."
            }`,
        );
        router.replace(productEditHref(storeId, res.data.id));
    }

    const hint = creating
        ? createBad
            ? missing
                ? `Add ${missing} to create it.`
                : firstBad
            : createStatus === "PUBLISHED"
              ? "Goes live as soon as it is created."
              : "It will be created as a draft — only the team will see it."
        : saveHint(dirty, stuck, names);
    const showHeaderSave = canWrite && (creating || dirty.length > 1);
    const headerOff = creating
        ? createBad || creatingNow
        : savable.length === 0 || saving.length > 0;

    const jumps = SECTION_ORDER.filter(
        (k) =>
            !(creating && (k === "variants" || k === "stock")) &&
            // The business doesn't track stock: nothing to count (#515).
            !(k === "stock" && !businessTracks),
    );

    return (
        <main className="w-full pb-8">
            {/* One sticky block, so the jumps stay under the header however
                many lines the header wraps to on a phone. */}
            <div className="sticky top-[61px] z-20 bg-background">
                <div className="flex flex-wrap items-center gap-2 border-b border-border px-3.5 py-[9px]">
                    <Link
                        href={PRODUCTS_HREF}
                        onClick={(e) => {
                            if (canEdit && dirty.length > 0) {
                                e.preventDefault();
                                setLeaving(true);
                            }
                        }}
                        className="flex items-center gap-[7px] rounded-[8px] px-[9px] py-1.5 text-[12.5px] text-foreground/75 hover:bg-muted hover:text-foreground"
                    >
                        <ChevronLeft
                            aria-hidden
                            className="size-[15px]"
                            strokeWidth={2}
                        />
                        Products
                    </Link>
                    <span
                        aria-hidden
                        className="text-[15px] text-muted-foreground"
                    >
                        /
                    </span>
                    <span className="min-w-0 truncate text-[13.5px] font-semibold">
                        {creating
                            ? "New product"
                            : product?.name.trim()
                              ? product.name
                              : "Untitled product"}
                    </span>
                    <StatusPill status={product?.status ?? null} />
                    <div className="ml-auto flex flex-wrap items-center gap-2.5 max-[480px]:ml-0">
                        <span
                            role="status"
                            className={cn(
                                "max-w-[340px] text-pretty text-[12px]",
                                creating && createBad && !missing
                                    ? "text-destructive"
                                    : "text-muted-foreground",
                            )}
                        >
                            {hint}
                        </span>
                        {showHeaderSave ? (
                            <button
                                type="button"
                                disabled={headerOff}
                                onClick={() =>
                                    creating
                                        ? void create()
                                        : void saveSections(savable)
                                }
                                className="h-[34px] rounded-[9px] bg-foreground px-3.5 text-[12.5px] font-semibold text-background hover:bg-foreground/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground coarse:h-11"
                            >
                                {creating
                                    ? creatingNow
                                        ? "Creating…"
                                        : createStatus === "PUBLISHED"
                                          ? "Create and publish"
                                          : "Create draft"
                                    : saving.length > 0
                                      ? "Saving…"
                                      : "Save all"}
                            </button>
                        ) : null}
                    </div>
                </div>

                {!canWrite ? (
                    <ReadOnlyNote>
                        {readOnlyBanner(viewerRole, canStock)}
                    </ReadOnlyNote>
                ) : null}

                <nav
                    aria-label="Sections"
                    className="flex flex-wrap gap-1 border-b border-border px-4 py-2 max-[760px]:flex-nowrap max-[760px]:overflow-x-auto"
                >
                    {jumps.map((k) => (
                        <a
                            key={k}
                            href={`#sec-${k}`}
                            className="inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12px] text-foreground/75 hover:bg-muted hover:text-foreground coarse:h-11"
                        >
                            {jumpNames[k]}
                            {!creating && dirty.includes(k) ? (
                                <span
                                    aria-label={
                                        problems[k] ? "needs a fix" : "unsaved"
                                    }
                                    className={cn(
                                        "size-[7px] rounded-full",
                                        problems[k]
                                            ? "bg-destructive"
                                            : "bg-highlight",
                                    )}
                                />
                            ) : null}
                        </a>
                    ))}
                </nav>
            </div>

            <div className="flex flex-wrap items-stretch max-[760px]:flex-col">
                <div className="flex min-w-0 flex-[1_1_440px] flex-col gap-4 px-5 pb-[30px] pt-5 max-[480px]:px-4">
                    <BasicsSection
                        product={product}
                        storeId={storeId}
                        currency={currency}
                        symbol={symbol}
                        categories={categories}
                        manageCategoriesHref={categoriesHref}
                        onCategoryChange={(id) => void categoryChanged(id)}
                    />
                    <DescriptionSection product={product} storeId={storeId} />
                    <DetailsSection
                        product={product}
                        storeId={storeId}
                        allergens={allergens}
                        defaults={defaults}
                    />
                    <MadeBySection
                        product={product}
                        storeId={storeId}
                        storeName={storeName}
                        defaults={defaults}
                    />
                    <PhotosSection product={product} />
                </div>
                <div className="flex min-w-[300px] flex-[1_1_380px] flex-col gap-4 border-l border-border px-5 pb-[30px] pt-5 max-[760px]:min-w-0 max-[760px]:border-l-0 max-[760px]:border-t max-[480px]:px-4">
                    <VisibilitySection
                        product={product}
                        storeId={storeId}
                        value={createStatus}
                        onChange={setCreateStatus}
                    />
                    {product ? (
                        <>
                            <VariantsSection
                                product={product}
                                storeId={storeId}
                                symbol={symbol}
                                options={options}
                                sku={sku}
                                stores={stores}
                                listings={listings}
                            />
                            {businessTracks ? (
                                <StockSection
                                    product={product}
                                    storeId={storeId}
                                    countedAt={
                                        stores.length > 1 ? storeName : null
                                    }
                                    defaultWarn={
                                        defaults?.lowStockAlert ?? null
                                    }
                                    control={trackingControl({
                                        canWrite,
                                        canStock,
                                    })}
                                />
                            ) : null}
                        </>
                    ) : (
                        <NextSteps />
                    )}
                </div>
            </div>

            <LeaveDialog
                open={leaving}
                onOpenChange={setLeaving}
                href={PRODUCTS_HREF}
                creating={creating}
                sections={dirty.map((k) => names[k])}
            />
        </main>
    );
}

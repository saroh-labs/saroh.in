"use client";

import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
} from "@saroh/ui/alert-dialog";
import { cn } from "@saroh/ui/lib/utils";
import { showError, showSuccess } from "@saroh/ui/toast";
import { ChevronLeft, Lock } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { useLeaveGuard } from "@/components/sites/use-leave-guard";
import { currencySymbol } from "@/lib/format/money";
import { createProduct } from "@/lib/products/actions";
import type { SectionKey } from "@/lib/products/editor-sections";
import {
    joinAnd,
    partitionSections,
    saveHint,
    SECTION_JUMPS,
    SECTION_NAMES,
    SECTION_ORDER,
} from "@/lib/products/editor-sections";
import { productEditHref } from "@/lib/products/links";
import type {
    ProductDetail,
    ProductOptionView,
    ProductStatus,
} from "@/lib/products/service";
import type { EffectiveDefaults } from "@/lib/products/settings";
import { effectiveDefaults } from "@/lib/products/settings-actions";

import { BasicsSection } from "./basics-section";
import type { CategoryChoice } from "./category-picker";
import { DescriptionSection } from "./description-section";
import { DetailsSection } from "./details-section";
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
    sku,
    allergens,
    defaults: initialDefaults,
}: ProductEditorProps) {
    const router = useRouter();
    const { mode, states, saving, saveSections, collectAll, afterCreateAll } =
        useEditor();
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
        const next = await effectiveDefaults(storeId, categoryId || null).catch(
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

    useLeaveGuard(canWrite && dirty.length > 0 && !creatingNow);

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
        : saveHint(dirty, stuck);
    const showHeaderSave = canWrite && (creating || dirty.length > 1);
    const headerOff = creating
        ? createBad || creatingNow
        : savable.length === 0 || saving.length > 0;

    const statusPill = product?.status;
    const jumps = SECTION_ORDER.filter(
        (k) => !(creating && (k === "variants" || k === "stock")),
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
                            if (canWrite && dirty.length > 0) {
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
                    {statusPill ? (
                        <span
                            className={cn(
                                "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em]",
                                statusPill === "PUBLISHED"
                                    ? "bg-success-subtle text-success-subtle-foreground"
                                    : statusPill === "DRAFT"
                                      ? "bg-brand-subtle text-brand-subtle-foreground"
                                      : "bg-muted text-foreground/75",
                            )}
                        >
                            {statusPill === "PUBLISHED"
                                ? "Published"
                                : statusPill === "DRAFT"
                                  ? "Draft"
                                  : "Archived"}
                        </span>
                    ) : (
                        <span className="shrink-0 rounded-full border border-dashed border-border-strong px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                            Not created yet
                        </span>
                    )}
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
                    <div
                        role="note"
                        className="flex items-start gap-[9px] border-b border-border bg-brand-subtle px-[18px] py-2.5"
                    >
                        <Lock
                            aria-hidden
                            className="mt-px size-[15px] shrink-0 text-brand"
                            strokeWidth={1.9}
                        />
                        <span className="text-pretty text-[12.5px] leading-[1.5] text-brand-subtle-foreground">
                            You can read this product but not change it — an
                            owner or admin can change your role in Team.
                        </span>
                    </div>
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
                            {SECTION_JUMPS[k]}
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
                    <PhotosSection product={product} storeId={storeId} />
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
                            />
                            <StockSection
                                product={product}
                                storeId={storeId}
                                defaultWarn={defaults?.lowStockAlert ?? null}
                            />
                        </>
                    ) : (
                        <NextSteps />
                    )}
                </div>
            </div>

            <AlertDialog open={leaving} onOpenChange={setLeaving}>
                <AlertDialogContent className="max-w-[380px] rounded-[14px] px-[22px] py-5">
                    <AlertDialogTitle className="font-display text-[17px] font-semibold tracking-[-0.02em]">
                        {creating
                            ? "Leave without creating it?"
                            : "Leave with unsaved changes?"}
                    </AlertDialogTitle>
                    <AlertDialogDescription className="mt-[7px] text-pretty text-[13px] leading-[1.55] text-foreground/75">
                        {creating
                            ? "Nothing you have entered is kept."
                            : `Unsaved changes in ${joinAnd(
                                  dirty.map((k) => SECTION_NAMES[k]),
                              )} will be lost.`}
                    </AlertDialogDescription>
                    <div className="mt-[18px] flex flex-wrap justify-end gap-2">
                        <Link
                            href={PRODUCTS_HREF}
                            className="inline-flex h-[34px] items-center rounded-[9px] border border-border px-[13px] text-[12.5px] font-semibold text-destructive hover:bg-destructive-subtle"
                        >
                            Leave without saving
                        </Link>
                        <button
                            type="button"
                            autoFocus
                            onClick={() => setLeaving(false)}
                            className="h-[34px] rounded-[9px] bg-foreground px-3.5 text-[12.5px] font-semibold text-background hover:bg-foreground/90"
                        >
                            Stay
                        </button>
                    </div>
                </AlertDialogContent>
            </AlertDialog>
        </main>
    );
}

/** While creating: what opens once the product exists, and that it stays here. */
function NextSteps() {
    return (
        <section
            aria-label="After you create it"
            className="rounded-[12px] border border-dashed border-border-strong px-[18px] py-[15px]"
        >
            <h2 className="font-display text-[15px] font-semibold tracking-[-0.015em]">
                Next: variants and stock
            </h2>
            <p className="mt-1.5 text-pretty text-[12.5px] leading-[1.55] text-foreground/75">
                Both are saved against the product, so they open here the moment
                it is created. You stay on this page.
            </p>
            <ol className="mt-[13px] flex flex-col gap-[9px]">
                <li className="flex items-start gap-2.5">
                    <span className="mt-px shrink-0 font-mono text-[11px] text-muted-foreground/80">
                        1
                    </span>
                    <span className="text-pretty text-[12.5px] leading-[1.5] text-muted-foreground">
                        <strong className="font-semibold text-foreground/75">
                            Variants
                        </strong>{" "}
                        — one per size, shade or colour. Each starts at the
                        product&apos;s price, and can have its own.
                    </span>
                </li>
                <li className="flex items-start gap-2.5">
                    <span className="mt-px shrink-0 font-mono text-[11px] text-muted-foreground/80">
                        2
                    </span>
                    <span className="text-pretty text-[12.5px] leading-[1.5] text-muted-foreground">
                        <strong className="font-semibold text-foreground/75">
                            Stock
                        </strong>{" "}
                        — how many you have, and when to warn you. With
                        variants, each keeps its own count.
                    </span>
                </li>
            </ol>
        </section>
    );
}

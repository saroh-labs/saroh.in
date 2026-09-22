"use client";

import { Button } from "@saroh/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import { PageHeader } from "@saroh/ui/page-header";
import { Textarea } from "@saroh/ui/textarea";
import { showError, showSuccess, showUndo } from "@saroh/ui/toast";
import { MoreHorizontal, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { OptionSelect } from "@/components/shared/option-select";
import { MediaPicker } from "@/components/sites/media-picker";
import { useLeaveGuard } from "@/components/sites/use-leave-guard";
import { formatMoneyMajor } from "@/lib/format/money";
import {
    createProduct,
    createVariant,
    deleteProduct,
    deleteVariant,
    setInventory,
    updateProduct,
    updateVariant,
} from "@/lib/products/actions";
import { productHref } from "@/lib/products/links";
import type {
    Category,
    ProductDetail,
    ProductStatus,
    Variant,
} from "@/lib/products/service";

/**
 * One product, on one page — after the "Saroh Product Editor" design.
 *
 * The main column is what the product IS (name, price, status, category,
 * description, picture); the aside is what it is sold AS (variants) and how
 * many there are (inventory). The design rebuilt this against the real form
 * and DTO, and three of its findings shape the controls:
 *
 * - Category is one value, not several — `categoryId` is a single id or null.
 * - A variant's price is optional, and blank is an instruction: inherit the
 *   product's price. It is not an empty field.
 * - On hand is the merchant's to set; reserved belongs to Orders and is shown
 *   as a figure, never a field, because editing it would lose an order.
 *
 * ONE SAVE for the page. The old form had three buttons — product, stock and
 * each variant — and a merchant who changed the price and the stock and
 * pressed the first lost the second without being told. Variants are the
 * exception: each is its own record, added and removed where it is listed,
 * and removing one takes undo rather than a confirm.
 */

const STATUS_OPTIONS: { value: ProductStatus; label: string }[] = [
    { value: "DRAFT", label: "Draft" },
    { value: "PUBLISHED", label: "Published" },
    { value: "ARCHIVED", label: "Archived" },
];

const STATUS_BADGE = {
    DRAFT: "draft",
    PUBLISHED: "success",
    ARCHIVED: "neutral",
} as const;

/** Currencies offered for a product; the storefront's own is always first. */
const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD"];

interface Fields {
    name: string;
    slug: string;
    price: string;
    currency: string;
    status: ProductStatus;
    categoryId: string;
    description: string;
    image: string;
    onHand: string;
    lowStock: string;
}

function initialFields(
    product: ProductDetail | undefined,
    storeCurrency: string,
): Fields {
    return {
        name: product?.name ?? "",
        slug: product?.slug ?? "",
        price: product?.price ?? "",
        currency: product?.currency ?? storeCurrency,
        status: product?.status ?? "DRAFT",
        categoryId: product?.categoryId ?? "",
        description: product?.description ?? "",
        image: product?.image ?? "",
        onHand: String(product?.inventory?.quantity ?? 0),
        lowStock: String(product?.inventory?.lowStockAlert ?? 10),
    };
}

/** What the API takes for a product, from the page's fields. */
function toInput(f: Fields) {
    return {
        name: f.name.trim(),
        price: f.price.trim(),
        currency: f.currency,
        status: f.status,
        categoryId: f.categoryId || null,
        description: f.description.trim() || null,
        image: f.image.trim() || null,
        ...(f.slug.trim() ? { slug: f.slug.trim() } : {}),
    };
}

/** A decimal amount the API will take: digits, and up to two after a point. */
function isAmount(value: string): boolean {
    return /^\d+(\.\d{1,2})?$/.test(value.trim());
}

export function ProductEditor({
    storeId,
    storeName,
    storeCurrency,
    categories,
    categoriesHref,
    product,
}: {
    storeId: string;
    storeName: string;
    /** The storefront's currency: what a new product is priced in. */
    storeCurrency: string;
    categories: Category[];
    categoriesHref: string;
    /** Absent when making one. */
    product?: ProductDetail;
}) {
    const router = useRouter();
    const editing = Boolean(product);
    const [saved, setSaved] = useState(() =>
        initialFields(product, storeCurrency),
    );
    const [fields, setFields] = useState(saved);
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [errors, setErrors] = useState<Partial<Record<keyof Fields, string>>>(
        {},
    );

    const dirty = (Object.keys(fields) as (keyof Fields)[]).some(
        (k) => fields[k] !== saved[k],
    );
    useLeaveGuard(dirty);

    const set = <K extends keyof Fields>(key: K, value: Fields[K]) => {
        setFields((f) => ({ ...f, [key]: value }));
        setErrors((e) => ({ ...e, [key]: undefined }));
    };

    const stockChanged =
        fields.onHand !== saved.onHand || fields.lowStock !== saved.lowStock;

    function validate(): boolean {
        const next: typeof errors = {};
        if (!fields.name.trim()) next.name = "A product needs a name.";
        if (!isAmount(fields.price)) {
            next.price = "A price in numbers, like 1250 or 19.99.";
        }
        if (!/^\d+$/.test(fields.onHand.trim())) {
            next.onHand = "A whole number.";
        }
        if (!/^\d+$/.test(fields.lowStock.trim())) {
            next.lowStock = "A whole number.";
        }
        setErrors(next);
        return Object.keys(next).length === 0;
    }

    async function save() {
        if (!validate()) return;
        setSaving(true);
        const input = toInput(fields);
        const res = product
            ? await updateProduct(storeId, product.id, input)
            : await createProduct(storeId, input);
        if (!res.ok) {
            setSaving(false);
            if (res.field === "name" || res.field === "slug") {
                setErrors((e) => ({ ...e, [res.field as string]: res.error }));
            } else if (res.field === "price") {
                setErrors((e) => ({ ...e, price: res.error }));
            } else {
                showError(res.error);
            }
            return;
        }
        const id = product?.id ?? res.data.id;
        // Stock is its own record. A new product always writes it, so the
        // numbers typed before the first save are not silently dropped.
        if (!product || stockChanged) {
            const stock = await setInventory(storeId, id, {
                quantity: Number(fields.onHand),
                lowStockAlert: Number(fields.lowStock),
            });
            if (!stock.ok) {
                setSaving(false);
                showError(
                    product
                        ? "The product was saved, but its stock was not."
                        : "The product was made, but its stock was not saved.",
                    stock.error,
                );
                if (!product) router.push(productHref(storeId, id));
                return;
            }
        }
        setSaving(false);
        setSaved(fields);
        if (product) {
            showSuccess("Saved");
            router.refresh();
        } else {
            showSuccess(`${input.name} is in your catalogue`);
            router.push(productHref(storeId, id));
        }
    }

    async function remove() {
        if (!product) return;
        const res = await deleteProduct(storeId, product.id);
        if (!res.ok) {
            showError(res.error);
            return;
        }
        // Nothing left to protect: leave without the unsaved-changes prompt.
        setSaved(fields);
        showSuccess(`${product.name} deleted`);
        router.push("/commerce/products");
    }

    async function archive() {
        if (!product) return;
        const was = saved.status;
        // From what was last saved, so archiving never carries unsaved
        // edits along with it.
        const res = await updateProduct(storeId, product.id, {
            ...toInput(saved),
            status: "ARCHIVED",
        });
        if (!res.ok) {
            showError(res.error);
            return;
        }
        setSaved((s) => ({ ...s, status: "ARCHIVED" }));
        setFields((f) => ({ ...f, status: "ARCHIVED" }));
        router.refresh();
        showUndo(`${product.name} archived`, () => {
            void updateProduct(storeId, product.id, {
                ...toInput(saved),
                status: was,
            }).then((r) => {
                if (!r.ok) return showError(r.error);
                setSaved((s) => ({ ...s, status: was }));
                setFields((f) => ({ ...f, status: was }));
                router.refresh();
            });
        });
    }

    const variantCount = product?.variants.length ?? 0;
    const savedName = product?.name ?? "New product";
    const title = fields.name.trim() || savedName;

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                className="mb-0"
                breadcrumb={[
                    "Sell",
                    <Link
                        key="products"
                        href="/commerce/products"
                        className="hover:text-foreground"
                    >
                        Products
                    </Link>,
                    savedName,
                ]}
                title={title}
                description={
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        {editing ? (
                            <span className={badgeClass(saved.status)}>
                                {statusLabel(saved.status)}
                            </span>
                        ) : null}
                        <span>
                            {storeName}
                            {editing
                                ? ` · ${variantCount === 0 ? "sold as itself" : variantCount === 1 ? "1 variant" : `${variantCount} variants`}`
                                : ""}
                        </span>
                    </span>
                }
                actions={
                    <>
                        {product ? (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        aria-label={`More actions for ${product.name}`}
                                    >
                                        <MoreHorizontal className="size-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    {saved.status !== "ARCHIVED" ? (
                                        <DropdownMenuItem
                                            onSelect={() => void archive()}
                                        >
                                            Archive
                                        </DropdownMenuItem>
                                    ) : null}
                                    <DropdownMenuItem
                                        className="text-destructive focus:text-destructive"
                                        onSelect={() => setConfirmDelete(true)}
                                    >
                                        Delete
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        ) : null}
                        <Button
                            onClick={() => void save()}
                            disabled={saving || (editing && !dirty)}
                        >
                            {saving
                                ? "Saving…"
                                : editing
                                  ? "Save changes"
                                  : "Create product"}
                        </Button>
                    </>
                }
            />

            <div className="grid overflow-hidden rounded-[16px] border border-border lg:grid-cols-[minmax(0,1fr)_380px]">
                <div className="bg-card p-5 sm:p-[26px]">
                    <div className="flex max-w-[620px] flex-col gap-[18px]">
                        <Field
                            label="Name"
                            error={errors.name}
                            note="What customers see on the storefront and on their receipt."
                        >
                            {(id, describedBy) => (
                                <Input
                                    id={id}
                                    aria-describedby={describedBy}
                                    aria-invalid={Boolean(errors.name)}
                                    value={fields.name}
                                    maxLength={200}
                                    onChange={(e) =>
                                        set("name", e.target.value)
                                    }
                                />
                            )}
                        </Field>

                        <Field
                            label="Address"
                            error={errors.slug}
                            note={
                                editing
                                    ? "The product's part of its web address. Changing it breaks links people have saved."
                                    : "Leave it empty and it follows the name."
                            }
                        >
                            {(id, describedBy) => (
                                <div className="flex items-center gap-2 rounded-[9px] bg-muted/60 px-[13px] py-[9px]">
                                    <span
                                        aria-hidden
                                        className="font-mono text-[12px] text-muted-foreground"
                                    >
                                        /products/
                                    </span>
                                    <Input
                                        id={id}
                                        aria-describedby={describedBy}
                                        value={fields.slug}
                                        placeholder={slugify(fields.name)}
                                        className="h-8 flex-1 font-mono text-[12.5px]"
                                        onChange={(e) =>
                                            set("slug", e.target.value)
                                        }
                                    />
                                </div>
                            )}
                        </Field>

                        <div className="grid gap-[14px] sm:grid-cols-[2fr_1fr]">
                            <Field
                                label="Price"
                                error={errors.price}
                                note={
                                    isAmount(fields.price)
                                        ? `Sold for ${formatMoneyMajor(fields.price, fields.currency) ?? fields.price}.`
                                        : "Before tax and delivery."
                                }
                            >
                                {(id, describedBy) => (
                                    <Input
                                        id={id}
                                        inputMode="decimal"
                                        placeholder="1250"
                                        aria-describedby={describedBy}
                                        aria-invalid={Boolean(errors.price)}
                                        value={fields.price}
                                        className="tabular-nums"
                                        onChange={(e) =>
                                            set("price", e.target.value)
                                        }
                                    />
                                )}
                            </Field>
                            <Field
                                label="Currency"
                                note={
                                    fields.currency === storeCurrency
                                        ? `${storeName}'s currency.`
                                        : `${storeName} charges in ${storeCurrency}.`
                                }
                                warn={fields.currency !== storeCurrency}
                            >
                                {(id, describedBy) => (
                                    <OptionSelect
                                        id={id}
                                        aria-describedby={describedBy}
                                        value={fields.currency}
                                        onValueChange={(v) =>
                                            set("currency", v)
                                        }
                                        options={currencyOptions(
                                            storeCurrency,
                                            fields.currency,
                                        )}
                                    />
                                )}
                            </Field>
                        </div>

                        <div className="grid gap-[14px] sm:grid-cols-2">
                            <Field
                                label="Status"
                                note={statusNote(fields.status, storeName)}
                            >
                                {(id, describedBy) => (
                                    <OptionSelect
                                        id={id}
                                        aria-describedby={describedBy}
                                        value={fields.status}
                                        onValueChange={(v) => set("status", v)}
                                        options={STATUS_OPTIONS}
                                    />
                                )}
                            </Field>
                            <Field
                                label="Category"
                                note={
                                    <>
                                        One per product.{" "}
                                        <Link
                                            href={categoriesHref}
                                            className="font-medium text-foreground underline-offset-4 hover:underline"
                                        >
                                            Manage categories
                                        </Link>
                                    </>
                                }
                            >
                                {(id, describedBy) => (
                                    <OptionSelect
                                        id={id}
                                        aria-describedby={describedBy}
                                        value={fields.categoryId}
                                        onValueChange={(v) =>
                                            set("categoryId", v)
                                        }
                                        options={[
                                            {
                                                value: "",
                                                label: "Uncategorized",
                                            },
                                            ...categories.map((c) => ({
                                                value: c.id,
                                                label: c.name,
                                            })),
                                        ]}
                                    />
                                )}
                            </Field>
                        </div>

                        <Field
                            label="Description"
                            note="What it is, what it is made of, what it fits. Shown under the name."
                        >
                            {(id, describedBy) => (
                                <Textarea
                                    id={id}
                                    aria-describedby={describedBy}
                                    rows={5}
                                    value={fields.description}
                                    onChange={(e) =>
                                        set("description", e.target.value)
                                    }
                                />
                            )}
                        </Field>

                        <Picture
                            value={fields.image}
                            name={fields.name}
                            onChange={(v) => set("image", v)}
                        />
                    </div>
                </div>

                <aside className="flex flex-col gap-5 border-t border-border bg-background p-5 sm:p-[22px] lg:border-l lg:border-t-0">
                    <Variants
                        storeId={storeId}
                        product={product}
                        currency={fields.currency}
                        productPrice={fields.price}
                    />
                    <div className="h-px bg-border" />
                    <section aria-labelledby="inventory-heading">
                        <h2
                            id="inventory-heading"
                            className="mb-[11px] text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
                        >
                            Inventory
                        </h2>
                        <div className="flex flex-wrap items-start gap-3">
                            <SmallField
                                label="On hand"
                                error={errors.onHand}
                                value={fields.onHand}
                                onChange={(v) => set("onHand", v)}
                            />
                            <SmallField
                                label="Low-stock alert"
                                error={errors.lowStock}
                                value={fields.lowStock}
                                onChange={(v) => set("lowStock", v)}
                            />
                            <div className="min-w-0 flex-1 pt-[19px]">
                                <div className="font-display text-[15px] font-semibold tabular-nums">
                                    {product?.inventory?.reserved ?? 0}
                                </div>
                                <div className="text-[11.5px] text-muted-foreground">
                                    reserved
                                </div>
                            </div>
                        </div>
                        <p className="mt-[9px] text-pretty text-[11.5px] leading-[1.5] text-muted-foreground">
                            Reserved is stock already promised to an order, so
                            only Orders moves it.
                        </p>
                        {isLow(fields) ? (
                            <p className="mt-2.5 flex items-start gap-[9px] rounded-[9px] bg-warning-subtle px-3 py-2.5 text-[12px] leading-[1.5] text-warning-subtle-foreground">
                                <TriangleAlert
                                    aria-hidden
                                    className="mt-0.5 size-3.5 shrink-0"
                                />
                                {Number(fields.onHand) === 0
                                    ? "None on hand. The products list marks it out of stock."
                                    : `At or under the alert of ${fields.lowStock}, so the products list marks it low.`}
                            </p>
                        ) : null}
                    </section>
                </aside>
            </div>

            {product ? (
                <ConfirmDialog
                    open={confirmDelete}
                    onOpenChange={setConfirmDelete}
                    title={`Delete ${product.name}?`}
                    description={`It comes out of the catalogue and off ${storeName}, and this cannot be undone. A product someone has ordered cannot be deleted at all — archive it instead, and it leaves the storefront with its order history kept.`}
                    confirmLabel="Delete product"
                    onConfirm={() => void remove()}
                />
            ) : null}
        </div>
    );
}

function statusLabel(status: ProductStatus): string {
    return STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

function badgeClass(status: ProductStatus): string {
    // A span with the badge's own classes: it sits inside PageHeader's
    // description paragraph, where `<Badge>` (a div) cannot.
    const tone = {
        draft: "bg-brand-subtle text-brand-subtle-foreground",
        success: "bg-success-subtle text-success-subtle-foreground",
        neutral: "bg-muted text-neutral-600 dark:text-muted-foreground",
    }[STATUS_BADGE[status]];
    return cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        tone,
    );
}

function statusNote(status: ProductStatus, storeName: string): string {
    if (status === "DRAFT") return "Your team can see it. Customers cannot.";
    if (status === "PUBLISHED") return `On sale at ${storeName}.`;
    return "Off sale and out of the list customers see. Past orders keep it.";
}

function currencyOptions(storeCurrency: string, current: string) {
    const list = [
        storeCurrency,
        current,
        ...CURRENCIES.filter((c) => c !== storeCurrency && c !== current),
    ];
    return list
        .filter((c, i) => list.indexOf(c) === i)
        .map((c) => ({ value: c, label: c }));
}

function isLow(fields: Fields): boolean {
    const onHand = Number(fields.onHand);
    const alert = Number(fields.lowStock);
    return (
        /^\d+$/.test(fields.onHand) &&
        /^\d+$/.test(fields.lowStock) &&
        onHand <= alert
    );
}

function slugify(name: string): string {
    return (
        name
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "") || "your-product"
    );
}

/** A labelled field with a note under it that turns into the error. */
function Field({
    label,
    note,
    error,
    warn,
    children,
}: {
    label: string;
    note?: React.ReactNode;
    error?: string;
    warn?: boolean;
    children: (id: string, describedBy: string) => React.ReactNode;
}) {
    const id = useId();
    const noteId = `${id}-note`;
    return (
        <div className="min-w-0">
            <Label
                htmlFor={id}
                className="mb-1.5 block text-[12.5px] font-medium"
            >
                {label}
            </Label>
            {children(id, noteId)}
            {error || note ? (
                <p
                    id={noteId}
                    className={cn(
                        "mt-1.5 text-pretty text-[11.5px] leading-[1.5]",
                        error
                            ? "text-destructive"
                            : warn
                              ? "text-warning-subtle-foreground"
                              : "text-muted-foreground",
                    )}
                >
                    {error ?? note}
                </p>
            ) : null}
        </div>
    );
}

function SmallField({
    label,
    value,
    onChange,
    error,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    error?: string;
}) {
    const id = useId();
    return (
        <div className="w-[108px] min-w-[92px]">
            <Label
                htmlFor={id}
                className="mb-1 block text-[11.5px] font-normal text-neutral-600 dark:text-muted-foreground"
            >
                {label}
            </Label>
            <Input
                id={id}
                inputMode="numeric"
                value={value}
                aria-invalid={Boolean(error)}
                className="tabular-nums"
                onChange={(e) => onChange(e.target.value)}
            />
            {error ? (
                <p className="mt-1 text-[11.5px] text-destructive">{error}</p>
            ) : null}
        </div>
    );
}

/**
 * The product's picture: upload one, or give an address. The same picker the
 * website editor uses, so a photo from the phone takes the same route
 * everywhere.
 */
function Picture({
    value,
    name,
    onChange,
}: {
    value: string;
    name: string;
    onChange: (value: string) => void;
}) {
    const urlId = useId();
    const [broken, setBroken] = useState(false);
    const valid = value === "" || /^https?:\/\//i.test(value.trim());
    return (
        <div>
            <div className="mb-1.5 text-[12.5px] font-medium">Picture</div>
            {value && valid ? (
                <div className="mb-2.5 flex flex-wrap items-start gap-[14px] rounded-[10px] border border-border bg-card p-[13px]">
                    {broken ? (
                        <div className="grid size-24 shrink-0 place-items-center rounded-[8px] bg-muted font-display text-[22px] font-semibold text-muted-foreground">
                            {(name.trim().charAt(0) || "?").toUpperCase()}
                        </div>
                    ) : (
                        // eslint-disable-next-line @next/next/no-img-element -- a tenant's own storage, outside next/image's allowlist
                        <img
                            src={value}
                            alt=""
                            className="size-24 shrink-0 rounded-[8px] object-cover"
                            onError={() => setBroken(true)}
                            onLoad={() => setBroken(false)}
                        />
                    )}
                    <div className="min-w-0 flex-[1_1_180px]">
                        <div className="truncate font-mono text-[11.5px] text-muted-foreground">
                            {value}
                        </div>
                        {broken ? (
                            <p className="mt-1.5 text-[11.5px] text-warning-subtle-foreground">
                                This address does not load as a picture.
                            </p>
                        ) : null}
                        <div className="mt-2.5 flex flex-wrap gap-[7px]">
                            <MediaPicker
                                label="Replace"
                                onPick={(img) => onChange(img.src)}
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => onChange("")}
                            >
                                Remove
                            </Button>
                        </div>
                    </div>
                </div>
            ) : (
                <MediaPicker
                    label="Choose a photo"
                    onPick={(img) => onChange(img.src)}
                />
            )}
            <div className="mt-2.5 flex flex-wrap items-center gap-[9px]">
                <Label
                    htmlFor={urlId}
                    className="shrink-0 font-mono text-[11px] font-normal text-muted-foreground"
                >
                    or address
                </Label>
                <Input
                    id={urlId}
                    value={value}
                    placeholder="https://"
                    aria-invalid={!valid}
                    className="h-8 min-w-0 flex-1 font-mono text-[12px]"
                    onChange={(e) => {
                        setBroken(false);
                        onChange(e.target.value);
                    }}
                />
            </div>
            {!valid ? (
                <p className="mt-1.5 text-[11.5px] text-destructive">
                    It has to start with http:// or https://.
                </p>
            ) : null}
        </div>
    );
}

/**
 * What the product is sold as. Each variant is its own record, so it is added,
 * changed and removed here, straight away — not held for the page's Save.
 */
function Variants({
    storeId,
    product,
    currency,
    productPrice,
}: {
    storeId: string;
    product?: ProductDetail;
    currency: string;
    productPrice: string;
}) {
    const router = useRouter();
    const [sku, setSku] = useState("");
    const [title, setTitle] = useState("");
    const [price, setPrice] = useState("");
    const [adding, setAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const skuId = useId();
    const titleId = useId();
    const priceId = useId();

    const money = (p: string | null) =>
        p === null || p === ""
            ? `inherits ${formatMoneyMajor(productPrice, currency) ?? "the product's price"}`
            : (formatMoneyMajor(p, currency) ?? p);

    async function add(e: React.FormEvent) {
        e.preventDefault();
        if (!product) return;
        if (price.trim() && !isAmount(price)) {
            showError("A variant's price is a number, or empty to inherit.");
            return;
        }
        setAdding(true);
        const res = await createVariant(storeId, product.id, {
            sku: sku.trim(),
            title: title.trim(),
            price: price.trim() || null,
        });
        setAdding(false);
        if (!res.ok) {
            showError(res.error);
            return;
        }
        setSku("");
        setTitle("");
        setPrice("");
        showSuccess(`${title.trim()} added`);
        router.refresh();
    }

    async function remove(v: Variant) {
        if (!product) return;
        const res = await deleteVariant(storeId, product.id, v.id);
        if (!res.ok) {
            showError(res.error);
            return;
        }
        router.refresh();
        // Undo puts it back as it was. The id is new; the SKU, title and
        // price — everything a merchant or an order refers to — are the same.
        showUndo(`${v.title} removed`, () => {
            void createVariant(storeId, product.id, {
                sku: v.sku,
                title: v.title,
                price: v.price,
                image: v.image,
            }).then((r) => {
                if (!r.ok) return showError(r.error);
                router.refresh();
            });
        });
    }

    const variants = product?.variants ?? [];

    return (
        <section aria-labelledby="variants-heading">
            <h2
                id="variants-heading"
                className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
            >
                Variants
            </h2>
            <p className="mb-[11px] text-pretty text-[11.5px] leading-[1.5] text-muted-foreground">
                A large and a small are two variants of one product, each with
                its own SKU. Leave a variant&apos;s price empty and it charges
                the product&apos;s.
            </p>
            {!product ? (
                <p className="text-pretty rounded-[11px] border border-dashed border-border-strong p-[18px] text-[12px] leading-[1.5] text-neutral-600 dark:text-muted-foreground">
                    Variants are added once the product exists. Create it, and
                    this is where its sizes and colours go.
                </p>
            ) : (
                <>
                    {variants.length > 0 ? (
                        <ul className="mb-3 overflow-hidden rounded-[11px] border border-border bg-card">
                            {variants.map((v) =>
                                editingId === v.id ? (
                                    <li
                                        key={v.id}
                                        className="border-b border-border p-3 last:border-b-0"
                                    >
                                        <VariantEdit
                                            variant={v}
                                            onCancel={() => setEditingId(null)}
                                            onSave={async (input) => {
                                                const res = await updateVariant(
                                                    storeId,
                                                    product.id,
                                                    v.id,
                                                    input,
                                                );
                                                if (!res.ok) {
                                                    showError(res.error);
                                                    return false;
                                                }
                                                setEditingId(null);
                                                showSuccess(
                                                    `${input.title} saved`,
                                                );
                                                router.refresh();
                                                return true;
                                            }}
                                        />
                                    </li>
                                ) : (
                                    <li
                                        key={v.id}
                                        className="flex items-center gap-3 border-b border-border px-[13px] py-[11px] last:border-b-0"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-[13px] font-medium">
                                                {v.title}
                                            </div>
                                            <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                                                <span className="font-mono">
                                                    {v.sku}
                                                </span>{" "}
                                                · {money(v.price)}
                                            </div>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            aria-label={`Change ${v.title}`}
                                            onClick={() => setEditingId(v.id)}
                                        >
                                            Edit
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            aria-label={`Remove ${v.title}`}
                                            onClick={() => void remove(v)}
                                        >
                                            Remove
                                        </Button>
                                    </li>
                                ),
                            )}
                        </ul>
                    ) : (
                        <p className="mb-3 text-pretty rounded-[11px] border border-dashed border-border-strong p-[18px] text-[12px] leading-[1.5] text-neutral-600 dark:text-muted-foreground">
                            No variants yet. A product with none is sold as
                            itself, at the price above.
                        </p>
                    )}
                    <form
                        onSubmit={(e) => void add(e)}
                        className="rounded-[11px] border border-border bg-card px-[15px] py-[13px]"
                    >
                        <div className="mb-2.5 text-[12px] font-semibold">
                            Add a variant
                        </div>
                        <div className="flex flex-wrap gap-[9px]">
                            <div className="min-w-0 flex-[1_1_110px]">
                                <Label
                                    htmlFor={skuId}
                                    className="mb-1 block text-[11.5px] font-normal text-neutral-600 dark:text-muted-foreground"
                                >
                                    SKU
                                </Label>
                                <Input
                                    id={skuId}
                                    value={sku}
                                    placeholder="TR-300-L"
                                    className="font-mono"
                                    onChange={(e) => setSku(e.target.value)}
                                />
                            </div>
                            <div className="min-w-0 flex-[1_1_110px]">
                                <Label
                                    htmlFor={titleId}
                                    className="mb-1 block text-[11.5px] font-normal text-neutral-600 dark:text-muted-foreground"
                                >
                                    Title
                                </Label>
                                <Input
                                    id={titleId}
                                    value={title}
                                    placeholder="Large"
                                    onChange={(e) => setTitle(e.target.value)}
                                />
                            </div>
                            <div className="min-w-0 flex-[1_1_92px]">
                                <Label
                                    htmlFor={priceId}
                                    className="mb-1 block text-[11.5px] font-normal text-neutral-600 dark:text-muted-foreground"
                                >
                                    Price
                                </Label>
                                <Input
                                    id={priceId}
                                    inputMode="decimal"
                                    value={price}
                                    placeholder="inherit"
                                    className="tabular-nums"
                                    onChange={(e) => setPrice(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
                            <Button
                                type="submit"
                                size="sm"
                                disabled={
                                    adding || !sku.trim() || !title.trim()
                                }
                            >
                                {adding ? "Adding…" : "Add variant"}
                            </Button>
                            <span className="min-w-0 flex-1 text-pretty text-[11.5px] leading-[1.45] text-muted-foreground">
                                {!sku.trim() || !title.trim()
                                    ? "A SKU and a title to add one."
                                    : `Adds ${title.trim()} at ${price.trim() ? (formatMoneyMajor(price, currency) ?? price) : "the product's price"}.`}
                            </span>
                        </div>
                    </form>
                </>
            )}
        </section>
    );
}

function VariantEdit({
    variant,
    onSave,
    onCancel,
}: {
    variant: Variant;
    onSave: (input: {
        sku: string;
        title: string;
        price: string | null;
    }) => Promise<boolean>;
    onCancel: () => void;
}) {
    const [sku, setSku] = useState(variant.sku);
    const [title, setTitle] = useState(variant.title);
    const [price, setPrice] = useState(variant.price ?? "");
    const [busy, setBusy] = useState(false);
    const ok =
        sku.trim() !== "" &&
        title.trim() !== "" &&
        (price.trim() === "" || isAmount(price));
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                if (!ok) return;
                setBusy(true);
                void onSave({
                    sku: sku.trim(),
                    title: title.trim(),
                    price: price.trim() || null,
                }).finally(() => setBusy(false));
            }}
            className="flex flex-col gap-2"
        >
            <div className="flex flex-wrap gap-2">
                <Input
                    aria-label="SKU"
                    value={sku}
                    className="min-w-0 flex-[1_1_100px] font-mono"
                    onChange={(e) => setSku(e.target.value)}
                />
                <Input
                    aria-label="Title"
                    value={title}
                    className="min-w-0 flex-[1_1_100px]"
                    onChange={(e) => setTitle(e.target.value)}
                />
                <Input
                    aria-label="Price, empty to inherit"
                    inputMode="decimal"
                    value={price}
                    placeholder="inherit"
                    className="min-w-0 flex-[1_1_80px] tabular-nums"
                    onChange={(e) => setPrice(e.target.value)}
                />
            </div>
            <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={busy || !ok}>
                    {busy ? "Saving…" : "Save"}
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={onCancel}
                >
                    Cancel
                </Button>
            </div>
        </form>
    );
}

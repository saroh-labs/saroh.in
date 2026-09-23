/**
 * Decimal → string serializers with explicit output shapes. Prisma returns
 * `price` as a Decimal; we render it as a string over HTTP so money stays exact
 * (never a lossy JS float). Declaring concrete return types also keeps the
 * services' public shapes portable — an inferred Prisma type would surface
 * `Decimal` across the pnpm boundary and trip TS2883.
 */

import { toMoneyString } from "../../common/money";

interface DecimalLike {
    toString(): string;
}

export interface VariantStockDto {
    quantity: number;
    reserved: number;
    lowStockAlert: number;
}

export interface VariantDto {
    id: string;
    productId: string;
    sku: string;
    title: string;
    price: string | null;
    mrp: string | null;
    image: string | null;
    optionValueId: string | null;
    /** The product photo shown when it is picked; null = the cover. */
    imageId: string | null;
    position: number;
    /** Its own stock row, once the product counts per variant. */
    inventory: VariantStockDto | null;
    createdAt: Date;
}

export interface ProductImageDto {
    id: string;
    url: string;
    mediaId: string | null;
    alt: string;
    width: number | null;
    height: number | null;
    position: number;
    creditName: string | null;
    creditUrl: string | null;
}

/** Which switches say "on the shop"; a key missing is treated as shown. */
export type ShopFieldsDto = Record<string, boolean>;

export interface ProductDto {
    id: string;
    storeId: string;
    name: string;
    slug: string;
    description: string | null;
    image: string | null;
    categoryId: string | null;
    price: string;
    mrp: string | null;
    currency: string;
    status: string;
    howToUse: string | null;
    materials: string | null;
    keyPoints: string[];
    madeHere: boolean;
    maker: string | null;
    madeIn: string | null;
    supplierCode: string | null;
    warranty: string | null;
    returnsMode: string;
    returnsText: string | null;
    shopFields: ShopFieldsDto;
    seoTitle: string | null;
    seoDescription: string | null;
    seoImageId: string | null;
    optionId: string | null;
    createdAt: Date;
    updatedAt: Date;
    category?: { id: string; name: string } | null;
}

/**
 * A catalogue row: what the products table shows without opening a product —
 * how many variants it has, the SKU it is known by, and its stock against its
 * own low-stock threshold (a threshold is per product: five is low for mugs
 * and high for wedding cakes).
 */
export interface ProductListItemDto extends ProductDto {
    variantCount: number;
    /** The first variant's SKU; `null` for a product with no variants. */
    sku: string | null;
    /** What an order line can be for: each variant, with its own price. */
    variants: {
        id: string;
        sku: string;
        title: string;
        price: string | null;
    }[];
    inventory: { quantity: number; lowStockAlert: number } | null;
}

export interface ProductDetailDto extends ProductDto {
    variants: VariantDto[];
    images: ProductImageDto[];
    /**
     * "variant" once any variant has its own stock row; "product" otherwise.
     * In variant mode the product row, if any, holds only promises made to
     * orders from before the product counted per variant.
     */
    stockMode: "product" | "variant";
    inventory: {
        quantity: number;
        reserved: number;
        lowStockAlert: number;
    } | null;
    option: {
        id: string;
        name: string;
        values: { id: string; value: string }[];
    } | null;
}

interface RawVariant {
    id: string;
    productId: string;
    sku: string;
    title: string;
    price: DecimalLike | null;
    mrp?: DecimalLike | null;
    image: string | null;
    optionValueId?: string | null;
    imageId?: string | null;
    position?: number;
    inventory?: VariantStockDto | null;
    createdAt: Date;
}

interface RawImage {
    id: string;
    url: string;
    mediaId: string | null;
    alt: string;
    width: number | null;
    height: number | null;
    position: number;
    creditName: string | null;
    creditUrl: string | null;
}

interface RawProduct {
    id: string;
    storeId: string;
    name: string;
    slug: string;
    description: string | null;
    image: string | null;
    categoryId: string | null;
    price: DecimalLike;
    mrp: DecimalLike | null;
    currency: string;
    status: string;
    howToUse: string | null;
    materials: string | null;
    keyPoints: string[];
    madeHere: boolean;
    maker: string | null;
    madeIn: string | null;
    supplierCode: string | null;
    warranty: string | null;
    returnsMode: string;
    returnsText: string | null;
    shopFields: unknown;
    seoTitle: string | null;
    seoDescription: string | null;
    seoImageId: string | null;
    optionId: string | null;
    createdAt: Date;
    updatedAt: Date;
    category?: { id: string; name: string } | null;
}

interface RawProductDetail extends RawProduct {
    variants: RawVariant[];
    images: RawImage[];
    inventory: {
        quantity: number;
        reserved: number;
        lowStockAlert: number;
    } | null;
    option: {
        id: string;
        name: string;
        values: { id: string; value: string }[];
    } | null;
}

/** Only boolean entries survive; anything else in the column is ignored. */
export function readShopFields(raw: unknown): ShopFieldsDto {
    const out: ShopFieldsDto = {};
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        for (const [key, value] of Object.entries(raw)) {
            if (typeof value === "boolean") out[key] = value;
        }
    }
    return out;
}

export function serializeImage(image: RawImage): ProductImageDto {
    return {
        id: image.id,
        url: image.url,
        mediaId: image.mediaId,
        alt: image.alt,
        width: image.width,
        height: image.height,
        position: image.position,
        creditName: image.creditName,
        creditUrl: image.creditUrl,
    };
}

export function serializeVariant(variant: RawVariant): VariantDto {
    return {
        id: variant.id,
        productId: variant.productId,
        sku: variant.sku,
        title: variant.title,
        price: variant.price ? toMoneyString(variant.price) : null,
        mrp: variant.mrp ? toMoneyString(variant.mrp) : null,
        image: variant.image,
        optionValueId: variant.optionValueId ?? null,
        imageId: variant.imageId ?? null,
        position: variant.position ?? 0,
        inventory: variant.inventory
            ? {
                  quantity: variant.inventory.quantity,
                  reserved: variant.inventory.reserved,
                  lowStockAlert: variant.inventory.lowStockAlert,
              }
            : null,
        createdAt: variant.createdAt,
    };
}

export function serializeProduct(product: RawProduct): ProductDto {
    return {
        id: product.id,
        storeId: product.storeId,
        name: product.name,
        slug: product.slug,
        description: product.description,
        image: product.image,
        categoryId: product.categoryId,
        price: toMoneyString(product.price),
        mrp: product.mrp ? toMoneyString(product.mrp) : null,
        currency: product.currency,
        status: product.status,
        howToUse: product.howToUse,
        materials: product.materials,
        keyPoints: product.keyPoints,
        madeHere: product.madeHere,
        maker: product.maker,
        madeIn: product.madeIn,
        supplierCode: product.supplierCode,
        warranty: product.warranty,
        returnsMode: product.returnsMode,
        returnsText: product.returnsText,
        shopFields: readShopFields(product.shopFields),
        seoTitle: product.seoTitle,
        seoDescription: product.seoDescription,
        seoImageId: product.seoImageId,
        optionId: product.optionId,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
        category: product.category ?? null,
    };
}

interface RawProductListItem extends RawProduct {
    _count: { variants: number };
    variants: {
        id: string;
        sku: string;
        title: string;
        price: DecimalLike | null;
    }[];
    inventory: { quantity: number; lowStockAlert: number } | null;
}

export function serializeProductListItem(
    product: RawProductListItem,
): ProductListItemDto {
    return {
        ...serializeProduct(product),
        variantCount: product._count.variants,
        sku: product.variants[0]?.sku ?? null,
        variants: product.variants.map((v) => ({
            id: v.id,
            sku: v.sku,
            title: v.title,
            price: v.price ? toMoneyString(v.price) : null,
        })),
        inventory: product.inventory
            ? {
                  quantity: product.inventory.quantity,
                  lowStockAlert: product.inventory.lowStockAlert,
              }
            : null,
    };
}

export function serializeProductDetail(
    product: RawProductDetail,
): ProductDetailDto {
    return {
        ...serializeProduct(product),
        variants: product.variants.map(serializeVariant),
        images: product.images.map(serializeImage),
        stockMode: product.variants.some((v) => v.inventory)
            ? "variant"
            : "product",
        option: product.option,
        inventory: product.inventory
            ? {
                  quantity: product.inventory.quantity,
                  reserved: product.inventory.reserved,
                  lowStockAlert: product.inventory.lowStockAlert,
              }
            : null,
    };
}

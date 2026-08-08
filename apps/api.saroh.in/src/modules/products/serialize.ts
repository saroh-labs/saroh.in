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

export interface VariantDto {
    id: string;
    productId: string;
    sku: string;
    title: string;
    price: string | null;
    image: string | null;
    createdAt: Date;
}

export interface ProductDto {
    id: string;
    storeId: string;
    name: string;
    slug: string;
    description: string | null;
    image: string | null;
    categoryId: string | null;
    price: string;
    currency: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    category?: { id: string; name: string } | null;
}

export interface ProductDetailDto extends ProductDto {
    variants: VariantDto[];
    inventory: {
        quantity: number;
        reserved: number;
        lowStockAlert: number;
    } | null;
}

interface RawVariant {
    id: string;
    productId: string;
    sku: string;
    title: string;
    price: DecimalLike | null;
    image: string | null;
    createdAt: Date;
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
    currency: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    category?: { id: string; name: string } | null;
}

interface RawProductDetail extends RawProduct {
    variants: RawVariant[];
    inventory: {
        quantity: number;
        reserved: number;
        lowStockAlert: number;
    } | null;
}

export function serializeVariant(variant: RawVariant): VariantDto {
    return {
        id: variant.id,
        productId: variant.productId,
        sku: variant.sku,
        title: variant.title,
        price: variant.price ? toMoneyString(variant.price) : null,
        image: variant.image,
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
        currency: product.currency,
        status: product.status,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
        category: product.category ?? null,
    };
}

export function serializeProductDetail(
    product: RawProductDetail,
): ProductDetailDto {
    return {
        ...serializeProduct(product),
        variants: product.variants.map(serializeVariant),
        inventory: product.inventory
            ? {
                  quantity: product.inventory.quantity,
                  reserved: product.inventory.reserved,
                  lowStockAlert: product.inventory.lowStockAlert,
              }
            : null,
    };
}

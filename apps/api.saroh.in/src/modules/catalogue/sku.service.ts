import { BadRequestException, Injectable } from "@nestjs/common";
import { prisma } from "@saroh/database";

import {
    clashProblem,
    DEFAULT_SKU_PATTERN,
    patternProblem,
    skuFrom,
} from "./sku-pattern";

export interface SkuSettingsView {
    pattern: string;
    suggest: boolean;
    /** The product's number for {N}: its place, or the next one for a new product. */
    n: number;
}

export interface SkuPreviewRow {
    productId: string;
    product: string;
    variant: string;
    now: string;
    next: string;
}

export interface SkuPreviewView {
    rows: SkuPreviewRow[];
    total: number;
    problem: string;
}

/**
 * The SKU pattern (#484): read with the product's number for the editor,
 * a preview of every variant's suggestion with its clashes, and the save —
 * which never rewrites a SKU a variant already has. The pattern is the
 * business's (#529, kept on its BusinessProfile), and {N} counts every
 * storefront's products.
 */
@Injectable()
export class SkuService {
    async get(
        organizationId: string,
        productId?: string,
    ): Promise<SkuSettingsView> {
        const [settings, ids] = await Promise.all([
            prisma.businessProfile.findUnique({
                where: { organizationId },
                select: { skuPattern: true, skuSuggest: true },
            }),
            prisma.product.findMany({
                where: { organizationId },
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                select: { id: true },
            }),
        ]);
        const at = productId ? ids.findIndex((p) => p.id === productId) : -1;
        return {
            pattern: settings?.skuPattern ?? DEFAULT_SKU_PATTERN,
            suggest: settings?.skuSuggest ?? true,
            n: at > -1 ? at + 1 : ids.length + 1,
        };
    }

    async preview(
        organizationId: string,
        pattern: string,
    ): Promise<SkuPreviewView> {
        const rows = await this.rows(organizationId, pattern);
        return {
            rows,
            total: rows.length,
            problem:
                patternProblem(pattern) ||
                clashProblem(
                    pattern,
                    rows.map((r) => r.next),
                ),
        };
    }

    async save(
        organizationId: string,
        input: { pattern: string; suggest: boolean },
    ): Promise<SkuSettingsView> {
        const pattern = input.pattern.trim();
        const rows = await this.rows(organizationId, pattern);
        const problem =
            patternProblem(pattern) ||
            clashProblem(
                pattern,
                rows.map((r) => r.next),
            );
        if (problem) {
            throw new BadRequestException({
                message: problem,
                field: "skuPattern",
            });
        }
        await prisma.businessProfile.upsert({
            where: { organizationId },
            create: {
                organizationId,
                skuPattern: pattern,
                skuSuggest: input.suggest,
            },
            update: { skuPattern: pattern, skuSuggest: input.suggest },
        });
        return this.get(organizationId);
    }

    /** Every variant (or product, when it has none), as the pattern names it. */
    private async rows(
        organizationId: string,
        pattern: string,
    ): Promise<SkuPreviewRow[]> {
        const products = await prisma.product.findMany({
            where: { organizationId },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: {
                id: true,
                name: true,
                category: { select: { name: true } },
                variants: {
                    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
                    select: { title: true, sku: true },
                },
            },
        });
        const out: SkuPreviewRow[] = [];
        products.forEach((p, i) => {
            const parts = {
                name: p.name,
                category: p.category?.name ?? "",
                n: i + 1,
            };
            if (p.variants.length === 0) {
                out.push({
                    productId: p.id,
                    product: p.name,
                    variant: "",
                    now: "",
                    next: skuFrom(pattern, { ...parts, value: "" }),
                });
                return;
            }
            for (const v of p.variants) {
                out.push({
                    productId: p.id,
                    product: p.name,
                    variant: v.title,
                    now: v.sku,
                    next: skuFrom(pattern, { ...parts, value: v.title }),
                });
            }
        });
        return out;
    }
}

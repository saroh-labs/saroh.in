import { BadRequestException, Injectable } from "@nestjs/common";
import { prisma } from "@saroh/database";

import {
    clashAdvice,
    DEFAULT_SKU_PATTERN,
    distinctSkus,
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
    /** What is wrong with the pattern itself; "" when nothing is. */
    problem: string;
    /**
     * Two variants the pattern names alike, and what the editor does about
     * it (-2, -3); "" when every SKU differs. Advice, never a block.
     */
    advice: string;
}

/**
 * The SKU pattern (#484): read with the product's number for the editor,
 * a preview of every variant's suggestion with advice on any clash, and the
 * save — which never rewrites a SKU a variant already has. A clash is never
 * a reason to refuse a save: the editor adds -2, -3 to tell two apart. The pattern is the
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
        const problem = patternProblem(pattern);
        const raw = await this.rows(organizationId, pattern);
        const next = distinctSkus(raw.map((r) => r.next));
        const rows = raw.map((r, i) => ({ ...r, next: next[i] ?? r.next }));
        return {
            rows,
            total: rows.length,
            problem,
            advice: problem
                ? ""
                : clashAdvice(
                      pattern,
                      raw.map((r) => ({
                          productId: r.productId,
                          product: r.product,
                          variant: r.variant,
                          sku: r.next,
                      })),
                  ),
        };
    }

    /**
     * Saves the pattern and whether to suggest. Only a pattern that is wrong
     * on its own is refused, and only while suggestions are on: turning them
     * off never checks the pattern — a wrong one is left as it was saved.
     */
    async save(
        organizationId: string,
        input: { pattern: string; suggest: boolean },
    ): Promise<SkuSettingsView> {
        const typed = input.pattern.trim();
        const problem = patternProblem(typed);
        if (problem && input.suggest) {
            throw new BadRequestException({
                message: problem,
                field: "skuPattern",
            });
        }
        const pattern = problem ? null : typed;
        await prisma.businessProfile.upsert({
            where: { organizationId },
            create: {
                organizationId,
                skuPattern: pattern ?? DEFAULT_SKU_PATTERN,
                skuSuggest: input.suggest,
            },
            update: {
                ...(pattern === null ? {} : { skuPattern: pattern }),
                skuSuggest: input.suggest,
            },
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

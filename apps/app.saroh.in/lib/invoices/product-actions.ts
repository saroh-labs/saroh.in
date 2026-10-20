"use server";

import { unstable_rethrow } from "next/navigation";

import type { ApiResult } from "@/lib/api/failure";
import { isGstPriceMode } from "@/lib/gst/price-mode";
import { listCataloguePage } from "@/lib/products/service";

import type { PickableProduct } from "./new-invoice-lines";

/**
 * New invoice's "+ Pick from your products" (U14 #1126): the catalogue's
 * products matching `q` (names and SKUs, as the Products list searches),
 * twenty at a time, with what a line needs: the price, the GST rate, how
 * the price carries it, the HSN, and each variant's own price. The API
 * decides who may read the catalogue; a refusal is said in the picker.
 */
export async function findInvoiceProducts(
    q: string,
): Promise<ApiResult<{ items: PickableProduct[]; more: boolean }>> {
    try {
        const page = await listCataloguePage({
            q: q.trim() || undefined,
            limit: 20,
        });
        if (!page) return { ok: false, error: "Pick a business first." };
        return {
            ok: true,
            data: {
                items: page.items
                    .filter((p) => p.status !== "ARCHIVED")
                    .map((p) => ({
                        id: p.id,
                        name: p.name,
                        price: p.price,
                        gstRate: p.gstRate ?? null,
                        gstPriceMode: isGstPriceMode(p.gstPriceMode)
                            ? p.gstPriceMode
                            : null,
                        hsnCode: p.hsnCode ?? null,
                        variants: p.variants.map((v) => ({
                            id: v.id,
                            title: v.title,
                            price: v.price,
                        })),
                    })),
                more: page.nextCursor !== null,
            },
        };
    } catch (error) {
        unstable_rethrow(error);
        return {
            ok: false,
            error: "Your products couldn't be searched just now. Try again.",
        };
    }
}

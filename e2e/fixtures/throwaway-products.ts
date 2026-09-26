import type { APIRequestContext } from "@playwright/test";
import { expect } from "@playwright/test";

import { urls } from "../playwright.config";

/**
 * Products a spec makes for itself and takes away afterwards (#515, DEC-032).
 *
 * One with no stock history is deleted. One with a history can't be (the
 * stock log is never edited), so it is set to Not sold under one fixed name
 * and address per spec name, "<name> (retired)", and the next run brings
 * that same row back instead of making another. However often a spec runs,
 * it leaves at most one archived product per name — never one per run.
 */

export interface Storefront {
    organizationId: string;
    storeId: string;
}

interface Listed {
    id: string;
    name: string;
}

const api = (at: Storefront, path: string) =>
    `${urls.API_URL}/stores/${at.storeId}/products${path}`;
const headers = (at: Storefront) => ({
    "x-organization-id": at.organizationId,
});

/** The name a product with a stock history is set aside under. */
export const retiredName = (name: string) => `${name} (retired)`;

function retiredSlug(name: string): string {
    const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return `e2e-retired-${slug}`;
}

async function listProducts(
    request: APIRequestContext,
    at: Storefront,
): Promise<Listed[]> {
    const res = await request.get(api(at, ""), { headers: headers(at) });
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as Listed[] | { items: Listed[] };
    return Array.isArray(body) ? body : body.items;
}

/**
 * A product called `name` for the spec to use: one a failed run left, or
 * the one set aside by an earlier run brought back, or else a new one.
 */
export async function takeProduct(
    request: APIRequestContext,
    at: Storefront,
    name: string,
    data: { price: string; status: "DRAFT" | "PUBLISHED" },
): Promise<string> {
    const list = await listProducts(request, at);
    const found =
        list.find((p) => p.name === name) ??
        list.find((p) => p.name === retiredName(name));
    if (found) {
        const back = await request.patch(api(at, `/${found.id}`), {
            headers: headers(at),
            data: { name, ...data },
        });
        expect(back.ok()).toBe(true);
        return found.id;
    }
    const made = await request.post(api(at, ""), {
        headers: headers(at),
        data: { name, ...data },
    });
    expect(made.ok()).toBe(true);
    return ((await made.json()) as { id: string }).id;
}

/**
 * Take away every product called `name`: deleted when it has no stock
 * history, else set to Not sold as "<name> (retired)" at its fixed address.
 */
export async function removeProducts(
    request: APIRequestContext,
    at: Storefront,
    name: string,
): Promise<void> {
    const list = await listProducts(request, at);
    for (const p of list.filter((x) => x.name === name)) {
        const del = await request.delete(api(at, `/${p.id}`), {
            headers: headers(at),
        });
        if (del.ok()) continue;
        expect(del.status()).toBe(409);
        const retired = await request.patch(api(at, `/${p.id}`), {
            headers: headers(at),
            data: {
                name: retiredName(name),
                slug: retiredSlug(name),
                status: "ARCHIVED",
            },
        });
        expect(retired.ok()).toBe(true);
    }
}

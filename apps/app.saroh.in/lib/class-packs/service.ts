import { apiFetch, getJson, orgBase } from "@/lib/api/http";

import type { ApiResult } from "@/lib/api/failure";
import { toFailure } from "@/lib/api/failure";

import type { PackStanding } from "./balance";

/**
 * Class packs (ADR-007), through the org-nested `/class-packs` routes:
 * N classes for a price, valid for D days, on the services a pack names.
 * Server-only.
 */

export interface ClassPack {
    id: string;
    name: string;
    description: string | null;
    credits: number;
    validityDays: number;
    price: string;
    currency: string;
    status: "ACTIVE" | "ARCHIVED";
    services: { id: string; name: string }[];
    /** Every sale, live or not. */
    sold: number;
    /** Sales with classes and time left. */
    activeHolders: number;
    createdAt: string;
}

export interface PackPurchase {
    id: string;
    pack: { id: string; name: string };
    contact: { id: string; name: string; email: string };
    credits: number;
    used: number;
    left: number;
    standing: PackStanding;
    price: string;
    currency: string;
    expiresAt: string;
    /** Null when sold with Payments off, or not readable by this person. */
    invoiceId: string | null;
    createdAt: string;
}

export interface PackInput {
    name?: string;
    description?: string | null;
    credits?: number;
    validityDays?: number;
    price?: string;
    currency?: string;
    serviceIds?: string[];
}

export interface SellingTerms {
    /** Payments is on: selling issues the invoice there and then. */
    invoicesOnSale: boolean;
}

const packPath = (id: string) => `/class-packs/${encodeURIComponent(id)}`;

export async function listPacks(): Promise<ClassPack[]> {
    const base = await orgBase();
    if (!base) return [];
    return (await getJson<ClassPack[]>(`${base}/class-packs`)) ?? [];
}

/** One pack, or null when missing / another business's. */
export async function getPack(id: string): Promise<ClassPack | null> {
    const base = await orgBase();
    if (!base) return null;
    return getJson<ClassPack>(`${base}${packPath(id)}`);
}

/** Every purchase, newest first (the API keeps the newest 500). */
export async function listPurchases(): Promise<PackPurchase[]> {
    const base = await orgBase();
    if (!base) return [];
    return (
        (await getJson<PackPurchase[]>(`${base}/class-packs/purchases`)) ?? []
    );
}

/**
 * Whether selling issues an invoice now. Read so the sell dialog mentions
 * an invoice only when there will be one; a failed read says nothing about
 * one rather than claiming it.
 */
export async function getSellingTerms(): Promise<SellingTerms> {
    const base = await orgBase();
    if (!base) return { invoicesOnSale: false };
    const res = await apiFetch(`${base}/class-packs/selling`).catch(() => null);
    if (!res?.ok) return { invoicesOnSale: false };
    return (await res.json()) as SellingTerms;
}

/**
 * One person's packs that pay for a service, or null when they could not be
 * read. For the booking screens, where packs are an extra and must not fail
 * the page: no `forbidden()` here, unlike `getJson`.
 */
export async function readPurchasesFor(
    contactId: string,
    serviceId: string,
): Promise<PackPurchase[] | null> {
    const base = await orgBase();
    if (!base) return null;
    const query = new URLSearchParams({ contactId, serviceId });
    try {
        const res = await apiFetch(
            `${base}/class-packs/purchases?${query.toString()}`,
        );
        if (!res.ok) return null;
        return (await res.json()) as PackPurchase[];
    } catch {
        return null;
    }
}

async function send<T>(
    path: string,
    method: "POST" | "PATCH" | "DELETE",
    body: unknown,
    fallback: string,
): Promise<ApiResult<T>> {
    const base = await orgBase();
    if (!base) return { ok: false, error: "No active business." };
    const res = await apiFetch(`${base}${path}`, {
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: (data ?? {}) as T };
    return toFailure(data, fallback);
}

export function createPack(input: PackInput) {
    return send<ClassPack>(
        "/class-packs",
        "POST",
        input,
        "Could not save that pack.",
    );
}
export function updatePack(id: string, input: PackInput) {
    return send<ClassPack>(
        packPath(id),
        "PATCH",
        input,
        "Could not save that pack.",
    );
}
export function setPackArchived(id: string, archived: boolean) {
    return send<ClassPack>(
        `${packPath(id)}/${archived ? "archive" : "restore"}`,
        "POST",
        {},
        archived
            ? "Could not archive that pack."
            : "Could not put that pack back on sale.",
    );
}
export function sellPack(id: string, contactId: string) {
    return send<PackPurchase>(
        `${packPath(id)}/sell`,
        "POST",
        { contactId },
        "Could not sell that pack.",
    );
}

const bookingPack = (bookingId: string) =>
    `/bookings/${encodeURIComponent(bookingId)}/class-pack`;

/** Pay a booking already made with one of its booker's packs. */
export function payBookingWithPack(bookingId: string, packPurchaseId: string) {
    return send<{ bookingId: string; purchase: PackPurchase }>(
        bookingPack(bookingId),
        "POST",
        { packPurchaseId },
        "Could not pay with that pack.",
    );
}
/** Take the pack off a booking; its class goes back. */
export function removeFromBooking(bookingId: string) {
    return send<{ bookingId: string; returned: boolean }>(
        bookingPack(bookingId),
        "DELETE",
        undefined,
        "Could not take the pack off.",
    );
}

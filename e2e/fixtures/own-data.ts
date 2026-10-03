import type {
    APIRequestContext,
    APIResponse,
    TestInfo,
} from "@playwright/test";
import { expect } from "@playwright/test";

import { NORTHWIND_ORG, urls } from "../playwright.config";
import { takeProduct } from "./throwaway-products";

/**
 * Records a test makes for itself, on Northwind, so it can run beside every
 * other test (the suite is `fullyParallel`; see the browser-tests skill).
 *
 * A test that changes something makes the thing it changes — a contact, an
 * order, a plan, a subscription — with a stamp no other test, project or
 * run shares, and asserts on that record only. Nothing here reads a count
 * or a "first row" another test could move.
 */

/** Northwind's first storefront, where the seed keeps its catalogue. */
export const NW_STORE = "seed_store";

/**
 * A stamp no other test shares: the project, the worker, the moment and a
 * random tail. Use it in names and emails, never as a phone (see `phone`).
 */
export function stamp(testInfo?: TestInfo): string {
    const who = testInfo
        ? `${testInfo.project.name}${testInfo.parallelIndex}`
        : "x";
    const tail = Math.floor(Math.random() * 36 ** 4)
        .toString(36)
        .padStart(4, "0");
    return `${who}-${Date.now().toString(36)}${tail}`;
}

/** A phone number no other test is likely to hold: +91 9 and nine random digits. */
export function phone(): string {
    const digits = String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
    return `+91 9${digits.slice(0, 4)} ${digits.slice(4)}`;
}

/** Northwind's API as the signed-in owner; writes carry an Origin (#50). */
export function northwind(request: APIRequestContext) {
    const headers = {
        "x-organization-id": NORTHWIND_ORG,
        origin: urls.APP_URL,
    };
    const url = (path: string) =>
        path.startsWith("/stores/")
            ? `${urls.API_URL}${path}`
            : `${urls.API_URL}/organizations/${NORTHWIND_ORG}${path}`;
    const ok = async <T>(res: APIResponse): Promise<T> => {
        expect(res.ok(), `${res.url()}: ${await res.text()}`).toBe(true);
        const text = await res.text();
        return (text ? JSON.parse(text) : null) as T;
    };
    return {
        headers,
        get: async <T>(path: string) =>
            ok<T>(await request.get(url(path), { headers })),
        post: async <T>(path: string, data: unknown = {}) =>
            ok<T>(await request.post(url(path), { headers, data })),
        patch: async <T>(path: string, data: unknown = {}) =>
            ok<T>(await request.patch(url(path), { headers, data })),
        put: async <T>(path: string, data: unknown = {}) =>
            ok<T>(await request.put(url(path), { headers, data })),
        delete: (path: string) => request.delete(url(path), { headers }),
    };
}

/** A Northwind contact made for this test. */
export async function makeContact(
    request: APIRequestContext,
    body: {
        firstName: string;
        lastName: string;
        email?: string;
        phone?: string;
    },
): Promise<{ id: string; name: string }> {
    const made = await northwind(request).post<{ id: string }>(
        "/contacts",
        body,
    );
    return { id: made.id, name: `${body.firstName} ${body.lastName}` };
}

/**
 * The product every order a test makes is for: untracked (#515), so an
 * order never holds stock another test counts, and it never sells out.
 * The setup project brings it in once per run (`tests/auth.setup.ts`);
 * nothing ever changes it.
 */
export const ORDER_LINE = "E2E Order Line";

let orderLineId: string | null = null;

/** The id of `ORDER_LINE`, making it when the setup project did not. */
export async function orderLine(request: APIRequestContext): Promise<string> {
    orderLineId ??= await takeProduct(
        request,
        { organizationId: NORTHWIND_ORG, storeId: NW_STORE },
        ORDER_LINE,
        { price: "150.00", status: "PUBLISHED" },
    );
    return orderLineId;
}

/**
 * One of Northwind's seeded services to book: never a service another test
 * is making and deleting ("E2E …"), nor the walkthrough, whose times the
 * booking-page specs take from the customer's side.
 */
export async function aService(
    request: APIRequestContext,
): Promise<{ id: string; name: string }> {
    const services =
        await northwind(request).get<{ id: string; name: string }[]>(
            "/services",
        );
    const service = services.find(
        (s) => !s.name.startsWith("E2E ") && s.name !== "Warehouse walkthrough",
    );
    expect(service, "Northwind has a seeded service to book").toBeTruthy();
    return service as { id: string; name: string };
}

/**
 * Book `contactId` into the first time still free, `days` from now, on one
 * of Northwind's seeded services. Tried in order: a test running beside this
 * one may take a time between the read and the booking.
 */
export async function bookOwn(
    request: APIRequestContext,
    contactId: string,
    days = 1,
): Promise<{ id: string; startAt: string }> {
    const service = await aService(request);
    const nw = northwind(request);
    const from = new Date(Date.now() + days * 86_400_000);
    const to = new Date(from.getTime() + 3 * 86_400_000);
    const slots = await nw.get<{ startAt: string }[]>(
        `/services/${service.id}/availability?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
    );
    let refused = "no times offered";
    for (const slot of slots) {
        const res = await request.post(
            `${urls.API_URL}/organizations/${NORTHWIND_ORG}/services/${service.id}/bookings`,
            { headers: nw.headers, data: { startAt: slot.startAt, contactId } },
        );
        if (res.ok()) {
            const { id } = (await res.json()) as { id: string };
            return { id, startAt: slot.startAt };
        }
        refused = `${res.status()} ${await res.text()}`;
    }
    throw new Error(`No time could be booked on ${service.name}: ${refused}`);
}

export type Fulfilment = "PICKUP" | "LOCAL_DELIVERY" | "SHIPPING";

export const ADDRESS = {
    line1: "14 Lake View Road",
    city: "Pune",
    state: "Maharashtra",
    postalCode: "411001",
};

/**
 * A Northwind order of one `ORDER_LINE`, made for this test: collected at
 * the counter by default, or delivered or shipped (B10); paid by hand
 * unless `paid: false`; and walked to `stage` through the kitchen.
 *
 * It is for Sneha (`seed_customer_6`), a seeded customer with no email, so
 * nothing is ever sent: an order only adds to her history, and no test
 * counts that. Or, with `customer`, for someone new by email, whom the
 * storefront makes a customer of (B13).
 */
export async function makeOrder(
    request: APIRequestContext,
    {
        fulfilment = "PICKUP",
        paid = true,
        stage,
        customer,
    }: {
        fulfilment?: Fulfilment;
        paid?: boolean;
        stage?: "PREPARING" | "READY";
        customer?: { email: string; name: string };
    } = {},
): Promise<{ id: string; orderId: string }> {
    const nw = northwind(request);
    const productId = await orderLine(request);
    const { id } = await nw.post<{ id: string }>(`/stores/${NW_STORE}/orders`, {
        ...(customer ? { customer } : { customerId: "seed_customer_6" }),
        items: [{ productId, quantity: 1 }],
        ...(fulfilment === "PICKUP" ? {} : { fulfilment, address: ADDRESS }),
    });
    if (paid) {
        await nw.patch(`/stores/${NW_STORE}/orders/${id}`, {
            paymentStatus: "PAID",
        });
    }
    const steps =
        stage === "READY" ? ["PREPARING", "READY"] : stage ? [stage] : [];
    for (const to of steps) {
        await nw.post(`/orders/${id}/stage`, { to });
    }
    const read = await nw.get<{ orderId?: string; number?: string }>(
        `/orders/${id}`,
    );
    return { id, orderId: String(read.orderId ?? read.number ?? "") };
}

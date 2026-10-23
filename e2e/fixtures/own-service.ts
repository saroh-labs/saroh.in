import type { APIRequestContext, TestInfo } from "@playwright/test";
import { expect } from "@playwright/test";

import { NORTHWIND_ORG, urls } from "../playwright.config";
import { northwind, stamp } from "./own-data";

/**
 * A Northwind service made for one test, so the times it books are its own
 * and no test beside it can take them (the browser-tests skill: times and
 * slots are claimed, not assumed).
 *
 * Online, so opening hours never refuse a time; open every day, all day,
 * in 30-minute steps from midnight in India; booked by the team only, so
 * the booking page never offers it; and priced, so Paid now and Take have
 * something to take. Nobody on the diary takes it, so its times are the
 * service's own. `remove()` archives it again.
 */
export interface OwnService {
    id: string;
    name: string;
    priceCents: number;
    durationMinutes: number;
    remove: () => Promise<void>;
}

/** Thirty minutes, in milliseconds: the service's step. */
export const STEP_MS = 30 * 60_000;

export async function ownService(
    request: APIRequestContext,
    testInfo: TestInfo,
    label = "Desk",
): Promise<OwnService> {
    const nw = northwind(request);
    const name = `E2E ${label} ${stamp(testInfo)}`;
    const priceCents = 50_000;
    const durationMinutes = 30;
    const made = await nw.post<{ id: string }>("/services", {
        name,
        durationMinutes,
        priceCents,
        currency: "INR",
        timezone: "Asia/Kolkata",
        locationType: "ONLINE",
        meetingUrl: "https://meet.example.com/e2e-desk",
        showOnBookingPage: false,
        bookableByTeam: true,
    });
    await nw.put(`/services/${made.id}/rules`, {
        rules: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
            dayOfWeek,
            startMinute: 0,
            endMinute: 1440,
        })),
    });
    return {
        id: made.id,
        name,
        priceCents,
        durationMinutes,
        remove: async () => {
            await nw.delete(`/services/${made.id}`);
        },
    };
}

/**
 * Book someone into `service` by hand through the API, by name and phone
 * (DEC-170), at `startAt` (default: the next step, under half an hour
 * away, so Came can be marked now: it opens an hour before the start).
 * Optionally Paid now at the desk.
 */
export async function bookOnOwn(
    request: APIRequestContext,
    service: OwnService,
    booker: { name: string; phone: string },
    options: { startAt?: string; paidBy?: "CASH" | "UPI" | "CARD" } = {},
): Promise<{ id: string; startAt: string }> {
    const startAt =
        options.startAt ??
        new Date(
            (Math.floor(Date.now() / STEP_MS) + 1) * STEP_MS,
        ).toISOString();
    const nw = northwind(request);
    const body = {
        startAt,
        bookerName: booker.name,
        bookerPhone: booker.phone,
        ...(options.paidBy ? { paidWith: "PAID", paidBy: options.paidBy } : {}),
    };
    // Lost a race on Northwind's shared rows (another test's booking or
    // order beside this one, at Serializable): the API says "Try again",
    // and nothing was written, so the desk would press again. The time is
    // the service's own, so it is never a slot taken.
    const url = `${urls.API_URL}/organizations/${NORTHWIND_ORG}/services/${service.id}/bookings`;
    const book = () => request.post(url, { headers: nw.headers, data: body });
    let res = await book();
    for (let tries = 1; res.status() === 409 && tries < 4; tries++) {
        if (!(await res.text()).includes("Try again")) break;
        res = await book();
    }
    expect(res.ok(), `${res.url()}: ${await res.text()}`).toBe(true);
    const made = (await res.json()) as { id: string };
    return { id: made.id, startAt };
}

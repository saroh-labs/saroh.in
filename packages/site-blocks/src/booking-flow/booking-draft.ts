"use client";

import type { BookingWhere, BookPay } from "./model";
import { MAX_DAYS_SKIP } from "./model";

/**
 * What the customer chose on the booking page, kept for the visit
 * (`sessionStorage`): the service, the two weeks they were looking at, who
 * with, the time, where, how they'll pay and the phone they typed.
 *
 * Signing in is the booking's last step, and the email code is read in
 * another app. A phone (the browsers inside WhatsApp and Instagram above
 * all) often loads the page again on the way back, and everything chosen
 * was gone. Kept here, the page comes back as it was left: the time is
 * checked against the times free now, and the page says what it kept.
 *
 * **Never the note.** "Anything we should know?" is where a customer tells
 * a clinic about their health, and nothing of it is written anywhere but
 * the booking. Only that a note had been typed is kept, so the page can say
 * it wasn't, and they can add it again.
 *
 * Kept only for the address it was chosen on (`search`): a reload brings it
 * back, while a link to another service or time starts from that link.
 * `sessionStorage`, never a cookie or `localStorage`: it stays in the
 * browser and ends with the tab. Cleared once the booking is made. Every
 * read is narrowed field by field and every call wrapped: a storage that
 * refuses leaves the page's own state.
 */

const KEY = "saroh.booking-draft";

/** A kept booking older than this is not brought back. */
export const BOOKING_DRAFT_MS = 2 * 60 * 60_000;

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const WHERE: readonly BookingWhere[] = ["IN_PERSON", "ONLINE"];
const PAYS: readonly BookPay[] = ["NOW", "DEPOSIT", "DESK", "CREDIT"];
const MAX_PHONE = 32;
const MAX_SEARCH = 512;

export interface BookingDraft {
    /** The address's query (`location.search`) it was chosen on. */
    search: string;
    serviceId: string;
    /** Days from today the two weeks on show start. */
    skip: number;
    /** The person asked for ("With: Asha"); null for anyone. */
    person: string | null;
    /** The start chosen, a UTC instant; null before one is. */
    startAt: string | null;
    where: BookingWhere | null;
    pay: BookPay | null;
    phone: string;
    /** A note had been typed. The note itself is never kept. */
    hadNote: boolean;
    /** When it was kept, by this browser's clock. */
    savedAt: number;
}

/**
 * The address's query as the draft is kept under: without the tag a QR
 * code's scan adds (`src`, `qr-source.ts`), which is never stored anywhere,
 * and without the tracking tags an ad or a share adds.
 */
export function draftSearch(search: string): string {
    const params = new URLSearchParams(search);
    for (const name of Array.from(params.keys())) {
        if (
            name === "src" ||
            name.startsWith("utm_") ||
            name === "fbclid" ||
            name === "gclid" ||
            name === "igshid"
        ) {
            params.delete(name);
        }
    }
    return params.toString().slice(0, MAX_SEARCH);
}

const idOrNull = (v: unknown): string | null =>
    typeof v === "string" && ID.test(v) ? v : null;

/** What is stored, narrowed field by field: anything else is nothing kept. */
export function parseBookingDraft(
    raw: string | null,
    now: number,
): BookingDraft | null {
    if (!raw) return null;
    let stored: unknown;
    try {
        stored = JSON.parse(raw);
    } catch {
        return null;
    }
    if (typeof stored !== "object" || stored === null) return null;
    const s = stored as Record<string, unknown>;
    const serviceId = idOrNull(s.serviceId);
    if (!serviceId) return null;
    if (typeof s.search !== "string" || s.search.length > MAX_SEARCH) {
        return null;
    }
    const savedAt = typeof s.savedAt === "number" ? s.savedAt : NaN;
    if (!(now >= savedAt && now - savedAt <= BOOKING_DRAFT_MS)) return null;
    const skip =
        typeof s.skip === "number" && Number.isInteger(s.skip)
            ? Math.min(MAX_DAYS_SKIP, Math.max(0, s.skip))
            : 0;
    return {
        search: s.search,
        serviceId,
        skip,
        person: idOrNull(s.person),
        startAt:
            typeof s.startAt === "string" && INSTANT.test(s.startAt)
                ? s.startAt
                : null,
        where: WHERE.find((w) => w === s.where) ?? null,
        pay: PAYS.find((p) => p === s.pay) ?? null,
        phone: typeof s.phone === "string" ? s.phone.slice(0, MAX_PHONE) : "",
        hadNote: s.hadNote === true,
        savedAt,
    };
}

/** The booking kept for this address, if there is one worth bringing back. */
export function readBookingDraft(search: string): BookingDraft | null {
    try {
        const draft = parseBookingDraft(
            window.sessionStorage.getItem(KEY),
            Date.now(),
        );
        return draft?.search === draftSearch(search) ? draft : null;
    } catch {
        return null;
    }
}

/** Keep it for the visit. */
export function writeBookingDraft(draft: Omit<BookingDraft, "savedAt">): void {
    try {
        // Rebuilt field by field, so a note (or anything else the flow
        // holds) can never be written by passing a wider object.
        const kept: BookingDraft = {
            search: draftSearch(draft.search),
            serviceId: draft.serviceId,
            skip: draft.skip,
            person: draft.person,
            startAt: draft.startAt,
            where: draft.where,
            pay: draft.pay,
            phone: draft.phone.slice(0, MAX_PHONE),
            hadNote: draft.hadNote,
            savedAt: Date.now(),
        };
        window.sessionStorage.setItem(KEY, JSON.stringify(kept));
    } catch {
        // Kept in the flow's state for this page only.
    }
}

export function clearBookingDraft(): void {
    try {
        window.sessionStorage.removeItem(KEY);
    } catch {
        // Nothing was kept.
    }
}

/**
 * What the page says when it brings a booking back: what was chosen, and,
 * when a note had been typed, that it wasn't kept.
 */
export function keptText(input: {
    serviceName: string;
    /** "Sun 20 Sep at 07:00 with Karan Mehta", or "" with no time chosen. */
    whenText: string;
    hadNote: boolean;
}): string {
    const what = [input.serviceName, input.whenText].filter(Boolean).join(", ");
    return `We kept what you chose: ${what}.${input.hadNote ? ` ${NOTE_NOT_KEPT}` : ""}`;
}

/** Said after a reload when a note had been typed (it is never stored). */
export const NOTE_NOT_KEPT =
    "Your note wasn't kept, so add it again if you need to.";

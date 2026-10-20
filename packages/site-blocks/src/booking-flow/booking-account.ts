import type { LookId } from "@saroh/block-contract";
import { phoneNumberProblem } from "@saroh/block-contract";

import type {
    SignedInCustomer,
    SignInApi,
    SignInOptions,
} from "../account/api";
import type { BookingLookup } from "../account/booking-page";
import type { PublicVisit } from "../blocks/visit-us";
import type { BusinessReach } from "../reach-links";
import type { BookSignedIn, CreditFor } from "./api";
import type { BookingPageData } from "./model";
import type { BookingStep } from "./step-url";
import type { WaitlistApi } from "./waitlist";

/**
 * Signing in on the business's site (A9): always on, never a guest path.
 * The app that draws the page passes its server actions in, since the
 * session lives in a host-only cookie only the site's server can read.
 */
export interface BookingAccount {
    /** Who is signed in on this site as the page was drawn, or null. */
    customer: SignedInCustomer | null;
    /** What the sheet needs: the business, its phone, the challenge. */
    options: SignInOptions;
    /** Ask for a code, and check it. */
    signIn: SignInApi;
    /** Book, with the session. */
    book: BookSignedIn;
    /**
     * The class credit they could pay with, with the session (A10). Absent:
     * no credit is ever offered, and booking works as before.
     */
    credit?: CreditFor;
    /** "Not you?": sign out of this site. */
    signOut: () => Promise<{ ok: boolean }>;
    /**
     * A full class's waitlist, with the session (A12). Absent: a full class
     * is closed, as before.
     */
    waitlist?: WaitlistApi;
    /**
     * One of their own bookings by its reference, with the session (U9):
     * the booked step read again after Back and Forward. Absent: a booked
     * reference the page no longer holds says it can't be found.
     */
    booking?: (ref: string) => Promise<BookingLookup>;
}

/**
 * The phone the business has for a signed-in customer, for the optional
 * "Phone": only one the booking would take, so a number staff wrote their
 * own way ("ext 4") never blocks the booking.
 */
export function accountPhone(customer: SignedInCustomer | null): string {
    const phone = customer?.phone?.trim() ?? "";
    return phone && phoneNumberProblem(phone) === null ? phone : "";
}

/** What the app gives the booking page (`BookingFlow`). */
export interface BookingFlowProps {
    page: BookingPageData;
    /** Sign-in and booking with it, through the site's server (A9). */
    account: BookingAccount;
    /** Base URL of the public API. See {@link DEFAULT_API_URL}. */
    apiUrl?: string;
    /**
     * The business's place, hours and phone for the header (E6). Null or
     * absent when it could not be read: the header names the business only.
     */
    visit?: PublicVisit | null;
    /** A service to open on (`?service=`), when it is one the page offers. */
    initialServiceId?: string | null;
    /** With it, a day and time to choose (`?date=&start=`, On today, G18). */
    initialDate?: string | null;
    initialStart?: string | null;
    /** With it, the person asked for (`?staff=`, U9). */
    initialStaff?: string | null;
    /** The step the address names (`?step=`, U9); null for none. */
    initialStep?: BookingStep | null;
    /** The booked reference the address names (`?ref=`, on `done`). */
    initialRef?: string | null;
    /** That booking, read with the customer's session on the server. */
    booked?: BookingLookup | null;
    /** "Run by ‹legal name›" on the confirmation (DEC-121); null draws none. */
    soldBy?: string | null;
    /** A call and a WhatsApp message, offered where no time can be found. */
    reach?: BusinessReach | null;
    /**
     * The site's look (DEC-172, U10): the same steps in its frame — a
     * panel (Folio), a page a question at a time (Quiet) or sheets (Live),
     * with the code asked inside Your details. Absent: Classic, today's
     * page, unchanged.
     */
    look?: LookId;
}

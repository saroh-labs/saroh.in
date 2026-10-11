/**
 * The shapes of what DEC-142 added to the customer's account: invoices
 * still to pay, places in a class's line, courses, the email choice and
 * what changed since the last visit. The same shapes the API's allow-list
 * (`site-accounts/account-details-view.ts`) sends.
 *
 * Types only, with no imports, so Home's shape (`model.ts`) and their words
 * (`details-model.ts`) both read them without reading each other.
 */

export interface AccountInvoiceDue {
    ref: string;
    number: string;
    /** What it bills: the paper's first line. */
    what: string | null;
    issuedAt: string | null;
    dueAt: string | null;
    overdue: boolean;
    total: string;
    currency: string;
    billOfSupply: boolean;
    /**
     * Through a pay link made when they press "Pay now" ("online"), not
     * while an autopay charge is under way on it ("charging"), or only with
     * the business directly ("direct").
     */
    pay: "online" | "charging" | "direct";
}

export interface AccountWaitlistPlace {
    service: string;
    serviceRef: string;
    startAt: string;
    timezone: string;
    status: "WAITING" | "OFFERED";
    /** 1 is next. Null once a place is held for them. */
    placeInLine: number | null;
    offeredUntil: string | null;
}

export interface AccountCourse {
    ref: string;
    name: string;
    firstAt: string | null;
    lastAt: string | null;
    timezone: string;
    sessions: number;
    attended: number;
    missed: number;
    left: number;
    nextAt: string | null;
}

export interface AccountNotices {
    /** The business may email them. */
    email: boolean;
}

export type AccountChange =
    | { kind: "order"; ref: string; number: string; status: string; at: string }
    | {
          kind: "booking-moved" | "booking-cancelled";
          ref: string;
          service: string;
          startAt: string;
          timezone: string;
          at: string;
      }
    | { kind: "messages"; count: number; at: string }
    | {
          kind: "invoice";
          ref: string;
          number: string;
          total: string;
          currency: string;
          at: string;
      };

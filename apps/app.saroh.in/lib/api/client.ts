import type {
    BookingView,
    CustomerView,
    HoursView,
    ProductView,
    ServiceView,
    StockView,
    VariantView,
} from "@saroh/api-contract";

/**
 * The workspace's calls typed from `@saroh/api-contract` (plan
 * 2026-11-10-001, U15). The calls still go to the internal routes through
 * `apiFetch` (`./http`), at the paths they always had; what comes from the
 * contract is only the fields an internal answer shares with the public
 * `/v1` one, by name and type. A field the two disagree on (money as a
 * decimal string here, minor units there; UPPERCASE statuses here,
 * lower_snake there; a flat address here, a nested one there) stays the
 * workspace's own, in its service file.
 *
 * Type-only: nothing of the contract's zod reaches the bundle.
 */

/** A customer, as `/stores/:store/customers` and `/v1/customers` both say it. */
export type SharedCustomer = Pick<
    CustomerView,
    "id" | "email" | "firstName" | "lastName" | "phone"
>;

/** A product's identity and words; price and status differ. */
export type SharedProduct = Pick<
    ProductView,
    "id" | "name" | "slug" | "description"
>;

/** A variant's identity; its price differs. */
export type SharedVariant = Pick<VariantView, "id" | "sku" | "title">;

/** One stock count, as a variant's row in `/v1`'s stock answer. */
export type SharedStock = Omit<StockView["variants"][number], "variantId">;

/** A service's shape and length; price, status and its own extras differ. */
export type SharedService = Pick<
    ServiceView,
    | "id"
    | "name"
    | "description"
    | "durationMinutes"
    | "bufferBeforeMinutes"
    | "bufferAfterMinutes"
    | "capacity"
    | "timezone"
    | "createdAt"
    | "updatedAt"
>;

/** One weekly window a service can be booked in. */
export type SharedHoursWindow = HoursView["windows"][number];

/** A booking's slot and times; status, outcome and the booker differ. */
export type SharedBooking = Pick<
    BookingView,
    | "id"
    | "serviceId"
    | "startAt"
    | "endAt"
    | "timezone"
    | "createdAt"
    | "cancelledAt"
>;

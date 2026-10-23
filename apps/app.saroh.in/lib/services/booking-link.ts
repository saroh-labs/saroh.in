import { z } from "zod";

/**
 * "Your booking page" in Bookings › Services (DEC-175, #1158): where the
 * business's booking page is, whether customers can open it, and what the
 * row offers. Pure, so the row's every state is tested without a browser;
 * the read is `booking-link-read.ts`, the writes `booking-link-actions.ts`.
 *
 * The booking page is the business's website's `/book`, never a site of
 * its own: Saroh makes the starter site when Bookings is turned on (or the
 * first service customers can book is added) and there is none, and
 * Publish booking page publishes that site. A business that already has a
 * website just sees its link.
 *
 * Honest until live: before customers can open it, the row says so and
 * offers no link to copy and no QR code.
 */

/** The API's `GET organizations/:id/booking-page`. */
export const bookingLinkSchema = z.object({
    state: z.enum(["none", "draft", "live"]),
    site: z
        .object({
            id: z.string().min(1),
            name: z.string(),
            address: z.string().nullable(),
        })
        .nullable(),
    host: z.string().nullable(),
    url: z.string().nullable(),
    published: z.boolean(),
    mayPublish: z.boolean(),
    make: z
        .enum(["ready", "permission", "no-service", "unavailable", "website"])
        .nullable()
        .catch(null),
});

export type BookingLinkView = z.infer<typeof bookingLinkSchema>;

/** The answer as the API sent it, or null when it can't be read. */
export function decodeBookingLink(raw: unknown): BookingLinkView | null {
    const parsed = bookingLinkSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
}

/** The row's label, whatever its state. */
export const BOOKING_LINK_LABEL = "Your booking page";

/** Said while customers can't open it, wherever it is drawn. */
export const NOT_LIVE = "Not live yet: customers can't open it";

/** The button that puts it live, and the sheet it opens. */
export const PUBLISH_LABEL = "Publish booking page";

/** The button that makes it, for a business with none. */
export const MAKE_LABEL = "Make my booking page";

/** Where Website is, for what is finished there. */
export const WEBSITE_HREF = "/sites";

/**
 * What the row draws, one shape per state:
 *
 * - `live`: the address, Copy link and QR code.
 * - `draft`: the address, "Not live yet", and either Publish booking page
 *   (`publish: "here"`), Website for a site already published whose page
 *   isn't served yet (`"website"`: publishing here would put every waiting
 *   change live too), or who can publish it (`"ask"`).
 * - `none`: no website yet, and why: Make my booking page, or what is
 *   missing first.
 */
export type BookingLinkRow =
    | { kind: "live"; address: string; url: string; line: string }
    | {
          kind: "draft";
          /** Null when it has no address yet. */
          address: string | null;
          line: string;
          publish: "here" | "website" | "ask";
      }
    | {
          kind: "none";
          line: string;
          action: "make" | "website" | null;
      };

/** "rye.saroh.app/book": what the merchant reads, without `https://`. */
export function shownAddress(url: string): string {
    return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

const NONE_LINE: Record<NonNullable<BookingLinkView["make"]>, string> = {
    ready: "No booking page yet. Make it, and customers can book you online once you publish it.",
    permission: "No booking page yet. An owner or admin can make it from here.",
    "no-service":
        "No booking page yet. Add a service customers can book online, and it's made for you.",
    unavailable: "Booking pages aren't available for your business yet.",
    website:
        "No booking page yet. Set your website up again in Website to get one.",
};

/** See {@link BookingLinkRow}. */
export function bookingLinkRow(view: BookingLinkView): BookingLinkRow {
    if (view.state === "live" && view.url) {
        return {
            kind: "live",
            address: shownAddress(view.url),
            url: view.url,
            line: "Live: customers can open it and book.",
        };
    }
    if (view.state === "none" || !view.site) {
        const make = view.make ?? "permission";
        return {
            kind: "none",
            line: NONE_LINE[make],
            action:
                make === "ready"
                    ? "make"
                    : make === "website"
                      ? "website"
                      : null,
        };
    }
    const publish = !view.mayPublish
        ? "ask"
        : view.published
          ? "website"
          : "here";
    return {
        kind: "draft",
        address: view.url ? shownAddress(view.url) : null,
        line:
            publish === "ask"
                ? `${NOT_LIVE}. An owner or admin can publish it.`
                : publish === "website"
                  ? `${NOT_LIVE}. Publish your website's latest changes in Website to put it live.`
                  : `${NOT_LIVE}.`,
        publish,
    };
}

/**
 * The sheet's sentence: what Publish booking page puts live. It is the
 * whole website, said plainly, so nobody is surprised by Home and Contact.
 */
export function publishLine(view: BookingLinkView): string {
    const where = view.url ? shownAddress(view.url) : "your web address";
    return `Customers can open ${where} and book once it's published. Your website goes live with it, at the same address, and you can change it any time in Website.`;
}

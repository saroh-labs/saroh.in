import { formatStatus } from "@/lib/format/status";

/**
 * "Came from" on a contact, in words. A contact's `source` is a key the API
 * writes, some with an id on the end (`store-customer:<id>`,
 * `enquiry:form:<id>`); read raw it showed "Customers:added" and
 * "Store-customer:cmum…" (round-2 verify, customers). Unknown keys keep
 * the old reading, without any id after a colon.
 */
export function contactSourceLabel(source: string): string {
    const key = source.trim();
    if (key === "customers:added") return "Added on Customers";
    if (key.startsWith("store-customer:")) return "An order at a storefront";
    if (key.startsWith("enquiry:")) return "An enquiry";
    if (key === "site-account") return "Signed in on your website";
    if (key === "manual") return "Added by hand";
    return formatStatus(key.split(":")[0].replace(/-/g, " "));
}

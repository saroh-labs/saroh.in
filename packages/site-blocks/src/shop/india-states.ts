/**
 * India's states and union territories, as the bag's "State" offers them.
 *
 * A choice, not a text field: the state decides the GST an order carries
 * (place of supply), and the API reads it by name, so a typed "Karnatka"
 * would be an order with the wrong tax. Each name is the register's own;
 * `apps/api.saroh.in/src/modules/invoices/gst-states.spec.ts` holds this
 * list to the API's.
 */
export const INDIA_STATES: readonly string[] = [
    "Andaman and Nicobar Islands",
    "Andhra Pradesh",
    "Arunachal Pradesh",
    "Assam",
    "Bihar",
    "Chandigarh",
    "Chhattisgarh",
    "Dadra and Nagar Haveli and Daman and Diu",
    "Delhi",
    "Goa",
    "Gujarat",
    "Haryana",
    "Himachal Pradesh",
    "Jammu and Kashmir",
    "Jharkhand",
    "Karnataka",
    "Kerala",
    "Ladakh",
    "Lakshadweep",
    "Madhya Pradesh",
    "Maharashtra",
    "Manipur",
    "Meghalaya",
    "Mizoram",
    "Nagaland",
    "Odisha",
    "Puducherry",
    "Punjab",
    "Rajasthan",
    "Sikkim",
    "Tamil Nadu",
    "Telangana",
    "Tripura",
    "Uttar Pradesh",
    "Uttarakhand",
    "West Bengal",
];

const squash = (value: string) => value.toLowerCase().replace(/[^a-z]/g, "");
const BY_NAME = new Map(INDIA_STATES.map((name) => [squash(name), name]));
// Names people type that are not the register's.
BY_NAME.set("orissa", "Odisha");
BY_NAME.set("pondicherry", "Puducherry");
BY_NAME.set("newdelhi", "Delhi");
BY_NAME.set("nctofdelhi", "Delhi");
BY_NAME.set("jammukashmir", "Jammu and Kashmir");
BY_NAME.set("andamannicobar", "Andaman and Nicobar Islands");

/**
 * A state as the list names it, from whatever was typed or kept ("karnataka ",
 * "Orissa"); "" for anything the list doesn't have, which reads as not
 * chosen yet.
 */
export function stateIn(value: string | null | undefined): string {
    return value ? (BY_NAME.get(squash(value)) ?? "") : "";
}

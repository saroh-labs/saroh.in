/**
 * The live demo businesses saroh.in links to (#1191, R7): their addresses on
 * the merchant-site domain, made by the demo script (U8). The button opens
 * the business's booking page in a new tab (`lib/demos.ts`).
 */
export type DemoTrade = "salon" | "gym";

/** Each demo's address: `https://<address>.<merchant-site domain>`. */
export const DEMO_ADDRESSES: Record<DemoTrade, string> = {
    salon: "demo-salon",
    gym: "demo-gym",
};

/** The page the button opens on the demo's site. */
export const DEMO_PATH = "/book";

export const DEMO_LABEL = "See a live demo";

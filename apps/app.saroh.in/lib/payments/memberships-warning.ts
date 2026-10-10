import { providerName } from "./providers";

/**
 * What Saroh leaving a payment provider does not do (owner, 9 Oct, #921):
 * it stops syncing with it, and cancels none of the customers' autopay
 * memberships set up there. Said where a merchant disconnects a provider
 * (Settings › Providers) and while the business is closing (the closing
 * banner), from one place so the two read the same.
 *
 * `lead` is what stops the syncing: "Disconnecting" in the confirm, "Deleting
 * the business" in the banner. The count sentence is left out at 0.
 */
export function membershipsWarning(
    provider: string,
    active: number,
    lead = "Disconnecting",
): string {
    const name = providerName(provider);
    const count =
        active > 0 ? ` — ${active} ${active === 1 ? "is" : "are"} active` : "";
    return `${lead} stops Saroh syncing with ${name}. It doesn't cancel your customers' autopay memberships there${count}. Cancel them in your ${name} dashboard if you want them stopped.`;
}

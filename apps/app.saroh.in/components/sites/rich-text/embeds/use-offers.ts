import { listOffersForPicker } from "@/lib/discounts/actions";
import type { OffersPick } from "@/lib/sites/queries";
import type { PickFailed } from "@/lib/sites/use-picker";
import { usePickerRead } from "@/lib/sites/use-picker";

export interface OfferOption {
    id: string;
    name: string;
    rule: string;
}

/** Without React Query above (a test): the Server Action it always used. */
const legacy = async (): Promise<OffersPick> => ({
    ok: true,
    offers: await listOffersForPicker(),
});

/**
 * The live offers for the Offer card (W2): `loading`, the list, or null
 * when the read failed, so nothing says "No offers yet" by mistake. One
 * cached read under `discounts` (U18), which a discount's save marks stale.
 */
export function useOffersForPicker(): OfferOption[] | null | "loading" {
    const { read } = usePickerRead<OffersPick | PickFailed>("offers", legacy);
    if (read === "loading") return "loading";
    return read.ok ? read.offers : null;
}

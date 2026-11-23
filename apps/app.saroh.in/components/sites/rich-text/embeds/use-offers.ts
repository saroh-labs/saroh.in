import { useEffect, useState } from "react";

import { listOffersForPicker } from "@/lib/discounts/actions";

export interface OfferOption {
    id: string;
    name: string;
    rule: string;
}

/**
 * The live offers for the Offer card (W2): `loading`, the list, or null
 * when the read failed, so nothing says "No offers yet" by mistake.
 */
export function useOffersForPicker(): OfferOption[] | null | "loading" {
    const [load, setLoad] = useState<OfferOption[] | null | "loading">(
        "loading",
    );
    useEffect(() => {
        let live = true;
        listOffersForPicker()
            .then((rows) => {
                if (live) setLoad(rows);
            })
            .catch(() => {
                if (live) setLoad(null);
            });
        return () => {
            live = false;
        };
    }, []);
    return load;
}

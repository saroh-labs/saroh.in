import { useEffect, useState } from "react";

import { listGridCatalogue } from "@/lib/sites/actions";
import type {
    GridCollectionOption,
    GridProductOption,
} from "@/lib/sites/grid-catalogue";

/**
 * Where the Product grid panel's read of the catalogue stands (G12). A
 * failed read is never an empty one: a picker never says "No products yet"
 * or calls a chosen product deleted because the read failed.
 */
export type GridCatalogueLoad =
    | { status: "loading" }
    | {
          status: "ready";
          products: GridProductOption[];
          collections: GridCollectionOption[];
      }
    | { status: "failed"; forbidden: boolean; retry: () => void };

/** The business's products and collections, read on mount and on retry. */
export function useGridCatalogue(): GridCatalogueLoad {
    const [read, setRead] = useState<
        | "loading"
        | {
              ok: true;
              products: GridProductOption[];
              collections: GridCollectionOption[];
          }
        | { ok: false; forbidden: boolean }
    >("loading");
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let active = true;
        listGridCatalogue()
            .then((next) => {
                if (active) setRead(next);
            })
            .catch(() => {
                if (active) setRead({ ok: false, forbidden: false });
            });
        return () => {
            active = false;
        };
    }, [attempt]);

    if (read === "loading") return { status: "loading" };
    if (read.ok) {
        return {
            status: "ready",
            products: read.products,
            collections: read.collections,
        };
    }
    return {
        status: "failed",
        forbidden: read.forbidden,
        retry: () => {
            setRead("loading");
            setAttempt((n) => n + 1);
        },
    };
}

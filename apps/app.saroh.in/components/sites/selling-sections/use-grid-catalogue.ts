import { listGridCatalogue } from "@/lib/sites/actions";
import type {
    GridCatalogueRead,
    GridCollectionOption,
    GridProductOption,
} from "@/lib/sites/grid-catalogue";
import { usePickerRead } from "@/lib/sites/use-picker";

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

/**
 * The business's products and collections: one cached read every picker
 * shares (U33), under Products' own key, so a product saved on the
 * Products screen marks it stale; read again on retry.
 */
export function useGridCatalogue(): GridCatalogueLoad {
    const { read, retry } = usePickerRead<GridCatalogueRead>(
        "products",
        listGridCatalogue,
    );
    if (read === "loading") return { status: "loading" };
    if (read.ok) {
        return {
            status: "ready",
            products: read.products,
            collections: read.collections,
        };
    }
    return { status: "failed", forbidden: read.forbidden, retry };
}

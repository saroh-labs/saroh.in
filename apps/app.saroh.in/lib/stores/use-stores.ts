"use client";

import type { QueryClient } from "@tanstack/react-query";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    createContext,
    createElement,
    useContext,
    useMemo,
    useState,
} from "react";

import { ordersKeys } from "@/lib/orders/queries";
import { productsKeys } from "@/lib/products/queries";
import { useOrgId } from "@/lib/query/org";

import type { LocationView } from "./queries";
import { locationRead, locationsRead } from "./queries";
import type { StorefrontSettings } from "./storefronts";

/** The open business's locations (DEC-259). */
export function useLocations() {
    return useQuery(locationsRead.options(useOrgId(), {}));
}

/** One location's page; no id reads nothing. */
export function useLocation(storeId: string | undefined) {
    return useQuery({
        ...locationRead.options(useOrgId(), { storeId: storeId ?? "" }),
        enabled: Boolean(storeId),
    });
}

/**
 * Orders and Products show a location's name and draw by who works where:
 * marked stale for their next visit, not read now.
 */
function staleElsewhere(qc: QueryClient, orgId: string) {
    const stale = { refetchType: "none" } as const;
    return Promise.all([
        qc.invalidateQueries({ queryKey: ordersKeys(orgId), ...stale }),
        qc.invalidateQueries({ queryKey: productsKeys(orgId), ...stale }),
    ]);
}

/**
 * How a Locations part saves (DEC-259): `orgId` goes last to each write
 * (`writeAsOrg`, refusing a moved tab), and once it landed:
 *
 * - `patch`: the location's settings as the API answered them go into its
 *   cached read, so nothing is read again for a switch or a rate.
 * - `listed`: a save the list shows (name, kind, address, pause): the list
 *   is read once; Orders and Products are marked stale.
 * - `reread`: its people or details changed: the location's read once;
 *   Orders and Products marked stale (who works where scopes them).
 * - `closed`: it is gone: its read is dropped and never asked again, so
 *   the settings read-again a close sets off (`afterSettingsSave`) isn't
 *   a 404 for it.
 *
 * Never throws: a read that fails is the screen's failed state. Outside
 * the Locations page (a test) each is a no-op and `orgId` is empty, which
 * `writeAsOrg` refuses.
 */
export interface LocationSave {
    orgId: string;
    patch: (
        storeId: string,
        fn: (s: StorefrontSettings) => StorefrontSettings,
    ) => void;
    listed: () => Promise<void>;
    reread: (storeId: string) => Promise<void>;
    closed: (storeId: string) => void;
    /** Locations closed here this visit. */
    gone: readonly string[];
}

const NONE: LocationSave = {
    orgId: "",
    patch: () => undefined,
    listed: () => Promise.resolve(),
    reread: () => Promise.resolve(),
    closed: () => undefined,
    gone: [],
};

const LocationSaveContext = createContext<LocationSave>(NONE);

export function useLocationSave(): LocationSave {
    return useContext(LocationSaveContext);
}

export function LocationSaveProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    const qc = useQueryClient();
    const orgId = useOrgId();
    const [gone, setGone] = useState<readonly string[]>([]);
    const value = useMemo((): LocationSave => {
        const settle = (p: Promise<unknown>) =>
            p.then(
                () => undefined,
                () => undefined,
            );
        return {
            orgId,
            patch: (storeId, fn) =>
                qc.setQueryData<LocationView>(
                    locationRead.key(orgId, { storeId }),
                    (v) => v && { ...v, settings: fn(v.settings) },
                ),
            listed: () =>
                settle(
                    Promise.all([
                        qc.invalidateQueries({
                            queryKey: locationsRead.key(orgId, {}),
                        }),
                        staleElsewhere(qc, orgId),
                    ]),
                ),
            reread: (storeId) =>
                settle(
                    Promise.all([
                        qc.invalidateQueries({
                            queryKey: locationRead.key(orgId, { storeId }),
                        }),
                        staleElsewhere(qc, orgId),
                    ]),
                ),
            closed: (storeId) => {
                setGone((ids) => [...ids, storeId]);
                qc.removeQueries({
                    queryKey: locationRead.key(orgId, { storeId }),
                });
            },
            gone,
        };
    }, [qc, orgId, gone]);
    return createElement(LocationSaveContext.Provider, { value }, children);
}

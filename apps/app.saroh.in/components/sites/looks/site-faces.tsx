"use client";

import type { LoadedSiteFaces } from "@saroh/site-blocks";
import { createContext, useContext } from "react";

/**
 * The merchant font faces the editor loaded (`lib/sites/site-fonts.ts`),
 * handed from the editor's layouts to the previews that draw a site, so
 * `SiteTheme` sets a site's chosen pair in the files actually loaded.
 *
 * Empty outside a provider: a preview then names the families plainly and
 * falls back to their stacks, which is how a unit test renders it.
 */
const SiteFacesContext = createContext<LoadedSiteFaces>({});

export function SiteFacesProvider({
    faces,
    children,
}: {
    faces: LoadedSiteFaces;
    children: React.ReactNode;
}) {
    return (
        <SiteFacesContext.Provider value={faces}>
            {children}
        </SiteFacesContext.Provider>
    );
}

export function useSiteFaces(): LoadedSiteFaces {
    return useContext(SiteFacesContext);
}

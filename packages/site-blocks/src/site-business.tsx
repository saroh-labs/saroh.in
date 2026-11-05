"use client";

import { createContext, useContext } from "react";

/**
 * The business a merchant page belongs to, as far as its forms care: its
 * edition and country (DEC-204), given once by the site's layout from the
 * read it does anyway. Every phone field starts on the country and a delivery
 * asks by the edition. Outside a site (a preview, a test), India's, as every
 * business was.
 */
export type SiteEdition = "INDIA" | "GLOBAL";

export interface SiteBusiness {
    edition: SiteEdition;
    country: string | null;
}

const SiteBusinessContext = createContext<SiteBusiness>({
    edition: "INDIA",
    country: null,
});

export const SiteBusinessProvider = SiteBusinessContext.Provider;

export const useSiteBusiness = () => useContext(SiteBusinessContext);

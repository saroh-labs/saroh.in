"use client";

import dynamic from "next/dynamic";

/**
 * The cookie notice and the tags it allows (`SiteTags`), fetched once the
 * page is up rather than with it. Nothing is lost: its server render is
 * empty anyway, as it waits for the answers stored in the browser.
 */
export const LazySiteTags = dynamic(
    () => import("./site-tags").then((m) => m.SiteTags),
    { ssr: false },
);

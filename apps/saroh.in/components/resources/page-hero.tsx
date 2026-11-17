import type { Crumb } from "@saroh/marketing/breadcrumbs";

/** The "Free tools" crumb: a link while this build has the /tools hub. */
export function toolsCrumb(hubBuilt: boolean): Crumb {
    return { name: "Free tools", href: hubBuilt ? "/tools" : undefined };
}

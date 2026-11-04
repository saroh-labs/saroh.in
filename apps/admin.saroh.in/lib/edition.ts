import type { DeployEnvironment, Edition } from "@saroh/edition";
import { hostsFor, parseEdition, urlOf } from "@saroh/edition";

import { env } from "@/env";

/** The edition this console serves (`NEXT_PUBLIC_EDITION`, DEC-204). */
export const EDITION = parseEdition(env.NEXT_PUBLIC_EDITION);

/** An edition in the console's words; only ever these two, no flags. */
export const EDITION_LABEL: Record<Edition, string> = {
    INDIA: "India",
    GLOBAL: "Global",
};

/** The edition's website as the console has always named it: no `www.`. */
export const websiteOf = (edition: Edition, environment: DeployEnvironment) =>
    urlOf(hostsFor(edition, environment).site.replace(/^www\./, ""));

import { editionProfile, parseEdition } from "@saroh/edition";

import { env } from "@/env";

/** The edition this deployment serves (`NEXT_PUBLIC_EDITION`, DEC-204). */
export const EDITION = parseEdition(env.NEXT_PUBLIC_EDITION);

/** What this edition does (DEC-204 item 7): ask it, never the edition. */
export const PROFILE = editionProfile(EDITION);

import { parseEdition } from "@saroh/edition";

import { env } from "@/env";

/** The edition this deployment serves (`NEXT_PUBLIC_EDITION`, DEC-204). */
export const EDITION = parseEdition(env.NEXT_PUBLIC_EDITION);

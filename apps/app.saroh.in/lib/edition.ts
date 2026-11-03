import { parseEdition } from "@saroh/edition";

/** The edition this deployment serves (`NEXT_PUBLIC_EDITION`, DEC-204). */
export const EDITION = parseEdition(process.env.NEXT_PUBLIC_EDITION);

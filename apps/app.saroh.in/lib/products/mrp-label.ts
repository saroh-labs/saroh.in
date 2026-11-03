import { EDITION } from "@/lib/edition";

/** MRP is India's printed price; elsewhere it's just a higher one (DEC-204). */
export const MRP_LABEL = EDITION === "GLOBAL" ? "Original price" : "MRP";

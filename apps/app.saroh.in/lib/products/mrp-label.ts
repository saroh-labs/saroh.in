import { PROFILE } from "@/lib/edition";

/** MRP is India's printed price; elsewhere it's just a higher one (DEC-204). */
export const MRP_LABEL =
    PROFILE.struckPrice === "original-price" ? "Original price" : "MRP";

/** The same word inside a sentence: "with MRP …", "with original price …". */
export const MRP_WORD = MRP_LABEL === "MRP" ? "MRP" : "original price";

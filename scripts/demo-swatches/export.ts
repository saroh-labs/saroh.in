/**
 * Print the showcase's generated-image list as JSON for `render.py`
 * (see its header for how to run both).
 */
import { MOTION_SWATCHES } from "../../packages/database/src/seed/showcase/physio-catalog";
import { NOOR_SWATCHES } from "../../packages/database/src/seed/showcase/salon-catalog";

console.log(
    JSON.stringify([
        { brand: "Gulmohar Salon & Bridal", swatches: NOOR_SWATCHES },
        { brand: "Stride Physio", swatches: MOTION_SWATCHES },
    ]),
);

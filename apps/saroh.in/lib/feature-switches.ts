import type {
    ClaimEnv,
    ClaimSwitch,
    ReleaseSwitch,
    SwitchEnv,
} from "@saroh/marketing/feature-switches";
import {
    claimsOffSet,
    switchedOffSet,
} from "@saroh/marketing/feature-switches";

import { browserEnv } from "@/lib/browser/env";

/**
 * The release switches this build has off (plan 2026-11-13-002, U1): the
 * one set every list of pages reads, through `PublishContext.off` and
 * `featureList`. Read at build. The feature lists reach browser code, so
 * by default this reads `browserEnv`; the server's publish context passes
 * `@/env`, which refuses a value that isn't `on` or `off`.
 */
export function featuresOff(from: SwitchEnv = browserEnv): ReleaseSwitch[] {
    return switchedOffSet(from);
}

/**
 * The claim switches this build has off (DEC-221): a claim the product
 * can't back yet is drawn only when it isn't in this list. Read at build,
 * as `featuresOff`.
 */
export function claimsOff(from: ClaimEnv = browserEnv): ClaimSwitch[] {
    return claimsOffSet(from);
}

/** Whether a claim is drawn in this build. */
export const claimOn = (claim: ClaimSwitch, from?: ClaimEnv) =>
    !claimsOff(from).includes(claim);

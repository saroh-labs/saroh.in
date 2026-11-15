import type {
    ReleaseSwitch,
    SwitchEnv,
} from "@saroh/marketing/feature-switches";
import { switchedOffSet } from "@saroh/marketing/feature-switches";

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

import type { Provider } from "@nestjs/common";
import { Logger } from "@nestjs/common";

import type { RunMarks } from "../../../common/test-run";
import { isTestRun } from "../../../common/test-run";
import { declaredNodeEnv, env } from "../../../env";
import { fakeSocialMeta } from "./fake-social-meta";
import type { MetaKeys } from "./meta-clients";
import { SocialMetaClient } from "./meta-clients";
import type { SocialMetaPort } from "./social-meta.port";
import { SOCIAL_META } from "./social-meta.port";

const logger = new Logger("SocialMeta");

/**
 * Whether the test-only fake runs: `SOCIAL_FAKE=1`, honoured only in a
 * test run (`common/test-run.ts`); `env.ts` refuses it at boot under
 * NODE_ENV=production besides.
 */
export function socialFakeAllowed(
    value: string | undefined,
    run: RunMarks,
): boolean {
    return value === "1" && isTestRun(run);
}

/** Each login's keys, or null for a login whose keys aren't all set. */
export function metaKeys(): MetaKeys {
    return {
        facebook:
            env.META_APP_ID &&
            env.META_APP_SECRET &&
            env.META_FB_LOGIN_CONFIG_ID
                ? {
                      appId: env.META_APP_ID,
                      appSecret: env.META_APP_SECRET,
                      configId: env.META_FB_LOGIN_CONFIG_ID,
                  }
                : null,
        instagram:
            env.INSTAGRAM_APP_ID && env.INSTAGRAM_APP_SECRET
                ? {
                      appId: env.INSTAGRAM_APP_ID,
                      appSecret: env.INSTAGRAM_APP_SECRET,
                  }
                : null,
        threads:
            env.THREADS_APP_ID && env.THREADS_APP_SECRET
                ? {
                      appId: env.THREADS_APP_ID,
                      appSecret: env.THREADS_APP_SECRET,
                  }
                : null,
    };
}

/**
 * Meta for this instance: the fake under the test switch, else the real
 * clients with whichever logins have keys. A login without keys answers
 * 503 when someone connects it (`MetaNotSetUpError`); with none at all
 * this is null, with one WARN at boot, and every connect answers 503.
 */
export function createSocialMeta(): SocialMetaPort | null {
    if (
        socialFakeAllowed(env.SOCIAL_FAKE, {
            nodeEnvs: [declaredNodeEnv, env.NODE_ENV],
            ci: env.CI,
        })
    ) {
        logger.warn(
            "social_meta_fake: Saroh Social runs on an in-memory Meta, never Meta (SOCIAL_FAKE, test only)",
        );
        return fakeSocialMeta;
    }
    const keys = metaKeys();
    if (!keys.facebook && !keys.instagram && !keys.threads) {
        logger.warn(
            "social_meta_off: no Meta keys set; Saroh Social channels can't be connected",
        );
        return null;
    }
    return new SocialMetaClient(keys, {
        bases: env.META_GRAPH_BASE_URL
            ? { facebookGraph: env.META_GRAPH_BASE_URL.replace(/\/$/, "") }
            : {},
    });
}

/** Nest provider exposing the port (or null, off) under {@link SOCIAL_META}. */
export const socialMetaProvider: Provider = {
    provide: SOCIAL_META,
    useFactory: createSocialMeta,
};

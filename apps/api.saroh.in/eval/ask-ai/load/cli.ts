/**
 * `pnpm --filter @saroh/api eval:ask-ai:load <seed | time | ask> [--out <dir>]`:
 * Ask AI at a big shop's scale (README beside this). Run by hand, never in
 * CI; only against the local `saroh-ai-load` database. `ask` costs money.
 */
// MUST stay the first import, bare: `@saroh/database` reads DATABASE_URL
// when it loads (src/main.ts says why).
import "../../../src/env";

import { prisma } from "@saroh/database";

const COMMANDS = {
    seed: () => import("./seed"),
    time: () => import("./time"),
    ask: () => import("./ask"),
} as const;

async function main(argv: readonly string[]): Promise<number> {
    const [command, ...rest] = argv;
    const load = COMMANDS[command as keyof typeof COMMANDS] as
        (typeof COMMANDS)[keyof typeof COMMANDS] | undefined;
    if (!load) {
        console.error(
            "[load] usage: eval:ask-ai:load <seed | time | ask> [--out <dir>]",
        );
        return 2;
    }
    return (await load()).main(rest);
}

main(process.argv.slice(2))
    .then((code) => {
        process.exitCode = code;
    })
    .catch((error: unknown) => {
        // The message, never a stack: our own errors name only hosts, files and keys.
        console.error(
            `[load] failed: ${error instanceof Error ? `${error.name}: ${error.message}` : "error"}`,
        );
        process.exitCode = 1;
    })
    .finally(() => {
        void prisma.$disconnect();
    });

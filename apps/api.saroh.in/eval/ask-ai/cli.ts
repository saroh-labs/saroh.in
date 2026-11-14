/**
 * `pnpm --filter @saroh/api eval:ask-ai <seed | run | grade> [flags]`: the
 * Ask AI quality test (README). Run by hand, never in CI; `run` and
 * `grade` cost real money.
 */
// MUST stay the first import, bare: `@saroh/database` reads DATABASE_URL
// when it loads (src/main.ts says why).
import "../../src/env";

import { prisma } from "@saroh/database";

const COMMANDS = {
    seed: () => import("./seed"),
    run: () => import("./run"),
    grade: () => import("./grade"),
} as const;

async function main(argv: readonly string[]): Promise<number> {
    const [command, ...rest] = argv;
    const load = COMMANDS[command as keyof typeof COMMANDS] as
        (typeof COMMANDS)[keyof typeof COMMANDS] | undefined;
    if (!load) {
        console.error(
            "[eval] usage: eval:ask-ai <seed | run | grade> [flags] (README)",
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
            `[eval] failed: ${error instanceof Error ? `${error.name}: ${error.message}` : "error"}`,
        );
        process.exitCode = 1;
    })
    .finally(() => {
        void prisma.$disconnect();
    });

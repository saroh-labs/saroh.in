/**
 * What the seed, the runner and the grader share: the database guard, and
 * the API booted in-process as the `ask` CLI boots it (src/cli/ask.cli.ts).
 *
 * The app's classes come from the API's build (`dist/`), not from `src/`:
 * tsx doesn't emit the decorator metadata Nest injects by. Types come from
 * `src/`. Build the API first (README).
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { Logger } from "@nestjs/common";
import type { TestingModule } from "@nestjs/testing";
import { Test } from "@nestjs/testing";

import { assertLocalDev } from "../../src/cli/ask";
import type * as AiModuleFile from "../../src/modules/ai/ai.module";
import type * as ToolBridgeFile from "../../src/modules/ai/tools/tool-bridge";
import type * as ToolboxPortFile from "../../src/modules/ai/tools/toolbox.port";
import type { AiToolbox } from "../../src/modules/ai/tools/toolbox.port";
import type * as JobWorkerServiceFile from "../../src/modules/jobs/job-worker.service";
import type { ToolCallRecord } from "./lib";

/**
 * The eval database: on this machine, outside production, and named
 * `…-eval`, so the seed can never land in a developer's own database.
 * Names only the host and database, never the connection string.
 */
export function assertEvalDatabase(): { host: string; database: string } {
    const target = assertLocalDev();
    if (!target.database.endsWith("-eval")) {
        throw new Error(
            `Refusing: the database is "${target.database}". The quality test only runs against a database whose name ends with "-eval" (README).`,
        );
    }
    return target;
}

const DIST = resolve(__dirname, "../../dist");

/** A module of the API's build; `T` is its source's type. */
export function fromDist<T>(path: string): T {
    const file = join(DIST, `${path}.js`);
    if (!existsSync(file)) {
        throw new Error(
            `No API build at ${file}: run \`pnpm --filter @saroh/api build\` first.`,
        );
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the build's classes carry Nest's metadata; tsx's don't.
    return require(file) as T;
}

export const expandHome = (path: string) =>
    path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;

/** Paths given on the command line are read from where pnpm was run. */
export const fromWhereRun = (path: string) =>
    resolve(globalThis.process.env.INIT_CWD ?? process.cwd(), expandHome(path));

/**
 * The AI module, as the `ask` CLI boots it: the job worker stubbed (it
 * would claim the local API's jobs). With `onCall`, every tool call a turn
 * makes is reported (name, input, refused or not) before its result goes
 * back to the model.
 */
export async function boot(
    onCall?: (call: ToolCallRecord) => void,
): Promise<TestingModule> {
    const { AiModule } = fromDist<typeof AiModuleFile>("modules/ai/ai.module");
    const { JobWorkerService } = fromDist<typeof JobWorkerServiceFile>(
        "modules/jobs/job-worker.service",
    );
    const { AI_TOOLBOX } = fromDist<typeof ToolboxPortFile>(
        "modules/ai/tools/toolbox.port",
    );
    const { ToolBridge } = fromDist<typeof ToolBridgeFile>(
        "modules/ai/tools/tool-bridge",
    );
    Logger.overrideLogger(["warn", "error"]);
    let builder = Test.createTestingModule({ imports: [AiModule] })
        .overrideProvider(JobWorkerService)
        .useValue({});
    if (onCall) {
        builder = builder.overrideProvider(AI_TOOLBOX).useFactory({
            factory: (bridge: AiToolbox): AiToolbox => ({
                definitions: (names) => bridge.definitions(names),
                async run(ctx, call, signal, turn) {
                    const result = await bridge.run(ctx, call, signal, turn);
                    onCall({
                        name: call.name,
                        input: call.input,
                        isError: result.isError === true,
                    });
                    return result;
                },
            }),
            inject: [ToolBridge],
        });
    }
    const app = await builder.compile();
    await app.init();
    return app;
}

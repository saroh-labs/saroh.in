/**
 * The parts of `ask.cli.ts` that need no database or Nest: its arguments,
 * the local-dev guard and the settings file's check. Kept apart so the
 * spec loads none of the app.
 */
import { isThrowawayDatabase } from "@saroh/database";

import type { AiSettingKey } from "../modules/ai/settings/ai-setting-keys";
import {
    AI_SETTING_SCHEMAS,
    isAiSettingKey,
} from "../modules/ai/settings/ai-setting-keys";

export const RATE_KEY = "cli.rupeesPerUsd";

export interface AskArgs {
    business?: string;
    as?: string;
    conversation?: string;
    setupSettings?: string;
    settings?: string;
    question?: string;
}

const FLAGS = {
    "--business": "business",
    "--as": "as",
    "--conversation": "conversation",
    "--setup-settings": "setupSettings",
    "--settings": "settings",
} as const;

/** The arguments, or null when one is not understood or a mode is incomplete. */
export function parseArgs(argv: readonly string[]): AskArgs | null {
    const args: AskArgs = {};
    const words: string[] = [];
    // Past the end is undefined at run time, whatever the index type says.
    const at = (j: number): string | undefined => argv[j];
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const [flag, inline] = arg.split(/=(.*)/s, 2) as [
            string,
            string | undefined,
        ];
        const name = FLAGS[flag as keyof typeof FLAGS] as
            (typeof FLAGS)[keyof typeof FLAGS] | undefined;
        if (name) {
            const value = (inline ?? at(++i) ?? "").trim();
            if (!value) return null;
            args[name] = value;
        } else if (arg.startsWith("--")) {
            return null;
        } else {
            words.push(arg);
        }
    }
    const question = words.join(" ").trim();
    if (question) args.question = question;
    if (!args.as) return null;
    if (args.setupSettings) return args.question ? null : args;
    return args.business && args.question ? args : null;
}

/**
 * The database this may touch: on this machine, outside production.
 * Throws a message naming only the host and database.
 */
export function assertLocalDev(
    env: NodeJS.ProcessEnv = globalThis.process.env,
): {
    host: string;
    database: string;
} {
    if (env.NODE_ENV === "production") {
        throw new Error("Refusing: NODE_ENV is production.");
    }
    let url: URL;
    try {
        url = new URL(env.DATABASE_URL ?? "");
    } catch {
        // Never echo the value: it holds the password.
        throw new Error("Refusing: DATABASE_URL is missing or not a URL.");
    }
    const host = url.hostname.split(".")[0] ?? url.hostname;
    if (!isThrowawayDatabase(env.DATABASE_URL)) {
        throw new Error(
            `Refusing: the database is on ${host}, not this machine. This command only runs against a local database.`,
        );
    }
    return { host, database: url.pathname.replace(/^\//, "") };
}

export interface SettingsFile {
    settings: [AiSettingKey, unknown][];
    rupeesPerUsd?: number;
    skipped: string[];
}

/** The settings file checked against each setting's schema, or every problem in it. */
export function parseSettingsFile(
    text: string,
): { ok: true; file: SettingsFile } | { ok: false; errors: string[] } {
    let json: unknown;
    try {
        json = JSON.parse(text);
    } catch {
        return { ok: false, errors: ["the file isn't JSON"] };
    }
    if (!json || typeof json !== "object" || Array.isArray(json)) {
        return { ok: false, errors: ["the file isn't a JSON object"] };
    }
    const file: SettingsFile = { settings: [], skipped: [] };
    const errors: string[] = [];
    for (const [key, value] of Object.entries(json)) {
        if (key === RATE_KEY) {
            if (typeof value === "number" && value > 0) {
                file.rupeesPerUsd = value;
            } else errors.push(`${RATE_KEY}: a positive number`);
        } else if (!isAiSettingKey(key)) {
            file.skipped.push(key);
        } else {
            const parsed = AI_SETTING_SCHEMAS[key].safeParse(value);
            if (parsed.success) file.settings.push([key, parsed.data]);
            else {
                errors.push(
                    `${key}: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
                );
            }
        }
    }
    return errors.length ? { ok: false, errors } : { ok: true, file };
}

/** A card in one line: its kind and its fields' names. */
export function summariseCard(kind: string, data: Record<string, unknown>) {
    return `[card ${kind}: ${Object.keys(data).join(", ") || "no fields"}]`;
}

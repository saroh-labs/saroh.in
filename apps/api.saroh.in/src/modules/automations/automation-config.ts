import { BadRequestException } from "@nestjs/common";

import { isCommsChannel } from "../communications/providers/provider.port";
import type { AutomationAction } from "./dto";

/**
 * The typed `config` shapes per automation action, and the SINGLE place they are
 * parsed/validated (S6-003). Both write-time (the service, when a rule is
 * created/updated) and run-time (the `automation.run` handler, when a rule
 * fires) go through these parsers, so a stored rule can never carry a config the
 * handler cannot execute. Each parser throws {@link BadRequestException} with a
 * field-naming message on invalid input and returns a normalized value.
 */

/** Parsed config for the `send.message` action. */
export interface SendMessageConfig {
    channel: string;
    subject?: string;
    body: string;
}

/** Parsed config for the `create.task` action. */
export interface CreateTaskConfig {
    body: string;
    /** Days from firing until the follow-up task is due (default 1, max 365). */
    dueInDays: number;
}

/** Coerce to a trimmed non-empty string or throw, naming the field. */
function requireString(
    config: Record<string, unknown>,
    key: string,
    max: number,
): string {
    const value = config[key];
    if (typeof value !== "string" || value.trim() === "") {
        throw new BadRequestException(
            `config.${key} must be a non-empty string`,
        );
    }
    const trimmed = value.trim();
    if (trimmed.length > max) {
        throw new BadRequestException(
            `config.${key} must be at most ${max} characters`,
        );
    }
    return trimmed;
}

/** Parse+validate a `send.message` config. */
export function parseSendMessageConfig(
    config: Record<string, unknown>,
): SendMessageConfig {
    const channelRaw = config.channel;
    if (typeof channelRaw !== "string") {
        throw new BadRequestException("config.channel is required");
    }
    const channel = channelRaw.trim().toUpperCase();
    if (!isCommsChannel(channel)) {
        throw new BadRequestException(
            `config.channel must be a supported channel`,
        );
    }
    const body = requireString(config, "body", 10_000);
    const subjectRaw = config.subject;
    if (subjectRaw !== undefined && typeof subjectRaw !== "string") {
        throw new BadRequestException("config.subject must be a string");
    }
    const subject =
        typeof subjectRaw === "string" && subjectRaw.trim() !== ""
            ? subjectRaw.trim().slice(0, 255)
            : undefined;
    return { channel, subject, body };
}

/** Parse+validate a `create.task` config. */
export function parseCreateTaskConfig(
    config: Record<string, unknown>,
): CreateTaskConfig {
    const body = requireString(config, "body", 2_000);
    const dueRaw = config.dueInDays;
    let dueInDays = 1;
    if (dueRaw !== undefined) {
        if (
            typeof dueRaw !== "number" ||
            !Number.isFinite(dueRaw) ||
            dueRaw < 0 ||
            dueRaw > 365
        ) {
            throw new BadRequestException(
                "config.dueInDays must be a number between 0 and 365",
            );
        }
        dueInDays = dueRaw;
    }
    return { body, dueInDays };
}

/**
 * Validate a rule's `config` against its `action` (write-time). Throws on
 * invalid; returns nothing (the service stores the raw config unchanged — the
 * handler re-parses at run time via the same functions).
 */
export function validateActionConfig(
    action: AutomationAction,
    config: Record<string, unknown>,
): void {
    switch (action) {
        case "send.message":
            parseSendMessageConfig(config);
            return;
        case "create.task":
            parseCreateTaskConfig(config);
            return;
    }
}

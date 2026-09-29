import { BadRequestException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import type { ValidationError } from "class-validator";
import { validateSync } from "class-validator";

import type { ModuleKey } from "../module-registry";
import {
    AppointmentsSetupDto,
    CommerceSetupDto,
    EmptySetupDto,
    WebsiteSetupDto,
} from "./module-setup.dto";

/**
 * Validating a module's setup payload (DEC-068).
 *
 * `setup` arrives as a plain object — its shape depends on the module in the
 * path, which a body DTO can't know — so it is checked here against the
 * module's class, with the global pipe's rules (whitelist, and any unknown
 * field refused). A refusal is a 400 whose message is the first problem, in
 * the merchant's words, and whose `details` name every field as a path the
 * sheet puts its message under:
 *
 *     { field: "setup.service.price", fields: [{ field, message }, …] }
 *
 * `field` is the first, for the app's `toFailure`.
 */

/** The typed setup for each module. */
export interface ModuleSetups {
    COMMERCE: CommerceSetupDto;
    APPOINTMENTS: AppointmentsSetupDto;
    WEBSITE: WebsiteSetupDto;
    CRM: EmptySetupDto;
    PAYMENTS: EmptySetupDto;
    COMMUNICATIONS: EmptySetupDto;
    INSIGHTS: EmptySetupDto;
    CLASS_PACKS: EmptySetupDto;
    COURSES: EmptySetupDto;
    AUTOMATIONS: EmptySetupDto;
}

export type ModuleSetup = ModuleSetups[ModuleKey];

const SETUP_CLASS: {
    [K in ModuleKey]: new () => ModuleSetups[K];
} = {
    COMMERCE: CommerceSetupDto,
    APPOINTMENTS: AppointmentsSetupDto,
    WEBSITE: WebsiteSetupDto,
    CRM: EmptySetupDto,
    PAYMENTS: EmptySetupDto,
    COMMUNICATIONS: EmptySetupDto,
    INSIGHTS: EmptySetupDto,
    CLASS_PACKS: EmptySetupDto,
    COURSES: EmptySetupDto,
    AUTOMATIONS: EmptySetupDto,
};

/** One field's problem, by its path in the request body. */
export interface SetupFieldError {
    field: string;
    message: string;
}

/** The refusal for a setup that doesn't validate: 400, every field named. */
export function setupRefusal(errors: SetupFieldError[]): BadRequestException {
    const first = errors[0] ?? { field: "setup", message: "Check the setup." };
    return new BadRequestException({
        message: first.message,
        details: { field: first.field, fields: errors },
    });
}

/** Flatten class-validator's tree into `setup.a.0.b` paths. */
function flatten(errors: ValidationError[], prefix: string): SetupFieldError[] {
    const out: SetupFieldError[] = [];
    for (const e of errors) {
        const path = `${prefix}.${e.property}`;
        // The first problem per field; the whitelist's own words are for a
        // developer.
        for (const [rule, message] of Object.entries(e.constraints ?? {})) {
            out.push({
                field: path,
                message:
                    rule === "whitelistValidation"
                        ? "This isn't something turning it on asks for."
                        : message,
            });
            break;
        }
        out.push(...flatten(e.children ?? [], path));
    }
    return out;
}

/** Hours that close after they open, per window. */
function hoursProblems(setup: AppointmentsSetupDto): SetupFieldError[] {
    return setup.hours.flatMap((h, i) =>
        h.open < h.close
            ? []
            : [
                  {
                      field: `setup.hours.${i}.close`,
                      message: "Close after you open.",
                  },
              ],
    );
}

/**
 * The module's setup, validated, or a 400 naming every field. `raw` is the
 * body's `setup` as sent; it must be an object.
 */
export function parseModuleSetup<K extends ModuleKey>(
    moduleKey: K,
    raw: unknown,
): ModuleSetups[K] {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        throw setupRefusal([
            { field: "setup", message: "Send the setup as an object." },
        ]);
    }
    const shape = SETUP_CLASS[moduleKey];
    if (shape === EmptySetupDto) {
        // Nothing to ask (class-validator has no rules to run on it): any
        // field sent is refused, as the whitelist would.
        const sent = Object.keys(raw);
        if (sent.length > 0) {
            throw setupRefusal(
                sent.map((key) => ({
                    field: `setup.${key}`,
                    message: "This isn't something turning it on asks for.",
                })),
            );
        }
        return new EmptySetupDto() as ModuleSetups[K];
    }
    const instance = plainToInstance(shape, raw);
    const errors = flatten(
        validateSync(instance, {
            whitelist: true,
            forbidNonWhitelisted: true,
        }),
        "setup",
    );
    if (errors.length === 0 && instance instanceof AppointmentsSetupDto) {
        errors.push(...hoursProblems(instance));
    }
    if (errors.length > 0) throw setupRefusal(errors);
    return instance;
}

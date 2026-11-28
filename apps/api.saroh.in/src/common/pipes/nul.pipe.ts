import type { ArgumentMetadata, PipeTransform } from "@nestjs/common";
import { BadRequestException } from "@nestjs/common";

import { nulPath } from "./zod-contract.pipe";

/**
 * Refuses a NUL character in any body, query or path value with a 400 that
 * names the field. Postgres refuses the byte in text, so without this a
 * `%00` in a list's search failed the query with a 500 (pentest 28 Nov
 * 2026, I-1). Global (main.ts), beside {@link BodyDepthPipe}; the public
 * `/v1` routes' `ZodContractPipe` asks the same.
 */
export class NulPipe implements PipeTransform {
    transform(value: unknown, metadata: ArgumentMetadata): unknown {
        if (metadata.type === "custom") return value;
        const path = nulPath(value);
        if (path) {
            const field = [metadata.type, ...path].join(".");
            throw new BadRequestException(
                `${field}: Must not contain a NUL character`,
            );
        }
        return value;
    }
}

import {
    Body,
    Controller,
    HttpCode,
    HttpException,
    HttpStatus,
    Ip,
    Post,
} from "@nestjs/common";
import { createHash } from "node:crypto";

import { FixedWindowRateLimiter } from "../enquiry/rate-limiter";
import { JoinWaitlistDto } from "./dto";
import { WaitlistService } from "./waitlist.service";

/**
 * PUBLIC waitlist API, mounted at `/public/waitlist` with NO guards — this is
 * what the marketing site's form POST reaches. Mirrors the guardless enquiry
 * (S3-002) and public-payments surfaces.
 *
 * Write-only by design: there is no GET here. The list of people waiting is an
 * operator concern and does not belong on an unauthenticated controller.
 */
@Controller("public/waitlist")
export class WaitlistController {
    /**
     * Per-IP speed bump. Same in-process, non-durable limiter the enquiry
     * surface uses — a cheap abuse brake, not a guarantee (see its docstring:
     * behind N replicas a client gets N× the limit). A waitlist is a low-value
     * target, so this is proportionate; a distributed limiter stays a later
     * concern shared with enquiry.
     */
    private readonly limiter = new FixedWindowRateLimiter(5, 60_000);

    constructor(private readonly waitlist: WaitlistService) {}

    @Post()
    @HttpCode(HttpStatus.OK)
    async join(@Body() dto: JoinWaitlistDto, @Ip() ip: string) {
        // The raw IP is hashed immediately and never leaves this handler — it
        // is used as the rate-limit key and stored only as a digest.
        const ipHash = ip
            ? createHash("sha256").update(ip).digest("hex")
            : undefined;

        if (ipHash && !this.limiter.take(ipHash)) {
            throw new HttpException(
                "Too many signups from this address. Try again shortly.",
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }

        const { created } = await this.waitlist.join({
            email: dto.email,
            source: dto.source,
            ipHash,
        });

        return { ok: true, created };
    }
}

import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    Header,
    HttpCode,
    HttpStatus,
    Ip,
    Post,
    Req,
    Res,
    UseGuards,
} from "@nestjs/common";
import { fromNodeHeaders } from "better-auth/node";
import type { Request, Response } from "express";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import type { AuthUser } from "../../common/types/store-context";
import type {
    PhoneOptions,
    PhoneProof,
    PhoneStart,
} from "./account-phone.service";
import { AccountPhoneService, placeOf } from "./account-phone.service";
import { StartPhoneDto, VerifyPhoneDto } from "./dto";

/**
 * Signing in to Saroh with a verified phone (DEC-196), before anyone is
 * signed in. Not under `/public/`: the sign-in sets the session cookie, so
 * these take credentialed CORS from Saroh's own origins only, and
 * `OriginGuard` refuses a write from anywhere else.
 */
@Controller("account-phone")
export class PhoneSignInController {
    constructor(private readonly phones: AccountPhoneService) {}

    /** Whether to offer "Use phone instead", and Turnstile's public key. */
    @Get("options")
    @Header("Cache-Control", "no-store")
    options(): Promise<PhoneOptions> {
        return this.phones.options();
    }

    /** Turnstile and the limits, then a WhatsApp code sent, or the SMS widget's config. */
    @Post("start")
    @HttpCode(HttpStatus.OK)
    @Header("Cache-Control", "no-store")
    start(@Body() dto: StartPhoneDto, @Ip() ip: string): Promise<PhoneStart> {
        return this.phones.start({
            phoneE164: dto.phone,
            channel: dto.channel ?? "whatsapp",
            purpose: "sign-in",
            turnstileToken: dto.turnstileToken,
            ip,
        });
    }

    /** The WhatsApp code or the widget's token, checked on the server, for Better Auth's session. */
    @Post("sign-in")
    @HttpCode(HttpStatus.OK)
    @Header("Cache-Control", "no-store")
    async signIn(
        @Body() dto: VerifyPhoneDto,
        @Ip() ip: string,
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response,
    ): Promise<{ signedIn: true }> {
        const headers = fromNodeHeaders(req.headers);
        const cookies = await this.phones.signIn({
            phoneE164: dto.phone,
            proof: proofOf(dto),
            ip,
            headers,
            place: placeOf(headers),
        });
        res.setHeader("Set-Cookie", cookies.getSetCookie());
        return { signedIn: true };
    }
}

/** The signed-in person's own phone: add or change it, or remove it. */
@Controller("account/phone")
@UseGuards(BetterAuthGuard)
export class AccountPhoneController {
    constructor(private readonly phones: AccountPhoneService) {}

    /** A code for the new number, bound to this person. */
    @Post("start")
    @HttpCode(HttpStatus.OK)
    @Header("Cache-Control", "no-store")
    start(
        @CurrentUser() user: AuthUser,
        @Body() dto: StartPhoneDto,
        @Ip() ip: string,
    ): Promise<PhoneStart> {
        return this.phones.start({
            phoneE164: dto.phone,
            channel: dto.channel ?? "whatsapp",
            purpose: "add",
            userId: user.id,
            turnstileToken: dto.turnstileToken,
            ip,
        });
    }

    /** Add or change: always a fresh verify of the new number. */
    @Post()
    @HttpCode(HttpStatus.OK)
    @Header("Cache-Control", "no-store")
    add(
        @CurrentUser() user: AuthUser,
        @Body() dto: VerifyPhoneDto,
        @Ip() ip: string,
        @Req() req: Request,
    ): Promise<{ phoneE164: string; phoneVerifiedAt: Date }> {
        return this.phones.add({
            userId: user.id,
            phoneE164: dto.phone,
            proof: proofOf(dto),
            ip,
            place: placeOf(fromNodeHeaders(req.headers)),
        });
    }

    @Delete()
    @HttpCode(HttpStatus.NO_CONTENT)
    remove(
        @CurrentUser() user: AuthUser,
        @Ip() ip: string,
        @Req() req: Request,
    ): Promise<void> {
        return this.phones.remove({
            userId: user.id,
            ip,
            place: placeOf(fromNodeHeaders(req.headers)),
        });
    }
}

/** Exactly one of the WhatsApp code or the widget's token. */
function proofOf(dto: VerifyPhoneDto): PhoneProof {
    if (dto.code !== undefined && dto.accessToken === undefined) {
        return { code: dto.code };
    }
    if (dto.accessToken !== undefined && dto.code === undefined) {
        return { accessToken: dto.accessToken };
    }
    throw new BadRequestException({
        message: "Send the code or the widget's token, not both or neither.",
        details: { code: "PROOF" },
    });
}

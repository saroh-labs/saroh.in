import {
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
import type { PhoneOptions, PhoneStart } from "./account-phone.service";
import { AccountPhoneService } from "./account-phone.service";
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
    options(): PhoneOptions {
        return this.phones.options();
    }

    /** The soft gate: Turnstile and the limits, then the widget's config. */
    @Post("start")
    @HttpCode(HttpStatus.OK)
    @Header("Cache-Control", "no-store")
    start(@Body() dto: StartPhoneDto, @Ip() ip: string): Promise<PhoneStart> {
        return this.phones.start({
            phoneE164: dto.phone,
            turnstileToken: dto.turnstileToken,
            ip,
        });
    }

    /** The widget's token, checked on the server, for Better Auth's session. */
    @Post("sign-in")
    @HttpCode(HttpStatus.OK)
    @Header("Cache-Control", "no-store")
    async signIn(
        @Body() dto: VerifyPhoneDto,
        @Ip() ip: string,
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response,
    ): Promise<{ signedIn: true }> {
        const headers = await this.phones.signIn({
            phoneE164: dto.phone,
            accessToken: dto.accessToken,
            ip,
            headers: fromNodeHeaders(req.headers),
        });
        res.setHeader("Set-Cookie", headers.getSetCookie());
        return { signedIn: true };
    }
}

/** The signed-in person's own phone: add or change it, or remove it. */
@Controller("account/phone")
@UseGuards(BetterAuthGuard)
export class AccountPhoneController {
    constructor(private readonly phones: AccountPhoneService) {}

    /** Add or change: always a fresh verify of the new number. */
    @Post()
    @HttpCode(HttpStatus.OK)
    @Header("Cache-Control", "no-store")
    add(
        @CurrentUser() user: AuthUser,
        @Body() dto: VerifyPhoneDto,
        @Ip() ip: string,
    ): Promise<{ phoneE164: string; phoneVerifiedAt: Date }> {
        return this.phones.add({
            userId: user.id,
            phoneE164: dto.phone,
            accessToken: dto.accessToken,
            ip,
        });
    }

    @Delete()
    @HttpCode(HttpStatus.NO_CONTENT)
    remove(@CurrentUser() user: AuthUser, @Ip() ip: string): Promise<void> {
        return this.phones.remove({ userId: user.id, ip });
    }
}

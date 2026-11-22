import { Controller, Get, UseGuards } from "@nestjs/common";

import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { websiteAreaOn } from "./website-area-switch";

/**
 * The Website area switch the app draws by (DEC-240): `{ on }` to anyone
 * signed in, so the app never keeps a switch of its own. The app reads it
 * once per request; an answer it can't read is off.
 */
@Controller("website-area")
@UseGuards(BetterAuthGuard)
export class WebsiteAreaController {
    @Get()
    read(): { on: boolean } {
        return { on: websiteAreaOn() };
    }
}

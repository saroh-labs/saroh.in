import {
    Body,
    Controller,
    Get,
    Header,
    HttpCode,
    HttpStatus,
    Post,
    Query,
    UseGuards,
} from "@nestjs/common";

import type {
    PublicWaitlistPlace,
    WaitlistJoined,
} from "../bookings/waitlist.service";
import { WaitlistService } from "../bookings/waitlist.service";
import type { CustomerContext } from "./customer-context.decorator";
import { CurrentCustomer } from "./customer-context.decorator";
import { CustomerSessionGuard } from "./customer-session.guard";
import { WaitlistQueryDto, WaitlistSessionDto } from "./dto";

/**
 * A full class's waitlist, from the booking page (round-2 A12, R13):
 * `public/site-accounts/waitlist`. Joining is signed in, as booking is
 * (A9): the place in line is the account's contact's, and a freed place
 * held for them is booked through the normal path.
 *
 * Behind {@link CustomerSessionGuard} only, like booking: it is part of
 * the booking page, which is live on every site, not of the account area
 * behind `SITE_ACCOUNT_AREA`. Registered by `BookingsModule`, which owns
 * the waitlist service.
 */
@Controller("public/site-accounts/waitlist")
@UseGuards(CustomerSessionGuard)
export class AccountWaitlistController {
    constructor(private readonly waitlist: WaitlistService) {}

    /** Their places in line for one service's classes still to come. */
    @Get()
    @Header("Cache-Control", "no-store")
    mine(
        @CurrentCustomer() customer: CustomerContext,
        @Query() query: WaitlistQueryDto,
    ): Promise<{ places: PublicWaitlistPlace[] }> {
        return this.waitlist.mine(signedIn(customer), query.serviceId);
    }

    /** Join the line for one full session. */
    @Post()
    @HttpCode(HttpStatus.CREATED)
    @Header("Cache-Control", "no-store")
    join(
        @CurrentCustomer() customer: CustomerContext,
        @Body() dto: WaitlistSessionDto,
    ): Promise<WaitlistJoined> {
        return this.waitlist.join(
            signedIn(customer),
            dto.serviceId,
            dto.startAt,
        );
    }

    /** Leave it; a place held for them goes to the next in line. */
    @Post("leave")
    @HttpCode(HttpStatus.OK)
    @Header("Cache-Control", "no-store")
    leave(
        @CurrentCustomer() customer: CustomerContext,
        @Body() dto: WaitlistSessionDto,
    ): Promise<{ left: boolean }> {
        return this.waitlist.leave(
            signedIn(customer),
            dto.serviceId,
            dto.startAt,
        );
    }
}

function signedIn(customer: CustomerContext) {
    return {
        organizationId: customer.organizationId,
        accountId: customer.accountId,
        contactId: customer.contactId,
    };
}

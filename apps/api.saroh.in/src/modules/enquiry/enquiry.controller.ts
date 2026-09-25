import { Body, Controller, Ip, Param, Post } from "@nestjs/common";
import { hashClientIp } from "../../common/client-ip";

import { SubmitEnquiryDto } from "./dto";
import { EnquiryService } from "./enquiry.service";

/**
 * PUBLIC enquiry submission API (S3-002), mounted at `/public/forms` with NO
 * guards — this is what an anonymous visitor's form POST hits. There is
 * deliberately no `BetterAuthGuard`/`OrganizationGuard` and no `@OrgContext()`:
 * no session, no client-supplied org.
 *
 * The owning organization is derived entirely from the target Form inside
 * {@link EnquiryService.submit}, so this unauthenticated endpoint can only ever
 * create rows in the org that owns the form it targets.
 */
@Controller("public/forms")
export class EnquiryController {
    constructor(private readonly enquiry: EnquiryService) {}

    /**
     * Submit an enquiry against `:formId`. The source IP (from `@Ip()`) is
     * immediately hashed (sha256; IPv6 by its /64, `common/client-ip.ts`) and
     * only the hash is ever passed on / stored — the raw IP never leaves this
     * handler.
     */
    @Post(":formId/submit")
    submit(
        @Param("formId") formId: string,
        @Body() dto: SubmitEnquiryDto,
        @Ip() ip: string,
    ) {
        const ipHash = hashClientIp(ip);

        return this.enquiry.submit(
            formId,
            dto.data,
            dto.idempotencyKey,
            ipHash,
        );
    }
}

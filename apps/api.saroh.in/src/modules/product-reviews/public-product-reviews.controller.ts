import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";

import { PublicReviewDto } from "./dto";
import { PublicProductReviewsService } from "./public-product-reviews.service";

/**
 * The customer's review page reads and posts here — no session, no guards,
 * under `/public/` (which the origin guard exempts). Its own controller so a
 * public surface is obvious in the file tree; everything hangs on the token.
 */
@Controller("public/product-reviews")
export class PublicProductReviewsController {
    constructor(private readonly reviews: PublicProductReviewsService) {}

    @Get(":token")
    read(@Param("token") token: string) {
        return this.reviews.read(token);
    }

    @Post(":token/reviews")
    @HttpCode(201)
    submit(@Param("token") token: string, @Body() dto: PublicReviewDto) {
        return this.reviews.submit(token, dto);
    }
}

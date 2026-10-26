import { Controller, Get } from "@nestjs/common";

import { SearchPagesService } from "./search-pages.service";

/**
 * Which search pages saroh.in builds (DEC-193): `live` are on the site, and
 * `takenOff` were live once and are not now (unpublished or archived), so
 * their old address redirects. Both sorted by path. No guards: the site's
 * build reads it, and it says nothing a visitor can't see on the site.
 */
@Controller("public/search-pages")
export class PublicSearchPagesController {
    constructor(private readonly pages: SearchPagesService) {}

    @Get()
    list() {
        return this.pages.publicList();
    }
}

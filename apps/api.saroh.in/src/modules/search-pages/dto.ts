import {
    ArrayMaxSize,
    ArrayMinSize,
    ArrayUnique,
    IsArray,
    IsIn,
    IsString,
    Matches,
} from "class-validator";

import type { SearchPageAction } from "./search-page-rules";
import {
    MAX_PATHS_PER_ACTION,
    SEARCH_PAGE_ACTIONS,
    SEARCH_PAGE_PATH,
} from "./search-page-rules";

const PATH_MESSAGE =
    "Each path is /for/ or /tools/ and a slug of a-z, 0-9 and -";

/** `POST /admin/search-pages/actions`: one action on 1–100 pages, all or none. */
export class SearchPageActionDto {
    @IsIn(SEARCH_PAGE_ACTIONS)
    action!: SearchPageAction;

    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(MAX_PATHS_PER_ACTION)
    @ArrayUnique()
    @IsString({ each: true })
    @Matches(SEARCH_PAGE_PATH, { each: true, message: PATH_MESSAGE })
    paths!: string[];
}

/** `GET /admin/search-pages/history?path=/for/x`. */
export class SearchPageHistoryQueryDto {
    @IsString()
    @Matches(SEARCH_PAGE_PATH, { message: PATH_MESSAGE })
    path!: string;
}

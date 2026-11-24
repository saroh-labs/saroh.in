import "server-only";

import { cache } from "react";

import { makeQueryClient } from "@/lib/query/client";

/**
 * The server render's QueryClient (DEC-259): made inside React's `cache()`,
 * so a request's components share one and it is thrown away with the
 * request. Never a module-level client: that would hand one person's rows
 * to the next request.
 */
export const getServerQueryClient = cache(makeQueryClient);

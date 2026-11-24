import { homeSetupServer, maySeeSetup } from "@/lib/home/access";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** Home's "Finish setup" (DEC-259): owners and admins only. */
export const dynamic = "force-dynamic";
export const GET = readRoute(homeSetupServer, maySeeSetup);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;

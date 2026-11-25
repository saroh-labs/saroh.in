import { mayReadModules, modulesServer } from "@/lib/modules/access";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** Settings › Modules: every module's state and the plan's connect locks, to anyone in the business (DEC-259). */
export const dynamic = "force-dynamic";
export const GET = readRoute(modulesServer, mayReadModules);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;

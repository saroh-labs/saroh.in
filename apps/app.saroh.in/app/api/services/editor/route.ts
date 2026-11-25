import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import {
    mayReadServices,
    serviceEditorServer,
} from "@/lib/services/access-server";

/** New service's editor context (DEC-259). */
export const dynamic = "force-dynamic";
export const GET = readRoute(serviceEditorServer, mayReadServices);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;

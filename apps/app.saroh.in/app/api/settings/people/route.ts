import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import { mayReadPeople, peopleServer } from "@/lib/settings/access";

/** Settings › Team: the roster, invitations and roles, to whoever may open Team (member:read) (DEC-259). */
export const dynamic = "force-dynamic";
export const GET = readRoute(peopleServer, mayReadPeople);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;

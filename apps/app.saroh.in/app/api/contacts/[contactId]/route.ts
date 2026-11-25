import { mayReadPersonCrm, personCrmServer } from "@/lib/contacts/access";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** A person's leads and enquiries (DEC-259): CRM on and `lead:read`; another business's contact is a 404. */
export const dynamic = "force-dynamic";
export const GET = readRoute(personCrmServer, mayReadPersonCrm);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;

import { contactsListServer, mayReadContacts } from "@/lib/contacts/access";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** The business's contacts (DEC-259), behind the list's CRM gate. */
export const dynamic = "force-dynamic";
export const GET = readRoute(contactsListServer, mayReadContacts);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;

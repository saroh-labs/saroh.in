import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import { mayReadPlans, plansServer } from "@/lib/saroh-billing/screen-service";

/** Settings › Plan and billing › Change plan: the plans' cards, to billing:read (DEC-259). */
export const dynamic = "force-dynamic";
export const GET = readRoute(plansServer, mayReadPlans);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;

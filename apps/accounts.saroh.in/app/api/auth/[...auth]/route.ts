import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

const handlers = toNextJsHandler(auth);

export const { POST, GET, PUT, PATCH, DELETE } = handlers;

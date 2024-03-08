import { handle } from "hono/vercel";
import app from "../src/app";

export const POST = handle(app);

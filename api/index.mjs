import { handle } from "hono/vercel";
import app from "../src/index";

export const runtime = "edge";

export const POST = handle(app);
export default handle(app);

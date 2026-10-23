import { Hono } from "hono";
import type { Env } from "./env";

/** Hono environment shared by every route module. */
export type AppEnv = { Bindings: Env };

export const newApp = () => new Hono<AppEnv>();

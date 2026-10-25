import type { Env } from "../env";
import { adminFromRequest } from "./access";

export type FeatureKey = "video" | "instagram" | "sightings" | "globe_wrapped";

/** Same meaning as `features` in `GET /api/config`: "on" for everyone, "admin" only for a signed-in admin, anything else is off. */
export async function featureEnabled(env: Env, req: Request, settings: Record<string, string>, key: FeatureKey): Promise<boolean> {
  const flag = settings[`feature_${key}`];
  if (flag === "on") return true;
  return flag === "admin" && (await adminFromRequest(env, req)) !== null;
}

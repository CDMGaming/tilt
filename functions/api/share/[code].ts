// GET /api/share/:code: the shared song (cached for a year; a miss is never cached).
import { getShare, type ShareEnv } from "../../../src/server/shareapi";

export const onRequestGet = ({ params, env }: { params: { code: string }; env: ShareEnv }) => getShare(String(params.code), env);

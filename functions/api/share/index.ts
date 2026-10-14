// POST /api/share: store a song (write-once), answer with its code. See src/server/shareapi.ts.
import { postShare, type ShareEnv } from "../../../src/server/shareapi";

export const onRequestPost = ({ request, env }: { request: Request; env: ShareEnv }) => postShare(request, env);

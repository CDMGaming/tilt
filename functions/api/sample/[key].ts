// PUT / GET /api/sample/:key: a user sample, stored in R2 under the hash of its bytes.
import { getSampleBlob, putSampleBlob, type ShareEnv } from "../../../src/server/shareapi";

export const onRequestPut = ({ request, params, env }: { request: Request; params: { key: string }; env: ShareEnv }) => putSampleBlob(request, String(params.key), env);
export const onRequestGet = ({ params, env }: { params: { key: string }; env: ShareEnv }) => getSampleBlob(String(params.key), env);

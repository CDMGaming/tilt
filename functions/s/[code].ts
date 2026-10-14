// GET /s/:code: the app itself; it reads the code from the address and opens the shared song.
interface Env { ASSETS: { fetch(req: Request | URL): Promise<Response> } }

export const onRequestGet = ({ request, env }: { request: Request; env: Env }) => env.ASSETS.fetch(new URL("/", request.url));

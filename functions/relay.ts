// wss://<site>/relay: online games. Passed straight to the relay Durable Object
// (cloud/relay-worker.ts), so the app finds its server next to itself.

interface Env { RELAY: { idFromName(name: string): unknown; get(id: unknown): { fetch(req: Request): Promise<Response> } } }

export const onRequest = ({ request, env }: { request: Request; env: Env }) =>
  env.RELAY.get(env.RELAY.idFromName("lobby")).fetch(request);

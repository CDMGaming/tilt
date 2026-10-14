// TILT online relay on Cloudflare: the same Rooms as tools/relay.ts, living in one
// Durable Object so every player's socket reaches the same rooms. The app's Pages
// site forwards wss://<site>/relay here (functions/relay.ts); this worker has no
// public address of its own.
// Deployed by .github/workflows/deploy.yml (wrangler deploy --config cloud/wrangler.toml).

import { Rooms } from "../tools/relay.ts";

// The few Workers runtime types used here (wrangler bundles without type-checking).
declare const WebSocketPair: { new (): Record<0 | 1, CfSocket> };
interface CfSocket {
  accept(): void;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: "message" | "close" | "error", fn: (e: { data?: unknown }) => void): void;
}
interface Namespace { idFromName(name: string): unknown; get(id: unknown): { fetch(req: Request): Promise<Response> } }
interface Env { RELAY: Namespace }

export class RelayRoom {
  private rooms = new Rooms();

  fetch(req: Request): Response {
    if (req.headers.get("upgrade") !== "websocket") return new Response("TILT relay: connect with a WebSocket\n");
    const u = new URL(req.url);
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    server.accept();
    const gone = () => {
      this.rooms.close(server);
      try { server.close(1000); } catch { /* already closed */ }
    };
    server.addEventListener("message", (e) => { if (typeof e.data === "string") this.rooms.message(server, e.data); });
    server.addEventListener("close", gone);
    server.addEventListener("error", gone);
    this.rooms.open(server, { create: u.searchParams.has("create"), room: u.searchParams.get("room") ?? "", name: u.searchParams.get("name") ?? "" });
    return new Response(null, { status: 101, webSocket: client } as ResponseInit);
  }
}

/** One lobby object holds every room (a few friends at a time needs nothing more). */
export function lobby(env: Env) {
  return env.RELAY.get(env.RELAY.idFromName("lobby"));
}

export default {
  fetch(req: Request, env: Env) { return lobby(env).fetch(req); },
};

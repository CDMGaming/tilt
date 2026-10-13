// Rollbox online relay: rooms of up to 4 players, each a WebSocket. The relay
// knows nothing about music: it hands out room codes and peer ids, passes JSON
// messages on (to everyone else in the room, or to one peer with `to`), stamps
// them with `from`, and answers clock pings with its own time so players can
// agree on when "now" is. The host's machine holds the song.
//
// Run: deno run -A tools/relay.ts [port]          (default 8787)
// Connect: ws://host:8787/?create=1&name=Felix    -> a new room, you are the host
//          ws://host:8787/?room=ABCD&name=Matt     -> join that room

export const MAX_PEERS = 4;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I
const MAX_MESSAGE = 4 * 1024 * 1024;

export interface Sock { send(data: string): void; close(code?: number, reason?: string): void }

interface Peer { id: string; name: string; sock: Sock }
interface Room { code: string; hostId: string; peers: Map<string, Peer> }

export class Rooms {
  rooms = new Map<string, Room>();
  private where = new Map<Sock, { room: Room; peer: Peer }>();
  private nextPeer = 1;

  constructor(private now: () => number = () => Date.now(), private rand: () => number = Math.random) {}

  private code(): string {
    for (;;) {
      let c = "";
      for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(this.rand() * CODE_CHARS.length)];
      if (!this.rooms.has(c)) return c;
    }
  }

  /** A socket opened. Returns false (and closes it) when it can't join. */
  open(sock: Sock, q: { create?: boolean; room?: string; name?: string }): boolean {
    const name = (q.name ?? "Player").slice(0, 20) || "Player";
    let room: Room | undefined;
    if (q.create) {
      room = { code: this.code(), hostId: "", peers: new Map() };
      this.rooms.set(room.code, room);
    } else {
      room = this.rooms.get((q.room ?? "").toUpperCase().trim());
      if (!room) { sock.send(JSON.stringify({ t: "error", why: "No game with that code" })); sock.close(4004, "no room"); return false; }
      if (room.peers.size >= MAX_PEERS) { sock.send(JSON.stringify({ t: "error", why: "That game is full (4 players)" })); sock.close(4003, "full"); return false; }
    }
    const peer: Peer = { id: `c${this.nextPeer++}`, name, sock };
    if (q.create) room.hostId = peer.id;
    const others = [...room.peers.values()].map((p) => ({ id: p.id, name: p.name }));
    room.peers.set(peer.id, peer);
    this.where.set(sock, { room, peer });
    sock.send(JSON.stringify({ t: "welcome", id: peer.id, room: room.code, hostId: room.hostId, peers: others, s: this.now() }));
    this.broadcast(room, peer.id, { t: "peer-join", id: peer.id, name });
    return true;
  }

  message(sock: Sock, data: string) {
    const at = this.where.get(sock);
    if (!at || data.length > MAX_MESSAGE) return;
    let m: Record<string, unknown>;
    try { m = JSON.parse(data); } catch { return; }
    if (!m || typeof m !== "object") return;
    if (m.t === "ping") { sock.send(JSON.stringify({ t: "pong", c: m.c, s: this.now() })); return; }
    const out = JSON.stringify({ ...m, from: at.peer.id });
    if (typeof m.to === "string") at.room.peers.get(m.to)?.sock.send(out);
    else for (const p of at.room.peers.values()) if (p !== at.peer) p.sock.send(out);
  }

  close(sock: Sock) {
    const at = this.where.get(sock);
    if (!at) return;
    this.where.delete(sock);
    const { room, peer } = at;
    room.peers.delete(peer.id);
    if (peer.id === room.hostId) {
      // The host holds the song: without them the game is over.
      // The guests close their own sockets when they hear it (closing from both ends makes browsers complain).
      this.broadcast(room, peer.id, { t: "host-left" });
      for (const p of room.peers.values()) this.where.delete(p.sock);
      this.rooms.delete(room.code);
      return;
    }
    this.broadcast(room, peer.id, { t: "peer-leave", id: peer.id });
    if (!room.peers.size) this.rooms.delete(room.code);
  }

  private broadcast(room: Room, except: string, m: unknown) {
    const s = JSON.stringify(m);
    for (const p of room.peers.values()) if (p.id !== except) p.sock.send(s);
  }
}

if (import.meta.main) {
  const port = Number(Deno.args[0] ?? 8787);
  const rooms = new Rooms();
  Deno.serve({ port, hostname: "0.0.0.0" }, (req) => {
    if (req.headers.get("upgrade") !== "websocket") return new Response("Rollbox relay: connect with a WebSocket\n", { headers: { "access-control-allow-origin": "*" } });
    const u = new URL(req.url);
    const { socket, response } = Deno.upgradeWebSocket(req);
    socket.onopen = () => {
      const ok = rooms.open(socket, { create: u.searchParams.has("create"), room: u.searchParams.get("room") ?? "", name: u.searchParams.get("name") ?? "" });
      if (ok) console.log(`[relay] ${rooms.rooms.size} room(s)`);
    };
    socket.onmessage = (e) => { if (typeof e.data === "string") rooms.message(socket, e.data); };
    socket.onclose = () => rooms.close(socket);
    socket.onerror = () => rooms.close(socket);
    return response;
  });
  console.log(`[relay] listening on ws://0.0.0.0:${port}`);
}

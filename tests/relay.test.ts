// Run: deno test --sloppy-imports tests/
import { assert, assertEquals } from "jsr:@std/assert@1";
import { Rooms, type Sock } from "../tools/relay.ts";

class FakeSock implements Sock {
  got: Record<string, unknown>[] = [];
  closed = false;
  send(d: string) { this.got.push(JSON.parse(d)); }
  close() { this.closed = true; }
  last(t: string) { return [...this.got].reverse().find((m) => m.t === t); }
}

Deno.test("relay: create, join, pass messages on, one-to-one, clock, host leaving", () => {
  const rooms = new Rooms(() => 1000, () => 0.1);
  const host = new FakeSock(), guest = new FakeSock(), third = new FakeSock();
  assert(rooms.open(host, { create: true, name: "Felix" }));
  const code = host.last("welcome")!.room as string;
  assertEquals(code.length, 4);
  assert(rooms.open(guest, { room: code.toLowerCase(), name: "Matt" }), "codes are case-insensitive");
  assertEquals(guest.last("welcome")!.hostId, host.last("welcome")!.id);
  assertEquals(host.last("peer-join")!.name, "Matt");
  rooms.open(third, { room: code, name: "Sam" });

  rooms.message(guest, JSON.stringify({ t: "patches", patches: [] }));
  assertEquals(host.last("patches")!.from, guest.last("welcome")!.id);
  assertEquals(third.last("patches")!.from, guest.last("welcome")!.id);
  assertEquals(guest.last("patches"), undefined, "not echoed to the sender");

  rooms.message(host, JSON.stringify({ t: "snapshot", to: guest.last("welcome")!.id }));
  assert(guest.last("snapshot"));
  assertEquals(third.last("snapshot"), undefined, "one-to-one stays private");

  rooms.message(guest, JSON.stringify({ t: "ping", c: 5 }));
  assertEquals(guest.last("pong"), { t: "pong", c: 5, s: 1000 });

  rooms.close(third);
  assertEquals(host.last("peer-leave")!.id, third.last("welcome")!.id);
  rooms.close(host);
  assert(guest.last("host-left"));
  rooms.message(guest, JSON.stringify({ t: "patches" }));
  assertEquals(guest.got.filter((m) => m.t === "patches").length, 0, "the room is gone");
  assertEquals(rooms.rooms.size, 0);
});

Deno.test("relay: unknown codes and full rooms are refused", () => {
  const rooms = new Rooms();
  const s = new FakeSock();
  assertEquals(rooms.open(s, { room: "ZZZZ" }), false);
  assert(s.closed);
  const host = new FakeSock();
  rooms.open(host, { create: true });
  const code = host.last("welcome")!.room as string;
  for (let i = 0; i < 3; i++) assert(rooms.open(new FakeSock(), { room: code }));
  const late = new FakeSock();
  assertEquals(rooms.open(late, { room: code }), false);
  assertEquals(late.last("error")!.why, "That game is full (4 players)");
});

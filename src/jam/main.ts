// TILT Jam: a jam-first front door on TILT's engine. Pick a genre and a template and a whole band
// plays; every part is a card of big knobs that can't sound wrong. "Open in TILT Studio" hands the
// song to the full editor.

import "./jam.css";
import { JamApp } from "./ui";

const app = new JamApp(document.getElementById("jam")!);
// ?join=CODE: a friend's online jam.
const join = new URLSearchParams(location.search).get("join");
if (join) app.showJoin(join);
else app.showPacks();

// For automated checks in the browser console.
(window as unknown as { jam: JamApp }).jam = app;

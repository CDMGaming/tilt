import "./ui/style.css";
import { newSong } from "./engine/model";
import { App, STORE_PREFIX } from "./ui/app";
import { welcomeBack } from "./ui/welcome";
import { DiceScreen } from "./ui/dice";
import { helpDialog, songSettings, systemMenu } from "./ui/dialogs";
import { remoteChoice, remoteTimeUp, timeUp, clearRemoteTimeUp } from "./ui/timeup";
import { EditorScreen } from "./ui/editor";
import { openShortcut } from "./ui/shortcut";
import { phraseGridDialog } from "./ui/phrasegrid";
import { SongScreen } from "./ui/song";
import { MixerScreen } from "./ui/mixer";
import { CouchScreen } from "./ui/couch";
import { bindTopbar } from "./ui/topbar";
import { bindRightClick } from "./ui/rightclick";
import { Scope } from "./ui/scope";
import { getSample } from "./ui/samples";
import { audioSessionPlayback, keepStorage, watchPhone } from "./ui/phone";
import { takeCodeFromUrl } from "./ui/share";
import { takeSharedFromUrl } from "./ui/sharesong";
import { Tutorial, offerTutorial } from "./ui/tutorial";

const root = document.getElementById("app")!;
audioSessionPlayback();
keepStorage();
// Installable and playable offline (not on the dev server: it would cache stale code).
if (!import.meta.env.DEV && "serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js").catch(() => {});
const app = new App(root);
app.screens.dice = new DiceScreen(app);
app.screens.song = new SongScreen(app);
app.screens.edit = new EditorScreen(app);
app.screens.mix = new MixerScreen(app);
app.screens.couch = new CouchScreen(app);
bindTopbar(app, app.headerEl);
watchPhone(() => app.refresh());
bindRightClick(app);
app.openDice = () => { app.engine.stop(); app.show("dice"); };
app.openSystemMenu = () => systemMenu(app, () => app.openDice!());
app.openHelp = () => { if (!app.overlays.open) helpDialog(app); };
const tutorial = new Tutorial(app);
app.openTutorial = (fresh = false) => { document.querySelector(".coach-offer")?.remove(); void tutorial.start(!fresh); };
app.songSettings = () => songSettings(app);
app.onTimeUp = () => void timeUp(app);
// Online games: the host's clock and its time's-up card reach every guest.
app.onTimerChanged = () => app.couch?.online?.sendTimer();
app.onRemoteTimeUp = (game) => void remoteTimeUp(app, game);
app.onRemoteChoice = (choice) => remoteChoice(app, choice);
app.onRemoteTimeUpOver = () => clearRemoteTimeUp(app);
app.openShortcut = () => openShortcut(app);
const scope = new Scope(app);
app.toggleScope = () => scope.toggle();
app.scopeOpen = () => scope.open;
app.stuck = () => phraseGridDialog(app, { sceneId: app.currentSceneId(), onDone: () => app.refresh() });

app.engine.userSampleLoader = async (id) => { const s = await getSample(id); return s && { data: s.data, rate: s.rate }; };
const saved = App.savedSong();
await app.boot(saved ?? newSong());
// Coming back: the song you left, on the screen / track / scene you left it (New song one click
// away). The first visit ever (no song yet) starts on the setup screen.
const PLACE_KEY = STORE_PREFIX + "place.v1";
type Place = { libId?: string; screen: "song" | "edit" | "mix"; trackId: number; sceneId: number; row: number; col: number };
if (saved?.tracks.length) {
  let place: Place | null = null;
  try { place = JSON.parse(localStorage.getItem(PLACE_KEY) ?? "null"); } catch { /* none */ }
  const song = app.song, p = place && place.libId === song.libId ? place : null;
  if (p && song.tracks.some((t) => t.id === p.trackId)) app.ed.trackId = p.trackId;
  if (p && song.scenes.some((x) => x.id === p.sceneId)) app.ed.sceneId = p.sceneId;
  if (p) app.songCur = { row: p.row, col: p.col };
  app.show(p?.screen ?? "song");
  welcomeBack(app);
} else app.show("dice");
let lastPlace = "";
app.frameHooks.push(() => {
  if (app.couch || !["song", "edit", "mix"].includes(app.screenName) || !app.song.tracks.length) return;
  const p: Place = { libId: app.song.libId, screen: app.screenName as Place["screen"], trackId: app.ed.trackId, sceneId: app.ed.sceneId, row: app.songCur.row, col: app.songCur.col };
  const key = JSON.stringify(p);
  if (key === lastPlace) return;
  lastPlace = key;
  try { localStorage.setItem(PLACE_KEY, key); } catch { /* storage blocked */ }
});
takeCodeFromUrl(app);
takeSharedFromUrl(app); // /s/CODE or #song=…: a whole shared song
// New here: a card on the setup screen offers the tutorial (never a forced dialog).
void offerTutorial(app, tutorial, document.body);
app.frameHooks.push(() => { if (app.screenName !== "dice") document.querySelector(".coach-offer")?.remove(); });


// For automated checks in the browser console.
(window as unknown as { tilt: App }).tilt = app;

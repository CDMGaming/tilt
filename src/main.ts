import "./ui/style.css";
import { newSong } from "./engine/model";
import { App, STORE_PREFIX } from "./ui/app";
import { DiceScreen } from "./ui/dice";
import { helpDialog, songSettings, systemMenu } from "./ui/dialogs";
import { remoteChoice, remoteTimeUp, timeUp } from "./ui/timeup";
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
app.openShortcut = () => openShortcut(app);
const scope = new Scope(app);
app.toggleScope = () => scope.toggle();
app.stuck = () => phraseGridDialog(app, { sceneId: app.currentSceneId(), onDone: () => app.refresh() });

app.engine.userSampleLoader = async (id) => { const s = await getSample(id); return s && { data: s.data, rate: s.rate }; };
await app.boot(App.savedSong() ?? newSong());
// From TILT Jam ("Open in TILT Studio"): the jam's song is already the saved song; go straight to it.
const fromJam = new URLSearchParams(location.search).has("from-jam");
if (fromJam) history.replaceState(null, "", location.pathname + location.search.replace(/[?&]from-jam/, "").replace(/^&/, "?"));
app.show(fromJam && app.song.tracks.length ? "song" : "dice");
takeCodeFromUrl(app);
takeSharedFromUrl(app); // /s/CODE or #song=…: a whole shared song
// New here: a card on the setup screen offers the tutorial (never a forced dialog).
void offerTutorial(app, tutorial, document.body);
app.frameHooks.push(() => { if (app.screenName !== "dice") document.querySelector(".coach-offer")?.remove(); });


// For automated checks in the browser console.
(window as unknown as { tilt: App }).tilt = app;

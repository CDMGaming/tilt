import "./ui/style.css";
import { newSong } from "./engine/model";
import { App, STORE_PREFIX } from "./ui/app";
import { DiceScreen } from "./ui/dice";
import { helpDialog, songSettings, systemMenu, timeUpDialog } from "./ui/dialogs";
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
app.songSettings = () => songSettings(app);
app.onTimeUp = () => timeUpDialog(app);
app.openShortcut = () => openShortcut(app);
const scope = new Scope(app);
app.toggleScope = () => scope.toggle();
app.stuck = () => phraseGridDialog(app, { sceneId: app.currentSceneId(), onDone: () => app.refresh() });

app.engine.userSampleLoader = async (id) => { const s = await getSample(id); return s && { data: s.data, rate: s.rate }; };
await app.boot(App.savedSong() ?? newSong());
app.show("dice");
takeCodeFromUrl(app);

// First visit: show the controls once.
try {
  if (!localStorage.getItem(STORE_PREFIX + "seenHelp")) {
    localStorage.setItem(STORE_PREFIX + "seenHelp", "1");
    helpDialog(app);
  }
} catch { /* storage blocked */ }

// For automated checks in the browser console.
(window as unknown as { tilt: App }).tilt = app;

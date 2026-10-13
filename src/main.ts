import "./ui/style.css";
import { newSong } from "./engine/model";
import { App, STORE_PREFIX } from "./ui/app";
import { DiceScreen } from "./ui/dice";
import { helpDialog, songSettings, systemMenu, timeUpDialog } from "./ui/dialogs";
import { EditorScreen } from "./ui/editor";
import { openShortcut } from "./ui/shortcut";
import { SongScreen } from "./ui/song";
import { MixerScreen } from "./ui/mixer";
import { bindTopbar } from "./ui/topbar";
import { bindRightClick } from "./ui/rightclick";

const root = document.getElementById("app")!;
const app = new App(root);
app.screens.dice = new DiceScreen(app);
app.screens.song = new SongScreen(app);
app.screens.edit = new EditorScreen(app);
app.screens.mix = new MixerScreen(app);
bindTopbar(app, app.headerEl);
bindRightClick(app);
app.openSystemMenu = () => systemMenu(app, () => { app.engine.stop(); app.show("dice"); });
app.songSettings = () => songSettings(app);
app.onTimeUp = () => timeUpDialog(app);
app.openShortcut = () => openShortcut(app);

await app.boot(App.savedSong() ?? newSong());
app.show("dice");

// First visit: show the controls once.
try {
  if (!localStorage.getItem(STORE_PREFIX + "seenHelp")) {
    localStorage.setItem(STORE_PREFIX + "seenHelp", "1");
    helpDialog(app);
  }
} catch { /* storage blocked */ }

// For automated checks in the browser console.
(window as unknown as { rollbox: App }).rollbox = app;

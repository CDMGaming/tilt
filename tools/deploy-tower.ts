// Deploy TILT (app + online relay) to Tower: build, copy, rebuild the container, check it answers.
// Run: deno run -A tools/deploy-tower.ts
//
// Uses Windows OpenSSH and the `route-nas` SSH alias (Git Bash's ssh mangles /mnt/... paths).
// Lives in /mnt/cache/appdata/tilt (the real disk, not the /mnt/user FUSE view).

const HOST = "route-nas";
const DIR = "/mnt/cache/appdata/tilt";
const URL_LAN = "http://tower.local:8097";
const SSH = Deno.build.os === "windows" ? "C:\\Windows\\System32\\OpenSSH\\ssh.exe" : "ssh";
const SCP = Deno.build.os === "windows" ? "C:\\Windows\\System32\\OpenSSH\\scp.exe" : "scp";

const root = decodeURIComponent(new URL("..", import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1");
Deno.chdir(root);
const stage = await Deno.makeTempDir({ prefix: "tilt-deploy-" });

async function run(cmd: string, args: string[]) {
  console.log(`> ${[cmd.split(/[\\/]/).pop(), ...args].join(" ")}`);
  const { code } = await new Deno.Command(cmd, { args, stdout: "inherit", stderr: "inherit" }).output();
  if (code !== 0) throw new Error(`${cmd} failed (${code})`);
}

// 1. Build the app into the staging folder (never into the project: the dev server watches it).
await run(Deno.execPath(), ["run", "-A", "npm:vite", "build", "--outDir", `${stage}/dist`, "--emptyOutDir"]);
await Deno.mkdir(`${stage}/tools`);
for (const f of ["tools/relay.ts", "tools/serve.ts"]) await Deno.copyFile(f, `${stage}/${f}`);
for (const f of ["Dockerfile", "compose.yaml"]) await Deno.copyFile(`deploy/${f}`, `${stage}/${f}`);

// 2. Replace the old copy on Tower (only this app's own folder) and rebuild the container.
await run(SSH, [HOST, `mkdir -p ${DIR} && rm -rf ${DIR}/dist ${DIR}/tools`]);
await run(SCP, ["-r", "-q", `${stage}/dist`, `${stage}/tools`, `${stage}/Dockerfile`, `${stage}/compose.yaml`, `${HOST}:${DIR}/`]);
await run(SSH, [HOST, `cd ${DIR} && docker compose up -d --build 2>&1 | tail -5`]);
await Deno.remove(stage, { recursive: true });

// 3. Check it answers: the page, and the relay's health.
for (let i = 0; i < 20; i++) {
  try {
    const page = await fetch(URL_LAN);
    const health = await (await fetch(`${URL_LAN}/health`)).json();
    if (page.ok && (await page.text()).includes("<div id=\"app\"") && health.ok) {
      console.log(`\nTILT is up: ${URL_LAN} (rooms open: ${health.rooms})`);
      Deno.exit(0);
    }
  } catch { /* still starting */ }
  await new Promise((r) => setTimeout(r, 1000));
}
console.error(`\nTILT didn't answer at ${URL_LAN}. Check: ssh ${HOST} docker logs tilt`);
Deno.exit(1);

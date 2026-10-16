const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, ".."),
  version = require("../package.json").version,
  compiler = process.env.ISCC_EXE || path.join(root, ".deps/inno/ISCC.exe");
const r = spawnSync(
  compiler,
  [
    "/Qp",
    "/DAppVersion=" + version,
    "/DPackageDir=" + path.join(root, "release/RewardDesk-win32-x64"),
    "/DOutputDir=" + path.join(root, "release"),
    path.join(root, "tools/installer.iss"),
  ],
  { stdio: "inherit", windowsHide: true },
);
if (r.error) throw r.error;
if (r.status !== 0) process.exit(r.status || 1);
const file = path.join(
  root,
  `release/reward-desk-${version}-windows-x64-setup.exe`,
);
fs.writeFileSync(
  file + ".sha256",
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") +
    "  " +
    path.basename(file) +
    "\n",
);
console.log(file);

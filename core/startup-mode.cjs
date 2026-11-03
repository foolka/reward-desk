// Explicit launch arguments take precedence without changing stored preferences.
function startInTray(argv, preference = false) {
  if (argv.includes("--start-window")) return false;
  return argv.includes("--start-tray") || preference === true;
}

module.exports = { startInTray };

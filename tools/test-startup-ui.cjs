const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const executablePath = process.argv[2] && path.resolve(process.argv[2]);
const { _electron: electron } = require(path.join(root, 'node_modules/playwright'));
const reward = require(path.join(root, 'package.json')).name === 'reward-desk';
const out = path.join(root, 'test-results/startup-mode');
fs.mkdirSync(out, { recursive: true });

// Test only isolated, unauthenticated profiles, never a real viewer or OBS source.
async function verify(mode) {
  const profile = fs.mkdtempSync(path.join(out, 'profile-'));
  if (!reward) {
    const { Store } = require(path.join(root, 'core/store.cjs'));
    const store = new Store(path.join(profile, 'shoutouts.sqlite'));
    store.setPrefs({ startInTray: true, enabled: false });
    store.close();
  }
  const env = { ...process.env, [reward ? 'REWARD_DESK_TEST_DATA' : 'SHOUTOUT_DESK_TEST_DATA']: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const instance = await electron.launch({
    ...(executablePath ? { executablePath } : {}),
    args: [...(executablePath ? [] : [root]), reward ? '--test-mode' : '--smoke-test', mode, '--mute-audio'],
    env,
    timeout: 25000,
  });
  try {
    const page = await instance.firstWindow();
    await page.waitForFunction(() => window.desk && document.readyState === 'complete');
    const state = await page.evaluate(() => window.desk.command('state'));
    assert.equal(state.dataPath, profile);
    const expected = mode === '--start-window';
    for (let i = 0; i < 50; i++) {
      if (await instance.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()) === expected) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(await instance.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), expected);
    if (!reward) assert.equal(state.prefs.startInTray, true, 'explicit window mode does not rewrite preference');
    await instance.evaluate(({ app, BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].hide();
      app.emit('second-instance', {}, ['app.exe', '--start-tray']);
    });
    assert.equal(await instance.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), false);
    await instance.evaluate(({ app }) => app.emit('second-instance', {}, ['app.exe', '--start-window']));
    assert.equal(await instance.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), true);
    console.log(path.basename(root), mode, 'passed: visibility, reopen, isolated profile, no preference changes');
  } finally {
    await instance.close();
  }
}

(async () => {
  await verify('--start-tray');
  await verify('--start-window');
})().catch(error => { console.error(error); process.exitCode = 1; });

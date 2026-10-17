const { _electron } = require('playwright');
const path = require('node:path');
(async () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.REWARD_DESK_TEST_DATA;
  const app = await _electron.launch({executablePath:path.join(process.env.LOCALAPPDATA,'Programs/Reward Desk/RewardDesk.exe'),args:['--mute-audio'],env});
  try {
    const page=await app.firstWindow(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.waitForTimeout(2000);
    const result=await page.evaluate(async()=>{
      const s=await desk.command('state');
      return {version:s.version,dataPath:s.dataPath,rewards:s.rewards.map(r=>({id:r.id,title:r.title,items:r.items.length})),visible:document.querySelector('#reward-list')?.textContent,editor:document.querySelector('#editor')?.textContent?.slice(0,300),search:document.querySelector('#search')?.value};
    });
    console.log(JSON.stringify({...result,errors}));
    await page.screenshot({path:path.resolve(__dirname,'../test-results/installed-missing-rewards.png')});
  } finally { await app.close(); }
})().catch(e=>{console.error(e.message);process.exitCode=1;});

// Optional browser smoke test: npm install --no-save playwright, then node tests/ui.smoke.js.
// CEP and Python are simulated here. Screenshot is a temporary QA artifact.
const {chromium}=require('playwright');
const path=require('node:path'),os=require('node:os');
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:520,height:850}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(require('./cep-fixture'));
  await page.goto('file://'+path.resolve(__dirname,'../cep/index.html'));
  await page.locator('#audio').fill('C:/voice.wav');await page.locator('#mediaDir').fill('C:/images');
  await page.locator('#transcriptText').fill('朝です。電話です。安心です。');
  await page.locator('#analyze').click();await page.waitForFunction(()=>document.querySelectorAll('#scenes tr').length===3);
  if(!await page.locator('#build').isDisabled())throw Error('Warning acknowledgement gate failed');
  if(await page.locator('#scenes img').count())throw Error('Transcript HTML was executed');
  await page.locator('#accept').check();if(await page.locator('#build').isDisabled())throw Error('Build button stays disabled');
  await page.locator('#summary').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(process.env.ASV_SCREENSHOT_DIR||os.tmpdir(),'asv-panel-qa.png'),fullPage:false});
  await page.locator('#build').click();await page.waitForFunction(()=>document.getElementById('status').textContent.startsWith('Đã tạo'));
  if(!await page.locator('#build').isDisabled())throw Error('Duplicate build must be prevented');
  await page.locator('#mode').selectOption('equal');
  if(!await page.locator('#transcriptFields').isHidden())throw Error('Mode switching failed');
  if(!await page.locator('#build').isDisabled())throw Error('Changed request did not invalidate plan');
  await page.setViewportSize({width:360,height:650});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
  if(overflow)throw Error('Horizontal overflow at minimum panel width');
  if(errors.length)throw Error(errors.join('\n'));
  console.log('UI smoke PASS: analyze, warnings, escaping, build, duplicate guard, invalidation, compact layout');
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});

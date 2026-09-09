import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runBrowserChecks, waitFor, reload, save, storedSettings, settingsKey, pageUrl } from './check-options-tab-persistence.mjs';

const pageDir = path.dirname(fileURLToPath(pageUrl));
const readSettings = (cdp) => cdp.evaluate(`(async () => ${storedSettings})()`);
const click = (cdp, id) => cdp.evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);

async function checkOptions(cdp) {
  const project = `document.querySelector('input[name="decryptProjectEnabled"][value="persistence-test"]')`;
  await cdp.evaluate(`${project}.click()`);
  await save(cdp, 'saveBtn');
  await click(cdp, 'decryptConfigEditBtn');
  assert.equal(await cdp.evaluate(`${project}.checked`), false);
  await click(cdp, 'decryptConfigCancelBtn');
  await click(cdp, 'decryptConfigEditBtn');
  await save(cdp, 'decryptConfigSaveBtn');
  await reload(cdp);
  assert.deepEqual((await readSettings(cdp)).decryptConfig.selectedProjectIds, []);
  await cdp.evaluate(`${project}.click()`);
  await click(cdp, 'decryptConfigEditBtn');
  await save(cdp, 'decryptConfigSaveBtn');
  assert.deepEqual((await readSettings(cdp)).decryptConfig.selectedProjectIds, ['persistence-test']);
  console.log('PASS project selection survives edit, cancel, save and reload');

  await cdp.evaluate(`chrome.storage.local.set({formPilotV2FileStore:[{name:'old.txt',category:'document',mimeType:'text/plain',size:1,updatedAt:1}]})`);
  await reload(cdp);
  await waitFor(cdp, `document.getElementById('fileUploadList').textContent.includes('old.txt')`, 'initial file store');
  await cdp.evaluate(`(async () => {
    const next = ${storedSettings};
    next.provider = 'openai'; next.openai.model = 'external-model';
    next.testDataLibrary.pools.email = ['external@example.invalid'];
    next.testDataLibrary.pools.file.document = [{name:'new.txt',mimeType:'text/plain',size:2,updatedAt:2}];
    await chrome.storage.local.set({[${JSON.stringify(settingsKey)}]: next});
  })()`);
  await click(cdp, 'testDataEnabled');
  await waitFor(cdp, `document.getElementById('saveStatus').textContent.includes('已关闭测试数据池')`, 'data-pool auto-save');
  let settings = await readSettings(cdp);
  assert.equal(settings.provider, 'openai');
  assert.equal(settings.openai.model, 'external-model');
  assert.deepEqual(settings.testDataLibrary.pools.email, ['external@example.invalid']);
  assert.equal(settings.testDataLibrary.pools.file.document[0].name, 'new.txt');
  await cdp.evaluate(`document.getElementById('openaiApiKey').value = 'fixture-key'; document.getElementById('debugLogs').click()`);
  await save(cdp, 'saveBtn');
  settings = await readSettings(cdp);
  assert.equal(settings.provider, 'openai');
  assert.equal(settings.openai.model, 'external-model');
  assert.equal(settings.openai.apiKey, 'fixture-key');
  assert.equal(settings.debugLogs, true);
  assert.deepEqual(settings.testDataLibrary.pools.email, ['external@example.invalid']);
  assert.equal(settings.testDataLibrary.pools.file.document[0].name, 'new.txt');
  console.log('PASS old settings form preserves external updates during auto-save and full save');

  const first = '<section>\n<p>First sample</p>\n<p>Second paragraph</p>\n</section>';
  const second = '<p>Independent sample</p>';
  await click(cdp, 'testDataRichTextSourceMode');
  await cdp.evaluate(`document.getElementById('testDataRichText').value = ${JSON.stringify(first)}`);
  await click(cdp, 'richTextSampleAdd');
  await cdp.evaluate(`document.getElementById('testDataRichTextEditor').innerHTML = ${JSON.stringify(second)}`);
  await save(cdp, 'saveBtn');
  assert.deepEqual((await readSettings(cdp)).testDataLibrary.pools.richText, [first, second]);
  await reload(cdp);
  await save(cdp, 'saveBtn');
  assert.deepEqual((await readSettings(cdp)).testDataLibrary.pools.richText, [first, second]);
  await cdp.evaluate(`const select = document.getElementById('richTextSampleSelect'); select.value = '1'; select.dispatchEvent(new Event('change'))`);
  assert.equal(await cdp.evaluate(`document.getElementById('testDataRichTextEditor').innerHTML`), second);
  await click(cdp, 'testDataRichTextSourceMode');
  await cdp.evaluate(`document.getElementById('testDataRichText').value = '<p>Edited sample</p>'`);
  await save(cdp, 'saveBtn');
  assert.deepEqual((await readSettings(cdp)).testDataLibrary.pools.richText, [first, '<p>Edited sample</p>']);
  if (process.env.FILLFORM_QA_SCREENSHOT) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await cdp.evaluate(`document.getElementById('testDataRichTextCard').scrollIntoView({block:'center',behavior:'instant'}); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
    const shot = await cdp.send('Page.captureScreenshot', {format:'png'});
    await fs.writeFile(process.env.FILLFORM_QA_SCREENSHOT, Buffer.from(shot.data, 'base64'));
  }
  await click(cdp, 'richTextSampleRemove');
  await save(cdp, 'saveBtn');
  assert.deepEqual((await readSettings(cdp)).testDataLibrary.pools.richText, [first]);
  await click(cdp, 'richTextSampleRemove');
  await save(cdp, 'saveBtn');
  await reload(cdp);
  assert.deepEqual((await readSettings(cdp)).testDataLibrary.pools.richText, []);
  console.log('PASS multiline HTML and independent rich-text samples survive reload, edits and deletion');
}

async function checkTemplates(cdp) {
  await cdp.send('Page.navigate', {url: pathToFileURL(path.join(pageDir, 'template-center.html')).href});
  await waitFor(cdp, `document.readyState === 'complete' && document.getElementById('flowStopBtn')?.disabled === true`, 'template center');
  await cdp.evaluate(`(async () => {
    const {saveTemplate} = await import('./core/templateEngine.js');
    await saveTemplate('api', {id:'external-flow', name:'External flow', steps:[{id:'s1'}]});
    await chrome.storage.local.set({formpilot_api_endpoints:[{id:'external-endpoint', name:'External endpoint', method:'GET', url:'https://example.invalid/external'}]});
    document.getElementById('flowEndpointName').value = 'Local endpoint';
    document.getElementById('flowCurlInput').value = 'curl https://example.invalid/local';
    document.getElementById('flowParseSaveBtn').click();
  })()`);
  await waitFor(cdp, `document.getElementById('flowParseStatus').textContent.includes('已保存')`, 'endpoint saved');
  let data = await cdp.evaluate(`chrome.storage.local.get(['formPilotV2Templates','formpilot_api_endpoints'])`);
  assert.deepEqual(data.formPilotV2Templates.api.map((item) => item.id), ['external-flow']);
  assert.equal(data.formpilot_api_endpoints.length, 2);
  await cdp.evaluate(`document.querySelector('[data-action="delete-endpoint"][data-id="external-endpoint"]').click()`);
  await waitFor(cdp, `(async () => (await chrome.storage.local.get('formpilot_api_endpoints')).formpilot_api_endpoints.length === 1)()`, 'endpoint deleted');
  data = await cdp.evaluate(`chrome.storage.local.get('formPilotV2Templates')`);
  assert.equal(data.formPilotV2Templates.api[0].id, 'external-flow');
  await cdp.evaluate(`(async () => {
    const data = await chrome.storage.local.get('formpilot_api_endpoints');
    data.formpilot_api_endpoints.push({id:'refreshed-endpoint', name:'Newly added', method:'GET', url:'https://example.invalid/new'});
    await chrome.storage.local.set(data);
    document.getElementById('flowRefreshBtn').click();
  })()`);
  await waitFor(cdp, `!!document.querySelector('[data-id="refreshed-endpoint"]')`, 'endpoint refresh');
  console.log('PASS older template center preserves external templates/endpoints and refreshes both lists');

  await cdp.evaluate(`(async () => {
    const {saveTemplate} = await import('./core/templateEngine.js');
    await saveTemplate('api', {id:'center-zero-flow',name:'Center zero flow',loop:{count:1,intervalMs:999,retry:3},steps:[{endpointId:'refreshed-endpoint'}]});
    document.getElementById('flowRefreshBtn').click();
  })()`);
  await waitFor(cdp, `!!document.querySelector('#flowRunTemplateSelect option[value="center-zero-flow"]')`, 'run template');
  await cdp.evaluate(`document.getElementById('flowRunTemplateSelect').value = 'center-zero-flow'; document.getElementById('flowRunCount').value = '1'; document.getElementById('flowRunInterval').value = '0'; document.getElementById('flowRunRetry').value = '0'; window.__fetchCalls = 0; window.fetch = async () => { window.__fetchCalls++; return {ok:false,status:500,text:async()=> 'Fixture failure'}; }; document.getElementById('flowRunBtn').click()`);
  await waitFor(cdp, `document.getElementById('flowRunStatus').textContent === '执行完成'`, 'mock flow execution');
  assert.equal(await cdp.evaluate('window.__fetchCalls'), 1, 'zero retries must not fall back to the saved value 3');
  assert.equal(await cdp.evaluate(`document.getElementById('flowRunLog').textContent.includes('间隔=0ms，重试=0')`), true);
  console.log('PASS template-center execution respects explicit zero interval and zero retries');
}

async function checkPanel(cdp) {
  await cdp.send('Page.navigate', {url: pageUrl});
  await waitFor(cdp, `document.readyState === 'complete' && !!document.getElementById('richTextSampleSelect')`, 'options loaded');
  await cdp.evaluate(`(async () => {
    const settings = ${storedSettings}; settings.provider = 'heuristic'; settings.fillOptionalFields = true;
    settings.visiblePanelTabs = ['ui','qr','api','crypto'];
    await chrome.storage.local.set({[${JSON.stringify(settingsKey)}]: settings, formPilotV2Templates:{ui:[],api:[{
      id:'zero-flow',name:'Zero flow',templateCategory:'flow',loopCount:1,intervalMs:0,retryCount:0,
      steps:[{id:'s1',stepId:'s1',name:'Fixture',method:'GET',endpoint:'https://example.invalid/fixture'}]
    }]}});
    window.__failRead = false; window.__failWrite = true; window.__writeMessages = 0; window.__flowWrites = 0;
    chrome.runtime.id = 'regression-extension';
    chrome.runtime.onMessage = {addListener() {}};
    chrome.storage.onChanged = {addListener() {}};
    chrome.runtime.sendMessage = async (msg) => {
      if (msg.type === 'formpilotv2:get-settings') return window.__failRead ? {ok:false,error:'Fixture read failure'} : {ok:true,settings:${storedSettings}};
      if (msg.type === 'formpilotv2:set-settings') {
        window.__writeMessages++;
        if (window.__failWrite) return {ok:false,error:'Fixture quota failure'};
        await chrome.storage.local.set({[${JSON.stringify(settingsKey)}]:msg.settings});
        return {ok:true,settings:msg.settings};
      }
      if (msg.type === 'formpilotv2:list-api-templates') return {ok:true,templates:(await chrome.storage.local.get('formPilotV2Templates')).formPilotV2Templates.api};
      if (msg.type === 'formpilotv2:save-api-template') {
        const template = {...msg.template,id:'zero-flow'};
        await chrome.storage.local.set({formPilotV2Templates:{ui:[],api:[template]}});
        window.__flowWrites++;
        return {ok:true,template};
      }
      return {ok:true,templates:[],entries:[]};
    };
  })()`);
  await cdp.evaluate(await fs.readFile(path.join(pageDir, 'content/agent.js'), 'utf8'));
  const sourceSelect = `document.querySelector('.formpilot-v2-source-select')`;
  const badge = `document.querySelector('.formpilot-v2-badge')`;
  const scope = `document.querySelector('[data-action="toggle-fill-optional"]')`;
  await waitFor(cdp, `${sourceSelect}?.value === 'heuristic' && ${scope}?.dataset.enabled === 'true'`, 'panel settings');
  await cdp.evaluate(`${sourceSelect}.value = 'openai'; ${sourceSelect}.dispatchEvent(new Event('change',{bubbles:true}))`);
  await waitFor(cdp, `${badge}.dataset.tone === 'error'`, 'provider failure');
  assert.equal(await cdp.evaluate(`${sourceSelect}.value`), 'heuristic');
  assert.equal((await readSettings(cdp)).provider, 'heuristic');
  await cdp.evaluate(`${scope}.click()`);
  await waitFor(cdp, `${badge}.textContent === '切换失败'`, 'scope failure');
  assert.equal(await cdp.evaluate(`${scope}.dataset.enabled`), 'true');
  assert.equal((await readSettings(cdp)).fillOptionalFields, true);
  const writes = await cdp.evaluate('window.__writeMessages');
  await cdp.evaluate(`window.__failRead = true; ${sourceSelect}.value = 'openai'; ${sourceSelect}.dispatchEvent(new Event('change',{bubbles:true}))`);
  await waitFor(cdp, `${badge}.dataset.tone === 'error'`, 'read failure');
  assert.equal(await cdp.evaluate('window.__writeMessages'), writes, 'failed reads must not write defaults');
  await cdp.evaluate(`window.__failRead = false; window.__failWrite = false; ${sourceSelect}.value = 'openai'; ${sourceSelect}.dispatchEvent(new Event('change',{bubbles:true}))`);
  await waitFor(cdp, `${badge}.dataset.tone === 'success'`, 'provider saved');
  assert.equal((await readSettings(cdp)).provider, 'openai');
  console.log('PASS real panel rejects failed saves/reads, restores controls, and saves successfully');

  const loadFlow = `Array.from(document.querySelectorAll('.formpilot-v2-api-card-btn')).find(button => button.textContent === '载入')`;
  await waitFor(cdp, `!!(${loadFlow})`, 'flow card');
  await cdp.evaluate(`(${loadFlow}).click()`);
  for (const role of ['api-interval-ms','api-retry-count']) {
    assert.equal(await cdp.evaluate(`document.querySelector('[data-role="${role}"]').value`), '0');
  }
  await cdp.evaluate(`document.querySelector('[data-action="api-save-flow"]').click()`);
  await waitFor(cdp, `window.__flowWrites === 1`, 'zero flow saved');
  await cdp.evaluate(`(${loadFlow}).click()`);
  const saved = await cdp.evaluate(`chrome.storage.local.get('formPilotV2Templates')`);
  assert.equal(saved.formPilotV2Templates.api[0].intervalMs, 0);
  assert.equal(saved.formPilotV2Templates.api[0].retryCount, 0);
  for (const role of ['api-interval-ms','api-retry-count']) assert.equal(await cdp.evaluate(`document.querySelector('[data-role="${role}"]').value`), '0');
  console.log('PASS flow zero interval/retry survives load, save and reload');
}

runBrowserChecks(async (cdp) => {
  await checkOptions(cdp);
  await checkTemplates(cdp);
  await checkPanel(cdp);
  console.log('PASS all six persistence regressions');
}).catch((error) => { console.error(error.stack || error); process.exitCode = 1; });

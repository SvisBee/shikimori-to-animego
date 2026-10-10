
'use strict';
/*
 * RU: Изолированный браузерный smoke-тест. Перехватывает все запросы к AnimeGO.
 * EN: Isolated browser smoke test. All AnimeGO requests are mocked.
 * Optional dependency: playwright-core (set NODE_PATH if needed).
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '..');
const script = path.join(root, 'shikimori-to-animego.user.js');
const output = path.join(root, 'artifacts');
fs.mkdirSync(output, { recursive: true });

function makeRow(i) {
  const status = i === 0 ? 'completed' : i === 1 ? 'dropped' :
    ['completed','watching','planned','on_hold','dropped'][i % 5];
  const title = i === 0 ? 'Akudama Drive' : i === 1 ? 'Test dropped anime' :
    i === 3 ? 'Haikyuu!!' : 'Test Anime ' + i;
  const id = String(9000 + i);
  const candidate = { id, title, original: title, href: '/anime/test-title-' + id, confidence: 1 };
  return { sourceIndex:i, title, russian:'', status, score:status==='completed' ? 8 : 0,
    episodes:12, candidates:[candidate],chosen:id,note:'Точное совпадение, проверьте',result:'pending' };
}
const rows=Array.from({length:640},(_,i)=>makeRow(i));
const report={version:1,createdAt:new Date().toISOString(),items:rows,skipped:[]};
const statuses=new Map();
let writes=0, failOn='';
const requests=[];
const launchOpts={
  executablePath:process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless:true,args:['--disable-gpu','--no-first-run']
};
async function main() {
  const browser=await chromium.launch(launchOpts);
  try {
    const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
    const errors=[], nativeDialogs=[];
    page.on('pageerror',err=>errors.push(String(err)));
    // RU/EN: A browser-native confirm is a regression; dismiss and fail the test.
    page.on('dialog',async dialog=>{
      nativeDialogs.push(dialog.message());
      await dialog.dismiss();
    });
    await page.route('https://anime-go.org/**',async(route)=>{
      const req=route.request(),u=new URL(req.url()),part=u.pathname;
      requests.push(req.method()+' '+part);
      const text=(status,body,ct='text/html')=>route.fulfill({status,body,headers:{'Content-Type':ct}});
      if(part==='/user/12345') {
        const selected=rows.filter(x=>statuses.get(x.chosen)==='completed');
        const html='<html><body><div data-tabs-content="completed"><ul>' +
          selected.map(r=>'<li class="fav-row"><a href="/anime/test-title-'+r.chosen+'">link</a><span class="fav-row__score">'+r.score+'</span></li>').join('') +
          '</ul></div></body></html>';
        return text(200,html);
      }
      if(part.startsWith('/api/watchlist/')) {
        const id=part.split('/').pop(),active=statuses.get(id);
        const html=['watching','completed','onhold','dropped','planned'].map(x=>
          '<button data-fav-list="'+x+'" class="'+(active===x?'active':'')+'"></button>').join('');
        return text(200,html);
      }
      if(part==='/fav/set' && req.method()==='POST') {
        const data=new URLSearchParams(req.postData()),id=data.get('anime_id');
        if (failOn===id) return text(403,JSON.stringify({ok:false}),'application/json');
        statuses.set(id,data.get('list'));writes++;
        return text(200,JSON.stringify({ok:true,list:data.get('list')}),'application/json');
      }
      if(part==='/rate') return text(200,JSON.stringify({ok:true}),'application/json');
      if(part==='/search') {
        return text(200,'<html><body><div class="short__items"><article class="short"><div class="short__title"><a href="/anime/standalone-5555">Standalone</a></div><div class="short__label">Standalone</div></article></div></body></html>');
      }
      if(part==='/') return text(200,'<html><head><meta charset="utf-8"></head><body><h1>Mock AnimeGO</h1></body></html>');
      return text(200,'<html><body>Mock</body></html>');
    });
    await page.goto('https://anime-go.org/',{waitUntil:'domcontentloaded'});
    await page.addScriptTag({path:script});
    await page.locator('#shiki-ag-open').click();
    assert.equal(await page.locator('#shiki-ag-modal').evaluate(e=>getComputedStyle(e).display),'flex');
    assert.equal(await page.locator('#ag-stats .ag-stat').count(),5);
    await page.locator('#ag-report-file').setInputFiles({
      name:'shiki-to-animego-report.json',mimeType:'application/json',
      buffer:Buffer.from(JSON.stringify(report))
    });
    await page.locator('#ag-restore').click();
    await page.waitForFunction(()=>document.querySelector('#ag-status').textContent.includes('640'));
    assert.equal(await page.locator('#ag-body tr').count(),50);
    assert.equal(await page.locator('#ag-more').isVisible(),true);
    assert.equal((await page.locator('#ag-stats').innerText()).includes('640'),true);

    // RU/EN: test search, filters and incremental rendering without touching any account
    await page.locator('#ag-find').fill('Haikyuu');
    assert.equal(await page.locator('#ag-body tr').count(),1);
    await page.locator('#ag-find').fill('');
    await page.locator('#ag-more').click();
    assert.equal(await page.locator('#ag-body tr').count(),100);
    await page.locator('.ag-scroll').evaluate(e=>{e.scrollTop=0;});
    await page.screenshot({path:path.join(output,'ui-desktop.png'),fullPage:false});
    await page.setViewportSize({width:390,height:844});
    await page.locator('.ag-scroll').evaluate(e=>{e.scrollTop=0;});
    await page.screenshot({path:path.join(output,'ui-mobile.png'),fullPage:false});
    await page.locator('#ag-preview-head').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,'ui-mobile-list.png'),fullPage:false});
    const scrollWidth = await page.locator('.ag-table-wrap').evaluate(e=>e.scrollWidth-e.clientWidth);
    assert.equal(scrollWidth,0,'Mobile table must not require horizontal scrolling');
    const shell=await page.locator('.ag-shell').boundingBox();
    assert.ok(shell && shell.width <= 390,'Modal must fit mobile viewport');
    await page.setViewportSize({width:1440,height:900});
    // RU/EN: batch import is mocked; check independent Completed and Dropped paths
    await page.locator('#ag-limit').fill('2');
    await page.locator('#ag-profile-id').fill('12345');
    await page.locator('#ag-import').click();
    assert.equal(await page.locator('#ag-confirm-overlay').isVisible(),true);
    assert.equal(await page.locator('#ag-status-wrap').isVisible(),true);
    assert.match(await page.locator('#ag-confirm-title').innerText(),/2 аниме/);
    assert.match(await page.locator('#ag-confirm-list').innerText(),/Akudama Drive/);
    assert.match(await page.locator('#ag-confirm-list').innerText(),/Test dropped anime/);
    assert.equal(writes,0,'Must never write before confirmation');
    await page.screenshot({path:path.join(output,'ui-confirmation.png'),fullPage:false});
    // RU/EN: Cancel confirmation, verify no request was sent and importer stays open.
    await page.locator('#ag-confirm-cancel').click();
    assert.equal(await page.locator('#ag-confirm-overlay').isHidden(),true);
    assert.equal(writes,0);
    assert.equal(await page.locator('#shiki-ag-modal').isVisible(),true);
    await page.locator('#ag-import').click();
    assert.equal(await page.locator('#ag-confirm-overlay').isVisible(),true);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator('#ag-confirm-overlay').isHidden(),true);
    assert.equal(writes,0,"Esc cancellation must make zero writes");
    await page.locator('#ag-import').click();
    assert.equal(await page.locator('#ag-confirm-overlay').isVisible(),true);
    await page.locator('#ag-confirm-approve').click();
    assert.equal(await page.locator('#ag-confirm-overlay').isHidden(),true);
    assert.equal(await page.locator('#shiki-ag-modal').isVisible(),true);
    assert.equal(await page.locator('#ag-livebar').isVisible(),true);
    await page.waitForFunction(()=>document.querySelector('#ag-status').textContent.includes('2 успешно'),{timeout:15000});
    assert.equal(statuses.get('9000'),'completed');
    assert.equal(statuses.get('9001'),'dropped');
    assert.equal(writes,2);
    assert.equal(errors.length,0,'Browser errors: '+errors.join('; '));
    await page.screenshot({path:path.join(output,'ui-after-import.png'),fullPage:false});
    // RU: Точки сохранения после каждой записи восстанавливаются из старого отчёта.
    // EN: Checkpoints recover imported rows from the original pre-import report.
    const localState=await page.evaluate(()=>JSON.parse(localStorage.getItem('shiki-animego:checkpoint:v1:12345')));
    assert.equal(localState.version,1);
    assert.equal(Object.keys(localState.entries).length,2);
    assert.ok(Object.values(localState.entries).every(x=>x.result==='imported'));
    await page.locator('#ag-restore').click();
    await page.waitForFunction(()=>document.querySelector('#ag-live-meta').textContent.includes('автосохранения: 2'));
    assert.match(await page.locator('#ag-preview-count').innerText(),/готов/);
    assert.equal(await page.locator('#ag-filters').innerText().then(x=>/Перенесено 2/.test(x)),true);
    assert.equal(await page.locator('#ag-dock-report').isEnabled(),true);
    assert.equal(await page.locator('#ag-dock-stop').isDisabled(),true);
    assert.equal(await page.locator('#ag-status').evaluate(e=>e.closest('.ag-livebar').parentElement.className), 'ag-shell');
    // RU: Ошибка сервера после первого успешного элемента останавливает всю партию.
    // EN: An API error after a successful item halts the batch and remains visible.
    failOn='9003';
    await page.locator('#ag-limit').fill('3');
    await page.locator('#ag-import').click();
    assert.equal(await page.locator('#ag-confirm-overlay').isVisible(),true);
    await page.locator('#ag-confirm-approve').click();
    await page.waitForFunction(()=>!document.querySelector('#ag-dock-stop').disabled);
    await page.waitForFunction(()=>document.querySelector('#ag-status').textContent.includes('Остановлено'),{timeout:15000});
    assert.match(await page.locator('#ag-last-error').innerText(),/HTTP 403/);
    assert.match(await page.locator('#ag-last-error').innerText(),/Haikyuu!!/);
    assert.equal(statuses.get('9002'),'planned');
    assert.equal(statuses.has('9004'),false);
    assert.equal(await page.locator('#ag-dock-stop').isDisabled(),true);
    const afterFailure=await page.evaluate(()=>JSON.parse(localStorage.getItem('shiki-animego:checkpoint:v1:12345')));
    assert.equal(Object.keys(afterFailure.entries).length,4);
    assert.equal(Object.values(afterFailure.entries).filter(x=>x.result==='error').length,1);
    // Recovery from an older report should restore results and skip completed entries.
    await page.locator('#ag-restore').click();
    await page.waitForFunction(()=>document.querySelector('#ag-live-meta').textContent.includes('автосохранения: 4'));
    assert.match(await page.locator('#ag-filters').innerText(),/Перенесено 3/);
    assert.match(await page.locator('#ag-filters').innerText(),/Ошибки 1/);
    failOn='';


    // RU: Проверка, что после полного нового поиска кнопки снова доступны.
    // EN: Fresh search must reenable the import button when finished.
    await page.locator('#ag-file').setInputFiles({name:'shiki-anime.json',mimeType:'application/json',
      buffer:Buffer.from(JSON.stringify([{target_type:'Anime',target_title:'Standalone',status:'watching'}]))});
    await page.locator('#ag-scan').click();
    await page.waitForFunction(()=>document.querySelector('#ag-status').textContent.includes('Поиск 1/1'));
    await page.waitForFunction(()=>!document.querySelector('#ag-scan').disabled);
    assert.equal(await page.locator('#ag-import').isEnabled(),true);
    assert.equal(nativeDialogs.length,0,'Unexpected browser dialog(s): '+nativeDialogs.join('; '));
    assert.equal(errors.length,0,'Browser errors: '+errors.join('; '));
    console.log('PASS: UI desktop/mobile, 640-row report, filtering/search, 2 mocked writes and fresh-scan actions');
    console.log(JSON.stringify({writes,summary:(await page.locator('#ag-status').innerText()),requestCount:requests.length,screenshots:output}));
  } finally {
    await browser.close();
  }
}
main().catch(error=>{console.error(error.stack || error);process.exitCode=1;});

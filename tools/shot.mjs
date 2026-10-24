import { chromium } from 'playwright';
const [url,out,w=1400,h=500,wait='done',ms=0]=process.argv.slice(2);
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:+w,height:+h}});
p.on('console',m=>console.log('[console]',m.type(),m.text().slice(0,300)));p.on('pageerror',e=>console.log('[pageerror]',e.message));
await p.goto(url);await p.waitForFunction(`window.${wait}`,null,{timeout:180000});
if(+ms) await p.waitForTimeout(+ms);
console.log(JSON.stringify(await p.evaluate('window.info||null')));
await p.screenshot({path:out});await b.close();

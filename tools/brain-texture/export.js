const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1600,height:1200}});
await p.addInitScript(`window.PARAMS=${process.argv[2]}`);
await p.goto('file://'+__dirname+'/harness.html');await p.waitForFunction(()=>document.title.startsWith('hot'),{timeout:120000});
const data=await p.evaluate(()=>({url:document.getElementById('out').toDataURL('image/png'),hot:window.HOT}));
fs.writeFileSync(__dirname+'/brain.png',Buffer.from(data.url.split(',')[1],'base64'));
fs.writeFileSync(__dirname+'/hot.json',JSON.stringify(data.hot.map(([x,y])=>[+(x/1600).toFixed(4),+(y/1200).toFixed(4)])));
console.log('hot',data.hot.length);await b.close();})();

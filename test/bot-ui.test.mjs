import test from 'node:test';import assert from 'node:assert/strict';import {execFile} from 'node:child_process';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
test('isolated bot settings UI: blocked activation, masked token, link input and clearing',async()=>{
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const output=await new Promise((resolve,reject)=>execFile(require('electron'),[new URL('./fixtures/bot-ui.cjs',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')],{env,windowsHide:true,timeout:20000},(error,stdout,stderr)=>error?reject(new Error(stdout+'\n'+stderr)):resolve(stdout)));
 assert.match(output,/BOT_UI_PASSED/);
});

'use strict';
// 2026-11-26 — GPT-6.2 under JHR, Inox #42.
const assert=require('node:assert/strict');
const P=require('../lib/whisper');
async function main(){
 P.scheduler('sync');
 const ctx={method(n,cb){assert.equal(this,ctx);cb(null,n+1)}};
 const args=[7];
 const p=P().method(ctx.method,ctx,args);
 assert.equal(await p,8);assert.deepEqual(args,[7]);
 P.factory(Promise);
 const q=P();let called=0;
 const a=q.then(v=>{called++;return v+1});const b=q.then(v=>v*2);
 q.resolve(7);assert.equal(await a,8);assert.equal(await b,14);assert.equal(called,1);
 assert.equal(await q.then(v=>v+2),9);
 const bad=P();const handled=bad.then(null,e=>{assert.equal(e,'bad');return 42});bad.reject('bad');assert.equal(await handled,42);
 const late=P();late.resolve(6);assert.equal(await late.then(v=>v*3),18);
 P.factory(null);
 console.log('Parole FBF PASS');
}
const watchdog=setTimeout(()=>{console.error('Parole FBF timeout');process.exit(1)},5000);
main().then(()=>clearTimeout(watchdog),e=>{clearTimeout(watchdog);console.error(e);process.exitCode=1});

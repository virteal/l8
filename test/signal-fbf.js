'use strict';
// GPT-6 under Jean Hugues Noel Robert, 2026-11-24, Inox#42.
const assert = require('node:assert/strict');
const l8 = require('../lib/signal');
async function main(){
 const s=l8.signal();
 assert.equal(s.active,false); assert.equal(s.inactive,true);
 s.signal(1);
 const p=s.promise; assert.equal(p,s.promise); assert.equal(s.active,true); assert.equal(s.inactive,false);
 s.signal(2); s.signal(3); assert.equal(await p,2); assert.equal(s.inactive,true);
 const q=s.promise; assert.notEqual(q,p); assert.equal(q.wasResolved,false);
 const result=Promise.resolve(s); await Promise.resolve(); s.signal(4); assert.equal(await result,4); assert.equal(await q,4);
 const r=s.promise; s.close(); assert.equal(s.active,false); assert.equal(s.inactive,true); assert.equal(s.promise,r); await assert.rejects(Promise.resolve(r),e=>e===l8.closeEvent);
 s.signal(5); s.close(); assert.equal(s.promise,r); assert.equal(r.wasRejected,true);
 const t=l8.signal(); t.close(); assert.equal(t.inactive,true); await assert.rejects(Promise.resolve(t),e=>e===l8.closeEvent);
 console.log('Signal FBF PASS');
}
main().catch(e=>{console.error(e);process.exitCode=1});

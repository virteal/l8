'use strict';
// GPT-6 coding agent under Jean Hugues Noel Robert, 2026-11-24, Inox#42.
const assert = require('node:assert/strict');
const l8 = require('../lib/semaphore');
async function main(){
 const s=l8.semaphore(1);
 const a=s.promise; assert.equal(a.wasResolved,true); assert.equal(s.count,0);
 const b=s.promise,c=s.promise; assert.notEqual(b,c); assert.equal(b.wasResolved,false);
 s.release(); assert.equal(b.wasResolved,true); assert.equal(c.wasResolved,false); assert.equal(s.count,0);
 s.signal(); assert.equal(c.wasResolved,true); assert.equal(s.count,0);
 s.release(); assert.equal(s.count,1);
 const d=s.promise; assert.equal(d.wasResolved,true); assert.equal(s.count,0);
 const e=s.promise,f=s.promise; s.close(); assert.equal(s.closed,true); assert.equal(e.wasRejected,true); assert.equal(f.wasRejected,true);
 assert.equal(s.promise.wasRejected,true); s.close(); s.release(); assert.equal(s.count,0);
 await assert.rejects(Promise.resolve(s),reason=>reason===l8.closeEvent);
 console.log('Semaphore FBF PASS');
}
main().catch(e=>{console.error(e);process.exitCode=1});

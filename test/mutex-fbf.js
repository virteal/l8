'use strict';
// GPT-6 coding agent under Jean Hugues Noel Robert, 2026-11-24, Inox#42.
const assert=require('node:assert/strict');
const l8=require('../lib/mutex');
l8.debug(false);
const m=l8.mutex(true);
const a=m.promise,b=m.promise;
assert.equal(a.wasResolved,false);
assert.equal(b.wasResolved,false);
m.release(); assert.equal(a.wasResolved,true); assert.equal(b.wasResolved,false);
m.release(); assert.equal(b.wasResolved,true);
m.release(); assert.equal(Boolean(m.entered),false);
const n=l8.mutex(); const p=n.promise;
assert.equal(p.wasResolved,true); assert.equal(n.task,l8.current);
assert.equal(n.promise.wasRejected,true);
n.release(); assert.equal(Boolean(n.entered),false);
const c=l8.mutex(true); const q=c.promise;
c.close(); assert.equal(c.closed,true); assert.equal(q.wasRejected,true); assert.equal(c.promise.wasRejected,true); c.close(); c.release();
console.log('Mutex FBF PASS');

// Exercise the real scheduler, not just multiple requests from the root.
(async function testOwnershipTransfer(){
 const mutex=l8.mutex(); const events=[];
 const root=l8.current; mutex.promise;
 let a,b;
 a=l8.task(function(){
   this.step(function(){ events.push('a waits'); this.wait(mutex); });
   this.step(function(){ assert.equal(mutex.task,a); assert.equal(mutex.promise.wasRejected,true); events.push('a owns'); mutex.release(); });
 });
 b=l8.task(function(){
   this.step(function(){ events.push('b waits'); this.wait(mutex); });
   this.step(function(){ assert.equal(mutex.task,b); events.push('b owns'); mutex.release(); });
 });
 await new Promise(resolve=>setTimeout(resolve,20));
 assert.equal(mutex.task,root); assert.equal(mutex.promiseQueue.length,2);
 mutex.release();
 await new Promise(resolve=>setTimeout(resolve,30));
 assert.equal(a.done,true); assert.equal(b.done,true);
 assert.deepEqual(events,['a waits','b waits','a owns','b owns']);
 assert.equal(mutex.entered,false); assert.equal(mutex.task,null);
 console.log('Mutex ownership transfer PASS');
})().catch(e=>{console.error(e);process.exitCode=1});

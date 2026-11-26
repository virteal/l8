'use strict';
// 2026-11-24: GPT-6 under JHR, Inox #42.
const assert=require('node:assert/strict');
const l8=require('../lib/lock');
l8.debug(false);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
 const lock=l8.lock(); const first=lock.promise;
 await delay(10); assert.equal(first.wasResolved,true); assert.equal(lock.count,1); assert.equal(lock.task,l8.current);
 const second=lock.promise; assert.equal(second.wasResolved,true); assert.equal(lock.count,2);
 lock.release(); assert.equal(lock.count,1); assert.equal(lock.mutex.entered,true);
 lock.release(); assert.equal(lock.count,0); assert.equal(lock.mutex.entered,false);
 const initial=l8.lock(2); assert.equal(initial.task,l8.current); initial.release(); assert.equal(initial.count,1); initial.release(); assert.equal(initial.mutex.entered,false);
 const closed=l8.lock(); closed.close(); const rejected=closed.promise; await delay(10); assert.equal(rejected.wasRejected,true); assert.equal(rejected.rejectReason,l8.closeEvent);
 const held=l8.lock(); held.promise; await delay(10);
 let waiter; const task=l8.task(function(){this.step(function(){waiter=held.promise;});});
 await delay(10); assert.equal(task.done,true); assert.equal(waiter.wasResolved,false); held.close(); await delay(10); assert.equal(waiter.wasRejected,true); assert.equal(held.count,0);
 const racing=l8.lock(); const r1=racing.promise,r2=racing.promise;
 assert.equal(racing.count,2); await delay(10);
 assert.equal(r1.wasResolved,true); assert.equal(r2.wasResolved,true); assert.equal(racing.count,2);
 racing.release(); assert.equal(racing.count,1); assert.equal(racing.mutex.entered,true);
 racing.release(); assert.equal(racing.count,0); assert.equal(racing.mutex.entered,false);
 const closing=l8.lock(); const interrupted=closing.promise; closing.close(); await delay(10);
 assert.equal(interrupted.wasRejected,true); assert.equal(interrupted.rejectReason,l8.closeEvent); assert.equal(closing.count,0);
 const fifo=l8.lock(2); const root=l8.current; const events=[];
 let a,b;
 a=l8.task(function(){this.step(function(){events.push('a waits');this.wait(fifo);});this.step(function(){assert.equal(fifo.task,a);assert.equal(fifo.count,1);assert.equal(fifo.promise.wasResolved,true);assert.equal(fifo.count,2);events.push('a owns');fifo.release();fifo.release();});});
 b=l8.task(function(){this.step(function(){events.push('b waits');this.wait(fifo);});this.step(function(){assert.equal(fifo.task,b);assert.equal(fifo.count,1);events.push('b owns');fifo.release();});});
 await delay(20); assert.equal(fifo.task,root); assert.equal(fifo.mutex.promiseQueue.length,2);
 fifo.release(); await delay(10); assert.equal(fifo.task,root); assert.equal(fifo.count,1);
 fifo.release(); await delay(30); assert.equal(a.done,true); assert.equal(b.done,true);
 assert.deepEqual(events,['a waits','b waits','a owns','b owns']); assert.equal(fifo.count,0); assert.equal(fifo.task,null);
 console.log('Lock FBF PASS');
}
main().catch(e=>{console.error(e);process.exitCode=1});

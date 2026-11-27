'use strict';
// 2026-11-27 — GPT-6.2 under JHR, Inox #42.
const assert=require('node:assert/strict');
const l8=require('../lib/aggregator');require('../lib/selector');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
async function main(){
 const a=deferred(),b=deferred();const all=l8.all([a.promise,b.promise]).promise;b.resolve(2);a.resolve(1);assert.deepEqual(await all,[[null,1],[null,2]]);
 assert.deepEqual(await l8.all([null,undefined,()=>{throw 'bad'},()=>Promise.resolve(7)]),[[null,null],[null,undefined],['bad',null],[null,7]]);
 assert.deepEqual(await l8.all([{then(ok,ko){ok(1);ko('bad');ok(2)}},3]),[[null,1],[null,3]]);
 const evil={get then(){throw 'getter'}};assert.deepEqual(await l8.all([evil]),[['getter',null]]);
 assert.equal(await l8.and([Promise.reject('bad'),7]),false);
 assert.equal(await l8.and([7,0,9]),0);
 assert.equal(await l8.and([7,9]),9);
 assert.deepEqual(await l8.and([]),[]);
 assert.deepEqual(await l8.any([null,7]),[null,null]);
 assert.deepEqual(await l8.any([()=>{throw 'bad'},7]),['bad',null]);
 assert.equal(await l8.or([false,0,7]),7);
 assert.equal(await l8.or([false,0]),0);
 assert.equal(await l8.or([false,Promise.resolve(7)]),7);
 let reason;try{await l8.or([Promise.reject('bad'),new Promise(()=>{})]);assert.fail('or fulfilled')}catch(e){reason=e}assert.equal(reason,'bad');
 const c=deferred(),d=deferred();const s=l8.any([c.promise,d.promise]);const selected=s.promise;d.resolve(false);c.resolve(7);assert.deepEqual(await selected,[null,false]);await new Promise(r=>setTimeout(r,10));assert.deepEqual(s.result,[null,false]);
 assert.equal(await l8.any([]),null);assert.equal(await l8.or([]),null);
 const cyclic={then(ok){ok(cyclic)}};assert.ok((await l8.all([cyclic]))[0][0] instanceof TypeError);
 const nested=()=>({then(ok){ok(()=>Promise.resolve(11))}});assert.deepEqual(await l8.all([nested]),[[null,11]]);
 let started=0; assert.deepEqual(await l8.any([1,()=>{started++;return 2},Promise.reject('ignored'),evil]),[null,1]);assert.equal(started,0);
 assert.equal(await l8.and([0,false]),0);
 assert.equal(await l8.and([0,Promise.reject(undefined)]),false);
 let rejected=false;try{await l8.or([Promise.reject(false)])}catch(e){rejected=true;assert.equal(e,false)}assert.equal(rejected,true);
 const f=deferred(),g=deferred();const reduction=l8.and([f.promise,g.promise]).promise;g.resolve(9);f.resolve(7);assert.equal(await reduction,9);
 const h=deferred();const choice=l8.or([false,h.promise]).promise;assert.equal(choice.wasResolved,false);h.resolve(0);assert.equal(await choice,0);
 const local=l8.promise();local.resolve(8);assert.deepEqual(await l8.all([local]),[[null,8]]);
 console.log('Aggregator/Selector FBF PASS');
}
const watchdog=setTimeout(()=>{console.error('timeout');process.exit(1)},5000);
main().then(()=>clearTimeout(watchdog),e=>{clearTimeout(watchdog);console.error(e);process.exitCode=1});

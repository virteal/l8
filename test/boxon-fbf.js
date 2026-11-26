'use strict';
// 2026-11-26 — GPT-6.2 under JHR, Inox #42.
const assert=require('node:assert/strict');
const B=require('../lib/boxon').scope(executor=>new Promise(executor));
async function main(){
 const a=B(), b=B(); let collected;
 B.Moxon.all([a,b])( (err, xs)=>{assert.ifError(err); collected=xs;} );
 a(null,1); assert.equal(collected,undefined);
 b('failure'); assert.deepEqual(collected,[a,b]); assert.throws(()=>b(),e=>e==='failure');
 assert.equal(B.Moxon.race,B.race);
 const x=B(),y=B(); y(()=>{assert.equal(B.current,y)});
 x(()=>{assert.equal(B.current,x);y(null,1);assert.equal(B.current,x)});
 x(null,2); assert.equal(B.current,null);
 const z=B(); z(()=>{throw Error('test')}); assert.throws(()=>z(null,1),/test/); assert.equal(B.current,null);
 const inputs=[Promise.resolve(2),Promise.reject('bad'),3];
 const all=await B.all(inputs); assert.equal(all[0](),2); assert.throws(()=>all[1](),e=>e==='bad'); assert.equal(all[2](),3);
 // Race returns a Boxon (not its value) to callback observers.
 const first=await new Promise(resolve=>B.race([Promise.resolve(4),new Promise(()=>{})])((err, winner)=>{assert.ifError(err);resolve({winner})}));
 assert.equal(first.winner(),4);
 const observed=B(), later=B(); let raw=0, registration=0, result, winner, adopted;
 observed((err)=>{if(err&&err.Boxon)registration++;else raw++});
 B.all([observed,later,observed])((err,xs)=>{assert.ifError(err);result=xs});
 B.race([observed,later])((err,x)=>{assert.ifError(err);winner=x});
 B.cast(observed)((err,x)=>{assert.ifError(err);adopted=x});
 observed(null,11);
 assert.equal(raw,1); assert.equal(registration,0); assert.equal(winner,observed); assert.equal(adopted,11); assert.equal(result,undefined);
 later('late failure'); assert.deepEqual(result,[observed,later,observed]);
 console.log('Boxon FBF PASS');
}
main().catch(e=>{console.error(e);process.exitCode=1});

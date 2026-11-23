'use strict';
// GPT-6, under Jean Hugues Noël Robert's direction, 2026-11-23: independent FBF regressions.
const assert=require('node:assert/strict');
const W=require('../lib/water');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
W.machine({autodep:true}).resume();
async function race(){
 const a=W(0), b=W(), obs=[];
 b(W,()=>{const v=a();return new Promise(resolve=>setTimeout(()=>resolve(v*10),v===1?40:5));});
 W(b,v=>obs.push(v));await delay(20);obs.length=0;
 a(1);a(2);await delay(75);
 assert.equal(b(),20,'obsolete promise result must not overwrite newer generation');
 assert.deepEqual(obs,[20]);
}
async function diamond(){
 const a=W(1), b=W(), c=W(), d=W(), obs=[];
 b(W,()=>{const v=a();return Promise.resolve(v*2)});
 c(W,()=>{const v=a();return new Promise(resolve=>setTimeout(()=>resolve(v*3),5))});
 d(W,()=>b()+c()); W(d,v=>obs.push(v));
 await delay(20);obs.length=0;a(2);await delay(30);
 assert.equal(d(),10);assert.deepEqual(obs,[10]);
}
async function dynamic(){
 const select=W(true),a=W(1),b=W(10),c=W();
 c(W,()=>select()?a():b());assert.equal(c(),1);
 select(false);assert.equal(c(),10);a(99);assert.equal(c(),10);
 b(12);assert.equal(c(),12);
}
async function compaction(){
 const a=W(),b=W();
 for(let i=0;i<2000;i++){
  assert.equal(W.connect(a,b),true);
  assert.equal(W.disconnect(a,b),true);
 }
 assert.ok(!a._deps || a._deps.length===0,'orphaned downstream slots: '+a._deps.length);
 assert.ok(!b._sources || b._sources.length===0,'orphaned upstream slots: '+b._sources.length);
 assert.equal(W.connect(a,b),true);
 assert.equal(W.connect(a,b),false);
 assert.equal(W.disconnect(a,b),true);
}
async function cycles(){
 const factorial=W.define(function(arg,ret){
  arg(W,function(n){return [n,1]},[]);
  const loop=W();
  loop(arg,function(pair){
   const n=pair[0], product=pair[1];
   if(n<=1)ret(product);
   else return [n-1,n*product];
  });
  loop(loop);
 });
 const fluidFactorial=W.fluid.define(function(stream){return stream
  .map(function(n){return [n,1]})
  .while(function(pair){return pair[0]>1})
    .map(function(pair){return [pair[0]-1,pair[0]*pair[1]]})
  .end_while()
  .map(function(pair){return pair[1]});
 });
 for(const n of [0,1,3,5,10,170,171,5]){
  const reference=(function(){let v=1;for(let i=2;i<=n;i++)v*=i;return v})();
  for(const [label,got] of [['Water',factorial(n)],['Fluid',fluidFactorial(n)]]){
   if(!Number.isFinite(reference)) assert.equal(got,reference,label+' cycle for '+n);
   else assert.ok(Math.abs(got-reference)/reference<1e-12,label+' cycle for '+n+': '+got);
  }
 }
}
(async()=>{for(const [name,fn] of [['race',race],['diamond',diamond],['dynamic',dynamic],['compaction',compaction],['cycles',cycles]]){await fn();console.log('PASS',name)}})().catch(e=>{console.error('FAIL',e.stack);process.exitCode=1});

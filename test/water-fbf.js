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
 assert.ok(!a._deps || a._deps.length<=1000,'orphaned downstream slots: '+a._deps.length);
 assert.ok(!b._sources || b._sources.length<=1000,'orphaned upstream slots: '+b._sources.length);
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
async function holdReleaseAndSubmitContract(){
 // FBF 2026-11-23 — GPT-6 under Jean Hugues Noël Robert's direction.
 // Regression for the original smoke-test bug: submit() refuses a held machine.
 const machine=W.machine({autodep:true});
 const previous=machine.resume();
 try{
  const stream=W.fluid().hold().from([10,20,30]);
  const collected=stream.map(n=>n*n).stateful().state();
  let called=false, submitError=null;
  W.submit(function(){called=true;stream.release()},function(err){submitError=err});
  assert.equal(called,false,'submit must not execute a held/busy machine');
  assert.match(String(submitError),/cannot submit.*busy/);
  assert.equal(machine.nested,1);
  stream.release();
  assert.deepEqual(collected,[100,400,900]);
  assert.equal(machine.nested,0);
  assert.equal(machine.effects.length,0);
  assert.equal(machine.queue.length,0);
  assert.equal(machine.ready(),true);
  // A successfully released machine must still accept regular submits.
  let ran=false;
  W.submit(function(){ran=true},function(err){assert.equal(err,undefined)});
  assert.equal(ran,true);
 }finally{previous.resume()}
}
async function pendingEffectsNotReady(){
 // FBF 2026-11-23 — GPT-6 under Jean Hugues Noël Robert's direction.
 const m=W.machine({autodep:true}), prior=m.resume();
 try{
  const observed=[];
  W.effect(()=>observed.push('effect'));
  assert.equal(m.effects.length,1);
  assert.equal(m.ready(),false);
  W.fluid().hold().release();
  assert.deepEqual(observed,['effect']);
  assert.equal(m.ready(),true);
 }finally{prior.resume()}
}
async function promisesKeepTheirMachine(){
 // Completion must run in the original Machine, even if another is active.
 const m1=W.machine({autodep:true}), m2=W.machine({autodep:true});
 const prior=m1.resume();
 try{
  const a=W(1),b=W(), seen=[];
  b(W,()=>{const val=a();return new Promise(resolve=>setTimeout(()=>resolve(val*10),8))});
  W(b,v=>seen.push({v,context:W.Machine.current}));
  m2.resume();
  await delay(22);
  assert.equal(b(),10);
  assert.deepEqual(seen,[{v:10,context:m1}]);
  assert.equal(W.Machine.current,m2,'completion must restore the active Machine');
  assert.equal(m1.ready(),true);
  assert.equal(m2.ready(),true);
 }finally{prior.resume()}
}
async function boxonValueCardinality(){
 // Both an ordinary Boxon result and multiple results must survive delivery.
 const m=W.machine({autodep:true}), prior=m.resume();
 try{
  const single=W.boxon(), one=W();
  one(W,()=>single,[]);
  one(1); single(null,42);
  assert.equal(one(),42);
  const multi=W.boxon(),many=W();
  many(W,()=>multi,[]);
  many(1);multi(null,'alpha','beta');
  assert.deepEqual(many(),['alpha','beta']);
  const failed=W.boxon(), failedNode=W();
  failedNode(W,()=>failed,[]);
  failedNode(1);
  failed(new Error('boom'),42,43);
  assert.throws(()=>failedNode(),/boom/,
    'Boxon must not discard errors when multiple results accompany them');
  assert.equal(m.ready(),true);
 }finally{prior.resume()}
}
async function conditionalAutodependencyPruning(){
 // FBF 2026-11-23 — GPT-6 under Jean Hugues Noël Robert's direction.
 const m=W.machine({autodep:true}), prior=m.resume();
 try{
  const select=W(true), left=W(10), right=W(20), out=W();
  let evaluations=0;
  out(W,()=>{evaluations++;return select()?left():right()});
  assert.equal(out(),10);
  assert.equal(left._deps.includes(out),true);
  select(false);assert.equal(out(),20);
  assert.equal(left._deps.includes(out),false,
    'the inactive branch must not remain a dynamic dependency');
  assert.equal(right._deps.includes(out),true);
  const before=evaluations;
  left(99);
  assert.equal(evaluations,before,'inactive branch must not recompute');
  right(21);assert.equal(out(),21);
  select(true);assert.equal(out(),99);
  assert.equal(right._deps.includes(out),false);
  // Explicitly connecting the branch reserves its dependency independently
  // of the conditional expression's next evaluation.
  W.connect(right,out);
  select(false);assert.equal(out(),21);
  select(true);assert.equal(out(),99);
  assert.equal(right._deps.includes(out),true,'explicit edge must survive pruning');
  const beforeExplicit=evaluations;
  right(25);assert.ok(evaluations>beforeExplicit);
  assert.equal(out(),99);
  W.disconnect(right,out);
  assert.equal(right._deps.includes(out),false);
  assert.equal(m.ready(),true);
 }finally{prior.resume()}
}
async function inactiveAsyncBranchIsNotPublished(){
 // FBF 2026-11-23 — GPT-6 under Jean Hugues Noël Robert's direction.
 // Switching a branch while an earlier promise is unresolved must not
 // publish the earlier generation as the current computed result.
 const machine=W.machine({autodep:true}), prior=machine.resume();
 try{
  const select=W(true), left=W(1), right=W(20), out=W();
  let finishOld, finishNew;
  const emitted=[];
  out(W,()=>{
   if(select()){
    const value=left();
    return new Promise(resolve=>{finishOld=()=>resolve(value)});
   }
   const value=right();
   return new Promise(resolve=>{finishNew=()=>resolve(value)});
  });
  W(out,value=>emitted.push(value));
  select(false);
  assert.equal(typeof finishNew,'undefined',
    'pending first generation should be settled before evaluating next');
  finishOld();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(emitted,[],
    'obsolete branch must not emit after selection changes');
  assert.equal(typeof finishNew,'function');
  finishNew();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(emitted,[20]);
  assert.equal(out(),20);
  assert.equal(left._deps.includes(out),false);
  assert.equal(right._deps.includes(out),true);
  assert.equal(machine.ready(),true);
 }finally{prior.resume()}
}
async function initiallyMissingConditionalAutodependency(){
 // FBF 2026-11-23 — GPT-6 under Jean Hugues Noël Robert's direction.
 // A missing source aborts an initial evaluation. Its auto-owned edge must
 // still be tracked so that a later branch switch can remove it.
 const m=W.machine({autodep:true}), prior=m.resume();
 try{
  const select=W(true), missing=W(), fallback=W(7), out=W();
  let evaluations=0;
  out(W,()=>{evaluations++;return select()?missing():fallback()});
  assert.equal(out(),undefined);
  assert.equal(missing._deps.includes(out),true);
  missing(4);assert.equal(out(),4);
  select(false);assert.equal(out(),7);
  assert.equal(missing._deps.includes(out),false);
  const before=evaluations;
  missing(9);
  assert.equal(evaluations,before);
  fallback(8);assert.equal(out(),8);
 }finally{prior.resume()}
}
(async()=>{for(const [name,fn] of [['race',race],['diamond',diamond],['dynamic',dynamic],['compaction',compaction],['cycles',cycles],['hold-release-submit',holdReleaseAndSubmitContract],['ready-effects',pendingEffectsNotReady],['machine-async',promisesKeepTheirMachine],['boxon-results',boxonValueCardinality],['dynamic-pruning',conditionalAutodependencyPruning],['inactive-async-branch',inactiveAsyncBranchIsNotPublished],['initially-missing-branch',initiallyMissingConditionalAutodependency]]){await fn();console.log('PASS',name)}})().catch(e=>{console.error('FAIL',e.stack);process.exitCode=1});

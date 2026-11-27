'use strict';
// 2026-11-24 — GPT-6 under Jean Hugues Robert's direction.
// L8: multiple Task.defer callbacks must run LIFO before terminal handlers.
const assert=require('node:assert/strict');
const l8=require('../lib/l8');
l8.debug(false);
const events=[];
const t=l8.task(function(){
  this.defer(function(){events.push('A')});
  this.defer(function(){events.push('B')});
  this.step(function(){events.push('W');return 42});
  this.final(function(err,result){events.push('F');events.push(result)});
});
setTimeout(()=>{
  try{
    assert.equal(t.done,true);
    assert.equal(t.error,undefined);
    assert.deepEqual(events,['W','B','A','F',42]);
    assert.equal(t.result,42);
    console.log('L8 multiple Task.defer LIFO FBF: PASS');
  }catch(e){console.error(e);process.exitCode=1}
},45);

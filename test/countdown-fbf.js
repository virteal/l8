'use strict';
const assert=require('node:assert/strict');
const l8=require('../lib/l8');
const original={setInterval:global.setInterval,clearInterval:global.clearInterval,exit:process.exit};
let tick,cleared=0,exitCode;
try{
  global.setInterval=fn=>{tick=fn;return 123};
  global.clearInterval=id=>{assert.equal(id,123);cleared++};
  process.exit=code=>{exitCode=code};
  l8.countdown(2,true);
  tick();assert.equal(exitCode,undefined);
  tick();assert.equal(exitCode,1);assert.equal(cleared,1);
  const cancel=l8.countdown(2);cancel();assert.equal(cleared,2);
  l8.clientize();l8.countdown(1,true);
  assert.throws(()=>tick(),/countdown expired/);
  assert.equal(cleared,3);
  console.log('Countdown FBF PASS');
}finally{
  global.setInterval=original.setInterval;global.clearInterval=original.clearInterval;process.exit=original.exit;
}

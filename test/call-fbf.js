'use strict';
const assert = require('node:assert/strict');
const l8 = require('../lib/call');
async function main(){
  const ctx={base:10};
  const f=l8.call(function(a,b){return this.base+a+b},ctx);
  const p=Promise.resolve(f.promise);
  assert.equal(f(2,3),15);
  assert.equal(await p,15);
  assert.equal(f.apply([4,5]),19);
  const g=l8.call(function(){return Array.from(arguments)});
  assert.deepEqual(g.signal(),[]);
  assert.deepEqual(g.signal(0),[0]);
  assert.deepEqual(g.apply([1,2]),[1,2]);
  assert.deepEqual(g.signal(1,2),[1,2]);
  const reason=new Error('call failure');
  const h=l8.call(()=>{throw reason});
  const rejected=assert.rejects(Promise.resolve(h.promise),e=>e===reason);
  assert.throws(()=>h(),e=>e===reason);
  await rejected;
  console.log('Call FBF PASS');
}
main().catch(e=>{console.error(e);process.exitCode=1});

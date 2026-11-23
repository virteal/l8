'use strict';
// FBF regression tests, 2026-11-23, GPT-6 under Jean Hugues Noël Robert's
// direction. New tests only; original L8 implementation remains attributed JHR.
const assert = require('node:assert/strict');
const l8 = require('../lib/l8');
l8.debug(false);

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function testLateWaitResolution() {
  const p = l8.promise();
  const events = [];
  const task = l8.task(function() {
    this.step(function() { events.push('waiting'); this.wait(p); });
    this.step(function() { events.push('next step'); });
    this.final(function() { events.push('done'); });
  });
  let resumeCalls = 0;
  const resume = task.resume;
  task.resume = function() { resumeCalls++; return resume.apply(this, arguments); };
  await delay(10);
  task.resume();
  await delay(10);
  assert.equal(task.done, true);
  p.resolve(13);
  await delay(15);
  assert.deepEqual(events, ['waiting', 'next step', 'done']);
  assert.equal(resumeCalls, 1, 'obsolete promise must not resume completed task');
}

async function testLateWaitRejection() {
  const p = l8.promise();
  const task = l8.task(function() {
    this.step(function() { this.wait(p); });
    this.step(function() {});
  });
  let raiseCalls = 0;
  const raise = task.raise;
  task.raise = function() { raiseCalls++; return raise.apply(this, arguments); };
  await delay(10);
  task.resume();
  await delay(10);
  assert.equal(task.done, true);
  p.reject(new Error('late failure'));
  await delay(15);
  assert.equal(raiseCalls, 0, 'obsolete promise rejection must not raise on done task');
}

async function testLateSleepWakeup() {
  const events = [];
  const task = l8.task(function() {
    this.step(function() { events.push('sleeping'); this.sleep(35); });
    this.step(function() { events.push('next step'); });
    this.final(function() { events.push('done'); });
  });
  let resumeCalls = 0;
  const resume = task.resume;
  task.resume = function() { resumeCalls++; return resume.apply(this, arguments); };
  await delay(10);
  task.resume();
  await delay(55);
  assert.deepEqual(events, ['sleeping', 'next step', 'done']);
  assert.equal(resumeCalls, 1, 'obsolete timer must not resume completed task');
}

async function testLegitimateWaitAndSleep() {
  const p = l8.promise();
  const seen = [];
  const task = l8.task(function() {
    this.step(function() { this.wait(p); });
    this.step(function(value) { seen.push(value); this.sleep(8); });
    this.step(function() { seen.push('completed'); });
  });
  await delay(10);
  p.resolve(42);
  await delay(35);
  assert.deepEqual(seen, [42, 'completed']);
  assert.equal(task.done, true);
}

(async function main() {
  await testLateWaitResolution();
  await testLateWaitRejection();
  await testLateSleepWakeup();
  await testLegitimateWaitAndSleep();
  console.log('FBF stale wakeup tests passed (4 scenarios)');
})().catch(error => { console.error(error); process.exitCode = 1; });

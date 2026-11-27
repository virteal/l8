'use strict';
// 2026-11-24 — GPT-6 coding agent under Jean Hugues Robert's direction.
// L8 retrofit of Inox L9's cooperative stop / stop-because contract.
const assert = require('node:assert/strict');
const l8 = require('../lib/l8');
l8.debug(false);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function makePendingTask(events) {
  return l8.task(function () {
    this.step(function () { events.push('work'); });
    this.final(function () { events.push('final'); });
  });
}

async function main() {
  const events = [];
  const task = makePendingTask(events);
  assert.equal(task.stopReason, undefined);
  assert.equal(Boolean(task.stopping), false);
  assert.equal(task.stop(), task, 'stop() remains chainable');
  assert.equal(task.stopReason, true, 'no-argument stop defaults to true');
  assert.equal(task.stopping, true);
  assert.equal(task.stopped, false);
  assert.equal(task.canceled, undefined, 'stop must not cancel');
  assert.equal(task.error, undefined, 'stop must not raise');
  await delay(15);
  assert.equal(task.done, true);
  assert.equal(task.stopping, false);
  assert.equal(task.stopped, true);
  assert.deepEqual(events, ['work', 'final'], 'cooperative stop does not skip normal steps');

  for (const reason of ['maintenance', false, null, undefined, 0, { kind: 'shutdown' }]) {
    const t = makePendingTask([]);
    assert.equal(t.stopBecause(reason), t, 'stopBecause remains chainable');
    assert.equal(t.stopReason, reason, 'preserve explicit reason including falsy');
    assert.equal(t.stopping, true);
    assert.equal(t.error, undefined);
  }

  const t1 = makePendingTask([]);
  t1.stopBecause('first').stopBecause('second').stop();
  assert.equal(t1.stopReason, 'first', 'first reason must survive later requests');
  const t2 = makePendingTask([]);
  t2.stop().stopBecause('second');
  assert.equal(t2.stopReason, true, 'default first reason must survive explicit retry');

  const completed = makePendingTask([]);
  await delay(15);
  assert.equal(completed.done, true);
  completed.stopBecause('too late');
  completed.stop();
  assert.equal(completed.stopReason, undefined, 'terminal task must ignore late stops');
  assert.equal(Boolean(completed.stopped), false);

  const failing = l8.task(function () {
    this.step(function () { throw new Error('application error'); });
    this.failure(function () { /* handle failure, not an intentional stop */ });
  });
  await delay(15);
  assert.equal(failing.done, true);
  assert.equal(failing.stopReason, undefined);
  assert.equal(Boolean(failing.stopped), false, 'exception is not a stop request');

  // The singleton root forwards operations to its current task (L8 convention).
  const rootRequest = l8.stopBecause('root maintenance');
  assert.equal(rootRequest, l8);
  assert.equal(l8.stopReason, 'root maintenance');
  assert.equal(l8.stop(), l8);
  assert.equal(l8.stopReason, 'root maintenance');
  console.log('L8 cooperative stop / stopBecause FBF: PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

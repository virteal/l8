//  mutex.js
//    Mutexes.
//
// 13/04/08, JHR, extracted from l8.js
//
"use strict";

// This file adds methods to the l8 global object
var l8 = require( "l8/lib/l8.js" )
module.exports = l8

// FBF 2026-11-24, GPT-6 under JHR: queue the requester with its promise.
function Mutex( entered ){
  this.entered   = !!entered
  this.task      = null
  this.promiseQueue = []
  this.closed    = false
}
var ProtoMutex = Mutex.prototype

l8.proto.mutex = function task_mutex( entered ){
// A mutex is a binary semaphore.
// See http://en.wikipedia.org/wiki/Mutual_exclusion
//
// Usage:
//   var mutex = l8.mutex( false )
//   ...
//   l8.step( function(){  l8.wait( mutex )
//   }).step( function(){  l8.defer( function(){ mutex.release(); } )
//    ... critical section ....
//
// The parameter is optional and defaults to false, ie the mutex is "free".
// To acquire the mutex, wait for it. If multiple tasks do that, they are
// queued, FIFO order.
//
// Usage:
//   var mutex = l8.mutex()
//   function release(){ mutex.release(); }
//   mutex
//   .then( function(){ ... critical section ... } )
//   .then( release, release )
//
// Another way to acquire a mutex is to treat it as a promise, ie using .then().
// Contrary to a normal promise, when multiple .then() are called, not all of
// the callbacks will be called when the mutex is released, only one. The other
// callbacks will be called when the mutex is released again. It works this way
// because .then() actually involves a new promise each time it is called.
  return new Mutex( entered )
}

// 2026-11-26, GPT-6.2 under JHR (#42): establish owner and any
// internal acquisition state before publishing promise settlement.
ProtoMutex._grant = function( task, promise ){
  this.entered = true
  this.task = task
  if( this._onGrant )this._onGrant()
  promise.resolve( this )
}

ProtoMutex.__defineGetter__( "promise", function(){
// Mutexes queue promises that are resolved when mutex is entered.
// Note: accessing .promise twice results in two more promises in the promise
// queue  of the mutex. I.e. please make sure that each promise, when resolved,
// invoke code that will eventually releases the mutex, or else queued promises
// will never be resolved.
// If the same task tries to reacquire a mutex, an exception is raised.
// That is not the case with re-entrant mutexe, "locks". See also Lock.promise
  var promise = l8.promise()
  var task = l8.current
  if( this.closed ){
    promise.reject( l8.closeEvent )
    return promise
  }
  // when no need to queue...
  if( !this.entered || this.task === task ){
    // ... because same task cannot block itself
    if( this.entered ){
      promise.reject( new Error( "mutex already entered") )
    // ... because nobody's there
    }else{
      this._grant( task, promise )
    }
  // when a new task wants to enter asap
  }else{
    this.promiseQueue.push({ task: task, promise: promise })
  }
  return promise
})

ProtoMutex.then = function( callback, errback ){
// A mutex is a promise, resolved when mutex is entered.
// Duck typing so that Task.wait() works.
  return this.promise.then( callback, errback)
}

ProtoMutex.release = function(){
// Release mutex, resolve next pending promise if any.
  if( this.closed || !this.entered )return
  var waiter = this.promiseQueue.shift()
  if( waiter ){
    this._grant( waiter.task, waiter.promise )
  }else{
    this.entered = false
    this.task    = null
  }
}

// Alias for Mutex.release()
ProtoMutex.signal = ProtoMutex.release

ProtoMutex.close = function(){
// Close mutex, reject all pending promises.
  if( this.closed )return this
  this.closed = true
  this.entered = false
  this.task = null
  var list = this.promiseQueue
  this.promiseQueue = []
  var len = list.length
  for( var ii = 0 ; ii < len ; ii++ ){
    list[ii].promise.reject( l8.closeEvent )
  }
  return this
}


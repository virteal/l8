//  mutex.js
//    Mutexes.
//
// 13/04/08, JHR, extracted from l8.js
//
"use strict";

// This file adds methods to the l8 global object
var l8 = require( "l8/lib/l8.js" )
exports.l8 = l8

function Mutex( entered ){
  this.entered   = entered
  this.task      = null
  this.taskQueue = []
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
  // when no need to queue...
  if( !this.entered || this.task === task ){
    // ... because same task cannot block itself
    if( this.entered ){
      promise.reject( new Error( "mutex already entered") )
    // ... because nobody's there
    }else{
      this.entered = true
      this.task    = task
      promise.resolve( this )
    }
  // when a new task wants to enter asap
  }else{
    this.promiseQueue.push( promise )
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
  if( !this.entered )return
  this.task = null
  var promise = this.promiseQueue.shift()
  if( promise ){
    promise.resolve( this )
  }else{
    this.entered = false
    this.task    = null
  }
}

// Alias for Mutex.release()
ProtoMutex.signal = ProtoMutex.release

ProtoMutex.close = function(){
// Close mutex, reject all pending promises.
  var list = this.promiseQueue
  this.promiseQueue = null
  var len = list.length
  for( var ii = 0 ; ii < len ; ii++ ){
    list[ii].reject( l8.closeEvent )
  }
  return this
}


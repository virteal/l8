//  signal.js
//    A deactivable event detector.
//
// 13/04/08, JHR, extracted from l8.js
//
"use strict";

// This file adds methods to the l8 global object
var l8 = require( "l8/lib/l8.js" )
module.exports = l8;

function Signal(){
  this.nextPromise = l8.promise()
  this.nextPromise.resolve()
  this.closed = false
}
var ProtoSignal = Signal.prototype

l8.proto.signal = function task_signal( value ){
// l8#signal()
// Make a new signal. Signals are activable event detectors.
// Signals can be signaled multiple times. When a signal is
// signaled, the promise attached to it is resolved and a new promise can be
// attached to it (that will be resolved when the signal is signaled again).
// Note: if the signal occurs while nobody cares, it get lost, ie signals are
// event detectors, when inactive they detect nothing.
// Note: a new promise is attached to a signal using .promise or .then() ;
// this "clears" the previously signaled signal and reactivate the signal, ie
// it restarts the event detection.
  return new Signal( value )
}

ProtoSignal.__defineGetter__( "active", function(){
// A signal is active when some entities expects its occurence.
// I.e. a signal is active when there is a pending promise. When an active
// signal is signaled, the promise is resolved.
  return !this.nextPromise.wasResolved
})

ProtoSignal.__defineGetter__( "inactive", function(){
// A signal is inactive when nothing is expecting its occurence.
// An event occurence signaled on a inactive signal object is ignored.
  return !this.nextPromise.wasResolved
})

ProtoSignal.__defineGetter__( "promise", function(){
// Returns an unresolved promise that next a_signal.signal() will resolve.
// Returns an already rejected promise if signal was closed.
  var promise = this.nextPromise
  if( this.closed )return promise
  // Make a new promise if previous one was resolved.
  return !promise.wasResolved ? promise : (this.nextPromise = l8.promise())
})

ProtoSignal.then = function signal_then( callback, errback ){
// Signals are promises that detect events. Repeatedly.
//
// When a signal is signaled, it's current promise is resolved and a new
// promise is attached to it when a_signal.then() is called again.
// As a result, a_signal.then() is guarantee to succeed only when the next
// a_signal.signal() occurs.
// Note: when an unresolved promise is attached to a signal, the signal is
// active. After the signal is signaled, it becomes inactive, until it is
// activated again.
  return this.promise.then( callback, errback)
}

ProtoSignal.signal = function signal_signal( value ){
// Signal the occurence of a signal.
// Tasks that block on the signal are deblocked.
// Also resolves the promise attached to the signal. Signals are not
// buffered, the first signaled value is the value of the current promise.
// If another signal occurs before another promise is issued, it get lost.
// Ie, signaling an inactive signal is a noop.
// A new promise is issued when a_signal.then() is called, if the current
// promise is already resolved.
  if( !this.nextPromise.wasResolved ){
    this.nextPromise.resolve( value )
  }
  return this
}

ProtoSignal.close = function signal_close(){
// CLose signal, reject pending promise.
  if( this.closed )return
  this.closed = true
  if( this.nextPromise.wasResolved ){
    this.nextPromise = l8.promise()
  }
  this.nextPromise.reject( l8.closeEvent )
  return  this
}



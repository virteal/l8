//  semaphore.js
//    Dijsktra's semaphore, a synchronisation tool
//
// 13/04/08, JHR, extracted from l8.js
//
"use strict";

// This file adds methods to the l8 global object
var l8 = require( "l8/lib/l8.js" )
exports.l8 = l8

function Semaphore( count ){
  this.count        = count
  this.promiseQueue = []
  this.closed       = false
  return this
}
var ProtoSemaphore = Semaphore.prototype

l8.proto.semaphore = function( count ){
// Make a new semaphore.
// See http://en.wikipedia.org/wiki/Semaphore_(programming)
// P is .signal() or .release().
// V is l8.wait( a_semaphore ) or a_semaphore.then(...)
  return new Semaphore( count)
}

ProtoSemaphore.then = function( callback ){
// Semaphores are queued promises, resolved when semaphore is released.
// Usage:
//  l8.step(  function(){  l8.wait( a_semaphore );
//  )}.step(  function(){  console.log( "resource acquired" );
//  }).step(  function(){  ...
//  }).final( function(){  a_semaphore.release(); })
//
// Usage:
//  a_semaphore.then( function(){ console.log( "resource acquired" ); } );
//
// See also Promise.then()
  return this.promise.then( callback )
}

ProtoSemaphore.__defineGetter__( "promise", function(){
// Make a new promise, queued, resolved when semaphore is released.
  var promise = MakePromise()
  if( this.closed ){
    promise.reject( l8.closeEvent )
    return promise
  }
  if( this.count > 0 ){
    this.count--
    promise.resolve( this )
  }else{
    this.promiseQueue.push( promise )
  }
  return promise
})

ProtoSemaphore.release = function(){
// Add resource to semaphore, may resolve next pending promise.
  this.count++
  if( this.closed || this.count <= 0 )return this
  var step = this.promiseQueue.shift()
  if( step ){
    this.count--
    step.resolve( this)
  }
  return this
}

// Alias for Semaphore.release()
ProtoSemaphore.signal = ProtoSemaphore.release

ProtoSemaphore.close = function(){
// Close semaphore, reject pending promises.
  var list = this.promiseQueue
  this.promiseQueue = null
  var len = list.length
  for( var ii = 0 ; ii < len ; ii++ ){
    list[ii].reject( l8.closeEvent)
  }
  return this
}


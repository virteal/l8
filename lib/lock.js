//  port.js
//    Locks, r-entrant mutexes.
//
// 13/04/08, JHR, extracted from l8.js
//
"use strict";

// This file adds methods to the l8 global object
var l8 = require( "l8/lib/l8.js" )
require( "l8/lib/mutex.js" )
exports.l8 = l8

function Lock( count ){
// aka "reentrant mutex"
  this.mutex  = l8.mutex( count > 0 )
  this.count  = count || 0
}
var ProtoLock = Lock.prototype

l8.proto.lock = function task_lock( count ){
// l8#lock()
// A create a new lock, a re-entrant mutex
  return new Lock( count)
}

ProtoLock.__defineGetter__( "promise", function(){
  var that    = this
  var promise = l8.promise()
  if( this.mutex.task === l8.current ){
    this.count++
    promise.resolve( that)
  }else{
    this.mutex.then( function(){
      this.count = 1
      promise.resolve( that)
    })
  }
  return promise
})

ProtoLock.then = function lock_then( callback, errback ){
  return this.promise.then( callback, errback)
}

ProtoLock.release = function(){
  if( this.count ){
    if( --this.count )return
  }
  this.mutex.release()
}

ProtoLock.signal = ProtoLock.release

ProtoLock.__defineGetter__( "task", function(){
  return this.mutex.task
})

ProtoLock.close = function(){
  this.mutex.close()
  return this
}


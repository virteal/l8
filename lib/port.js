//  port.js
//    Ports. Producer/Consumer protocol with no buffering at all.
//
// 13/04/08, JHR, extracted from l8.js
//
"use strict";

// This file adds methods to the l8 global object
var l8 = require( "l8/lib/l8.js" )
exports.l8 = l8

function Port(){
  this.getPromise = null // "in"  promise, ready when ready to .get()
  this.putPromise = null // "out" promise, ready when ready to .put()
  this.value      = null
  this.closed     = false
}
var ProtoPort = Port.prototype

l8.proto.port = function(){
  return new Port()
}

ProtoPort.__defineGetter__( "promise", function(){
  return this.in
})

ProtoPort.then = function port_then( callback, errback ){
  return this.in.then( callback, errback)
}

ProtoPort.get = function(){
// Block current task until another task produces a result.
// If multiple tasks block, they get results in FIFO order.
  var that = this
  // Deblock producer
  this.out.resolve()
  var task = this.current
  var step = task.currentStep
  task.pause()
  // Wait until producer produce a result
  this.in.then( function( r ){
    // If another task already consumed the result, keep waiting
    if( !that.getPromise )return that.in
    // Consume the result (if task is still blocked waiting for it)
    if( task.pausedStep === step ){
      if( that.closed ){
        return task.raise( l8.closedEvent )
      }
      that.getPromise = null
      that.value = r
      task.stepResult = r
      task.resume()
    }
  })
  return this
}

ProtoPort.try_get = function(){
// Like .get() but non blocking. Returns [false] or [true, value].
  if( this.closed
  || !this.getPromise
  || this.getPromise.wasResolved
  )return [false]
  this.getPromise = null
  return [true, this.value]
}

ProtoPort.put = function port_put( msg ){
// Produce a result and block task until a consumer task consumes it.
// Multiple productions by multiple tasks are buffered, FIFO order.
  var that = this
  // Deblock consumer (if/when there is a pending one)
  this.in.resolve( msg )
  var task = l8.current
  var step = task.currentStep
  task.pause()
  // Wait until consumer consumes the result
  this.out.then( function(){
    // If another task already produced a result, wait again
    if( !that.putPromise ){
      // Deblock consumer
      this.in.resolve( msg )
      return that.out
    }
    that.putPromise = null
    if( task.pausedStep === step ){
      step.stepResult = that
      task.resume()
    }
  })
  return this
}

ProtoPort.try_put = function( msg ){
// Like .put() but non blocking
  if( this.closed
  ||  !this.putPromise
  ||  !this.putPromise.wasResolved
  )return false
  this.putPromise = null
  this.value = msg
  return true
}

ProtoPort.signal = ProtoPort.try_put

ProtoPort.__defineGetter__( "in", function(){
  return !this.getPromise
  ? this.getPromise = l8.promise()
  : this.getPromise
})

ProtoPort.__defineGetter__( "out", function(){
  return !this.putPromise
  ? this.putPromise = l8.promise()
  : this.putPromise
})


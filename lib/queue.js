//  queue.js
//    Message queues. Producer/Consumer protocol with buffering.
//
// 13/04/08, JHR, extracted from l8.js
//
"use strict";

// This file adds methods to the l8 global object
var l8 = require( "l8/lib/l8.js" )
module.exports = l8;

//global.__defineGetter__( "de", l8.getDebugFlag )
var de   = l8.de
var bug  = l8.bug
var mand = l8.mand

function MessageQueue( capacity ){
  this.capacity   = capacity || 100000
  this.queue      = new Array() // ToDo: preallocate this.capacity
  this.length     = 0
  this.getPromise = null // "in"  promise, ready when ready to .get()
  this.putPromise = null // "out" promise, ready when ready to .put()
  this.closed     = false
}
var ProtoMessageQueue = MessageQueue.prototype

l8.proto.queue = function task_queue( capacity ){
  return new MessageQueue( capacity)
}

ProtoMessageQueue.__defineGetter__( "promise", function(){
  return this.in
})

ProtoMessageQueue.then = function message_queue_then( callback, errback ){
  return this.in.then( callback, errback)
}

ProtoMessageQueue.put = function message_queue_put( msg ){
  var that = this
  var step
  var task = l8.current;
  if( that.closed )return task.break
  if( arguments.length > 1 ){
    msg = arguments
  }
  if( this.full ){
    task.pause()
    step = task.pausedStep
    this.out.then( function(){
      task.queue.push( msg)
      if( task.pausedStep === step ){
        task.stepResult = msg
        task.resume()
      }
      that.putPromise = null
      that.in.resolve()
      ++that.length
      if( !that.full ){
        that.out.resolve()
      }
    })
  }else{
    this.queue.push( msg)
    this.length++
    this.in.resolve()
  }
}

ProtoMessageQueue.try_put = function( msg ){
  if( this.closed
  ||  this.full
  )return false
  this.queue.push( arguments.length > 1 ? arguments : msg)
  this.length++
  this.in.resolve()
  return true
}

ProtoMessageQueue.signal = ProtoMessageQueue.try_put

ProtoMessageQueue.get = function message_queue_get(){
  var that = this
  var step
  var task = l8.current
  if( that.closed )return task.break
  var get = function(){
    l8.de&&mand( that.getPromise )
    that.getPromise = null
    task.stepResult = that.queue.shift()
    that.length--
    if( !that.empty ){
      that.in.resolve()
    }
    return that
  }
  if( !this.empty )return get()
  var consume = function(){
    if( task.pausedStep !== step )return
    if( that.closed )return task.break
    if( that.empty ){
      that.in.then( consume)
      return
    }
    get()
    task.resume()
  }
  task.pause()
  step = task.pausedStep
  this.in.then( consume)
  return that
}

ProtoMessageQueue.try_get = function(){
  if( this.closed
  ||  this.empty
  )return [false]
  var msg = this.queue.shift()
  --this.length
  if( !this.empty ){
    this.in.resolve()
  }
  return [true, msg]
}

ProtoMessageQueue.__defineGetter__( "in", function(){
  var promise = this.getPromise
  if( promise )return promise
  this.getPromise = promise = l8.promise()
  if( !this.empty ){
    promise.resolve()
  }
  return promise
})

ProtoMessageQueue.__defineGetter__( "out", function(){
  var promise = this.putPromise
  if( promise )return promise
  this.putPromise = promise = l8.promise()
  if( !this.full ){
    promise.resolve()
  }
  return promise
})

ProtoMessageQueue.__defineGetter__( "empty", function(){
  return this.length === 0 || this.closed
})

ProtoMessageQueue.__defineGetter__( "full", function(){
  return this.length >= this.capacity && !this.closed
})

ProtoMessageQueue.close = function(){
  if( this.closed )return this
  this.closed = true
  if( this.getPromise ){
    this.getPromise.resolve()
  }
  if( this.putPromise ){
    this.putPromise.resolve()
  }
  return true
}


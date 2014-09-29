//  generator.js
//    next()/yield() protocol
//
// 13/04/08, JHR, extracted from l8.js
//
"use strict";

// This file adds methods to the l8 global object
var l8 = require( "l8/lib/l8.js" )
module.exports = l8

function Generator(){
  this.task       = null // generator task, the one that yields
  this.getPromise = null // ready when ready to .next()
  this.getMessage = null
  this.putPromise = null //  ready when ready to .yield()
  this.putMessage = null
  this.closed     = false
  return this
}

var ProtoGenerator = Generator.prototype

l8.proto.generate = function(){
// Make a new generator.
  return new Generator()
}

l8.proto.Generator = function( block ){
// Return a "Generator Constructor".
// This function behaves much like l8.Task() does but the returned
// value is a Generator Task, not just a regular Task. I.e. it can "yield".
  return function(){
    var args = arguments
    var parent = l8.current
    var gen = l8.generate()
    var task = l8._spawn( function(){
      block.apply( task, args)
    })
    gen.task = task
    var closer = function(){
      if( task.optional.generator ){
        gen.close()
        task.optional.generator = null
      }
      if( parent.optional.generator ){
        gen.close()
        parent.optional.generator = null
      }
    }
    task.then(   closer, closer)
    parent.then( closer, closer)
    parent.optional.generator = task.optional.generator = gen
    return task
  }
}

l8.proto.yield = function( val ){
// Yield a new result for the active generator's consumer.
// See also Generator.yield() when in need of nested generator.
// See also l8.next() about how to receive results.
  var task = l8.current
  var gen
  var gen_task = task
  while( gen_task ){
    gen = gen_task.optional.generator
    if( gen ){
      gen.yield( val)
      return task
    }
    gen_task = gen_task.parentTask
  }
  task.raise( new Error( "Cannot yield(), not a l8 generator"))
  return task
}

l8.proto.next = function( val ){
// l8.next()
// Consume another result from the active peer generator.
// See also Generator.next() when in need of nested generators.
  var task = l8.current
  var gen
  var gen_task = task
  while( gen_task ){
    gen = gen_task.optional.generator
    if( gen ){
      gen.next( val)
      return task
    }
    gen_task = gen_task.parentTask
  }
  task.raise( new Error( "Cannot generate(), not a l8 generator"))
  return task
}

ProtoGenerator.__defineGetter__( "promise", function(){
// The "can next()" promise of a generator.
// The default promise of a generator is the promise resolved when the consumer
// can get a new result without blocking.
// See also Generator.set about the promise resolved when the generator can
// yield a new result without being blocked.
  return this.get
})

ProtoGenerator.then = function( callback, errback ){
// A generator is also a promise, resolved when the generator yields a result.
// After the generator yields a result and resolve its promise, a new promise
// becomes pending.
  return this.get.then( callback, errback)
}

ProtoGenerator.next = function( msg ){
// Block task until generator yields a result.
// Optional parameter is sent to the generator. It gets it as the result of
// the step that called .yield().
  var that = this
  var task = l8.current
  var step = task.currentStep
  // Pause until producer yields
  task.pause()
  this.get.then( function( get_msg ){
    that.getPromise = null
    that.put.resolve( that.putMessage = msg )
    if( task.pausedStep === step ){
      if( that.closed ){
        // return task.break
        task.stepError = l8.breakEvent
      }else{
        task.stepResult = get_msg
      }
      task.resume()
    }
  })
  return this
}

ProtoGenerator.try_next = function( msg ){
// Like .next() but never blocks
  if( this.closed )return [false]
  if( !this.getPromise.wasResolved )return [false]
  this.getPromise = null
  this.put.resolve( this.putMessage = msg)
  return [true, this.getMessage]
}

ProtoGenerator.yield = function( msg ){
// Task produce a new result and wait for consumer.
// The value returned is what the consumer specified when it called .next(),
// or the undefined value if it specified nothing.
  var that = this
  this.task = task
  this.get.resolve( this.getMessage = msg)
  var task = l8.current
  var step = task.currentStep
  // Pause until consumer calls .next()
  task.pause()
  this.put.then( function( put_msg ){
    that.putPromise = null
    if( task.pausedStep === step ){
      if( that.closed ){
        // return task.break
        task.stepError = l8.breakEvent
      }else{
        task.stepResult = put_msg
      }
      task.resume()
    }
  })
  return this
}

ProtoGenerator.try_yield = function( msg ){
// Like .yield() but never blocks.
// Returns [false] or [true,message]
  if( this.closed )return [false]
  if( !this.putPromise.wasResolved )return [false]
  this.putPromise = null
  this.get.resolve( this.getMessage = msg)
  return [true, this.putMessage]
}

// Alias for l8.try_yield()
ProtoGenerator.signal = ProtoGenerator.try_yield

ProtoGenerator.close = function generator_close(){
  if( this.closed )return this
  this.closed = true
  if( this.getPromise ){
    this.getPromise.resolve( l8.closeEvent )
  }
  if( this.putPromise ){
    this.putPromise.resolve( l8.closeEvent )
  }
  return this
}

ProtoGenerator.__defineGetter__( "get", function(){
  var promise = this.getPromise
  if( !promise ){
    promise = this.getPromise = l8.promise()
    if( this.closed ){
      promise.resolve( l8.closeEvent )
    }
  }
  return promise
})

ProtoGenerator.__defineGetter__( "put", function(){
  var promise = this.putPromise
  if( !promise ){
    promise = this.putPromise = l8.promise()
    if( this.closed ){
      promise.resolve( l8.closeEvent )
    }
  }
  return promise
})



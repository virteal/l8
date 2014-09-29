//  timeout.js
//    A promise resolved within some delay.
//
// 13/04/08, JHR, extracted from l8.js
//
"use strict";

// This file adds methods to the l8 global object
var l8 = require( "l8/lib/l8.js" )
module.exports = l8;

function Timeout( delay ){
  var promise = this.timedPromise = l8.promise()
  var that = this
  this.id = setTimeout( function(){ that.signal() }, delay )
  this.timeStarted  = l8.now
  this.timeSignaled = null
  return this
}
var ProtoTimeout = Timeout.prototype

l8.proto.timeout = function( delay ){
// Make a new timeout that will bomb after a delay.
  return new Timeout( delay )
}

ProtoTimeout.__defineGetter__( "promise", function(){
// Return the promise that is resolved when the timeout fires.
  return this.timedPromise
})

ProtoTimeout.then = function( callback, errback ){
// Timeouts are promises resolved within a fixed delay.
// It is possible to fire them early, using to.signal().
  return this.timedPromise.then( callback, errback)
}

ProtoTimeout.signal = function( value ){
// Fire timeout early.
// Resolves the promise of the timeout early.
  if( this.id ){
    clearTimeout( this.id )
    this.id = null
    this.timeSignaled = l8.now
    this.timedPromise.resolve( value )
  }
  return this
}

ProtoTimeout.__defineGetter__( "duration", function(){
// How long since timeout was created or until it fired.
  return this.timeSignaled
  ? this.timeSignaled - this.timeStarted
  : l8.now            - this.timeStarted
})

ProtoTimeout.__defineGetter__( "signaled", function(){
// Time when timeout was fired, or null
  return this.timeSignaled
})

ProtoTimeout.__defineGetter__( "started", function(){
// Time when the timeout was created. ie: l8.now at that time.
  return this.timeStarted
})



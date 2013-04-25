//  call.js
//    Callback objects that trigger a promise
//
// 13/04/08, JHR, extracted from l8.js
//
"use strict";

// This file adds methods to the l8 global object
var l8 = require( "l8/lib/l8.js" )
exports.l8 = l8

function Call( cb, that ){
  this.callPromise = null
  this.that        = that
  this.cb          = cb
}
var ProtoCall = Call.prototype

ProtoCall.call = function(){
// Call a call, also resolve/reject its promise.
  var that   = this
  var target = this.that || this
  var rslt
  if( this.callPromise ){
    try{
      rslt = that.cb.apply( target, arguments )
      this.callPromise.resolve( rslt )
      return rslt
    }catch( e ){
      this.callPromise.reject( e )
      throw e
    }
  }else{
    return that.cb.apply( target, arguments )
  }
}

ProtoCall.apply = function( args ){
// Call a call, also resolve/reject its promise
  if( !arguments.length ){
    args = []
  }else if( arguments.length === 1 && typeof args !== "array" ){
    args = [ args ]
  }
  return this.call.appy( this, args )
}

// Alias for .apply()
// When a call object is signaled, the call's function is called.
ProtoCall.signal = ProtoCall.apply

ProtoCall.__defineGetter__( "promise", function(){
// Call can have a promise attached to them.
  if( this.callPromise ) return this.callPromise
  return this.callPromise = l8.promise()
})

ProtoCall.then = function( ok, ko ){
// Calls are promises resolved/rejected when the call is called.
// If the calls raises an exception, the promise is rejected. Or else, the
// the promise is resolved using the result of the call.
  return this.promise.then( ok, ko )
}

l8.proto.call = function( fn, that ){
// l8#call()
// Create a function whose result will resolve a promise.
//
// The first parameter is a function. The second parameter is what "this" will
// be bound to when that function is called/signaled, it is optional.
//
// The returned function is also a promise, ie it implements .then().
// The promise is resolved/rejected when the function is called, using its
// result.
//
// Note: this promise resolution is invisible to the entity that calls the
// function, the result xor exception are returned as if the function was a
// regular function, called synchronously (the promise callbacks are called
// later, async).
//
// Usage:
//   var f = l8.call( function( msg ){ return this.handle( msg ) }, handler )
//   f.then( function( r ){ console.log( r,  "world!" ); } )
//   ...
//   console.log( f( "Hello" ) );
//
// Usage:
//   l8.step( function(){
//     var read
//     fs.readFile( "xx", "utf8", read = l8.call( function( err, rslt ){
//       if( err ) throw err;
//       return rslt
//     }
//     return read
//   }).step( function( r ){ console.log( "content of xx: " + r ); })
//
// When the pending call is eventually called, the promise attached to it is
// resolved/rejected, depending on the outcome of the call.
  var call = new Call( fn, that )
  var fn2 = function(){
    return fn.apply( arguments )
  }
  fn2.__proto__ = call
  return fn2
}



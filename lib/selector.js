//  selector.js
//    A promise resolved when one of many promises resolves.
//
// 13/04/08, JHR, extracted from l8.js
//
"use strict";

// This file adds methods to the l8 global object
var l8 = require( "l8/lib/l8.js" )
exports.l8 = l8

function Selector( list, is_or ){
  this.allPromises = list
  this.firePromise = null
  this.result      = null
  this.isOr        = is_or // "Or" selectors ignore false results
}
var ProtoSelector = Selector.prototype

l8.proto.selector = function( ll ){
// L8#selector()
// Make a selector promise, resolved when one of many promises resolves.
  var list = (arguments.length === 1 && (ll instanceof Array)) ? ll : arguments
  return new Selector( list)
}

// l8.any()
// Alias for l8.selector()
// See also l8.or()
l8.proto.any = l8.proto.selector

l8.proto.or = function( ll ){
// L8#or()
// Make a promise resolved when one of many promises resolves with thruth. If
// one of the sub promises is rejected, the whole promise is rejected.
// See also l8.any()
  var list = (arguments.length === 1 && (ll instanceof Array)) ? ll : arguments
  return new Selector( list, true)
}

l8.proto.select = function(){
// l8#select()
// Block task until one of many promises delivers.
//
// Usage:
//   l8.step( function(){
//     var timeout = l8.timeout( 1000 );
//     var read
//     fs.readFile( "xx", "utf8", read = l8.call( function( err, rslt ){
//       return [err,rslt]
//     });
//     l8.select( read, timeout )
//   }).step( function( err, rslt ){ if( err ){ ... }else{ ...use rslt... } )}
//
  var selector = new Selector( arguments)
  return this.wait( selector )
}

ProtoSelector.__defineGetter__( "promise", function(){
// A selector has a promise attached to itself.
  var promise = this.firePromise
  if( promise )return promise
  var that = this
  var list = this.allPromises
  this.firePromise = promise = l8.promise()
  var len = list.length
  if( !len ){
    promise.resolve( null)
    return promise
  }
  var count = 0
  function ok( r ){
    if( !that.result ){
      try{
        while( r instanceof Function ){
          r = r.call( l8)
        }
      }catch( e ){
        return ko( e)
      }
      if( r.then ){
        r.then( ok, ko)
      }else{
        count++
        if( r || !that.isOr || count === len ){
          that.result = that.isOr ? r : [null,r]
          promise.resolve( that.result)
        }
      }
    }
  }
  function ko( e ){
    count++
    if( !that.result ){
      that.result = [e,null]
      promise.resolve( that.result)
    }
  }
  var item
  var buf = []
  for( var ii = 0 ; ii < len ; ii++ ){
    item = list[ii]
    while( item instanceof Function ){
      item = item.call( l8)
    }
    if( item.then ){
      buf.push( item)
    }else{
      ok( item)
      return promise
    }
  }
  if( len = buf.length ){
    for( ii = 0 ; ii < len ; ii++ ){
      item = buf[ii]
      item.then( ok, ko)
    }
  }
  return promise
})

ProtoSelector.then = function( callback, errback ){
// A selector is also a promise.
  return this.firePromise.then( callback, errback)
}


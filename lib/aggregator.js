//  aggregator.js
//    A promise resolved when many promises get resolved.
//
// 13/04/08, JHR, extracted from l8.js
//
"use strict";

// This file adds methods to the l8 global object
var l8 = require( "l8/lib/l8.js" )
module.exports = l8;

function Aggregator( list, is_and ){
  this.allPromises = list
  this.results     = []
  this.result      = list.length
  this.firePromise = null
  this.isAnd       = is_and
}
var ProtoAggregator = Aggregator.prototype

l8.proto.aggregator = l8.proto.all = function( ll ){
// Make a promise that collects the outcome of sub promises.
// The promise is never rejected. Instead, its value is an array of "results"
// where each result is [err,rslt] for the corresponding promise.
  var list = (arguments.length === 1 && (ll instanceof Array)) ? ll : arguments
  return new Aggregator( list)
}

l8.proto.and = function( ll ){
// l8.and()
// Make a promise that depends on sub promises.
  var list = (arguments.length === 1 && (ll instanceof Array)) ? ll : arguments
  return new Aggregator( list, true)
}

ProtoAggregator.__defineGetter__( "promise", function(){
  var promise = this.firePromise
  if( promise )return promise
  var that = this
  var list = this.allPromises
  this.firePromise = promise = l8.promise()
  var results = this.results
  var len = list.length
  if( !len ){
    promise.resolve( results)
    return promise
  }
  // ToDo: should respect order, need an index
  function ok( r ){
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
      results.push( [null,r])
      if( that.result ){ that.result = r }
      if( results.length === list.length ){
        promise.resolve( that.isAnd ? that.result : results)
      }
    }
  }
  function ko( e ){
    results.push( [e,null])
    if( results.length === list.length ){
      promise.resolve( that.isAnd ? false : results)
    }
  }
  var item
  for( var ii = 0 ; ii < len ; ii++ ){
    item = list[ii]
    while( item instanceof Function ){
      item = item.call( l8)
    }
    if( item.then ){
      item.then( ok, ko)
    }else{
      ok( item)
    }
  }
  return promise
})

ProtoAggregator.then = function( callback, errback ){
// An aggregator is a promise too.
  return this.promise.then( callback, errback)
}

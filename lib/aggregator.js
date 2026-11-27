//  aggregator.js
//    A promise resolved when many promises get resolved.
//
// 13/04/08, JHR, extracted from l8.js
//
"use strict";

// This file adds methods to the l8 global object
var l8 = require( "l8/lib/l8.js" )
module.exports = l8;
var settle_input = require( "./settle-input" );

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
  // Keep source order, independent of completion order. Explicit failure
  // bits preserve false/undefined rejection reasons for the and reduction.
  var failed = [], remaining = len;
  function record( index, error, value, rejected ){
    results[index] = [error, value];
    failed[index] = rejected;
    if( --remaining )return;
    if( !that.isAnd ){ promise.resolve( results ); return; }
    var result = results[len - 1][1];
    var rejected = false;
    for( var i = 0; i < len; i++ ){
      if( failed[i] ){ rejected = true; break; }
    }
    if( rejected ){ result = false; }else{
      for( var i = 0; i < len; i++ ){
        if( !results[i][1] ){ result = results[i][1]; break; }
      }
    }
    that.result = result;
    promise.resolve( result );
  }
  for( var ii = 0; ii < len; ii++ ){
    (function( index ){
      settle_input( l8, list[index],
        function( value ){ record( index, null, value, false ); },
        function( error ){ record( index, error, null, true ); });
    })( ii );
  }
  return promise
})

ProtoAggregator.then = function( callback, errback ){
// An aggregator is a promise too.
  return this.promise.then( callback, errback)
}

//  lib/parole.js
//    l8 integrated Parole objects as defined in whisper.js
//
// 13/04/24, JHR
//
"use strict";

// This file adds methods to the l8 global object
var l8 = require( "l8/lib/l8" );
exports.l8 = l8;

var Parole = require( "l8/lib/whisper" );

Parole.scheduler( l8.tick );

l8.proto.parole = function(){
  var p = Parole.apply( null, arguments );
  p.promise = p;
  return p;
}

Parole.proto.signal = function( v ){ return this._fulfill( null, v ); };

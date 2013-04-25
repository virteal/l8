//  lib/parole.js
//    l8 integrated Parole objects as defined in whisper.js
//
// 13/04/24, JHR
//
"use strict";

// This file adds methods to the l8 global object
var l8 = require( "l8/lib/l8.js" );
exports.l8 = l8;

var Parole = require( "l8/lib/whisper.js" );

Parole.Parole.sync( l8.tick );

l8.proto.parole = Parole.parole;

Parole.signal = function( v ){ return this.fulfill( null, v ); };

// ToDo: should return a fully compliant Promise/A promise
Parole.__defineGetter__( "promise", function(){ return this; } );


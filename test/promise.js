// promise.js
//   adapter for promises-aplus/promises-tests
// See https://github.com/promises-aplus/promises-tests

var Parole = require( "l8/lib/whisper" );

module.exports.pending = function(){
  var p = Parole();
  return {
    promise: p,
    fulfill: function( v ){ return p.resolve( v ); },
    reject:  function( r ){ return p.reject(  r ); }
  };
};

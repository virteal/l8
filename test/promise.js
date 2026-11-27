// promise.js
//   adapter for promises-aplus/promises-tests
// See https://github.com/promises-aplus/promises-tests

var Parole = require( "l8/lib/whisper" );

module.exports.deferred = function(){
  var p = Parole();
  return {
    promise: p,
    resolve: function( v ){ return p.resolve( v ); },
    reject:  function( r ){ return p.reject(  r ); }
  };
};

// If debugging
if( 0 ){
  var promisesAplusTests = require("promises-aplus-tests");
  promisesAplusTests(
    module.exports,
    // Please change the grep expression to match the target test to debug
    { reporter: "spec", grep: "" },
    function (err) {}
  );
}

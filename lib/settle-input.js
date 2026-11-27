// 2026-11-27 — GPT-6.2 under JHR, Inox #42.
// Resolve a combinator input, including thunks and foreign thenables.
// Each thenable has its own once gate; recursive adoption retains the path.
"use strict";
module.exports = function settle_input( l8, input, ok, ko, skip_thunks ){
  var seen = [];
  function adopt( value ){
    try{
      // Read then once, before treating a callable value as a thunk.
      var then = value == null ? null : value.then;
      if( skip_thunks && typeof value === "function" && typeof then !== "function" )return;
      if( typeof then === "function" || typeof value === "function" ){
        if( seen.indexOf( value ) !== -1 )return ko( new TypeError("cyclic combinator input") );
        seen.push( value );
        if( typeof then === "function" ){
          var called = false;
          try{
            then.call( value, function( result ){
              if( called )return; called = true; adopt( result );
            }, function( error ){
              if( called )return; called = true; ko( error );
            });
          }catch( error ){
            if( !called ){ called = true; ko( error ); }
          }
          return;
        }
        return adopt( value.call( l8 ) );
      }
    }catch( error ){ return ko( error ); }
    ok( value );
  }
  adopt( input );
};

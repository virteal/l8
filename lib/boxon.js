// boxon.js
//   Boxons are 100 loc thenable indirect callbacks
//
// (C) 2014, Jean Hugues Robert -- github.com/JeanHuguesRobert -- @jhr
// MIT License
//
// Please look for test suite in test/boxon.js

"use strict";

(function scope(){
  
  var noop = function(){};
  var slice = [].slice;
  var schedule; // a setImmediate() style function, setTimeout() is ok too
  var factory;  // An ECMAScript 6 compatible Promise factory or null

  // Boxon factory, create an instance
  var boxon = function(){
    
    // Instance data members, captured by closure
    var box, on, ok, ko, ctx, outcome, promise;
    
    // Create the instance, it is a Function
    box = function( f, f2 ){
      // When called to track a thenable, ie box( a_thenable )
      var then;
      if( f
      && (typeof f === "object" || typeof f === "function" )
      && typeof (then = f.then) === "function"
      ){
        if( f === box )return box;
        then.call( f, 
          function( ok ){ box( null, ok ) },
          function( ko ){ box( ko )       }
        );
      // When called with some callbacks, ie box( fn [, fn2] )
      }else if( typeof f === "function" ){
        // When about thenable callbacks, ie box( f1, f2 )
        if( typeof f2 === "function" ){
          // Only one pending .then() call is valid (true promises accept more)
          if( ok )throw new Error( "busy boxon" );
          // No result yet? remember what to do later when result is delivered
          if( !outcome ){
            ok = f || noop;
            ko = f2;
          // Valid result? schedule delayed call to proper callback
          }else if( !outcome[0] ){
            // If multiple results, collapse them into an array
            f && schedule( f.bind(  null, 
              outcome.length <= 2 ? outcome[1] : slice.call( outcome, 1 )
            ), 0 );
          // Error?
          }else{
            f2 && schedule( f2.bind( null, outcome[0] ), 0 );
          }
          // Help avoid confusion with true compliant promises
          return "Boxon is not a chainable promise";
        // When about the sync callback, ie box( fn [, ctx] )
        }else if( outcome ){
          f.apply( f2 || box, outcome );
        // When about callback to call when boxon gets delivered
        }else{
          // Either remember or signal {boxon:xx,on:ff,context:yy} event
          if( on ){
            on.call( ctx, { boxon: box, on: f, context: f2 || box } );
          }else{
            on  = f;
            ctx = f2 || box;
          }
        }
      // When called to set outcome, ie box( err, ...result )
      }else if( !outcome ){
        outcome = arguments;
        // Call callbacks that were installed before outcome was delivered
        if( ok ){
          f  = ok;
          f2 = ko;
          ok = null;
          box( f, f2 );
        }
        if( on ){ on.apply( ctx, outcome ); }
        if( !arguments.length )return;
      // When called to get memorized outcome, ie box()
      }else if( !arguments.length ){
        if( outcome[0] )throw outcome[0];
        if( outcome.length <= 2 )return outcome[1];
        return slice.call( outcome, 1 );
      // When called set outcome again, ignore
      }else{}
      return box;
    };
    
    // Make instance thenable, ok for Promise.cast() typically
    box.then = function( f1, f2 ){
      return factory
      ? ( promise || (promise = factory.cast( this )) ).then( f1, f2 )
      : this( f1 || noop, f2 || noop );
    };
    
    // Duck typing/boxon detection: x && typeof x.boxon === "function"
    box.boxon = box;
    
    arguments.length && box.apply( null, arguments );
    return box;
  };
  
  // Use setImmediate() if available, fallback to setTimeout()
  boxon.scheduler = fsch;
  function fsch( t ){ return arguments.length ? (schedule = t) : schedule }
  fsch( (typeof setImmediate !== "undefined" && setImmediate) || setTimeout );
  
  // Use an ECMAScript 6 compatible Promise factory when available or provided
  boxon.factory = ffactory;
  function ffactory( f ){ return arguments.length ? (factory = f) : factory }
  ffactory( (typeof Promise !== "undefined" && Promise ) || null );

  // Isolation, when multiple scopes are required
  boxon.scope = function(){ return scope.bind( null ) };
  
  // Export global Boxon, platform dependant
  typeof module !== "undefined" && "exports" in module && (module.exports = boxon);
  typeof global !== "undefined" && (global.Boxon = boxon);
  typeof window !== "undefined" && (window.Boxon = boxon);

  // Smoke test
  0 && boxon( function( _, m ){
    console.log( "sync: " + m );
    })( null, "Hello Boxon" )
    .then( function( m ){
      console.log( "async: " + m );
    });
    
})();



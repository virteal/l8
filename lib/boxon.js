// boxon.js
//   Boxons are promise friendly functional callbacks
//
// (C) 2014, Jean Hugues Robert -- github.com/JeanHuguesRobert -- @jhr
// MIT License
//
// Please look for test suite in test/boxon.js

"use strict";

(function scope( scoped, opt_factory ){
  
  var noop = function(){};
  var slice = [].slice;
  var factory = opt_factory;
  var duck = true;

  // Internal observers do not consume the public single-callback slot.
  // Keep the capability private to this scope and retain foreign duck typing.
  var observations = new WeakMap();
  function observe( box, callback ){
    var subscribe = observations.get( box );
    if( subscribe ){ subscribe( callback ); }
    else{ box.boxon( callback ); }
  }

  function try_thunk( box, f ){ try{ f( box ); }catch( err ){ box( err ); } }
  function cast(){ return boxon.apply( cast, arguments ); }
  
  function invoke( box, f, ctx, outcome ){
    // FBF 2026-11-26 (#42): restore dynamically nested callback context.
    var previous = boxon.current;
    boxon.current = box;
    try{ f.apply( ctx, outcome ); }
    finally{ boxon.current = previous || null; }
  }
  
  // Boxon factory, create an instance
  var boxon = function(){
    
    // Instance data members, captured by closure
    var box, on, ctx, outcome, promise, resolver, rejector, observers = [];
    
    // Create the instance, it is a Function
    box = function( f, f2 ){
      var called, tmp;
      // When cast() to track another boxon
      if( this === cast && f && typeof f.boxon === "function" ){
        if( f === box )return box;
        observe( f, function(){
          if( called )return;
          called = true;
          box.apply( box, arguments );
        });
      // When cast() to track a thenable, ie a_boxon( a_thenable )
      }else if( this === cast && f
      && (typeof f === "object" || typeof f === "function" )
      && typeof (tmp = f.then) === "function"
      ){
        if( f === box )return box;
        tmp.call( f, 
          function( ok ){ box( null, ok ) },
          function( ko ){ box( ko )       }
        );
      // When called with some callbacks, ie a_boxon( fn [, ...] )
      }else if( typeof f === "function" ){
        // When about a "thunk", via boxon.co()
        if( this === cast && f2 === try_thunk ){
          try_thunk( box, f );
        // When cast() about a function call
        }else if( this === cast ){
          tmp = slice.call( arguments, 1 );
          tmp.push( box );
          f.apply( null,  tmp );
        // When about the sync callback, ie a_boxon( fn [, ctx] )
        }else if( outcome ){
          invoke( box, f, arguments.length > 1 ? f2 : box, outcome );
        // When about callback to call when boxon gets delivered
        }else{
          // Either remember or signal {Boxon:xx,on:ff,context:yy} event
          tmp = arguments.length > 1 ? f2 : box;
          if( on ){
            on.call( ctx, { Boxon: box, on: f, context: tmp } );
          }else{
            on  = f;
            ctx = tmp;
          }
        }
      // When called about an async call, ie a_bxn( target, fn [, ...params] )
      }else if( (f || this === cast ) && typeof f2 === "function" ){
        tmp = slice.call( arguments, 2 );
        tmp.push( box );
        // ToDo: is it ok to call f2 even after outcome was delivered?
        f2.apply( f,  tmp );
      // When called to set outcome, ie a_boxon( err, ...result )
      }else if( !outcome ){
        outcome = arguments;
        // Call callbacks that were installed before outcome was delivered
        if( promise ){
          if( outcome[0] ){
            rejector( outcome[0] );
          }else{
            resolver( outcome.length > 2
              ? slice.call( outcome, 1 )
              : outcome[1]
            );
          }
        }
        // Snapshot and detach before invoking user code; one failing
        // observer must not prevent delivery to the other consumers.
        var pending = observers;
        observers = [];
        var failure, failed = false;
        for( var i = 0 ; i < pending.length ; i++ ){
          try{ invoke( box, pending[i], box, outcome ); }
          catch( e ){ if( !failed ){ failure = e; failed = true; } }
        }
        try{ if( on ){ invoke( box, on, ctx, outcome ); } }
        catch( e ){ if( !failed ){ failure = e; failed = true; } }
        if( failed )throw failure;
        // Handle premature a_boxon() access to outcome, returns undefined
        if( !arguments.length )return;
      // When called to get memorized outcome, ie a_boxon()
      }else if( !arguments.length ){
        if( outcome[0] )throw outcome[0];
        if( outcome.length <= 2 )return outcome[1];
        return slice.call( outcome, 1 );
      // When called set outcome again, ignore
      }else{}
      return box;
    };
    
    observations.set( box, function( callback ){
      if( outcome ){ invoke( box, callback, box, outcome ); }
      else{ observers.push( callback ); }
    });

    // Make instance thenable, needs an ECMAScript 6 Promise compatible factory
    if( factory ){
      box.then = function( f1, f2 ){
        return (promise || (promise = factory( function( rslv, rjct ){
          resolver = rslv;
          rejector = rjct;
          if( !outcome )return;
          if( outcome[0] ){
            rejector( outcome[0] );
          }else{
            resolver( outcome.length > 2
              ? slice.call( outcome, 1 )
              : outcome[1]
            );
          }
        }) )).then( f1, f2 );
      };
      box.catch = function( f ){ return this.then( null, f ); };
    }
    
    // Duck typing/boxon detection: x && typeof x.boxon === "function"
    if( duck ){ box.boxon = box; }
    
    // Init instance using parameters if any. note: this === cast in some cases
    arguments.length && box.apply( this, arguments );
    return box;
  };
  
  // Moxons are boxons with multiple callbacks
  var moxon = boxon.Moxon = function(){
    var queue = [];
    var box = boxon( function( err ){
      if( err && err.Boxon ){
        queue.push( err );
        return;
      }
      for( var cb, ii = 0 ; cb = queue[ ii++ ] ; ){
        cb.on.apply( cb.context, arguments );
      }
    });
    arguments.length && box.apply( null, arguments );
    return box;
  };
  
  boxon.all = moxon.all = function( a ){
    var box = boxon();
    var result = [];
    var len = a.length;
    if( !len )return box( null, result );
    var ii = 0;
    var countdown = len;
    var b;
    while( ii < len ){
      b = a[ ii ];
      if( !b || typeof b.boxon !== "function" ){
        if( b && typeof b.then === "function" ){
          b = cast( b );
        }else{
          b = boxon()( null, b );
        }
      }
      result[ ii++ ] = b;
      observe( b, function(){ if( !--countdown ){ box( null, result ); } } );
    }
    return box;
  };
  
  boxon.race = moxon.race = function( a ){
    var win = boxon();
    var done;
    var b;
    var ii = 0;
    var len = a.length;
    while( ii < len ){
      b = a[ ii++ ];
      if( !b || typeof b.boxon !== "function" ){
        if( b && typeof b.then === "function" ){
          b = cast( b );
        }else{
          b = boxon()( null, b );
        }
      }
      observe( b, function(){
        done = true;
        win( null, this );
      });
      if( done )break;
    }
    return win;
  };
  
  // Interop with other implementations
  boxon.cast = moxon.cast = cast;
  
  // Interop with "thunks"
  boxon.co = moxon.co = function( f ){ return cast( f, try_thunk ); };
  
  // Switch to "fast" plain mode, ie create boxon without .boxon property
  boxon.plain = moxon.plain = function(){ duck = false; };
  
  // Interop with promises
  boxon.promise = moxon.promise = function( f ){
    if( !arguments.length )return factory;
    factory = f;
    return boxon;
  };
  boxon.scope = moxon.scope = function( factory ){
    return scope( true, factory );
  };
  
  // Export global Boxon, platform dependant
  if( !scoped ){
    typeof module !== "undefined" && "exports" in module && (module.exports = boxon);
    typeof global !== "undefined" && (global.Boxon = boxon);
    typeof window !== "undefined" && (window.Boxon = boxon);
  }

  // Smoke test
  0 && moxon( function( _, m ){ console.log( "sync: " + m ); } )( null, "Hello Boxon" );
  
  return boxon;
    
})();



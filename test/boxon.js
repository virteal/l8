  // test/boxon.js
  //
  // January 2014 by JeanHuguesRobert aka @jhr

  var Promise = require( "l8/lib/whisper.js" ).Promise;
  var Boxon   = require( "l8/lib/boxon.js" ).scope( Promise );
  var assert  = require( "assert" );
  
  describe( "Boxon", function(){
    
    it( "Says Hello", function( done ){
      Boxon( done )();
    });
    
    it( "Smoke test", function( done ){
      Boxon( function( _, m ){
        console.log( "sync: " + m );
        assert( m === "Hello Boxon" );
      })( null, "Hello Boxon" )
      .then( function( m ){
        console.log( "async: " + m );
        assert( m === "Hello Boxon" );
        done();
      });
    });
    
    it( "memorizes outcome", function( done ){
      var b = Boxon();
      b( "Hello Boxon" );
      b( function( m ){
        console.log( "memorized: " + m );
        assert( m == "Hello Boxon" );
        done();
      });
    });
    
    it( "memorizes first outcome only", function( done ){
      var b = Boxon();
      b( "Hello Boxon" );
      b( "This should be ignored" );
      b( function( m ){
        console.log( "memorized: " + m );
        assert( m == "Hello Boxon" );
        done();
      });
    });
    
    it( "can set 'this'", function( done ){
      var b = Boxon();
      b( "Hello Boxon" );
      var ctx = {ok:true};
      b( function( m ) {
        console.log( "context: ", this, ", memorized: " + m );
        assert( this === ctx );
        assert( m == "Hello Boxon" );
        done();
      }, ctx );
    });
    
    it( "provides outcome", function( done ){
      var b = Boxon( null, "Hello Boxon" );
      console.log( "outcome: " + b() );
      assert( b() == "Hello Boxon" );
      done();
    });
    
    it( "provides multiple results outcome", function( done ){
      var b = Boxon();
      b( null, 1, 2, 3 );
      console.log( "results:", b() );
      var r = b();
      assert( r[0] === 1 );
      assert( r[1] === 2 );
      assert( r[2] === 3 );
      done();
    });
    
    it( "provides error outcome", function( done ){
      var b = Boxon( "Hello Boxon" );
      try{
        console.log( "invalid: " + b() );
        done( "Should have thrown something" );
      }catch( err ){
        console.log( "thrown: " + err );
        assert( err == "Hello Boxon" );
        done();
      }
    });
    
    it( "is idempotent", function( done ){
      var b = Boxon();
      var v1 = b();
      b( "Ignored" );
      var v2 = b();
      console.log( "v1:", v2, "v2:", v2 );
      assert( typeof v1 === "undefined", "undefined" );
      console.log( "properly undefined" );
      assert( v1 === v2, "still undefined" );
      done();
    });
    
    it( "interop with other boxon implementations", function( done ){
      var other = { boxon: function( f  ){
        assert( typeof f === "function", "proper callback" );
        f( "a1", "a2" );
      } };
      var b = Boxon.cast( other );
      b( function( a1, a2 ){
        assert( a1 === "a1", "err handling" );
        assert( a2 === "a2", "result handling" );
        done();
      });
    });
    
    it( "can track another boxon", function( done ){
      var other = Boxon();
      var b = Boxon.cast( other );
      b( function( err, result ){
        assert( typeof err === "undefined", "undefined err" );
        assert( typeof result === "undefined", "undefined result" );
        done();
      } );
      other();
    });
    
    it( "can track a rejected promise", function( done ){
      var p = new Promise( function( ok, ko ){
        ko( "rejected" );
      });
      var b = Boxon.cast( p );
      b( function( err ){
        assert( err === "rejected", "rejection" );
        done();
      });
    });
    
    it( "can track a resolved promise", function( done ){
      var p = new Promise( function( ok, ko ){
        ok( "resolved" );
      });
      var b = Boxon.cast( p );
      b( function( err, result ){
        console.log( err, result );
        assert( !err, "no error" );
        assert( result === "resolved", "resolution" );
        done();
      });
    });
    
    it( "can track a delayed promise rejection", function( done ){
      var p = new Promise( function( ok, ko ){
        setTimeout( function(){ ko( "rejected" ) }, 0 );
      });
      var b = Boxon.cast( p );
      b( function( err ){
        assert( err === "rejected", "rejection" );
        done();
      });
    });
    
    it( "can track a delayed promise resolution", function( done ){
      var p = new Promise( function( ok, ko ){
        setTimeout( function(){ ok( "resolved" ); }, 0 );
      });
      var b = Boxon.cast( p );
      b( function( err, result ){
        console.log( err, result );
        assert( !err, "no error" );
        assert( result === "resolved", "resolution" );
        done();
      });
    });
    
    it( "can track a 'thunk'", function( done ){
      var t = function( cb ){ cb( "called" ); };
      var b = Boxon.co( t );
      b( function( p ){
        assert( p === "called" );
        done();
      });
    });
    
    it( "can track a delayed 'thunk'", function( done ){
      var t = function( cb ){
        setTimeout( function(){ cb( "called" ); }, 0 );
      };
      var b = Boxon.co( t );
      b( function( p ){
        assert( p === "called" );
        done();
      });
    });
    
    it( "can track an async call", function( done ){
      var ctx = {
        fn: function( h, cb ){
          console.log( "called" );
          assert( this === ctx, "context" );
          assert( h === "hello", "parameter ");
          assert( typeof cb === "function", "callback" );
          cb( null, h );
        }
      };
      var b = Boxon();
      b( ctx, ctx.fn, "hello" );
      b( function( _, h ){
        console.log( "callback called" );
        assert( h === "hello", "result" );
      });
      b.then( function( p ){
        console.log( "success callback called" );
        assert( p === "hello", "result" );
        done();
      });
    });
    
    it( "is a promise, resolved", function( done ){
      var b = Boxon();
      b.then( function( ok ){
        assert( ok === "resolved", "resolution" );
        done();
      });
      b( null, "resolved" );
    });
    
    it( "is a promise, rejected", function( done ){
      var b = Boxon();
      b.then( null, function( ko ){
        assert( ko === "rejected", "rejection" );
        done();
      });
      b( "rejected" );
    });
    
    it( "handles multiple callback errors", function( done ){
      var b = Boxon();
      var f = function(){};
      b( function( on ){
        console.log( "callback attached" );
        assert( on.Boxon === b );
        assert( on.on === f );
        done();
      });
      b( f );
    });
    
    it( "handles multiple callback with moxons", function( done ){
      var b = Boxon.Moxon();
      var count = 0;
      var f = function( _, msg ){
        assert( msg === "Moxon!" );
        count++;
        console.log( "call", count, msg );
        if( count === 2 )return done();
        assert( count === 1 );
      };
      b( f );
      b( f );
      b( null, "Moxon!" );
    });
    
    // ToDo: more tests
    
  });
  
  
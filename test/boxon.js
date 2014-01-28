  // test/boxon.js
  //
  // January 2014 by JeanHuguesRobert aka @jhr

  var Boxon = require( "l8/lib/boxon.js" );
  var assert = require( "assert" );
  
  // Smoke test
  
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
      assert( typeof v1 === "undefined" );
      console.log( "properly undefined" );
      assert( v1 === v2 );
      done();
    });
    
    // ToDo: more tests
    
  });
  
  
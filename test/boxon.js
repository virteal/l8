  // test/boxon.js
  //
  // January 2014 by JeanHuguesRobert aka @jhr

  var Boxon = require( "l8/lib/boxon.js" );
  
  // Smoke test
  
  describe( "Boxon", function(){
    
    it( "Says Hello", function( done ){
      Boxon().boxon( done )( null, "Hello" );
    });
    
    it( "Smoke test", function( done ){
      Boxon( function( _, m ){
        console.log( "sync: " + m );
      })( null, "Hello Boxon" )
      .then( function( m ){
        console.log( "async: " + m );
        done();
      });
    });
    
  });
  
  
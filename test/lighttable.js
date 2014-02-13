// test/lighttable.js
//   minimal server for LightTable, also a scratch pad for debugging
//
// This file is run in order to set up a "connection" between node.js and
// lighttable. lighttable then  can send code to evaluate on that connection.
//
// Feb 2 2014 by @jhr

setInterval( function(){
  console.log( "It's alive!" );
}, 10 * 1000 );

var Boxon = require( "l8/lib/boxon.js" );

console.log( "Hello world!" );

var b = Boxon();

b( function(){ console.log.apply( console, arguments ) } );
b( "Hello boxon" );

try{
  console.log( b() );
}catch( err ){
  console.log( "Error: ", err );
}

b();

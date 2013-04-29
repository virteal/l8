// test/parole.js
// 13/04/24 by JHR

var P = require( "l8/lib/whisper" ).parole;

console.log( "Starting Parole test" );

var p = P().will( function(){
  console.log( "start" );
  setTimeout( this, 1000 );
}).will( function(){
  console.log( "first next " );
  setTimeout( this, 1000 );
}).will( function(){
  console.log( "second next " );
  this( 0, "hello ", "world!" );
}).will( function( err, hello, world ){
  console.log( "third next: ", err, hello, world );
  setTimeout( this, 1000 );
}).will( function(){
  console.log( "4th next" );
  this.exit();
}).will( function skipped_step(){
  console.log( "!!! skipped step !!!" );
  throw "Parole error";
}).then( function done(){
  console.log( "done" );
  var p = P();
  setTimeout( p, 1000 );
  return p;
}).then( function(){
  console.log( "Very done" );
}, function(){
  console.log( "Unexpected error" );
  process.exit( 1 );
});

p.then( function(){
  console.log( "END" );
}).then( function(){
  throw "ERR1";
}).then().then( null, function( err ){
  console.log( "Expected error: ", err );
  console.assert( err === "ERR1" );
  return "OK";
}).then( function( ok ){
  console.log( "ok: ", ok );
  console.assert( ok === "OK" );
  throw "ERR2";
}).then( null, function( err ){
  console.log( "Expected error 2: ", err );
  console.assert( err === "ERR2" );
  console.log( "TEST SUCCESS" );
  process.exit( 0 );
});

p.then(  function(){
  console.log( "Branch" );
}).then( function(){ console.log( "Branch done" ); } );

p.then(  function(){
  console.log( "Another Branch" );
}).then( function(){ console.log( "Another Branch done" ); } );

var l8 = require( "l8/lib/l8.js" );
l8.countdown( 10 );


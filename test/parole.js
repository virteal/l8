// test/parole.js
// 13/04/24 by JHR

var P = require( "l8/lib/whisper" );

console.log( "Starting Parole test" );

var timeout; setTimeout( timeout = P() );
timeout.on( function(){ console.log( "Queued start" ); } );

var loop_done = false;
var p;
var label1;
var label2;
p = P().will( function(){
  console.log( "Entering outer loop" );
  label1 = this( 3 );
}).will( function( n_out ){
  console.log( "Entering inner loop for outer loop " + n_out );
  label2 = this( n_out, 5 );
}).will( function( n_out, n_in ){
  console.log( "Inner loop " + n_in-- + " inside outer loop " + n_out );
  if( n_in ) return this.jump( label2, n_out, n_in );
  this( n_out );
}).will( function( n_out ){
  if( --n_out ) return this.jump( label1, n_out );
  this.resolve( "done" );
});
p.then( function( r ){ console.log( "Loop " + ( loop_done = r ) ); } );


var p = P().will( function(){
  console.log( "start" );
  setTimeout( this, 1000 );
}).will( function(){
  console.log( "first next " );
  setTimeout( this, 1000 );
}).will( function(){
  console.log( "second next " );
  this( null, "hello", "world!" );
}).will( function( err, hello, world ){
  console.log( "third next: ", err, hello, world );
  this.each( [ "hello", "world!" ] );
}).will( function( err, hello_world ){
  console.log( "4th next: ", err, hello_world[ 0 ], hello_world[ 1 ] );
  console.assert( !err );
  console.assert( hello_world[ 0 ] === "hello" );
  console.assert( hello_world[ 1 ] === "world!" );
  this.collect( "hello", "world!" );
}).wills( function( err, hello, world ){
  console.log( "42th next: ", err, hello, world );
  console.assert( !err );
  console.assert( hello === "hello" );
  console.assert( world === "world!" );
  console.log( "5th next" );
  this.conclude( null, "DONE" );
}).will( function skipped_step( err ){
  console.log( "!!! skipped step !!! ", err );
  throw "Parole error";
}).then( function done( ok ){
  console.log( "done: " + ok );
  console.assert( ok === "DONE" );
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
  console.assert( loop_done === "done" );
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
l8.countdown( 10 )

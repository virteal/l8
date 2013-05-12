// test/parole.js
// 13/04/24 by JHR

var P = require( "l8/lib/whisper" );

function assert( x ){
  try{ console.assert( x ); }
  catch( err ){
    console.log( "TEST FAILED: ", err, err.stack );
    process.exit( 1 );
  }
}

var syncsched = function( f ){
  try{ f(); }catch( er ){}
};

P.scheduler( syncsched );
P.Parole.tick = null;
P.scheduler();

console.log( "Starting Parole test" );

var timeout; setTimeout( timeout = P() );
timeout.on( function(){ console.log( "Queued start" ); } );

var loop_done = false;
var p;
var label1;
var label2;
var p_loop = p = P().will( function(){
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
  this.resolve( "p_loop done" );
});

p.then( function( r ){
  console.log( "Loop " + ( loop_done = r ) );
  assert( r = "p_loop done" );
} );


var p_start = P();
p = p_start.from().will( function( start ){
  console.log( "start: " + start );
  setTimeout( this, 1000 );
}).will( function(){
  console.log( "first next " );
  this.timeout( 1000 );
}).will( function( err ){
  console.log( "second next: " + err );
  assert( err && err.name === "ParoleTimeout" );
  this( null, "hello", "world!" );
}).will( function( err, hello, world ){
  console.log( "third next: ", err, hello, world );
  this.each( [ "hello", "world!" ] );
}).will( function( err, hello_world ){
  console.log( "4th next: ", err, hello_world[ 0 ], hello_world[ 1 ] );
  assert( !err );
  assert( hello_world[ 0 ] === "hello" );
  assert( hello_world[ 1 ] === "world!" );
  this.collect( "hello", "world!" );
}).wills( function( err, hello, world ){
  console.log( "42th next: ", err, hello, world );
  assert( !err );
  assert( hello === "hello" );
  assert( world === "world!" );
  this.curry( null, "hello" )( "world!" );
}).will( function( err, hello, world ){
  console.log( "5th next: ", err, hello, world );
  assert( !err );
  assert( hello === "hello" );
  assert( world === "world!" );
  this.conclude( null, "DONE" );
}).will( function skipped_step( err ){
  console.log( "!!! unexpected skipped step !!! ", err );
  throw "Parole error";
}).then( function done( ok ){
  console.log( "done: " + ok );
  assert( ok === "DONE" );
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
  assert( err === "ERR1" );
  return "OK";
}).then( function( ok ){
  console.log( "ok: ", ok );
  assert( ok === "OK" );
  throw "ERR2";
}).then( null, function( err ){
  console.log( "Expected error 2: ", err );
  assert( err === "ERR2" );
  assert( loop_done === "p_loop done" );
});

var log = P.from().will( function( msg ){
  console.log( msg );
  this( msg );
}).pipe();

p.then(  function(){
  console.log( "Branch" );
}).then( function(){ console.log( "Branch done" ); } );

var p_log = p.then(  function(){
  console.log( "Another Branch" );
  log( "Direct call" );
  return log.from( "From() call" ).upgrade( "Done" );
}).then(
  function( done ){
    console.log( "Another Branch: " + done );
    assert( done === "Done" );
    return "p_log done";
  },
  function( err ){
    console.log( "Another Branch, unexpected err: " + err );
    assert( false );
  }
);

p_start.from( "start" );

var all = [ p_loop, p_start, p_log ];
P.each( P.collect, all ).then(
  function( results ){
    P.schedule( function(){
      console.log( "TEST SUCCESS", results );
      process.exit( 0 );
    });
  },
  function( err ){
    console.log( "Unexpected promise failure: " + err, err.stack );
  }
);


var l8 = require( "l8/lib/l8.js" );
l8.countdown( 10 )

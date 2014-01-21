// test/node.js
//   This is a test for the remote access to node.js API from a node_client.js
//   powered client to a node_server.js powered server.
//
// 2013/02/08 by JHR
//

// Embbed server
var l8 = require( "l8/lib/node_server.js" )
l8.http_port = parseInt( process.env.PORT, 10) || 8080 // 80 requires sudo
l8.node_api_server( l8.http_port, "no credentials" )

// But behave as a client
require( "l8/lib/node_client.js" )
l8.node_api_client( "http://localhost:" + l8.http_port, "no credentials" )

// Let's create a task, blocking activities need a task.
l8.task( function(){
  
  // Open a file, truncated, write into it, close it, read content, check

  var fs
  var Buffer
  var fd

  l8.step( function ( ) {
    l8.require( "fs" );
  }).step( function (m) {
    l8.trace( "got fs" );
    fs = m;
    l8.require( "buffer" );
  }).step( function (m) {    
    l8.trace( "got buffer" );
    Buffer = m.Buffer;
    fs.open( "node.js.test_file.txt", "w" );
  }).step( function (f) {    
    l8.trace( "got fd" );
    fd = f;
    new Buffer( "Hello, world!", "utf8" );
  }).step( function (b) {    
    l8.trace( "got new buffer" );
    fs.write( fd, b, 0, b.length, null );
  }).step( function ( ) {
    l8.trace( "got buffer written" );
    fs.close( fd );
  }).step( function ( ) {    
    fs.readFile( "node.js.test_file.txt", "utf8" );
  }).step( function (r) {    
    l8.assert( r === "Hello, world!" );
    l8.trace( "test/node.js -- TEST SUCCESS");
    process.exit( 0 )
  }).failure( function (e) { 
    l8.trace( "test/node.js -- error", e, e.stack );
  })

}) // end of task

l8.countdown( 10 )


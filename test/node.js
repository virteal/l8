// test/node.js
//   This is a test for the remote access to node.js API from a node_client.js
//   powered client to a node_server.js powererd server.
//
// 2013/02/08 by JHR
//

// Embbed server
require( "l8/lib/node_server.js" )

// But behave as a client
var l8 = require( "l8/lib/node_client.js" )

// Let's create a task, blocking activities need a task.
l8.task( function(){
  
  // Open a file, truncated, write into it, close it, read content, check

  var fs
  var Buffer
  var fd
  var msg_buffer

  l8.step( function ( ) {    l8.require( "fs" );
  }).step( function (m) {    fs = m;
                             l8.require( "buffer" );
  }).step( function (m) {    Buffer = m.Buffer;
                             fs.open( "node.js.test_file.txt", "w" );
  }).step( function (f) {    fd = f;
                             new Buffer( "Hello, world!", "utf8" );
  }).step( function (b) {    msg_buffer = b;
                             fs.write( fd, msg_buffer, 0, msg_buffer.length, null );
  }).step( function ( ) {    fs.close( fd );
  }).step( function ( ) {    fs.readFile( "node.js.test_file.txt", "utf8" );
  }).step( function (r) {    l8.assert( r === "Hello, world!" );
                             l8.trace( "TEST SUCCESS");
                             process.exit( 0 )
  }).failure( function (e) { l8.trace( "Unexpected error", e, e.stack ); })

}) // end of task

l8.countdown( 100 )


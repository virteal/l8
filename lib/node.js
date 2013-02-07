// l8/node.js
//   l8 adaptor for node.js API, ie make that API "l8 blocking"
//
// What this module does is process all the node.js API methods that use
// callbacks. It turns them into l8 tasks that block until said callback is
// called. When that callback is called, it's parameters become the result
// of the task.
//
// Usage:
//   var f;
//   l8.step(    function(     ){  l8.require( "fs" );
//   )}.step(    function( fs  ){  fs.open.l8( ...);
//   }).step(    function( r   ){  (f = r).write.l8( ... );
//   }).failure( function( err ){  log( "File error", err );
//   }).final(   function(     ){  !f || f.close.async();
//   });
//
// For each such native API method F, a new F' is built. F'.native references
// the original version. F'.async and F'sync references the native sync and
// and async versions of methods that have both variants. F'.promise is a
// version that returns a promise. F'.l8 is a version that blocks the current
// l8 task and either deblock it with the method's result or with an exception.
// That exception can be captured in the .failure() clause of the task.
//
// The F'.go version, ie .write.go() vs .write.l8(), processes errors like
// the Go language does: without exceptions ; errors are returned as the first
// part of the composite result ; the programmer is expected to check errors.
//
// Usage:
//   var f;
//   l8.step(  function(      ){  l8.require( "fs" );
//   }).step(  function( fs   ){  fs.open.go( ...);
//   }).step(  function( e, r ){  !e && (f = r).write.go( ... );
//   }).final( function(      ){  !f || f.close.async();
//   });
//
// In some cases, a node.js API method with a callback parameter calls back
// that callback multiple times. In such cases, the equivalent abstraction
// in l8 is a l8.signal() and consequently such methods are transformed to
// accept a signalable object instead of a callback. They will signal that
// object when the native API's callback is called. Such methods don't block.
//
// Still in some cases, a node.js API method reference a "listener". That is
// typically a callback called multiple times, when some event fires. Such
// methods are transformed to also accept a l8.signal() or a promise, or even
// a message queue, in addition to a listener function.
//
// The general idea is that native node.js API methods that call a user
// provided function will also accept any object that provides a .signal()
// method. Most l8 objects do provide such a method, with a semantic that
// depends on the class of the object but that will usually resume some task
// that is blocked, waiting for that object to be signaled something.
//
// In addition to these method transformations, the node.js module provides a
// a few misc adaptations to make life with node.js easier with l8.
//
// Note: in addition to this module, see also the node_server.js module and
// the node_client.js modules. When used together, the three modules make it
// easy to have l8 code that runs everywhere, client side or server side, and
// can access the full node.js API, either directly, when running server side,
// or thru a server, when running client side.
//
// 2013/02/02 by JHR
//

l8 = require( "l8/lib/l8.js" );

var util = require( "util" )
var slice = [].slice

// Let's redefine l8.assert() to use node's one.
l8.proto.assert = l8.proto.mand = require( "assert" )

// Let's redefine the logger, ie l8.trace() behavior.
// ToDo: logger( null ) implementation
// ToDo: maybe use console.log ???
l8.logger( function(){ 
  return function( o ){
    var msg = ""
    var depth = 2
    if( arguments.length > 1 ){
      o = slice.call( arguments, 0 )
      depth++
    }
    msg = util.inspect( o, false, depth, process.stdout.isTTY ) // o, hidden, depth, color  
    util.print( msg )
    return msg
  }
})


// Redefine require(). We want it to be async, but it is not...
// ToDo: unify node.js require() with commonjs's one and require.js one.
var previous_require = l8.proto.require;

l8.proto.require = function( path ){
// like native require(), but does not block.
// Usage :
//  l8.step( function(     ){  l8.require( "xxx" )
//  }).step( function( xxx ){  ... use xxx ...
  // Pause current thread
  var walk = l8.walk;
  // Queue a function that invokes the native require()
  l8.tick( function(){
    // ToDo: error handling
    var r = L8_require( path )
    // Resume paused task, with result
    walk( r )
  })
}

// ToDo: other "global" stuff, http://nodejs.org/api/globals.html

var l8ize = function( fn ){
// Return a new function that calls the native node.js API one, with a callback
// to have the current task pause/resume as expected, with exceptions when
// node.js signal an error.
  return function(){
    var args = slice.call( arguments, 0 );
    // Pause task and invoke function with callback to resume task
    var cb = args[ len ] = l8.flow // Like l8.walk but detect exceptions
    try{
      return fn.apply( this, args )
    }catch( e ){
      cb( e )
    }
  }
}

var l8goize = function( fn ){
// Return a new function that calls the native node.js API one, with a callback
// callback to have the current task paused/resumed as expected, Go lang style.
  return function(){
    var args = slice.call( arguments, 0 );
    // Pause task and invoke function with callback to resume task
    var cb = args[ len ] = l8.walk // See l8 doc about this
    try{
      return fn.apply( this, args )
    }catch( e ){
      cb( e )
    }
  }
}

var l8promisize = function( fn ){
// Return a new function that calls the native node.js API one, with a callback
// to have a promise resolved or rejected. That promise is the value returned
// by the new function.
  return function(){
    // Allocate a new promise object
    var promise = l8.promise()
    // Add a callback parameter to the initial parameters
    args[ len ] = function( err ){
      // When node.js signal an error, reject the promise
      if( err ){
        promise.reject( err )
      // When node.js signal no error, remove the error status and resolve
      }else{
        var rslt = slice.call( arguments, 0 )
        rslt.shift()
        promise.resolve( rslt )
      }
    }
    // Catch potential exception and feed a reject with them
    try{
      fn.apply( this, args )
    }catch( e ){
      promise.reject( e )
    }
    // Always return the new promise
    return promise
  }
}

var l9signalize = function( fn ){
// Return a new function that calls the native node.js API one, with a
// callback to have an object signaled
  return function(){
    var args = slice.call( arguments, 0 )
    var len = args.length
    var signalable = args[ len - 1 ]
    if( !signalable.signal )return fn.apply( this, args )
    // Change last param into a callback that signals the signalable object
    args[ len - 1 ] = function( obj ){
      if( arguments.length > 1 ){
        signalable.signal.call( signalable, arguments )
      }else{
        signalable.signal.call( signalable, obj )
      }
    }
    // Remember it, so that is is possible to remove that listener later
    signalable.listener = args[ len - 1 ]
    return fn.apply( this, args )
  }
}


// This is where I intercept and patch the node.js native modules
function L8_require( path ){
  
  var m
  try{
    m = require( path )
  }catch( e ){
    m = previous_require( path )
  }
  
  var adapt = function( fn ){
  // Adapt one or more functions, classic nodejs cb( err, rslt ) style
    if( arguments.length > 1 ){
      fn = slice( arguments, 0 )
    }
    if( typeof fn !== "string "){
      for( var ii in fn ){
        adapt( fn[ ii ], style )
      }
      return
    }
    var original_fn = fn
    var original_f  = m[ fn ]
    var is_sync = fn.substr( fn.length - 4 ) === "Sync"
    var sync
    var async
    // For xxxxSync(), get the async associated function
    if( is_sync ){
      sync  = m[ fn ]
      fn = fn.substr( 0, fn.length - 4 )
      async = m[ fn ]
    // For xxx(), get the Sync version, if any
    }else{
      async = m[ fn ]
      sync  = m[ fn + "Sync" ]
      is_sync = !!sync
    }
    async.l8     = l8ize( async )
    async.go     = l8goize( async )
    async.async  = async
    async.sync   = sync
    async.native = async
    if( sync ){
      sync.l8     = async.l8
      sync.go     = async.go
      sync.async  = async
      sync.sync   = sync
      sync.native = sync
    }
  }
  
  adapt_signal = function( fn ){
  // Adapt one or more functions, event style callbacks
    if( arguments.length > 1 ){
      fn = slice( arguments, 0 )
    }
    if( typeof fn !== "string "){
      for( var ii in fn ){
        adapt_signal( fn[ ii ], style )
      }
      return
    }
    var native = m[ fn ]
    native.l8     = l8signalize( m[ fn ] )
    native.async  = native
    native.native = native
  }
  
  switch( path ){
    
    case "child_process": // http://nodejs.org/api/child_process.html
      adapt( [ "exec", "execFile" ] )
    break
    
    case "cluster": // http://nodejs.org/api/cluster.html
      adapt( "disconnect" )
    break
    
    case "crypto": // http://nodejs.org/api/crypto.html
      adapt( "pbkdf2", "randomByes" )
    break
    
    case "dns": // http://nodejs.org/api/dns.html
      adapt( "lookup", "resolve", "resolve4", "resolve6", "resolveMx" )
      adapt( "resolveTxt", "resolveSry", "resolveNs", "resolveCname" )
      adapt( "reverse" )
    break
    
    case "domain": // http://nodejs.org/api/domain.html
      // N/A
    break
    
    case "event": // http://nodejs.org/api/events.html
      // ToDo: wrap listeners to have them send a signal to some l8 object.
      adapt_signal( "addListener", "on", "once" )
      // ToDo: removeListener, removeAllListeners & listeners()
      // need special treatment because the listener parameter is altered
      // Or do nothing?
    break
    
    case "fs": // http://nodejs.org/api/fs.html
      // ToDo: a lot!
      adapt( "rename", "truncate" )
      adapt( "chown", "fchown", "lchown" )
      adapt( "chmod", "fchmod", "lchmod" )
      adapt( "stat",  "fstat",  "lstat"  )
      adapt( "link",  "symlink", "readlink", "realpath" )
      adapt( "unlink", "rmdir", "mkdir", "readdir", "close", "open" )
      adapt( "utimes", "futimes", "fsync" )
      adapt( "write", "read", "readFile", "writeFile", "appendFile" )
      adapt_signal( "watchFile", "watch" )
      // ToDo: unwatchFile( filename, [listener] )
      adapt( "exists" )
      // ToDo: class fs.ReadStream
      // ToDo: class fs.WriteStream
      // ToDo: class fs.FSWatcher
    break
    
    case "http": // http://nodejs.org/api/http.html
      adapt_signal( "createServer", "listen", "close", "request", "get" )
      adapt_signal( "setTimeout" )
    break
    
    case "https": // http://nodejs.org/api/https.html
      adapt_signal( "createServer", "listen" )
      adapt( "close" )
      adapt( "request", "get" )
      adapt_signal( "setTimeout" )
    break
    
    case "net": // http://nodejs.org/api/net.html
      adapt_signal( "createServer", "listen" )
      adapt( "close", "request", "get" )
      adapt_signal( "setTimeout" )
      adapt( "createConnection", "connect" )
      var save_m = m
      m = m.Server
      adapt_signal( "listen" )
      adapt( "close" )
      m = m.Socket
      adapt( "connect", "write" )
      apapt_signal( "setTimeout" )
      m = save_m
    break
    
    case "os": // http://nodejs.org/api/os.html
      // Nothing to do
    break
    
    case "path": // http://nodejs.org/api/path.html
      // Nothing to do apparently
    break
    
    case "process": // http://nodejs.org/api/process.html
      // ToDo: m.nextTick(), http://nodejs.org/api/process.html#process_process_nexttick_callback
    break
    
    case "punycode": // http://nodejs.org/api/punycode.html
      // Nothing
    break
    
    case "querystring": // http://nodejs.org/api/querystring.html
      // Nothing
    break
    
    case "readline": // http://nodejs.org/api/readline.html
      adapt( "question" )
    break
    
    case "repl": // http://nodejs.org/api/repl.html
      // Nothing
    break
    
    case "stream": // http://nodejs.org/api/stream.html
      // Not sure what to do with this one...
    break
    
    case "string_decoder": // http://nodejs.org/api/string_decoder.html
      // Nothing
    break
    
    case "tls": // http://nodejs.org/api/tls.html
      // ToDo
    break
    
    case "dgram": // http://nodejs.org/api/dgram.html
      adapt_signal( "createSocket" )
      adapt( "send" )
    break
    
    case "url" : // http://nodejs.org/api/url.html
      // Nothing
    break
    
    case "util":
      // ToDo: util.pump()
    break
    
    case "vm": // http://nodejs.org/api/url.html
      // Nothing
    break
    
    case "zlib": // http://nodejs.org/api/zlib.html
      adapt( "deflate", "deflateRaw", "gzip", "gunzip", "inflate")
      adapt( "inflateRaw", "unzip" )
    break
    
  }
  return m
}

exports.l8 = l8

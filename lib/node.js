// l8/node.js
//   l8 adaptor for node.js API
//
// What this module does is process all the node.js API methods that use
// callbacks. It turns them into l8 tasks that block until said callback is
// called. When that callback is called, it's parameters becomes the result
// of the task.
//
// Please note that there are 3 versions of each such methods. The one that
// is prefixed with "go", ie .goWrite() vs .write(), processes errors like the
// Go language does: with no exceptions ; the error is returned as the first
// part of the composite response ; the programmer is expected to check it.
//
// Another other version, the one with no "go" prefix, automatically raises an
// exception if an error is detected. That exception can be captured in the
// .failure() clause of the task.
//
// A third version, accessible using the .promise attribute, returns a promise.
//
// Additionaly, the original node.js native method is made available, with
// the .async attribute.
//
// Node native sync methods are removed. ie: to do the equivalent of
// fs.readFileSync(), use fs.readFile(). In the rare cases where the sync
// native method is required, please access it using the .sync attribute.
//
// In some cases, a node.js API method with a callback parameter calls back
// that callback multiple times. In such cases, the equivalent abstraction
// in l8 is a l8.signal() and consequently, such methods are transformed to
// accept a signal instead of a callback. A signal that that they will signal
// when the native API's callback is called. Such methods usually don't block.
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
// Note: in addition to this module, see also the browser_node.js module and
// the node_server.js module. When used together, the three modules make it
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
// usage :
//  l8.step(function(){
//    l8.require( "xxx" );
//  }).step(function( xxx ){
//    ... use xxx ...
//  })
  // Pause current thread
  var walk = l8.walk;
  // Queue a function that invokes the native require()
  l8.tick(function(){
    var r = L8_require( path )
    // Resume paused task, with result
    walk( r )
  })
}

// ToDo: other "global" stuff, http://nodejs.org/api/globals.html

var l8ize = function( fn ){
// Return a new function that calls the native node.js API one but wraps the
// callback to have the current task pause/resume as expected, with exceptions
// when the first parameter of the called callback is not null.
  return function(){
    var args = slice.call( arguments, 0 );
    var len = arguments.len
    // If the last argument is a function, assume it is a callback
    if( len && (typeof arguments[len-1] === 'function') ){
      var args = slice.call( arguments, 0 )
      args[len-1] = l8.flow
      return fn.apply( this, args )
    }
    return fn.apply( this, arguments )
  }
}

var l8goize = function( fn ){
// Return a new function that calls the native node.js API one but wraps the
// callback to have the current task pause/resume as expected, Go lang style.
  return function(){
    var args = slice.call( arguments, 0 );
    var len = arguments.len
    // If the last argument is a function, assume it is a callback
    if( len && (typeof arguments[len-1] === 'function') ){
      var args = slice.call( arguments, 0 )
      args[len-1] = l8.walk
      return fn.apply( this, args )
    }
    return fn.apply( this, arguments )
  }
}

var l8promisize = function( fn ){
// Return a new function that calls the native node.js API one but wraps the
// callback to have a promise resolved or rejected. That promise is the
// returned value of the new function
  return function(){
    var args = slice.call( arguments, 0 );
    var len = arguments.len
    var promise = l8.promise()
    // If the last argument is a function, assume it is a callback
    if( len && (typeof arguments[len-1] === 'function') ){
      var args = slice.call( arguments, 0 )
      args[len-1] = function( err ){
        if( err ){
          promise.reject( e )
        }else{
          promise.resolve( slice.call( arguments, 1 ) )
        }
      }
      return fn.apply( this, args )
    }
    try{
      promise.resolve( fn.apply( this, arguments ) )
    }catch( e ){
      promise.reject( e )
    }
    return promise
  }
}

var l9signalize = function( fn ){
// Return a new function that calls the native node.js API one but wraps the
// callback to have an object signaled
  return function(){
    var args = slice.call( arguments, 0 );
    var len = arguments.len
    var promise = l8.promise()
    // If the last argument is a function, assume it is a callback
    if( len && (typeof arguments[len-1] === 'function') ){
      var args = slice.call( arguments, 0 )
      args[len-1] = function( err ){
        if( err ){
          promise.reject( e )
        }else{
          promise.resolve( slice.call( arguments, 1 ) )
        }
      }
      return fn.apply( this, args )
    }
    try{
      promise.resolve( fn.apply( this, arguments ) )
    }catch( e ){
      promise.reject( e )
    }
    return promise
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
    // For xxx(), get the sync, if any
    }else{
      async = m[ fn ]
      sync  = m[ fn + "Sync" ]
      is_sync = !!sync
    }
    var go_fn = "go" + fn[0].toUpperCase() + substr( fn, 1 )
    var go_f  = l8goize( async )
    var l8_f  = l9ize(   async )
    l8_f.go    = go_f
    l8_f.async = async
    l8_f.sync  = sync
    m[ fn    ] = l8_f
    m[ go_fn ] = go_f
  }
  
  adapt_signal = function( fn ){
  // Adapt one or more functions, event style callback
    if( arguments.length > 1 ){
      fn = slice( arguments, 0 )
    }
    if( typeof fn !== "string "){
      for( var ii in fn ){
        adapt_signal( fn[ ii ], style )
      }
      return
    }
  }
  
  switch( path ){
    
    case "child_process": // http://nodejs.org/api/child_process.html
      // ToDo: m.exec(), http://nodejs.org/api/child_process.html#child_process_child_process_exec_command_options_callback
      // ToDo: m.execFile()
      adapt( [ "exec", "execFile" ] )
    break
    
    case "cluster": // http://nodejs.org/api/cluster.html
      // ToDo: m.disconnect(), http://nodejs.org/api/cluster.html#cluster_cluster_disconnect_callback
      adapt( "disconnect" )
    break
    
    case "crypto": // http://nodejs.org/api/crypto.html
      // ToDo: m.pbkdf2(), http://nodejs.org/api/crypto.html#crypto_crypto_pbkdf2_password_salt_iterations_keylen_callback
      // ToDo: m.randomBytes()
      adapt( "pbkdf2", "randomByes" )
    break
    
    case "dns": // http://nodejs.org/api/dns.html
      // ToDo: all of them
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
      // ToDo: deal with streams
    break
    
    case "http": // http://nodejs.org/api/http.html
      // ToDo
    break
    
    case "https": // http://nodejs.org/api/https.html
      // ToDo
    break
    
    case "net": // http://nodejs.org/api/net.html
      // ToDo
    break
    
    case "os": // http://nodejs.org/api/os.html
      // ToDo
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
      // ToDo: question
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
      // ToDo: m.createSocket(), http://nodejs.org/api/dgram.html#dgram_dgram_createsocket_type_callback
      // ToDo: m.send(), http://nodejs.org/api/dgram.html#dgram_dgram_send_buf_offset_length_port_address_callback
      adapt( "createSocket", "send" )
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
      // ToDo: a few
    break
    
  }
  return m
}

exports.l8 = l8
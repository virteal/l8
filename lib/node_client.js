// node_client.js
//   node.js native API made accessible remotely, the client side.
//   See also node_server.js, the server side.
//
// 2013/02/07 by JHR
//
// This code is expected to run in a browser.
// It can also run in a server however. This can be handy.
//
"use strict";

var l8 = require( "l8/lib/actor.js" )

var de   = l8.de
var bug  = l8.bug
var mand = l8.mand

var slice = [].slice

l8.http_port = parseInt( process.env.PORT, 10) || 8080 // 80 requires sudo

// Even when this code runs server side, it shall behave as a client
l8.clientize()

// We need to manage a bunch of proxy objects, per server (ie, per "stage")
var servers = {}

var node_server = l8.proxy( "node server", "http://localhost:" + l8.http_port )
register_server( node_server.stage )

l8.proto.node_server = function(){
// Get/set the url for the "node server" remote node API server, an actor.
// l8.require() will use it
  if( !arguments.length )return node_server && node_server.stage.name
  if( node_server ){
    deregister_server( node_server.stage )
    node_server = null
  }
  var url = arguments[ 0 ]
  if( !url )return null
  node_server = l8.proxy( "node server", url )
  return node_server.stage.name
}

// The client side is an actor too. That's because sometimes the server needs
// to invoke callbacks defined in the client side.
var ApiClient = l8.Actor( "node client", actor_called_back )

// Start to animate it
ApiClient()

var next_object_oid = 1;

function register_server( stage ){
// Called whenever a new stage get's in contact with the client
  servers[ stage.name ] = {}
}

function deregister_server( stage ){
// Called whenever contact is lost with a "node server" remote actor
  // ToDo: clean up registered objects
}

function register_server_object( stage, object ){
// Called to create a proxy object for further reference by server when it
// will invoke a callback in the client
  var oid = next_object_oid++;
  object._node_server_stage = stage
  object._node_client_oid   = oid
  servers[ stage.name ][ oid ] = object
  return { _node_client_oid: oid }
}

function lookup_server_object( stage, oid ){
// Return the corresponding proxy object for the specified id on the specified
// stage.
  return servers[ stage.name ][ oid ]
}


function marshall( stage, list ){
  for ( var ii in list ){
    var v = list[ ii ]
    if( v ){
      if( typeof v === "function" ){
        v = register_server_object( stage, v )
        list[ ii ] = v
      }else if( typeof v === "object" ){
        if(  v._node_client_oid ){
          list[ ii ] = { _node_client_oid: v._node_client_oid }
        }else if( v._node_server_oid ){
          list[ ii ] = { _node_server_oid: v._node_server_oid }
        }
      }
    }
  }
  return list
}

function unmarshall( stage, list ){
  for ( var ii in list ){
    var v = list[ ii ]
    if( v && typeof v === "object" && v._node_client_oid ){
      list[ ii ] = servers[ stage.name ][ v._node_client_oid ]
    }
  }
  return list
}


function actor_called_back( oid ){
// Called by the "node.js client" actor when it must serve a callback. No
// response is expected by the server. Parameters are demarshalled to restore
// references to proxied local objects.
  // If stage is first seen, install disconnection clearner
  if( !servers[ this.stage.name ] ){
    de&&bug( "New server: " + this.stage )
    register_server( this.stage )
    // ToDo: register method to call on disconnection, to free objects
    // this.stage.defer( function(){ cleaner() } )
  }
  var target = servers[ this.stage.name ][ oid ]
  // Garbadge collect useless callback info.
  // ToDo: should not do that for listeners
  if( !target._node_client_listener ){
    delete servers[ this.stage.name ][ oid ]
  }
  var decoded_args = unmarshall(
    this.stage,
    slice.call( arguments, 1 )
  )
  return target.apply( target, decoded_args )
}


// Redefine require(). We want it to be async, but it is not...
// ToDo: unify node.js require() with commonjs's one and require.js one.
var previous_require = l8.proto.require;

l8.proto.require = function( path ){
// like native require(), but does not block.
// Usage :
//  l8.step( function(     ){  l8.require( "xxx" )
//  }).step( function( xxx ){  ... use xxx ...
  // Pause current thread
  if( !node_server )throw new Error( "No l8 node API server" )
  var walk = l8.flow;
  // Queue a function that invokes the native require()
  l8.tick( function(){
    // ToDo: error handling
    var r = L8_require( path, walk )
  })
}

// ToDo: other "global" stuff, http://nodejs.org/api/globals.html

var l8ize = function( m, fn ){
// Return a new function that calls the remote node.js API one, with a callback
// to have the current task pause/resume as expected, with exceptions when
// node.js signal an error.
  de&&mand( m )
  de&&mand( m._node_server_stage )
  return function(){
    var args = slice.call( arguments, 0 )
    var len  = args.length
    // Pause task and invoke function with callback to resume task
    var cb = args[ len ] = l8.flow // Like l8.walk but detect exceptions
    args = marshall( m._node_server_stage, args )
    try{
      node_server.call( [ m._name, fn ].concat( args ) ).then(
        function( r ){},
        function( e ){ cb( e, 0 ) }
      )
    }catch( e ){
      cb( e, 0 )
    }
  }
}

var l8goize = function( m, fn ){
// Return a new function that calls the remote node.js API one, with a callback
// callback to have the current task paused/resumed as expected, Go lang style.
  return function(){
    var args = slice.call( arguments, 0 )
    // Pause task and invoke function with callback to resume task
    var cb = args[ len ] = l8.walk // See l8 doc about this
    args = marshall( m._node_server_stage, args )
    try{
      node_server.call( [ m._name, fn ].concat( args ) ).then(
        function( r ){},
        function( e ){ cb( e, 0 ) }
      )
    }catch( e ){
      cb( e, 0 )
    }
  }
}

var l8promisize = function( m, fn ){
// Return a new function that calls the remote node.js API one, with a callback
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
    args = marshall( m._node_server_stage, args )
    // Catch potential exception and feed a reject with them
    try{
      node_server.call( [ m._name, fn ].concat( args ) ).then(
        function( r ){},
        function( e ){ promise.reject( e ) }
      )
    }catch( e ){
      promise.reject( e )
    }
    // Always return the new promise
    return promise
  }
}

var l8signalize = function( m, fn ){
// Return a new function that calls the remote node.js API one, with a
// callback to have an object signaled
  function apply( args ){
    var cb = l8.walk
    // Catch potential exception and feed a reject with them
    try{
      node_server.call( [ m._name, fn ].concat( args ) ).then(
        function( r ){ cb( 0, r ) },
        function( e ){ cb( e, 0 ) }
      )
    }catch( e ){
      if( typeof cb !== "function" )return
      cb( e, 0 )
    }
  }
  var l8ized = function(){
    var args = slice.call( arguments, 0 )
    var len = args.length
    var signalable = args[ len - 1 ]
    if( !signalable.signal )return apply( args )
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
    args = marshall( m._node_server_stage, args )
    return apply( args )
  }
  // ToDo: l8ized.go
  return l8ized
}


// This is where I intercept and patch the node.js remote modules

var Modules = {}

function L8_require( path, cb ){
// Async require(), via server. For native node.js API modules, this does not
// load any code, it only get a list of remote function names and build a
// function for each of them. That function, when called, will send a request
// to the server. For user modules, this ask the server to send the module
// source code. That code is then executed. It may define define modules,
// including the required one, which is then returned, via the cb.
  // Return module loaded before, unless server is not the same now
  var m = Modules[ path ]
  if( m &&  m._node_server_stage.name === node_server.stage.name
  ){
    cb( 0, m )
    return
  }
  // Ask server
  node_server.call( [ 1, "require", path ] ).then(
    function( m ){ L8_require_2( 0, node_server.stage, path, m, cb ) },
    function( e ){ L8_require_2( e, node_server.stage, path, 0, cb ) }
  )
}



function L8_require_2( err, stage, path, m, walk ){

  if( err )return walk( err )
  
  var adapted_m = {
    _node_server_stage: stage,
    _name: path
  }
  
  // If m is javascript code for a module...
  if( m.module ){
    // ToDo: process the module definition to install the module.
    // ToDo: decompress compressed javascript source code.
    // eval that source code in a node.js style sandbox
    eval( m.code )
    // ToDo: some code will have to be executed remotely
    // m.servers, methods that are served by remote server 
    // m.signalers, methods that use signals sent by remote server
    // m.observers, one way methods sent to remote server
    walk( 0, m.module )
  }
  
  for( var method_name in m ){
    // ToDo: depending on method name suffix... adapt method
    if( false ){
      
    }else{
      adapted_m[ method_name ] = l8ize( adapted_m, m[ method_name ] )
    }
  }
  
  var adapt = function( fn ){
  // Adapt one or more functions, classic nodejs cb( err, rslt ) style
    if( arguments.length > 1 ){
      fn = slice.call( arguments, 0 )
    }
    if( typeof fn !== "string" ){
      for( var ii in fn ){
        adapt( fn[ ii ] )
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
    if( !async ){
      l8.trace( "Missing " + fn + "() in l8.require( '" + path + "' )")
      return null
    }
    var l8ized   = l8ize(   adapted_m, async )
    l8ized.go    = l8goize( adapted_m, async )
    l8ized.async = async
    l8ized.sync  = sync
    async.l8     = l8ized
    async.go     = l8ized.go
    async.async  = async
    async.sync   = sync
    async.native = async
    if( sync ){
      sync.l8     = l8ized
      sync.go     = l8ized.go
      sync.async  = async
      sync.sync   = sync
      sync.native = sync
    }
    adapted_m[ fn ] = l8ized    
  }
  
  var adapt_signal = function( fn ){
  // Adapt one or more functions, event style callbacks
    if( arguments.length > 1 ){
      fn = slice.call( arguments, 0 )
    }
    if( typeof fn !== "string" ){
      for( var ii in fn ){
        adapt_signal( fn[ ii ] )
      }
      return
    }
    var native = m[ fn ]
    var l8ized    = l8signalize( adapted_m, native )
    l8ized.async  = native
    l8ized.native = native
    l8ized.l8     = l8ized
    native.l8     = l8ized
    native.async  = native
    native.native = native
    adapted_m[ fn ] = l8ized
  }
  
  var adapt_class = function( klass_name ){
  // To adapt a class is about providing a factory to make it possible not
  // to use the "new XXX( ... )" javascript construct which is stricly sync and
  // to use a XXX.l8(... ) instead.
    var klass = function(){
      var cb = l8.flow
      this._node_client_oid = next_object_oid++
      node_server.call( 
        [ path, klass_name + ".new"].concat( slice.call( arguments, 0 ) )
      ).then(
        function( ok ){ cb( 0, ok ) },
        function( ko ){ cb( ko, 0 ) }
      )
    }
    adapted_m[ klass_name ] = klass
    adapted_m[ klass_name + ".new" ] = function(){
      switch( arguments.length ){
        case  0: return new this(
        ); break
        case  1: return new this(
          arguments[ 0 ]
        ); break
        case  2: return new this(
          arguments[ 0 ],
          arguments[ 1 ]
        ); break
        case  3: return new this(
          arguments[ 0 ],
          arguments[ 1 ],
          arguments[ 2 ]
        ); break
        case  4: return new this(
          arguments[ 0 ],
          arguments[ 1 ],
          arguments[ 2 ],
          arguments[ 3 ]
        ); break
        case  5: return new this(
          arguments[ 0 ],
          arguments[ 1 ],
          arguments[ 2 ],
          arguments[ 3 ],
          arguments[ 4 ]
        ); break
        case  6: return new this(
          arguments[ 0 ],
          arguments[ 1 ],
          arguments[ 2 ],
          arguments[ 3 ],
          arguments[ 4 ],
          arguments[ 5 ]
         ); break
        case  7: return new this(
          arguments[ 0 ],
          arguments[ 1 ],
          arguments[ 2 ],
          arguments[ 3 ],
          arguments[ 4 ],
          arguments[ 5 ],
          arguments[ 6 ]
        ); break
        case  8: return new this(
          arguments[ 0 ],
          arguments[ 1 ],
          arguments[ 2 ],
          arguments[ 3 ],
          arguments[ 4 ],
          arguments[ 5 ],
          arguments[ 6 ],
          arguments[ 7 ]
        ); break
        case  9: return new this(
          arguments[ 0 ],
          arguments[ 1 ],
          arguments[ 2 ],
          arguments[ 3 ],
          arguments[ 4 ],
          arguments[ 5 ],
          arguments[ 6 ],
          arguments[ 7 ],
          arguments[ 8 ]
        ); break
        case 10: return new this(
          arguments[ 0 ],
          arguments[ 1 ],
          arguments[ 2 ],
          arguments[ 3 ],
          arguments[ 4 ],
          arguments[ 5 ],
          arguments[ 6 ],
          arguments[ 7 ],
          arguments[ 8 ],
          arguments[ 9 ]
        ); break
        default: return null
      }
    }
    klass.native = klass
  }
  
  switch( path ){
    
    case "buffer": http://nodejs.org/api/buffer.html
      adapt_class( m.Buffer )
    break
    
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
      // ToDo: this does not work on the client side
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
  register_server_object( stage, adapted_m )
  Modules[ path ] = adapted_m
  walk( 0, adapted_m )
}

module.exports = l8


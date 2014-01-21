// node_server.js
//  node.js native API made remotely accessible, the server side.
//  See also node_client.js, the client side.
//
// 2013/02/07 by JHR
//
// The solution adopted here is to create a proxy objects for every local
// object. When the peer want to invoke a method, it send a call type message
// to the "node server" actor. That message includes the oid of the target
// object, a method name and a list of parameters.
//
// Because the response is not immediately available, the client has to wait
// for it. To do that the client either block on a l8 step or it invokes the
// .promise version of the method and uses .then().
//
"use strict";

var l8      = require( "l8/lib/actor.js" )
var Http    = require( "http")
var Connect = require( "connect")

var de   = true // l8.de
var bug  = l8.bug
var mand = l8.mand

var slice  = [].slice


l8.proto.node_api_server = function( port, credentials ){
// Start an http server to serve requests to proxied actors. Also specify
// credentials: either a string shared with clients, or a bool fn( credentials,
// module_name ) function expected to check if provided credentials are ok to
// access specified module.
  var app = Connect()
  app.use( Connect.static( 'public' ) )
  app.use( function( req, res ){ res.end( "l8 node API server\n" ) })
  var server = Http.createServer( app )
  server.listen( port || l8.http_port )
  l8.stage( "local", server )
  l8.actor( "node API server" ).credentials = credentials || "no credentials"
}

// Start a "node API server" actor. There is "node API client" peer actor in
// each client side stage ; they serve callbacks when the server needs to
// invoke a callback defined client side.
var TheNodeApiServerActor = l8.actor( "node API server", actor_queried )

// We need to manage a bunch of proxy objects, per client (ie, per "stage")
var Clients = {}

// Each client owns proxies. Except proxy 1, the global space, that defines
// .require() only
var NextObjectOid = 2;

// This is the global proxy, shared by all clients, it defines .require() only
var requirer = { require: server_require }

function register_client( proxy_actor ){
// Called whenever a new stage get's in contact with the server
  var client = Clients[ proxy_actor.stage.name ] = { proxy: proxy_actor }
  // Predefine a pseudo proxy, id 1, that implements "require"
  client[ 1 ] = requirer
}

function deregister_client( proxy_actor ){
// Called when connection with a client get lost. Dispose all registered proxy
// objects
  delete Clients[ proxy_actor.stage.name ]
}

function register_client_object( stage, object ){
// Called to create a proxy object for further reference by client when it
// will issue API requests.
  var oid = NextObjectOid++;
  object._node_client_stage = stage
  object._node_server_oid   = oid
  Clients[ stage.name ][ oid ] = object
  // ToDo: deep copy, with cycle detection and stuff...
  // I don't need that for the node API but I could need that for
  // user modules.
  var shallow_object = {}
  var attr_name
  var attr_value
  for( attr_name in object ){
    // Skip inherited members
    if( !object.hasOwnProperty( attr_name ) )continue
    // Skip private members
    if( attr_name[ 0 ] === "_" )continue;
    // Skip array indexes
    if( "0123456789".indexOf( attr_name[ 0 ] ) !== -1 )continue;
    attr_value = object[ attr_name ]
    if( typeof attr_value !== "object" ){
      if( typeof attr_value === "array" ){
        
      }else{
        shallow_object[ attr_name ] = attr_value
      }
    }
  }
  // The shallow object contains some of the attributes of the original object.
  // For example, the .length attribute of a a Buffer object is there. As a 
  // result, the client side can access that attribute without having to ask
  // anything to the server. This is handy but I need to check if some useless
  // attributes leaks ; if that happens, I may have to adapt the shallowing
  // scheme on a class per class basis. So far the generic solution is good
  // enough.
  shallow_object._node_server_oid = oid
  return shallow_object
}

function lookup_client_object( stage, oid ){
// Return the corresponding proxy object for the specified id on the specified
// stage.
  return Clients[ stage.name ][ oid ]
}

function marshall( stage, list ){
  for ( var ii in list ){
    var v = list[ ii ]
    if( v ){
      if( typeof v === "function" ){
        v = register_client_object( stage, v )
        list[ ii ] = v
      }else if( typeof v === "object" && v._node_server_oid ){
        list[ ii ] = { _node_server_oid: v._node_server_oid }
      }
    }
  }
  return list
}

function unmarshall( stage, list ){
  for ( var ii in list ){
    var v = list[ ii ]
    if( v && typeof v === "object" ){
      if( v._node_client_oid ){
        v._client_stage = stage
        list[ ii ] = v
      }else if( v._node_server_oid ){
        list[ ii ] = Clients[ stage.name ][ v._node_server_oid ]
      }
    }
  }
  return list
}

var Modules = {}

function actor_queried( oid, method ){
// Called by the "node server" actor when it must serve an API request.
// Response is sent right away. Variant parameters are demarshalled to restore
// references to proxied local objects.
  // If stage is first seen, install root object, id 1, with it's .require()
  var stage = this.stage
  if( !Clients[ stage.name ] ){
    de&&bug( "New client: " + stage )
    register_client( l8.proxy( "node API client", stage ) )
    // Register method to call on disconnection, to free objects
    stage.defer( function(){ deregister_client( stage ) } )
  }
  var target = Clients[ stage.name ][ oid ] || Modules[ oid ]
  target._node_client_stage = stage
  var decoded_args = unmarshall(
    stage,
    slice.call( arguments, 2 )
  )
  return target[ method ].apply( target, decoded_args )
}

function server_require( module_name, credentials ){
// This is the base API method, it makes other API methods visible to the
// client.
// "this" is the target object, as specified by the client.
  var iface = Modules[ module_name ]
  if( iface
  &&  iface._node_client_stage.name === this._node_client_stage.name
  ){
    var result = {}
    for( var method_name in Modules[ module_name ] ){
      if( method_name === "_node_client_stage" )continue
      result[ method_name ] = method_name
    }
    return result
  }
  // Check credentials, return null if not ok
  if( credentials !== l8.actor( "node API server").credentials ){
    if( typeof l8.actor( "node API server" ).credentials === "function" ){
      var checker = l8.actor( "node API server" ).credentials
      if( !checker( credentials, module_name ) ){
        l8.trace( "l8.require(), client with bad credentials: " + credentials )
        return null
      }
    }else{
      l8.trace( "l8.require(), client with bad credentials: " + credentials )
      return null
    }
  }
  iface = { _node_client_stage: this._node_client_stage }
  // Adapt interface based on module
  adapt_module( module_name, iface )
  // Register the interface to make it visible
  Modules[ module_name ] = iface
  return server_require.call( this, module_name )
}

function adapt_module( module_name, iface ){
// Some API methods need to be adapted because their parameters are not values
// but objects. Such objects must be proxied. Additionnaly, some parameters
// are callbacks, ie special objects that require a special treatment because
// the server will have to remotely invoke them in the client's space.
  
  // Import all functions, some will need to be modified
  var module = require( module_name );
  for( var method_name in module ){
    //de&&bug( "Importing method " + method_name + " from module " + module_name )
    var method = module[ method_name ]
    iface[ method_name ] = method
  }

  function proxify( f ){
  // Return a new function that returns a proxy instead of the new object
  // returned by the node.js API native method
    return function(){
      var obj = f.apply( this, arguments )
      return register_client_object( this._node_client_stage, obj )
    }
  }
  
  function proxify_callback( f ){
  // Return a new function that knows how to invoke it's callback parameter
  // in the remote caller's context, instead of locally
    return function(){
      var cb = arguments[ arguments.length - 1 ]
      if( !cb || !cb._node_client_oid )return f.apply( this, arguments )
      var args = slice.call( arguments, 0 )
      args[ args.length - 1 ] = function(){
        // Invoke callback in client's stage
        var client = Clients[ cb._client_stage.name ].proxy
        var args = marshall( client.stage, slice.call( arguments, 0 ) )
        client.tell( [ cb._node_client_oid ].concat( args ) )
      }
      return f.apply( this, args )
    }
  }

  var adapt = function( fn ){
  // Adapt one or more functions, classic nodejs cb( err, rslt ) style
    if( arguments.length > 1 ){
      fn = slice.call( arguments, 0 )
    }
    if( typeof fn !== "string"){
      for( var ii in fn ){
        adapt( fn[ ii ] )
      }
      return
    }
    iface[ fn ] = proxify_callback( module[ fn ] )
  }
  
  var adapt_class = function( klass ){
    var ctor
    iface[ klass.name + ".new" ] = function(){
      var obj = ctor.apply( klass, arguments )
      return register_client_object( iface._node_client_stage, obj )
    }
    ctor = function(){
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
  }
  
  switch( module_name ){
    
    case "buffer": // http://nodejs.org/api/buffer.html
      adapt_class( module.Buffer )
    break
    
    case "child_process": // http://nodejs.org/api/child_process.html
    break
    
    case "cluster": // http://nodejs.org/api/cluster.html
    break
    
    case "crypto": // http://nodejs.org/api/crypto.html
    break
    
    case "dns": // http://nodejs.org/api/dns.html
    break
    
    case "domain": // http://nodejs.org/api/domain.html
    break
    
    case "event": // http://nodejs.org/api/events.html
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
      adapt( "watchFile", "watch" )
      // ToDo: unwatchFile( filename, [listener] )
      adapt( "exists" )
      // ToDo: class fs.ReadStream
      // ToDo: class fs.WriteStream
      // ToDo: class fs.FSWatcher
    break
    
    case "http": // http://nodejs.org/api/http.html
    break
    
    case "https": // http://nodejs.org/api/https.html
    break
    
    case "net": // http://nodejs.org/api/net.html
    break
    
    case "os": // http://nodejs.org/api/os.html
    break
    
    case "path": // http://nodejs.org/api/path.html
    break
    
    case "process": // http://nodejs.org/api/process.html
    break
    
    case "punycode": // http://nodejs.org/api/punycode.html
    break
    
    case "querystring": // http://nodejs.org/api/querystring.html
    break
    
    case "readline": // http://nodejs.org/api/readline.html
    break
    
    case "repl": // http://nodejs.org/api/repl.html
    break
    
    case "stream": // http://nodejs.org/api/stream.html
    break
    
    case "string_decoder": // http://nodejs.org/api/string_decoder.html
    break
    
    case "tls": // http://nodejs.org/api/tls.html
    break
    
    case "dgram": // http://nodejs.org/api/dgram.html
    break
    
    case "url" : // http://nodejs.org/api/url.html
    break
    
    case "util":
    break
    
    case "vm": // http://nodejs.org/api/url.html
    break
    
    case "zlib": // http://nodejs.org/api/zlib.html
    break
    
  }
  
}

module.exports = l8



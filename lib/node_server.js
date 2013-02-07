// node_server.js
//  node.js native API made remotely accessible, the server side.
//  See also node_client.js, the client side.
//
// 2013/02/07 by JHR

var l8      = require( "l8/lib/actor.js" )
var Http    = require( "http")
var Connect = require( "connect")

var de   = l8.de
var bug  = l8.bug
var mand = l8.mand


/*
 *  Setup the stage, with an http server
 */

var app = Connect()
app.use( Connect.static( 'public' ) )
app.use( function( req, res ){ res.end( 'hello world\n' ) })
var server = Http.createServer( app )
l8.http_port = parseInt( process.env.PORT, 10) || 8080 // 80 requires sudo
server.listen( l8.http_port )

l8.stage( "local", server )

// Define the "node.js" actor
var Api = l8. Actor( "node.js", l8.role({
  "apply": serve
}))

// Start to animate it
Api()

// We need to manage a bunch of proxy objects, per client (aka "stage")
var clients ={}

// Each client owns proxies. Except proxy 1, the global space, that defines
// .require() only
var next_object_id = 2;

// This is the global proxy, shared by all clients, it defines .require() only
var requirer = { require: server_require }

function register_client( stage ){
// Called whenever a new stage get's in contact with the server
  client[ state.name ] ={}
}

function register_client_object( stage, object ){
// Called to create a proxy object for further reference by client when they
// will issue API requests.
  var id = next_object_id++;
  object._node_server_stage = stage
  object._node_server_id = id
  clients[ stage.name ][ id ] = object
  return { _node_server_id: id }
}

function lookup_client_objec( stage, id ){
// Return the corresponding proxy object for the specified id on the specified
// stage.
  return clients[stage.name][id]
}

function serve( that, method, args ){
// Called by the "node.js" actor when it must server a API request.
// Response is sent right away. Parameters are demarshalled to restore
// reference to proxied local objects.
  // If stage is first seen, install root object, id 1, with it's .require()
  if( !clients[ this.stage.name ] ){
    (clients[ this.stage.name ] = [])[ 1 ] = requirer
    // ToDo: register method to call on disconnection, to free objects
  }
  that  = clients[ this.stage.name ][ that ]
  var decoded_args = []
  for ( var arg in args ){
    var v = args[ arg ]
    if( !v._node_server_id ){
      decoded_args[ arg ] = v
    }else{
      decode_args[ arg ] = clients[ this.stage.name ][ v._node_server_id ]
    }
  }
  return that[method].apply( that, decoded_args )
}

function server_require( module ){
// This is the base API method, it makes other API methods visible to the
// client.
  if( this[ module ] )return register_client_object( this[ module ] )
  var m = require( module );
  var iface = {}
  // Import all functions, some will need to be modified
  for( var method_name in m ){
    de&&bug( "Importing method " + method_name + " from module " + module )
    var method = m[ method_name ]
    iface[ method_name ] = method
  }
  // Adapt interface based on module
  adapt( module, iface )
  // Register the interface to make it visible
  this[ module ] = iface
  return register_client_object( this[ module ] )
}

function adapt( module, iface ){
// Some API methods need to be adapted because their parameters are not values
// but objects. Such objects must be proxied. Additionnaly, some parameters
// are callbacks, ie special objects that require a special treatment because
// the server will have to remotely invoke them in the client's space.
  
  function proxify( f ){
  // Return a new function that returns a proxy instead of the new object
  // returned by the node.js API native method
    return function(){
      var o = f.apply( this, arguments )
      return register_client_object( this._node_server_stage, o )
    }
  }
  
  function proxify_callback( f ){
  // Return a new function that knows how to invoke it's callback parameter
  // in the remote caller's context, instead of locally
    return function(){
      var cb = arguments[ arguments.length - 1 ]
      if( cb._node_browser_id )return f.apply( this, arguments )
      var args = slice( arguments, 0 )
      that = this
      args[ args.length - 1 ] = function(){
        // Invoke callback in client's stage
      }
      return f.apply( this, args )
    }
  }

  switch( module ){
    
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


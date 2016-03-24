// actor.js
//   actor style RPC using l8 and websockets/socket.io
//
// 2013/01/07 by JHR
//
// npm install socket.io
// npm install zeparser
// npm install socket.io-client
// Also depends on https://github.com/natefaubion/matches.js
//   npm install matches


/*
 *  Dependencies
 */

var l8             = require( "l8/lib/l8.js")
module.exports = l8;
require( "l8/lib/queue.js")
var Pattern        = require( "matches").pattern
var SocketIo       = require( "socket.io")
var SocketIoClient = require( "socket.io-client")
var slice          = [].slice

/*
 *  Debug
 */

//global.__defineGetter__( "de", l8.getDebugFlag )
var de   = l8.de
var bug  = l8.bug
var mand = l8.mand


/* ----------------------------------------------------------------------------
 *  Actors, local. Aka "active objects"
 *  See http://www.dalnefre.com/wp/2010/05/deconstructing-the-actor-model/
 */

// Track actors based on their name
var Registry  = {}

// Track actor generators' "next id" based on their name
var RegistryIds = {}

function Actor( name, delegate ){
  this.name     = name
  this.task     = null
  this.queue    = l8.queue() // aka "mailbox"
  this.backlog  = []
  this.pattern  = null
  this.delegate = null
  this.stage    = null
  var previous  = null
  if( (name[name.length - 1] != ".")
  &&  (previous = this.lookup( name))
  ){
    previous.task.cancel()
  }
  this.name = this.register( name, this)
  return this
}
var ProtoActor = Actor.prototype

ProtoActor.toString = ProtoActor.toLabel
= function(){ return "Actor/" + this.name }

ProtoActor.register = function( name, object ){
//_
  if( !name ){ name = "." }
  var dot = name.lastIndexOf( "." )
  // If fully qualified name, track that name
  if( dot === -1 ){
    // Track by name
    Registry[ name ] = object
    return name
  }
  // If partial name, ie xxx. (with a dot), increment a suffix
  var prefix = name.substr(    0, dot  )
  var suffix = name.substring( dot + 1 )
  if( suffix ){
    Registry[ name ] = object
    return name
  }
  var id = RegistryIds[ prefix ] || 0
  name += id++
  // Remember what next id will be
  RegistryIds[ prefix ] = id
  // Track by name
  Registry[ name ] = object
  return name
}

ProtoActor.lookup = function( name, remove ){
//_
  var obj = Registry[ name ]
  if( obj && remove ){
    delete Registry[ name ]
  }
  return obj
}

var SetPatternMatchOutcome

ProtoActor.match = function( msg, delegate ){
//_Called when there is a message that the actor may process.
// Returns false if the message must be queued.
// Some messages require an answer (ask type messages).
// That answer is provided via a callback previously attached to the message.
// To provide an answer now, the actor simply returns a value.
// If that answer is a promise, the callback will be called when the promise
// is either fullfilled or rejected.
// To provide an answer later, the actor must call the callback that it gets
// typically using this.ego.reply
// Again, if that answer is a promise, the intial callback will be called when
// the promise is either fullfilled or rejected.
// While a call type message is beeing processed by the actor, no other such
// messages can be processed, they are queued. However, once the actor got
// access to the callback, such messages stop beeing queued, even if the
// actor does call the callback right away but calls it later one.
// All in all, this means that the actor can very easely specify how to handle
// call messages, sync or async, in serie or in parallel.
  var that     = this
  var callback = msg.caller
  var callback_called = false
  if( callback ){
    // Skip "call type" message if a call is still beeing processed
    if( that.caller )return false
    // Safeguard the callback and handle case where a promise is delivered
    callback = msg.callback
    if( !callback ){
      var true_cb = function( err, rslt ){
        try{
          if( callback_called ){
            return
            var error = new Error( "duplicate reply of " + that)
            error.message = msg
            throw error
          }
          callback_called = true
          msg.caller( err, rslt)
        }catch( e ){
          l8.trace( "!!! callback failure in " + this, e)
        }
      }
      msg.callback = callback = function( err, rslt ){
        if( rslt && rslt.then ){
          rslt.then(
            function( ok ){ true_cb( 0, ok) },
            function( ko ){ true_cb( ko) }
          )
        }else{
          true_cb( err, rslt)
        }
      }
    }
    // Block further message, until this.caller is null again
    that.caller = callback
  }
  // When message went thru a ProxyActor it comes from a remote stage
  this.stage = msg.remote
  if( this.stage ){
    //de&&bug( "local actor " + this + " handles message from " + this.stage)
  }
  // Here is a message that maybe the actor is willing to process
  var rslt
  var err = null
  // Let's try to process that message, either with a Role or patterns
  if( delegate ){
    try{
      rslt = delegate.match( msg.message, msg.remote, msg.callback, this) // msg.message?
    }catch( e ){
      err = e
      if( err === l8.continueError )return false
    }
  }else{
    SetPatternMatchOutcome = function( e, r ){
      err  = e
      rslt = r
    }
    try{
      this.pattern.apply( this, msg.message)
    }catch( e ){
      return false
    }
    if( err === l8.continueEvent )return false
  }
  if( callback && callback === that.caller ){
    that.caller = null
    if( err ){
      callback( err)
    }else if( rslt || typeof rslt !== 'undefined' ){
      callback( 0, rslt)
    }
  }
  return true
}

ProtoActor.pick = function( delegate ){
// Actor#receive()
// Define the new behavior of actor for the next message.
// Usage:
//   this.ego.receive( function )
//   this.ego.receive( behavior, options )
//
// When an unexpected message is received, it gets queued. Whenever the actor
// attempts to receive a new message, these queued messages are proposed first.
// Such queued messages are a backlog and it is the programmer's responsability
// to make sure that the backlog does not grow much or else performances will
// suffer.
  var list  = this.backlog
  var len   = list.length
  if( !len )return false
  var empty = false
  var found = false
  var msg
  // Loop until nothing processable is found
  while( true ){
    // Scan queued messages, old ones first
    for( var ii ; ii < len ; ii++ ){
      // Skip emptry slot of removed messages
      if( !(msg = list[ii]) )continue;
      // The backlog is not empty, we'll have to wait to reset it
      empty = false
      if( !this.match( msg, delegate) )continue
      found    = true
      list[ii] = null
      break
    }
    // If a message was processed, restart scan, older messages first
    if( !found )break
    found = false
  }
  // When the backlog is made of empty slots, it's time to reset it
  if( empty ){
    this.backlog = []
  }
  return found
}

ProtoActor.act = function( delegate, after, timeout, loop ){
// Actor#receive()
// The actor is normally idle, unless a timeout was specified (option).
// If some previous message was left unprocessed, the actor will process
// them if it wants. Or else, the actor waits for a new message to come in.
// When the special timeout value 0 is specified, only old messages are
// processed.
//
// option { timeout: xx, after: function() } specifies what function to call if
// no message is received within the specified delay.
//
// When the actor behavior depends on the reception of a single specific
// message, once that message is received, the actor gets back to its previous
// behavior. To change the behavior for more than one message, see Actor#become.
  var that = this
  l8.repeat( function(){
    // First, check backlog
    this.step( function(){
      if( that.pick( delegate) ){
        if( loop )this.continue
        this.break
      }
    // If no match, wait for a new message
    }).step( function(){
      if( timeout === 0 && that.queue.empty ){
        if( after ){
          after.call( that)
        }
        this.continue
      }
      that.queue.get()
    // Either a match or add to backlog
    }).step( function( msg ){
      if( !that.match( msg, delegate) ){
        de&&bug( "backlog") // ["backlog"].concat( msg))
        that.backlog.push( msg)
      }
      if( !loop ) this.break
    })
  })
  .failure( function( e ){
     l8.trace( "Actor: " + that, "Unexpected error", e)
  })
}

ProtoActor.__defineGetter__( "reply" , function(){
// Async response to some "ask type" message.
//
// Usage:
//   var reply = this.ego.reply
//   ...
//   reply( err, rslt )
//
// By default, actors process messages in sequence. However, if an actor
// wants to process messages in parallel, it can store a reply callback
// and reply later. When the actor gets the reply callback, l8 detects that and
// unlock the mailbox of the actor.
  var caller = this.caller
  this.caller = null
  return caller
})

ProtoActor.receive = function( pattern, options ){
//_ Define new behavior of actor using patterns. See Actor#pick for doc.
  // Restore current pattern when task terminates
  var previous_pattern = this.pattern
  var that = this
  if( !options ){
    options = {}
  }
  this.task._task( function(){
    this.defer( function(){ that.pattern = previous_pattern})
    var after   = options.after   || pattern.after
    var timeout = options.timeout || pattern.timeout
    var loop    = options.loop    || pattern.loop
    // When pattern can act, delegate to it
    if( pattern.match ){
      return that.act( pattern,          after, timeout, loop)
    }else if( pattern.delegate ){
      return that.act( pattern.delegate, after, timeout, loop)
    }
    delete pattern.after
    delete pattern.timeout
    delete pattern.loop
    // Encapsulate "matches.js" pattern to handle exceptions my way
    for( var attr in pattern ){
      if( attr === 'after' ){
        after = pattern[attr]
        continue
      }
      if( attr === 'timeout' ){
        timeout = pattern[attr]
        continue
      }
      pattern[attr] = (function( block){
        return function(){
          var rslt
          var err = null
          try{
            rslt = block.apply( this, arguments)
          }catch( e ){
            err = e
          }
          SetPatternMatchOutcome( err, rslt)
        }
      })( pattern[attr])
    }
    that.pattern = Pattern( pattern)
    that.act( null, after, timeout, loop)
  })
}

ProtoActor.become = function( pattern, options ){
// Change the way the actor handle the messages.
// Usage:
//   this.ego.become( function )
//   this.ego.become( behavior )
//
// The way an actor processes the messages is initialy defined when the actor
// is first created. However, the actor can change this at any time.
//
// This can be usefull for actors that accept or queue different messages
// depending on their internal state. When the state change, the actor can
// change behavior.
//
// See also Actor#receive() when an actor needs to change the way it handles
// just one message.
  return this.receive( pattern, (options || {}).loop = true)
}

ProtoActor.tell = function( message, caller ){
// Send a message to this actor.
// Usage:
//   an_actor.tell( "Seen", "something" )
//   an_actor.tell( ["Seen", "something"], function( err ){...} )
//
// Optional function( err ) is a callback. If it is not provided, a promise
// is returned instead. The only possible error is when an attempt is
// made to send a message to a dead/done actor or to a remote actor when the
// contact is lost.
  var promise = null
  if( !caller  || typeof caller !== "function" ){
    promise = l8.promise()
    caller = function( err, rslt ){
      if( err ){
        promise.reject( err)
      }else{
        promise.resolve( rslt)
      }
    }
  }else if( arguments.length > 1  && typeof caller !== "function" ){
    message = slice.call( arguments, 0 )
  }
  if( !Array.isArray( message ) && !message.remote ){
    message = [ message ]
  }
  var r = this.queue.try_put( message.remote ? message : {message:message})
  if( !r ){
    caller( "Invalid tell() on " + this)
  }else{
    caller( null, r)
  }
  return promise
}

ProtoActor.ask = function( message, caller ){
// Ask something to an actor, ie also expect a response.
//
// Usage:
//   an_actor.ask( "Do", "something" )
//   an_actor.ask( ["Do","something"], function( err, rslt ){...} )
//
// Send an 'ask type' message to the actor. The actor should reply.
// Optional function( err, rslt ) is called with the outcome. If not provided,
// a promise is returned instead.
//
// To reply, the actor can:
//   1/ provide an immediate result, by returning it.
//   2/ return a promise that it will fulfill later.
//   3/ return nothing immediately and produce a result later. To do that,
//   the actor is provided a reply callback that it must call with the outcome,
//   ie either an error or a null error and a result. The callback that the actor
//   must call is accessible using an_actor.reply. The actor for which the
//   current task is running is accessible using this.ego. When the actor uses
//   this method, ie when it accesses this.ego.reply, it means that the actor
//   is ok to process another message. As a result, many requests can be
//   processed in parallel instead of in sequence as it is the case when the
//   actor returns a promise. Note: the actor can store the reply callback, it
//   then can call it later, to provide an answer, maybe after it has processed
//   some other messages.
  var promise = null
  if( !caller || typeof caller !== "function" ){
    promise = l8.promise()
    caller = function( err, rslt ){
      if( err ){
        promise.reject(  err  )
      }else{
        promise.resolve( rslt )
      }
    }
  }else if( arguments.length > 1 && typeof caller !== "function" ){
    message = slice.call( arguments, 0 )
  }
  if( !Array.isArray( message ) && !message.remote ){
    message = [ message ]
  }
  // If the message is coming from a remote stage, its format is different
  if( message.remote ){
    message.caller = caller
  }else{
    message = { caller: caller, message: message }
  }
  // ToDo: stop receiving when queue is full, how?
  var r = this.queue.try_put( message )
  if( !r ){
    caller( new Error( "Invalid ask() on " + this ) )
  }
  return promise
}

function MakeActor( name, pattern, options ){
// l8.actor()
// Look up for an actor or create one (or create an actor generator).
// Usage:
//   l8.actor( name )      -- look for a local actor or a known remote actor
//   l8.actor( name, url ) -- return a proxy to access a remote actor
//   l8.actor( name, function ) -- create an actor, managed by a function
//   l8.actor( name, behavior ) -- idem with an initial behavior
//
// When the name ends with a dot, it is an actor generator that is returned.
// When that generator is called, a new actor is created, whose name is the
// actor generator name plus a sequential number.
//
// Actors behaviors are described in Actor#receive()

  // l8.actor( "xxx" ) usage, ie lookup, for local or remote actor
  if( arguments.length === 1 ){
    return ProtoActor.lookup( name ) || ProtoProxyActor.lookup( name )
  }

  // l8.actor( "xxx", "http://xxx" ) usage, ie create proxy
  if( typeof pattern === "string" || pattern instanceof Stage ){
    return MakeProxyActor.call( this, arguments )
  }

  var ctor = function(){
    de&&bug( "create actor " + name)
    var act = new Actor( name)
    if( options ){
      pattern.options = function(){ return options }
    }
    if( typeof pattern === "function" ){
      pattern = new Role( pattern )
    }else if( pattern.catch ){
      pattern = new Role( pattern )
    }
    function byebye(){
      act.queue.close()
      // Deregister actor, unless another one already took over it
      if( ProtoActor.lookup( name) === act ){
        ProtoActor.register( name, null)
      }
    }
    var task = l8._spawn( function(){
      task.var( "ego", act)
      task.step(  function(){ act.receive( pattern, {loop:true}) })
      task.step(  function(){ byebye(); task.join() })
      task.final( function(){ byebye() })
    })
    return act.task = task
  }

  // If name is a fully distinguished name (ie no . at the end), start now
  if( name[ name.length - 1 ] !== "." )return ctor()
  // Else, return the constuctor
  return ctor
}


/* ----------------------------------------------------------------------------
 *  Role class
 *  When an actor plays a role, it's role defines it's behavior based on the
 *  available methods of the role.
 *  This class can be the base class of user defined sub classes.
 *  Alternatively, one can instantiate a role with a delegate, in that case
 *  it's the delegate methods that define the ultimate behavior of the actor.
 *  If that delegate is a function, there is one less level of indirection and
 *  it is that function that defines the ultimate behavior of the actor, ie
 *  that function is used as if if was a delegate's .catch() method.
 */

function Role( delegate ){
  this.delegate = delegate || this
  var options   = (delegate.options && delegate.options()) || {}
  this.name     = options.name
  this.async    = options.async
  this.task     = options.task
  this.actor    = null
  this.ego      = null
  this.stage    = null
  this.role     = this
}
var ProtoRole = Role.prototype

function MakeRole( delegate ){
  return new Role( delegate )
}

ProtoRole.match = function( msg, remote, callback, actor ){
//_
  var that = this
  MakeRole.current = that
  that.actor    = this.ego = actor
  that.stage    = remote
  that.callback = callback
  var verb = msg[0]

  function apply(){
    var target = that
    if( typeof that.delegate === "function" ){
      return that.delegate.apply( target, msg )
    }
    if( that.delegate != that ){
      target = that.delegate
      target.actor    = target.ego = actor
      target.stage    = remote
      target.callback = callback
      target.role     = that
    }
    var target_method = target[verb]
    if( target_method ){
      msg.shift()
    }else{
      target_method = target["catch"]
    }
    return target_method.apply( target, msg)
  }

  if( !callback ){
    if( !actor.task ){
      return apply()
    }
    actor.task._spawn( function(){
      return apply()
    })
    return
  }

  if( that.task ){
    that.task._spawn( function(){
      l8.step(  function(){ return apply() })
      l8.final( function( err, rslt ){
        try{
          if( !callback )return
          if( that.caller === callback ){
            that.caller = null
          }
          callback( err, rslt)
        }catch( e ){
          l8.trace( "!!! unexpected callback error in " + actor, e)
        }
      })
    })
    return
  }

  var rslt
  try{
    rslt = apply()
    if( !callback )return
    if( typeof rslt === 'undefined' )return
    if( that.caller === callback ){
      that.caller = null
    }
    if( rslt && rslt.then ){
      rslt.then(
        function( ok ){
          callback( null, ok)
        },
        function( ko ){
          callback( ko)
        }
      )
      return
    }
    if( that.caller === callback ){
      that.caller = null
    }
    try{
      callback( null, rslt)
    }catch( e ){
      l8.trace( "!!! unexpected callback error in " + actor, e)
    }
  }catch( err ){
    if( that.caller === callback ){
      that.caller = null
    }
    try{
      if( !callback )return
      callback( err)
    }catch( e ){
      l8.trace( "!!! unexpected callback error in " + actor, e)
    }
  }
}


/* ---------------------------------------------------------------------------
 *  Stages, with actors in them. Each nodejs process (or browser) hosts a
 *  local stage and is connected to remote stages.
 */

var LocalStage      = null
var AllStages       = {}

// ToDo: there is a memory leak for callbacks that are never resolved.
// "Candle" is a solution: https://github.com/AlexeyKupershtokh/node-candle
var AllCalls        = {}
var NextCallbackId  = 1
var NextClientId    = 1

function Stage( name, address, not_lazy ){
  this.name    = name
  var promise
  this.promise = promise = l8.promise()
  this.disconnected = l8.promise()
  this.address = address
  this.isLocal = typeof address !== 'string'
  this.lazy    = !not_lazy && !this.isLocal
  this.resources = {}
  AllStages[name] = this
  var that = this
  // Handle "local" stage, it hosts local actors
  if( this.isLocal ){
    AllStages["local"] = this
    LocalStage = this
    // Local stage running server side must listen for client connections
    if( l8.server ){
      this.listenSocket   = null
      this.allConnections = {}
      // note, io.listen( <port>) will create an http server for you
      var on = address || l8.http_port || parseInt( process.env.PORT, 10 ) || 80
      try{
        l8.trace( "SocketIo.listen on " + on)
        this.listenSocket = SocketIo.listen(
          on,
          { "log level": 1 } // ToDo: options. See https://github.com/LearnBoost/Socket.IO/wiki/Configuring-Socket.IO
        )
        l8.trace( "")
      }catch( e ){
        l8.trace( "Cannot listen for l8 socket.io on " + on, e)
        promise.reject()
        return
      }
      promise.resolve( that)
      this.listenSocket.sockets.on( 'connection', function( connection ){
        var client_id = "client:" + NextClientId++
        de&&bug( "new connection, " + client_id)
        that.allConnections[client_id] = connection
        var stage = MakeStage( client_id, client_id)
        stage.connection = connection
        stage.promise.resolve( connection)
        stage.setConnectionHandlers()
        connection.on( 'message', function( msg ){
          de&&bug( ["'message' from " + client_id].concat( msg))
        })
        connection.on( 'ack', function( msg ){
          de&&bug( ["'ack' from " + client_id].concat( msg))
        })
      })
    }
  // Handle "remote" stage
  }else{
    if( !this.lazy ){
      this.connect()
    }
  }
  return this
}

var ProtoStage = Stage.prototype

ProtoStage.toString = ProtoStage.toLabel
= function(){ return "Stage/" + this.name }

ProtoStage.connect = function(){
//_Handle the connection with the stage.
  var that    = this
  var promise = this.promise
  if( !this.lazy || this.isLocal )return this
  this.lazy = false
  // Handle remote stage based on address's syntax
  var address = this.address
  if( address.substr( 0, 7) === "client:" )return this
  var url
  var unix
  var node
  if( address.substr( 0, 7) === "http://" ){
    url = address
  }else if( address.substr( 0, 8) === "https://" ){
    url = address
  }else if( address.substr( 0, 5) === "node:" ){
    node = address
  }else{
    unix = address
  }
  // Handle urls with socket.io
  if( url ){
    l8.trace( "SocketIoClient.connection() on " + url)
    var connection = SocketIoClient.connect( url, {} )
    // ToDo: options. See https://github.com/LearnBoost/socket.io-client
    this.connection = connection
    that.setConnectionHandlers()
    connection.on( 'connect', function(){
      l8.trace( "socketIoClient.connect() success for " + url)
      that.promise.resolve( connection)
    })
    var on_disc = function( e ){
      l8.trace( "socketIoClient.connect() failed for " + url, e )
      that.connection = null
      AllStages[that.name] = null
      that.promise.reject( 'connect_failed')
      that.disconnected.resolve()
    }
    connection.on( "connect_failed", on_disc )
    connection.on( "connect_error",  on_disc )
    connection.on( "error",          on_disc )
  // Handle node sub stages using process.fork()
  }else if( node ){
    throw Error( "not supported local l8 stage " + node)
  // Handle unix sub process stages using process.spawn()
  }else if( unix ){
    throw Error( "not supported local l8 stage " + unix)
  // ToDo: handle cmd with child processes
  }else{
    throw Error( "not supported local l8 stage " + address)
  }
  return this
}

ProtoStage.setConnectionHandlers = function(){
//_Attach event listeners to the socket.io connection.
  var that = this
  var conn = this.connection
  conn.on( 'tell', function( msg ){
    //de&&bug( ["'tell' socketIo event from " + that].concat( msg))
    var actor = ProtoActor.lookup( msg.name)
    if( !actor ){
      de&&bug( "'tell' socketIo event for unknown " + msg.name + " actor")
      return
    }
    actor.tell( {remote:that,message:msg.tell} )
  })
  conn.on( 'ask', function( msg ){
    //de&&bug( ["'ask' socketIo event from " + that].concat( msg ) )
    var actor = ProtoActor.lookup( msg.name)
    if( !actor ){
      de&&bug( "'ask' message for unknown " + msg.name + " actor")
      conn.emit( "ack", [msg.caller, "bad actor"])
      return
    }
    actor.ask(
      {remote:that,message:msg.ask},
      function( err, rslt ){
        conn.emit( "ack", [msg.caller, err, rslt])
      }
    )
  })
  conn.on( 'ack', function( msg ){
    //de&&bug( ["'ack' from " + that].concat( msg ) )
    var cb_id = msg[0]
    var err   = msg[1]
    var rslt  = msg[2]
    if( err ){
      AllCalls[cb_id].reject( err)
    }else{
      AllCalls[cb_id].resolve( rslt)
    }
    delete AllCalls[cb_id]
  })
  conn.on( 'disconnect', function( msg ){
    de&&bug( ["'disconnect' from " + that].concat( msg))
    that.promise.reject()
    that.promise = l8.promise()
    that.promise.reject()
    that.disconnected.resolve()
    delete AllStages[that.name]
  })
}

ProtoStage.then = function( ok, ko ){
// Monitor contact with a remote stage.
// Usage:
//  var stage = l8.stage( "http//some.server.com" ).then(
//    function( ok ){ remote_actor = l8.actor( "service", stage ),
//    function( ko ){ console.log( "Cannot contact server", ko ) }
//  )
// A stage is a promise that is resolved when the contact is established or
// is rejected if the contact cannot be established.
// To handle the loss of an established contact, see Stage#defer()
  return this.connect().promise.then( ok, ko)
}

ProtoStage.defer = function( cb ){
// Monitor loss of contact with a remote stage.
//
// Usage:
//   this.ego.stage.defer( function(){ "client disconnected" } )
//
// Note: multiple calls to .defer() will result in multiple functions being
// called when the contact with that stage gets lost.
  var that = this
  this.disconnected.then( function(){ cb.call( l8, that) })
}

ProtoStage.get = function( id ){
// Get stage local variable.
  return this.resources[id]
}

ProtoStage.set = function( id, value ){
// Set stage local variable.
  return this.resources[id] = value
}

function MakeStage( name, address, not_lazy ){
// l8.stage()
// Set up contact with a remote stage.
//
// Usage:
//   var stage = l8.stage( "http://some.server.com" )
//   var actor = l8.actor( "service", stage )
//
  // Create local stage if never started so far
  if( !LocalStage && name !== "local" ){
    new Stage( name || "local", address)
  }
  // Return existing stage if possible
  var stage = AllStages[name || "local"]
  if( stage && (!address || stage.address === address) )return stage
  // If local stage, let's rename it if never done before
  // ToDo: is this a good idea?
  if( !address && LocalStage && LocalStage.name === "local" ){
    LocalStage.name = name
    AllStages[name] = LocalStage
    return LocalStage
  }
  // Else, create a connection to a new remote stage
  if( name !== 'local' && !address )throw new Error( "Missing address for remote l8 stage")
  var stage = new Stage( name, address, not_lazy)
  return stage
}


/* ----------------------------------------------------------------------------
 *  ProxyActor is a proxy for an actor that lives in a remote stage.
 *  It provides .tell() and .ask() as regular actors do.
 *  ToDo: see https://github.com/jacobgroundwater/federation
 */

var AllProxyActors = {}

function ProxyActor( name, stage, address ){
// l8#actor
//
// Usage:
//   var remote_actor = l8.actor( "service", "http://some.server.com" )
//
// Remote actors and local actors both provide a .tell() and .ask() methods so
// that for most usage, they are identical.
// See also ProxyActor#then() and ProxyActor#defer() about contact monitoring
// because things are sligthly different when the actor is remote.
  if( stage ){
    if( address ){
      stage = MakeStage( stage, address)
    }else if( (typeof stage === 'string') && (stage.indexOf( "://") !== -1) ){
      stage = MakeStage( name, stage)
    }
  }
  this.stage = stage || LocalStage
  this.name  = name
  var stage_name = this.stage.name
  AllProxyActors[stage_name + "/" + name] = this
  return this
}

var ProtoProxyActor = ProxyActor.prototype

ProtoProxyActor.lookup = function( name ){
// l8.actor()
// Look up for an existing proxied actor.
//
// Usage:
//   var actor = l8.actor( "service" )
//
// If an actor with the specified name was referenced before, it is that object
// which is returned. Or else, null is returned.
  return AllProxyActors[ name ]
}

function MakeProxyActor( name, stage, address ){
  if( !LocalStage ){
    new Stage( "local")
  }
  if( !stage ){ stage = LocalStage }
  var proxy = AllProxyActors[stage.name + "/" + name]
  if( proxy && proxy.stage === stage) return proxy
  return new ProxyActor( name, stage, address)
}

ProtoProxyActor.toString = ProtoProxyActor.toLabel = function(){
//_ pretty print for traces
  return "Proxy/" + this.stage.name + "/" + this.name
}

ProtoProxyActor.tell = function( args ){
// Send a message to a remote actor.
//
// Usage:
//   var promise = remote_actor.tell( "See", "you" )
//   promise.then( null, function( ko ){ console.log( "Contact was lost" ) } )
//
  if( arguments.length > 1 ){
    args = slice.call( arguments, 0 )
  }else if( !Array.isArray( args ) ){
    args = [ args ]
  }
  var that = this
  var promise = l8.promise()
  this.stage.then(
    function( conn ){
      if( that.stage.isLocal ){
        // de&&bug( "local 'tell' on " + that)
        var actor = ProtoActor.lookup( that.name)
        try{
          actor.tell.call( actor, args, l8.noop )
          promise.resolve( that)
        }catch( err ){
          promise.reject( err)
        }
        return
      }
      try{
        // de&&bug( "'tell' on " + that)
        conn.emit( "tell", {name:that.name,tell:args})
        promise.resolve( that)
      }catch( err ){
        promise.reject( err)
      }
    },
    function( ko ){
      l8.trace( "Could not 'tell', unavailable stage " + this.stage)
      promise.reject( ko)
    }
  )
  return promise
}

ProtoProxyActor.ask = function( args, caller ){
// Send a message to a remote actor, also expect a response
//
// Usage:
//   actor.ask( "Some", "question" ).then( function( r ){ console.log( r ) } )
//
// If the contact is lost or if the remote actor replied with an error, the
// promise is rejected.
  var that = this
  var promise = l8.promise()
  if( caller && typeof caller === "function" ){
    promise.then(
      function( ok ){ caller( null, ok) },
      function( ko ){ caller( ko) }
    )
  }else if( arguments.length > 1  && typeof caller !== "function" ){
    args = slice.call( arguments, 0 )
  }
  if( !Array.isArray( args ) ){
    args = [ args ]
  }
  this.stage.then(
    function( conn ){
      if( that.stage.isLocal ){
        //de&&bug( "local 'ask' on " + that)
        var actor = ProtoActor.lookup( that.name)
        actor.ask(
          args,
          function( err, rslt ){
            if( err ){
              promise.reject( err)
            }else{
              promise.resolve( rslt)
            }
          }
        )
        return
      }
      var cb_id = NextCallbackId++
      AllCalls[cb_id] = promise
      //de&&bug( "'ask' number " + cb_id + " on " + that.stage + " for " + that.name, args )
      conn.emit( "ask", {name:that.name,ask:args,caller:cb_id})
    },
    function( err ){ promise.reject( err) }
  )
  return promise
}

ProtoProxyActor.then = function( ok, ko ){
// Register callbacks to call when initial connection succeeds xor fails
  var that = this;
  // ToDo: use apply() somehow
  return this.stage.then( function(){ ok( that ) }, function(){ ko( that ) } )
}

ProtoProxyActor.defer = function( cb ){
// Register callback to call when connection get lost
  var that = this
  // ToDo: use apply() somehow
  this.stage.defer( function(){ cb( that ) } )
}


/* ---------------------------------------------------------------------------
 *  Campaign, where actors on multiple stages cooperate
 */

function Campaign( name ){
  this.name = name
  this.allServerStages = {}
}
var ProtoCampaign = Campaign.prototype

ProtoCampaign.register = function( stage ){
  this.allServerStages[ stage.name ] = stage
}

ProtoCampaign.deregister = function( stage ){
  this.allServerStages[ stage.name ] = null
}

ProtoCampaign.lookup = function( name ){
  return this.allServerStages[ name ]
}


/*
 *  Exports are added to the existing l8 object
 */

l8.actor         = MakeActor

l8.actor.lookup  = ProtoActor.lookup

l8.actor.all     = Registry

// l8.ego references the current actor. Only tasks running for an actor have an
// ego, for the other tasks, the ego is null.
l8.proto.__defineGetter__( "ego", function(){ return this.get( "ego")})

l8.Role = Role
l8.role = MakeRole

l8.stage = MakeStage

l8.proxy = MakeProxyActor

// To expose the local actors to the outside world, an http server is required.
// If none is provided, one will be created, using the specified port or a
// reasonnable default one that depends on the running platform.
l8.http_port = undefined


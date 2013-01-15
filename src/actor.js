// actor.js
//  actor style RPC using l8 and websockets/socket.io
//
// 2013/01/07 by JHR
//
// npm install socket.io
// npm install zeparser
// npm install socket.io-client
// Also depends on https://github.com/natefaubion/matches.js
//   npm install matches

(function(){

var l8             = require( "../lib/l8.js")
var Pattern        = require( "matches").pattern
var SocketIo       = require( "socket.io")
var SocketIoClient = require( "socket.io-client")

var de   = l8.de
var bug  = l8.bug
var mand = l8.mand


/* ----------------------------------------------------------------------------
 *  Actors, local. Aka "active objects"
 */

var Registry    = {}
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
  if( !name ){ name = "." }
  var dot = name.lastIndexOf( ".")
  if( dot === -1 ){
    Registry[name] = object
    return name
  }
  var prefix = name.substr(    0, dot )
  var suffix = name.substring( dot + 1)
  if( suffix ){
    Registry[name] = object
    return name
  }
  var id = RegistryIds[prefix] || 0
  name += id++
  RegistryIds[prefix] = id
  Registry[name]      = object
  return name
}

ProtoActor.lookup = function( name, remove ){
  var obj = Registry[name]
  if( obj && remove ){
    delete Registry[name]
  }
  return obj
}

var SetPatternMatchOutcome

ProtoActor.match = function( msg, delegate ){
  var that  = this
  // Skip "call type" message if a call is still beeing processed
  if( msg.caller ){
    if( that.caller )return false
  }
  // When message went thru a ProxyActor it comes from a remote stage
  this.stage = msg.remote
  // Here is a message that maybe the actor is willing to process
  var rslt
  var err = null
  // Let's try to process that message
  if( delegate ){
    try{
      rslt = delegate.match( msg, this)
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
  try{
    var callback = msg.caller
    if( callback && callback === that.caller ){
      that.caller = null
      callback( err, rslt)
    }
  }catch( e ){
    l8.trace( "!!! callback failure in " + this, e)
  }
  return true
}

ProtoActor.pick = function( delegate ){
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
        de&&bug( ["backlog"].concat( msg))
        that.backlog.push( msg)
      }
      if( !loop ) this.break
    })
  })
  .failure( function( e ){
     l8.trace( "Actor: " + that, "Unexpected error", e)
  })
}

ProtoActor.__defineGetter__( "callback" , function(){
  var caller = this.caller
  this.caller = null
  return caller
})

ProtoActor.receive = function( pattern, options ){
// Define new behavior of actor using patterns
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
            rslt == block.apply( this, arguments)
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

ProtoActor.send = function( message, caller ){
// Send a message to this actor.
// Optional 'caller' is a function( err, rslt) callback. If not provided,
// a new promise is returned. The only possible error is when an attempt is
// made to send a message to a dead/done actor.
  var promise = null
  if( !caller ){
    promise = l8.promise()
    caller = function( err, rslt ){
      if( err ){
        promise.reject( err)
      }else{
        promise.resolve( rslt)
      }
    }
  }
  var r = this.queue.tryPut( message.remote ? message : {message:message})
  if( !r ){
    caller( "Invalid send() on " + this)
  }else{
    caller( null, r)
  }
  return promise
}

ProtoActor.call = function( message, caller ){
// Send a 'call type' message to this actor. The actor should reply.
// optional 'caller' is a function( err, rslt) callback. If not provided,
// a new promise is returned.
  var promise = null
  if( !caller ){
    promise = l8.promise()
    caller = function( err, rslt ){
      if( err ){
        promise.reject( err)
      }else{
        promise.resolve( rslt)
      }
    }
  }
  if( message.remote ){
    message.caller = caller
  }else{
    message = {caller:caller,message:message}
  }
  var r = this.queue.tryPut( message)
  if( !r ){
    caller( "Invalid call() on " + this)
  }
  return promise
}

function MakeActorConstructor( name, pattern ){
  return function(){
    de&&bug( "create actor " + name)
    var act = new Actor( name)
    function byebye(){
      act.queue.close()
      // Deregister actor, unless another one already took over it
      if( ProtoActor.lookup( name) === act ){
        ProtoActor.register( name, null)
      }
    }
    var task = l8._spawn( function(){
      task.var( "actor", act)
      task.step(  function(){ act.receive( pattern, {loop:true}) })
      task.step(  function(){ byebye(); task.join() })
      task.final( function(){ byebye() })
    })
    return act.task = task
  }
}


/* ----------------------------------------------------------------------------
 *  Role class
 *  When an actor plays a role, it's role defines it's behavior based on the
 *  available methods of the role.
 *  This class can be the base class of user defined sub classes.
 *  Alternatively, one can instantiate a role with a delegate, in that case
 *  it's the delegate methods that define the ultimate behavior of the actor.
 *  
 */

function Role( options ){
  this.name     = options && options.name
  this.delegate = options && options.delegate || options
  this.sync     = options && options.sync
  this.task     = options && options.task
  this.actor    = null
  this.stage    = null
}
var ProtoRole = Role.prototype

function MakeRole( options ){
  return new Role( options)
}

ProtoRole.match = function( msg, actor ){
  var that     = this
  MakeRole.current = that
  that.actor   = actor
  var verb = msg.message[0]
  var callback
  function apply(){
    var target = that.delegate || that
    target.actor = actor
    target.stage = actor && actor.stage
    var target_method = target[verb]
    if( target_method ){
      msg.message.shift()
    }else{
      target_method = target["catch"]
    }
    return target_method.apply( target, msg.message)
  }
  if( !msg.caller ){
    if( !that.task ){
      return apply()
    }
    that.task._spawn( function(){
      apply()
    })
  }else{
    if( !that.task ){
      callback = !that.sync && actor.callback
      var rslt
      try{
        rslt = apply()
        if( rslt.then ){
          rslt.then(
            function( ok ){
              if( !callback && !(callback = actor.callback) )return
              callback( null, ok)
            },
            function( ko ){
              if( !callback && !(callback = actor.callback) )return
              callback( ko)
            }
          )
          return
        }
        try{
          if( !callback && !(callback = actor.callback) )return
          callback( null, rslt)
        }catch( e ){
          l8.trace( "!!! unexpected callback error in " + actor, e)
        }
      }catch( err ){
        try{
          if( !callback && !(callback = actor.callback) )return
          callback( err)
        }catch( e ){
          l8.trace( "!!! unexpected callback error in " + actor, e)          
        }
      }
      return
    }
    that.task._spawn( function(){
      callback = !that.sync && actor.callback
      l8.step( function(){ that[verb].apply( that, msg)})
      l8.final( function( err, rslt ){
        try{
          if( !callback && !(callback = actor.callback) )return
          callback( err, rslt)
        }catch( e ){
          l8.trace( "!!! unexpected callback error in " + actor, e)
        }
      })
    })
  }
}


/* ---------------------------------------------------------------------------
 *  Stages, with actors in them. Each nodejs process (or browser) hosts a
 *  local stage and is connected to remote stages.
 */
 
var LocalStage      = null
var AllStages       = {}
var AllCalls        = {}
var NextCallbackId  = 1
var NextClientId    = 1

function Stage( name, address, not_lazy ){
  this.name    = name
  var promise
  this.promise = promise = l8.promise()
  this.address = address
  this.isLocal = typeof address !== 'string'
  this.lazy    = !not_lazy && !this.isLocal
  AllStages[name] = this
  var that = this
  // Handle "local" stage, it hosts local actors
  if( this.isLocal ){
    AllStages["local"] = this
    LocalStage = this
    // Local stage running server side must listen for client connections
    if( l8.server ){
      this.listenSocket  = null
      this.allConnection = {}
      // note, io.listen(<port>) will create a http server for you
      try{
        this.listenSocket
        = SocketIo.listen( address || parseInt( process.env.PORT))
      }catch( e ){
        l8.trace( "Cannot listen for socket.io")
        promise.reject()
      }
      promise.resolve( null)
      this.listenSocket.sockets.on( 'connection', function( connection ){
        var client_id = "client." + NextClientId++
        l8.trace( "new connection, " + client_id)
        var stage = MakeStage( client_id, client_id)
        stage.connection = connection
        stage.promise.resolve( connection)
        stage.setConnectionHandlers()
        connection.on( 'message', function( msg ){
          l8.trace( ["'send' from " + client_id].concat( msg))
        })
        connection.on( 'ack', function( msg ){
          l8.trace( ["'ack' from " + client_id].concat( msg))
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
  var that    = this
  var promise = this.promise
  if( !this.lazy || this.isLocal )return this
  this.lazy = false
  var connection = SocketIoClient.connect( this.address)
  this.connection = connection
  that.setConnectionHandlers()
  connection.on( 'connect', function(){
    promise.resolve( connection)
  })
  connection.on( 'connect_failed', function(){
    that.connection = null
    AllStages[that.name] = null
    promise.reject( 'connect_failed')
  })
  return this
}

ProtoStage.setConnectionHandlers = function(){
  var that = this
  var conn = this.connection
  conn.on( 'send', function( msg ){
    //l8.trace( ["'send' from " + that].concat( msg))
    var actor = ProtoActor.lookup( msg.name)
    if( !actor ){
      l8.trace( "'send' message for unknown " + msg.name + " actor")
      return
    }
    actor.send( {remote:that,message:msg.send})
  })
  conn.on( 'call', function( msg ){
    l8.trace( ["'call' from " + that].concat( msg))
    var actor = ProtoActor.lookup( msg.name)
    if( !actor ){
      l8.trace( "'call' message for unknown " + msg.name + " actor")
      conn.emit( "ack", [msg.caller, "bad actor"])
      return
    }
    actor.call(
      function( err, rslt ){
        conn.emit( "ack", [msg.caller, err, rslt])
      },
      {remote:that,message:msg.call}
    )
  })
  conn.on( 'ack', function( msg ){
    l8.trace( ["'ack' from " + that].concat( msg))
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
    l8.trace( ["'disconnect' from " + that].concat( msg))
    that.promise.reject()
    that.promise = l8.promise()
    that.promise.reject()
    delete AllStages[that.name]
  })
}

ProtoStage.then = function( ok, ko ){
  return this.connect().promise.then( ok, ko)
}

function MakeStage( name, address, not_lazy ){
  // Create local stage if never started so far
  if( !LocalStage && name !== "local" ){
    new Stage( name || "local")
  }
  // Return existing stage if possible
  var stage = AllStages[name || "local"]
  if( stage && (!address || stage.address === address) )return stage
  // If local stage, let's rename it if never done before
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
 *  It provides .send() and .call() as regular actors do.
 */

var AllProxyActors = {}

function ProxyActor( name, stage, address ){
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

function MakeProxyActor( name, stage, address ){
  if( !LocalStage ){
    new Stage( "local")
  }
  if( !stage ){ stage = LocalStage }
  var proxy = AllProxyActors[stage.name + "/" + name]
  if( proxy && proxy.stage === stage) return proxy
  return new ProxyActor( name, stage, address)
}

ProtoProxyActor.toString = ProtoProxyActor.toLabel
= function(){ return "Proxy/" + this.stage.name + "/" + this.name }

ProtoProxyActor.send = function( args ){
  var that = this
  var promise = l8.promise()
  this.stage.then(
    function( conn ){
      if( !conn ){
        var actor = ProtoActor.lookup( that.name)
        try{
          actor.send.apply( actor, args)
          promise.resolve()
        }catch( err ){
          promise.reject( err)
        }
        return
      }
      try{
        conn.emit( "send", {name:that.name,send:args})
        promise.resolve()
      }catch( err ){
        promise.reject( err)
      }
    },
    function(){ promise.reject() }
  )
  return promise
}

ProtoProxyActor.call = function( args, caller ){
  var that = this
  var promise = l8.promise()
  if( caller ){
    promise.then(
      function( ok ){ caller( null, ok) },
      function( ko ){ caller( ko) }
    )
  }
  this.stage.then(
    function( conn ){
      if( !conn ){
        var actor = ProtoActor.lookup( that.name)
        actor.call(
          function( err, rslt ){ 
            if( err ){
              promise.reject( err)
            }else{
              promise.resolve( rslt)
            }
          },
          args
        )
        return
      }
      var cb_id = NextCallbackId++
      AllCalls[cb_id] = promise
      conn.emit( "call", {name:that.name,call:args,caller:cb_id})
    },
    function( err ){ promise.reject( err) }
  )
  return promise
}

/* ---------------------------------------------------------------------------
 *  Campaign, where actors on multiple stages cooperate
 */

function Campaign( name ){
  this.name = name
  this.allServerStages = {}
}
var ProtoCampaign = Campaign.prototype

ProtoCampaign.register = function( Stage ){
  this.allServerStages[Stage.name] = Stage
}

ProtoCampaign.deregister = function( Stage ){
  this.allServerStages[Stage.name] = null
}

ProtoCampaign.lookup = function( name ){
  return this.allServerStages[name]
}


/*
 *  Exports are added to the existing l8 object
 */
 
l8.Actor         = MakeActorConstructor
l8.Actor.lookup  = ProtoActor.lookup
l8.Actor.all     = Registry
l8.proto.__defineGetter__( "actor", function(){ return this.get( "actor")})
l8.Role          = Role
l8.role          = MakeRole
l8.stage         = MakeStage
l8.proxy         = MakeProxyActor

}).call( this)



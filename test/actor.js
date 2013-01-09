// actor.js
//  actor style RPC using l8 and websockets
//
// 2013/01/07 by JHR
//
// Depends on https://github.com/natefaubion/matches.js
//   npm install matches


var l8 = require( "../src/l8.js")
var Pattern = require( "matches").pattern

l8.debug( true)
var de   = l8.de
var bug  = l8.bug
var mand = l8.mand

l8.trace( "Actor starting")

/* ---------------------------------------------------------------------------
 *  Actors, local
 */

var AllActors = {}

function Actor( name ){
  this.name    = name
  this.task    = null
  this.queue   = l8.queue() // aka "mailbox"
  this.backlog = []
  this.pattern = null
  this.picking = false
  var previous = AllActors[name]
  if( previous ){
    previous.task.cancel()
  }
  AllActors[name] = this
  return this
}
var ProtoActor = Actor.prototype

ProtoActor.toString = function(){ return "Actor/" + this.name }

Actor.lookup = function( name ){ return AllActors[name] }

ProtoActor.pick = function(){
  var list  = this.backlog
  var len   = list.length
  if( !len )return false
  this.picking = true
  var empty = false
  var found = false
  var msg
  for( var ii ; ii < len ; ii++ ){
    if( !(msg = list[ii]) )continue
    empty = false
    try{
      this.pattern.apply( this, msg)
    }catch( TypeError ){ continue }
    found = true
    list[ii] = null
    break
  }
  if( empty ){
    this.backlog = []
  }
  this.picking = false
  return found
}

ProtoActor.act = function(){
  var that = this
  l8.repeat( function(){
    // First, check backlog
    this.step( function(){
      if( that.pick() ) this.continue
    // If no match, wait for a new message
    }).step( function(){
      that.queue.get()
    // Either a match or add to backlog
    }).step( function( msg ){
      try{
        that.pattern.apply( that, msg)
      }catch( TypeError ){
        l8.de&&bug.apply( this, ["backlog"].concat( msg))
        that.backlog.push( msg)
      }    
    })
  })
  .failure( function( e ){
     l8.trace( "Actor: " + that, "Unexpected error", e)
  })
}

ProtoActor.receive = function( pattern ){
// Define new behavior of actor using patterns
  // Restore current pattern when task terminates
  var previous_pattern = this.pattern
  var that = this
  this.task._task( function(){
    this.defer( function(){ that.pattern = previous_pattern})
    // Encapsulate patterns to handle exception my way
    for( var attr in pattern ){
      pattern[attr] = (function( block){
        return function(){
          try{ block.apply( this, arguments) }catch( e ){ l8.raise( e, true) }
        }
      })( pattern[attr])
    }
    that.pattern = Pattern( pattern)
    that.act()
  })
}

ProtoActor.send = function(){
  this.queue.put( Array.prototype.slice.call( arguments))
  return this
}

function MakeActorConstructor( name, pattern ){
  return function(){
    de&&bug( "create actor " + name)
    var act = new Actor( name)
    var task = l8._spawn( function(){
      task.var( "actor", act)
      task.step( function(){ act.receive( pattern) })
      task.step( function(){ task.join() })
    })
    return act.task = task
  }
}

/*
 *  Exports are added to existing l8 object
 */
 
l8.Actor         = MakeActorConstructor
l8.Actor.lookup  = Actor.lookup
l8.Actor.all     = AllActors
l8.proto.__defineGetter__( "actor", function(){ return this.get( "actor")})

/*
 *  Example. A "logging" actor
 */
 
var Logger = l8.Actor( "l8_logger", {
  '"error", x': function( x ){ return l8.trace( "Error: " + x) },
  'x':          function( x ){ return l8.trace( x) },
  '"throw", e': function( e ){ l8.trace( "throw...", e); throw e }
  //'...': function(){ l8.trace( "unsupported) }
})

// Start it
Logger()

var mylog = l8.Actor.lookup( "l8_logger")
de&&mand( mylog)
mylog.task.then(
  function(){ l8.trace( "actor done")},
  function(){ l8.trace( "actor dead")}
)
mylog.send( "Hello")
mylog.send( "error", "is ok")
mylog.send( "does not understand", "this")
mylog.send( "throw", "something that kills")
l8.countdown( 2)

/* ---------------------------------------------------------------------------
 *  Stages, with actors in them. Each nodejs process (or browser) is a stage.
 */
 
/* ---------------------------------------------------------------------------
 *  Campaign, where actors on multiple stages cooperate
 */










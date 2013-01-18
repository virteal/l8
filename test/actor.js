// actor.js
//  tests for l8 actors
//
// 2013/01/07 by JHR

//var l8 = require( "l8/lib/l8.js")
var l8 = require( "l8/lib/actor.js" )
var Http    = require( "http")
var Connect = require( "connect")

var de   = l8.de
var bug  = l8.bug
var mand = l8.mand


/*
 *  test http server
 */

var app    = Connect()
app
.use( Connect.static( 'public'))
.use( function( req, res ){
  res.end( 'hello world\n')
})
var server = Http.createServer( app)
server.listen( process.env.PORT)

l8.stage( "local", server)

/*
 *  Example. A "logging" actor
 */
 
var Logger = l8.Actor( "l8_logger", {
  '"error", x': function( x ){ return l8.trace( "Error: " + x) },
  'x':          function( x ){ return l8.trace( x) },
  '"throw", e': function( e ){ l8.trace( "throw...", e); throw e }
  //'...': function(){ l8.trace( "unsupported) }
})

/*
 *  Example. A "logging" actor using a delegate playing a role.
 *  Note: another example could create a subclass of l8.Role instead of using
 *  the generic Role class with a delegate.
 */
 
var LoggerBis = l8.Actor( "l8_logger", l8.role( {
  delegate:{
    "Hello": function(){
      l8.trace( "Hello")
    },
    trace: function(){
      l8.trace.apply( l8, arguments)
    },
    error: function(){
      var msg = Array.prototype.slice.call( arguments, 0)
      msg[0] = "Error: " + msg[0]
      l8.trace.apply( l8, msg)
    },
    catch: function(){
      var msg = Array.prototype.slice.call( arguments, 0)
      msg[0] = "Catch: " + msg[0]
      l8.trace.apply( l8, msg)
    },
    throw: function( e ){
      l8.trace( "throw...", e); throw e
    }
  }
}))

/*
 *  Example, access to actor via a proxy. In this case, it's a mock because
 *  the proxied actor and the actual actor are on the same stage
 */

var LoggerTer = l8.proxy( "l8_logger")

var Logger4 = l8.proxy( "l8_logger", "http://localhost:" + process.env.PORT)

function test_it( logger ){
  l8.trace( "Start Logger")
  Logger()
  var mylog = logger || l8.Actor.lookup( "l8_logger")
  de&&mand( mylog)
  mylog.task && mylog.task.then(
    function(){ l8.trace( "actor done")},
    function(){ l8.trace( "actor dead")}
  )
  mylog.send([ "Hello"])
  mylog.send([ "error", "is ok"])
  mylog.send([ "does not understand", "this"])
  mylog.send([ "throw", "something that kills"])
}

l8.task( function(){
  l8.trace( "Scheduling test")
  l8.step( function(){ test_it() })
  l8.step( function(){ l8.sleep( 1000) })
  l8.step( function(){ Logger = LoggerBis; test_it() })
  l8.step( function(){ l8.sleep( 1000) })
  l8.step( function(){ test_it( LoggerTer) })
  l8.step( function(){ l8.sleep( 1000) })
  l8.step( function(){ test_it( Logger4) })
  l8.step( function(){ l8.sleep( 1000) })
  l8.step( function(){ l8.trace( "SUCCESS"); process.exit( 0) })
  l8.failure( function( e ){ l8.trace( "!!! unexpected error", e) })
})

l8.countdown( 10)

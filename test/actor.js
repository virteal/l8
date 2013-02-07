// actor.js
//  tests for l8 actors
//
// 2013/01/07 by JHR
"use strict";

var l8 = require( "l8/lib/actor.js")
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

/*
 *  Example. An half baked "logging" actor
 */
 
var Logger = l8.Actor( "l8_logger", {
  '"error", x': function( x ){ return l8.trace( "Error: " + x) },
  'x':          function( x ){ return l8.trace( "catch " + x) },
  '"throw", e': function( e ){ l8.trace( "throw...", e); throw e }
  //'...': function(){ l8.trace( "unsupported) }
})

/*
 *  Example. A "logging" actor using a delegate playing a role.
 *  Note: another example could create a subclass of l8.Role instead of using
 *  the generic Role class with a delegate.
 */

var LoggerCount = 0

var LoggerBis = l8.Actor( "l8_logger", l8.role( {
  
  "options" : function(){ return {} },
  
  "Hello": function(){
    l8.trace( "Hello")
  },
  
  trace: function(){
    l8.trace.apply( l8, arguments)
  },
  
  error: function(){
    var msg = Array.prototype.slice.call( arguments, 0)
    msg[0] = "l8_logger actor, error: " + msg[0]
    l8.trace.apply( l8, msg)
  },
  
  add: function(){ LoggerCount++ },
  
  getSync: function(){
    return LoggerCount
  },
  
  getAsync: function(){
    var actor = this.actor
    var callback = actor.callback
    if( callback ){ callback( 0, LoggerCount) }
  },
  
  getPromise: function(){
    var promise = l8.promise()
    promise.resolve( LoggerCount)
    return promise
  },
  
  getAsyncPromise: function(){ 
    var promise = l8.promise()
    promise.resolve( LoggerCount)
    this.callback( 0, promise) 
  },
  
  catch: function(){
    var msg = Array.prototype.slice.call( arguments, 0)
    msg[0] = "Catch: " + msg[0]
    return l8.trace.apply( l8, msg)
  },
  
  throw: function( e ){
    l8.trace( "throw...", e); throw e
  }
}))

/*
 *  Example, access to actor via a proxy. In this case, it's a mock because
 *  the proxied actor and the actual actor are on the same stage
 */

var LoggerTer = l8.proxy( "l8_logger")

var url  = "http://localhost"
var port = l8.http_port || parseInt( process.env.PORT) || 80
if( port ){ url += ":" + port }
l8.trace( "url for local server: " + url)

var Logger4 = l8.proxy( "l8_logger", url)

function test_it( logger ){
  l8.trace( "Start Logger. " + LoggerCount)
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
  mylog.send([ "add"])
  l8.step( function(   ){
    return mylog.call([ "getSync"])
  })
  l8.step( function( r ){
    l8.trace( "Count is " + LoggerCount + ". getSync->" + r)
    de&&mand( !LoggerCount || r === LoggerCount )
  })
  l8.step( function(   ){
    return mylog.call([ "getPromise"])
  })
  l8.step( function( r ){
    l8.trace( "getPromise->" + r)
    de&&mand( !LoggerCount || r === LoggerCount )
  })
  l8.step( function(   ){
    return mylog.call([ "getAsync"])
  })
  l8.step( function( r ){
    l8.trace( "getAsync->" + r)
    de&&mand( !LoggerCount || r === LoggerCount )
  })
  l8.step( function(   ){
    return mylog.call([ "getAsyncPromise"])
  })
  l8.step( function( r ){
    l8.trace( "getAsyncPromise->" + r)
    de&&mand( !LoggerCount || r === LoggerCount )
  })
  l8.step( function(   ){ mylog.send([ "throw", "something that kills"]) })
}

l8.task( function(){
  var t
  var t0
  var t1
  var nloops = 1000
  var nn
  function delta( op ){
    t1 = l8.timeNow
    var duration = (t1 - t0) / 1000
    var ops_per_sec = nloops / duration
    l8.trace( "" + LoggerCount + "/" + op + ". " + nloops + " in " + duration + " seconds")
    l8.trace( "" + ops_per_sec + " operations per second")
  }
  l8.trace( "Scheduling test")
  l8.step( function(){ test_it() })
  l8.step( function(){ l8.sleep( 1000) })
  l8.step( function(){ Logger = LoggerBis; test_it() })
  l8.step( function(){ l8.sleep( 1000) })
  l8.step( function(){ test_it( LoggerTer) })
  l8.step( function(){ l8.sleep( 1000) })
  l8.step( function(){ test_it( Logger4) })
  l8.step( function(){ l8.sleep( 1000) })
  l8.step( function(){
    l8.trace( "Count is " + LoggerCount)
    de&&mand( LoggerCount === 3 )
  })
  l8.step( function(){ l8.debug( false) })
  l8.step( function(){
    t = t0 = l8.timeNow
    nn = 0
  })
  l8.repeat( function(){
    if( nn++ >= nloops ) l8.break;
    return Logger4.call([ "getSync"])
  })
  l8.step( function(){ delta( "getSync") })
  l8.step( function(){
    t0 = l8.timeNow
    nn = 0
  })
  l8.repeat( function(){
    if( nn++ >= nloops ) l8.break;
    return Logger4.call([ "getAsync"])
  })
  l8.step( function(){ delta( "getAsync") })
  l8.step( function(){
    t0 = l8.timeNow
    nn = 0
  })
  l8.repeat( function(){
    if( nn++ >= nloops ) l8.break;
    return Logger4.call([ "getPromise"])
  })
  l8.step( function(){ delta( "getPromise") })
  l8.step( function(){
    t0 = l8.timeNow
    nn = 0
  })
  l8.repeat( function(){
    if( nn++ >= nloops ) l8.break;
    return Logger4.call([ "getAsyncPromise"])
  })
  l8.step( function(){ delta( "getAsyncPromise") })
  l8.step( function(){
    nloops = nloops * 4
    t0 = t
    delta( "remote get, overall")
  })
  l8.step( function(){ l8.debug( true) })
  l8.step( function(){
    l8.trace( "SUCCESS"); process.exit( 0)
  })
  l8.failure( function( e ){ l8.trace( "!!! unexpected error", e, e.stack) })
})

l8.countdown( 100)

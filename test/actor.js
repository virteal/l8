// actor.js
//  tests for l8 actors
//
// 2013/01/07 by JHR
"use strict";

var l8 = require( "l8/lib/actor.js")
var Http    = require( "http")
var Connect = require( "connect")
var ServeStatic = require('serve-static');

var de   = l8.de
var bug  = l8.bug
var mand = l8.mand

/*
 *  Setup the stage, with an http server
 */

var app = Connect()
app.use( ServeStatic( 'public' ) )
app.use( function( req, res ){ res.end( 'hello world\n' ) })
var server = Http.createServer( app )
l8.http_port = parseInt( process.env.PORT, 10) || 8080 // 80 requires sudo
server.listen( l8.http_port )

l8.stage( "local", server )

/*
 *  Example. An half baked "logging" actor, using pattern matching
 */
 
var Logger = function(){ return l8.actor( "l8_logger", {
  '"error", x': function( x ){ return l8.trace( "Error: " + x) },
  'x':          function( x ){ return l8.trace( "catch " + x) },
  '"throw", e': function( e ){ l8.trace( "throw...", e); throw e }
  //'...': function(){ l8.trace( "unsupported) }
})}

/*
 *  Example. A "logging" actor using method based dispatching
 */

var LoggerCount = 0

var LoggerBis = function(){ return l8.actor( "l8_logger", {
  
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
    var actor = this.ego
    var reply = actor.reply
    if( reply ){ reply( 0, LoggerCount) }
  },
  
  getPromise: function(){
    var promise = l8.promise()
    promise.resolve( LoggerCount)
    return promise
  },
  
  getAsyncPromise: function(){ 
    var promise = l8.promise()
    promise.resolve( LoggerCount)
    this.ego.reply( 0, promise) 
  },
  
  catch: function(){
    var msg = Array.prototype.slice.call( arguments, 0)
    msg[0] = "Catch: " + msg[0]
    return l8.trace.apply( l8, msg)
  },
  
  throw: function( e ){
    l8.trace( "throw...", e); throw e
  }
})}

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
  var mylog = logger || l8.actor.lookup( "l8_logger")
  de&&mand( mylog)
  mylog.task && mylog.task.then(
    function(){ l8.trace( "actor done")},
    function(){ l8.trace( "actor dead")}
  )
  mylog.tell( "Hello" )
  mylog.tell( "error", "is ok" )
  mylog.tell( "does not understand", "this" )
  mylog.tell( "add" )
  l8.step( function(   ){
    return mylog.ask( "getSync" )
  })
  l8.step( function( r ){
    l8.trace( "Count is " + LoggerCount + ". getSync->" + r)
    de&&mand( !LoggerCount || r === LoggerCount )
  })
  l8.step( function(   ){
    return mylog.ask( "getPromise" )
  })
  l8.step( function( r ){
    l8.trace( "getPromise->" + r)
    de&&mand( !LoggerCount || r === LoggerCount )
  })
  l8.step( function(   ){
    return mylog.ask( "getAsync" )
  })
  l8.step( function( r ){
    l8.trace( "getAsync->" + r)
    de&&mand( !LoggerCount || r === LoggerCount )
  })
  l8.step( function(   ){
    return mylog.ask( "getAsyncPromise" )
  })
  l8.step( function( r ){
    l8.trace( "getAsyncPromise->" + r)
    de&&mand( !LoggerCount || r === LoggerCount )
  })
  l8.step( function(   ){ mylog.tell([ "throw", "something that kills"]) })
}

l8.task( function(){
  var t
  var t0
  var t1
  var nloops = 1000
  var nn
  function delta( op ){
    t1 = l8.now
    var duration = (t1 - t0) / 1000
    var ops_per_sec = nloops / duration
    l8.trace( "" + LoggerCount + "/" + op + ". " + nloops + " in " + duration + " seconds")
    l8.trace( "" + ops_per_sec + " operations per second")
  }
  l8.trace( "Scheduling test")
  l8.step( function(){ test_it() })
  l8.step( function(){ l8.sleep( 1000) })
  l8.step( function(){ Logger = LoggerBis })
  l8.step( function(){ test_it() })
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
    t = t0 = l8.now
    nn = 0
  })
  l8.repeat( function(){
    if( nn++ >= nloops ) l8.break;
    return Logger4.ask( "getSync" )
  })
  l8.step( function(){ delta( "getSync") })
  l8.step( function(){
    t0 = l8.now
    nn = 0
  })
  l8.repeat( function(){
    if( nn++ >= nloops ) l8.break;
    return Logger4.ask( "getAsync" )
  })
  l8.step( function(){ delta( "getAsync") })
  l8.step( function(){
    t0 = l8.now
    nn = 0
  })
  l8.repeat( function(){
    if( nn++ >= nloops ) l8.break;
    return Logger4.ask( "getPromise" )
  })
  l8.step( function(){ delta( "getPromise") })
  l8.step( function(){
    t0 = l8.now
    nn = 0
  })
  l8.repeat( function(){
    if( nn++ >= nloops ) l8.break;
    return Logger4.ask( "getAsyncPromise" )
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

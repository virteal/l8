// test/boxon.js
//
// January 2014 by JeanHuguesRobert aka @jhr

var Promise = require( "l8/lib/whisper.js" ).Promise;
var Boxon   = require( "l8/lib/boxon.js" ).scope( Promise );
var assert  = require( "assert" );

describe( "Boxon", function(){
  
  it( "Says Hello", function( done ){
    Boxon( done )();
  });
  
  it( "Smoke test", function( done ){
    Boxon( function( _, m ){
      console.log( "sync: " + m );
      assert( m === "Hello Boxon" );
    })( null, "Hello Boxon" )
    .then( function( m ){
      console.log( "async: " + m );
      assert( m === "Hello Boxon" );
      done();
    });
  });
  
  it( "memorizes outcome", function( done ){
    var b = Boxon();
    b( "Hello Boxon" );
    b( function( m ){
      console.log( "memorized: " + m );
      assert( m == "Hello Boxon" );
      done();
    });
  });
  
  it( "memorizes first outcome only", function( done ){
    var b = Boxon();
    b( "Hello Boxon" );
    b( "This should be ignored" );
    b( function( m ){
      console.log( "memorized: " + m );
      assert( m == "Hello Boxon", "outcome" );
      assert( Boxon.current === b, "current" );
      done();
    });
  });
  
  it( "can set 'this'", function( done ){
    var b = Boxon();
    b( "Hello Boxon" );
    var ctx = {ok:true};
    b( function( m ) {
      console.log( "context: ", this, ", memorized: " + m );
      assert( this === ctx );
      assert( m == "Hello Boxon", "outcome" );
      assert( Boxon.current === b, "current" );
      done();
    }, ctx );
  });
  
  it( "provides outcome", function( done ){
    var b = Boxon( null, "Hello Boxon" );
    console.log( "outcome: " + b() );
    assert( b() == "Hello Boxon" );
    done();
  });
  
  it( "provides multiple results outcome", function( done ){
    var b = Boxon();
    b( null, 1, 2, 3 );
    console.log( "results:", b() );
    var r = b();
    assert( r[0] === 1 );
    assert( r[1] === 2 );
    assert( r[2] === 3 );
    done();
  });
  
  it( "provides error outcome", function( done ){
    var b = Boxon( "Hello Boxon" );
    try{
      console.log( "invalid: " + b() );
      done( "Should have thrown something" );
    }catch( err ){
      console.log( "thrown: " + err );
      assert( err == "Hello Boxon" );
      done();
    }
  });
  
  it( "is idempotent", function( done ){
    var b = Boxon();
    var v1 = b();
    b( "Ignored" );
    var v2 = b();
    console.log( "v1:", v2, "v2:", v2 );
    assert( typeof v1 === "undefined", "undefined" );
    console.log( "properly undefined" );
    assert( v1 === v2, "still undefined" );
    done();
  });
  
  it( "interop with other boxon implementations", function( done ){
    var other = { boxon: function( f  ){
      assert( typeof f === "function", "proper callback" );
      f( "a1", "a2" );
    } };
    var b = Boxon.cast( other );
    b( function( a1, a2 ){
      assert( a1 === "a1", "err handling" );
      assert( a2 === "a2", "result handling" );
      done();
    });
  });
  
  it( "can track another boxon", function( done ){
    var other = Boxon();
    var b = Boxon.cast( other );
    b( function( err, result ){
      assert( typeof err === "undefined", "undefined err" );
      assert( typeof result === "undefined", "undefined result" );
      done();
    } );
    other();
  });
  
  it( "can track a rejected promise", function( done ){
    var p = new Promise( function( ok, ko ){
      ko( "rejected" );
    });
    var b = Boxon.cast( p );
    b( function( err ){
      assert( err === "rejected", "rejection" );
      done();
    });
  });
  
  it( "can track a resolved promise", function( done ){
    var p = new Promise( function( ok, ko ){
      ok( "resolved" );
    });
    var b = Boxon.cast( p );
    b( function( err, result ){
      console.log( err, result );
      assert( !err, "no error" );
      assert( result === "resolved", "resolution" );
      done();
    });
  });
  
  it( "can track a delayed promise rejection", function( done ){
    var p = new Promise( function( ok, ko ){
      setTimeout( function(){ ko( "rejected" ) }, 0 );
    });
    var b = Boxon.cast( p );
    b( function( err ){
      assert( err === "rejected", "rejection" );
      done();
    });
  });
  
  it( "can track a delayed promise resolution", function( done ){
    var p = new Promise( function( ok, ko ){
      setTimeout( function(){ ok( "resolved" ); }, 0 );
    });
    var b = Boxon.cast( p );
    b( function( err, result ){
      console.log( err, result );
      assert( !err, "no error" );
      assert( result === "resolved", "resolution" );
      done();
    });
  });
  
  it( "can track a 'thunk'", function( done ){
    var t = function( cb ){ cb( "called" ); };
    var b = Boxon.co( t );
    b( function( p ){
      assert( p === "called" );
      done();
    });
  });
  
  it( "can track a delayed 'thunk'", function( done ){
    var t = function( cb ){
      setTimeout( function(){ cb( "called" ); }, 0 );
    };
    var b = Boxon.co( t );
    b( function( p ){
      assert( p === "called" );
      done();
    });
  });
  
  it( "can track an async call", function( done ){
    var ctx = {
      fn: function( h, cb ){
        console.log( "called" );
        assert( this === ctx, "context" );
        assert( h === "hello", "parameter ");
        assert( typeof cb === "function", "callback" );
        cb( null, h );
      }
    };
    var b = Boxon();
    b( ctx, ctx.fn, "hello" );
    b( function( _, h ){
      console.log( "callback called" );
      assert( h === "hello", "result" );
    });
    b.then( function( p ){
      console.log( "success callback called" );
      assert( p === "hello", "result" );
      done();
    });
  });
  
  it( "is a promise, resolved", function( done ){
    var b = Boxon();
    b.then( function( ok ){
      assert( ok === "resolved", "resolution" );
      done();
    });
    b( null, "resolved" );
  });
  
  it( "is a promise, rejected", function( done ){
    var b = Boxon();
    b.then( null, function( ko ){
      assert( ko === "rejected", "rejection" );
      done();
    });
    b( "rejected" );
  });
  
  it( "handles multiple callback errors", function( done ){
    var b = Boxon();
    var f = function(){};
    b( function( on ){
      console.log( "callback attached" );
      assert( on.Boxon === b );
      assert( on.on === f );
      done();
    });
    b( f );
  });
  
  it( "handles multiple callback with moxons", function( done ){
    var b = Boxon.Moxon();
    var count = 0;
    var f = function( _, msg ){
      assert( msg === "Moxon!" );
      count++;
      console.log( "call", count, msg );
      if( count === 2 )return done();
      assert( count === 1 );
    };
    b( f );
    b( f );
    b( null, "Moxon!" );
  });
  
  it( "collects outcomes", function( done ){
    var r1 = Boxon();
    var r2 = Boxon();
    var with_all = Boxon.all([ r1, r2, "done" ]);
    with_all( function( err, a ){
      assert( !err, "err" );
      assert( r1() === "first", "first" );
      assert( r2() === "second", "second" );
      assert( a[0] === r1, "r1" );
      assert( a[1] === r2, "r2" );
      assert( a[2]() === "done", "done" );
      done();
     });
    r2( null, "second" );
    r1( null, "first"  );
  });
  
  it( "select first outcome", function( done ){
    var r1 = Boxon();
    var r2 = Boxon();
    Boxon.race([ r1, r2 ] )( function( err, winner ){
      assert( !err, "err" );
      assert( winner === r2 );
      assert( r2() === "second", "second" );
      done();
    });
    r2( null, "second" );
    r1( null, "first" );
  });
  
  // ToDo: more tests
  
});

  # input.coffee
#   blocking input, BASIC style, via http
#
# 2012/12/16 by JHR

l8   = require( "l8/lib/l8.js")
l8.debug false
http = require( "http")
url  = require( "url")

# IO tools. BASIC style

screen    = []
cls       =       -> screen = []
print     = (msg) -> screen.push msg
printnl   = (msg) -> print msg + "\n"

PendingResponse = null
respond = (question) ->
  return unless PendingResponse
  PendingResponse.writeHead 200, {'Content-Type': 'text/html'}
  PendingResponse.end [
    '<html>'
    screen.join "<br\>"
    '<form url="/">'
    question
    '<input type="text" name="input">'
    '<input type="submit">'
    '</form>'
    '</html>'
  ].join '\n'
  PendingResponse = null

HttpQueue = l8.queue( 1000)
input = l8.Task (question) ->
  @step ->
    respond question
    HttpQueue.get()
  @step (req,res) ->
    @trace "Handling new http request, #{req.method}, #{req.url}"
    if req.method isnt "GET" or not (req.url is "/" or req.url[1] is "?")
      res.writeHead 404, {"Content-Type": "text/plain"}
      res.end "404 Not Found\n"
      return input question
    PendingResponse = res
    data = url.parse( req.url, true).query.input
    return data if data
    input question
http.createServer( HttpQueue.put.bind HttpQueue ).listen process.env.PORT

# Main

l8.task ->
  @step   -> l8.trace "Game is running"
  @repeat ->
    round = random = 0
    @step -> input "Enter a decent number to start a new game"
    @step (r) ->
      @continue if (r = parseInt( r) or 0) < 10 or r 
      random = Math.floor Math.random() * r
      round  = 0
    @repeat ->
      @step -> input "Guess a number"
      @step (r) ->
        round++
        r = parseInt( r)
        if r >  random then printnl "#{r} is too big"
        if r <  random then printnl "#{r} is too small"
        if r is random
          cls()
          printnl "Win in #{round} rounds! Try again"
          @break
  l8.trace "Game is scheduled"
l8.trace "Game is starting"
require( "coffee-script");
require( "./input.coffee");// test/lighttable.js
//   minimal server for LightTable, also a scratch pad for debugging
//
// This file is run in order to set up a "connection" between node.js and
// lighttable. lighttable then  can send code to evaluate on that connection.
//
// Feb 2 2014 by @jhr

setInterval( function(){
  console.log( "It's alive!" );
}, 10 * 1000 );

var Boxon = require( "l8/lib/boxon.js" );

console.log( "Hello world!" );

var b = Boxon();

b( function(){ console.log.apply( console, arguments ) } );
b( "Hello boxon" );

try{
  console.log( b() );
}catch( err ){
  console.log( "Error: ", err );
}

b();
// test/node.js
//   This is a test for the remote access to node.js API from a node_client.js
//   powered client to a node_server.js powered server.
//
// 2013/02/08 by JHR
//

// Embbed server
var l8 = require( "l8/lib/node_server.js" )
l8.http_port = parseInt( process.env.PORT, 10) || 8080 // 80 requires sudo
l8.node_api_server( l8.http_port, "no credentials" )

// But behave as a client
require( "l8/lib/node_client.js" )
l8.node_api_client( "http://localhost:" + l8.http_port, "no credentials" )

// Let's create a task, blocking activities need a task.
l8.task( function(){
  
  // Open a file, truncated, write into it, close it, read content, check

  var fs
  var Buffer
  var fd

  l8.step( function ( ) {
    l8.require( "fs" );
  }).step( function (m) {
    l8.trace( "got fs" );
    fs = m;
    l8.require( "buffer" );
  }).step( function (m) {    
    l8.trace( "got buffer" );
    Buffer = m.Buffer;
    fs.open( "node.js.test_file.txt", "w" );
  }).step( function (f) {    
    l8.trace( "got fd" );
    fd = f;
    new Buffer( "Hello, world!", "utf8" );
  }).step( function (b) {    
    l8.trace( "got new buffer" );
    fs.write( fd, b, 0, b.length, null );
  }).step( function ( ) {
    l8.trace( "got buffer written" );
    fs.close( fd );
  }).step( function ( ) {    
    fs.readFile( "node.js.test_file.txt", "utf8" );
  }).step( function (r) {    
    l8.assert( r === "Hello, world!" );
    l8.trace( "test/node.js -- TEST SUCCESS");
    process.exit( 0 )
  }).failure( function (e) { 
    l8.trace( "test/node.js -- error", e, e.stack );
  })

}) // end of task

l8.countdown( 10 )

// test/parole.js
//   Run it on jsFiddle: http://jsfiddle.net/jhrobert/F52a9/
// 13/04/24 by JHR
// 14/01/04 by JHR

// This code can run locally or inside jsfiddle.net
var html = typeof document !== "undefined";

// In jsfiddle, whisper.js is included by the HTML page & defines Parole
var P = html ? Parole : require("l8/lib/whisper");


var syncsched = function (f) {
    try {
        f();
    } catch (er) {}
};

//P.scheduler( syncsched ); // Sync, but buffered
//P.scheduler( "sync" );    // Sync mode.
//P.scheduler();            // Restore default async mode.


// format as <h1>...</h1> if html or else as *** ... ***
function h1(msg) {
    return html ? "<h1>" + msg + "</h1>" : "*** " + msg + " ***";
}

// Basic output display buffer
var log_buffer = [];

// Displays its parameters with ", " between them
function log() {
    var msg = Array.prototype.slice.call(arguments).join(", ");
    if( msg !== "OK" ){
      log_buffer.push(Array.prototype.slice.call(arguments).join(", "));
    }
    if (!html) {
        console.log(msg);
        return msg;
    }
    var id = document.getElementById("log");
    var txt = log_buffer.join("<br>");
    id.innerHTML = txt;
    return msg;
}

log("Starting Parole test");
log("Hello world! This is about Parole, a new (may 2013) flow control toolkit");
log("<a href='http://github.com/JeanHuguesRobert/l8/wiki/ParoleReference'>github.com/JeanHuguesRobert/l8</a>");
log();

// Make a new curried logger function that is similar to log() but with a msg prefix
function clog( msg ) {
  return log.bind( null, msg );
}

var count_tests = 0;
var count_fails = 0;

// Describes the expected output, checks that the actual output matches the
// expected one.
// Note: this is ok for sync mode only. For async mode, where multiple threads
// of output exits, something fancier is needed.
// ToDo: reuse test/suite.js similar stuff.
function shows() {
    var args = Array.prototype.slice.call(arguments).reverse();
    var ii = 0;
    var len = args.length;
    while (ii < len) {
        var output = log_buffer[log_buffer.length - ii - 1];
        var expected = args[ii];
        count_tests++;
        if (output.indexOf(expected) === -1) {
            count_fails++;
            log("!!! Not OK, expected: '" + expected + "', found: '" + output + "'");
            return;
        }
        ii++;
    }
    log( "OK" );
}

function assert(x) {
    try {
        console.assert(x);
    } catch (err) {
        log("TEST FAILED: ", err, err.stack);
        throw err;
    }
}

function trace(msg) {
    log.apply(this, arguments);
    return msg;
}

var p_general = P();
try {

    var p;
    var p2;
    var p3;
    

    log(h1("Callbacks"));

    p = P().on(clog("Listener 1"));
    p("I am a callback");
    shows("Listener 1, I am a callback");
    p("I am another callback");
    shows("Listener 1, I am another callback");
    p.on(clog("Listener 2"));
    // => nothing
    p("I am yet another callback");
    shows("Listener 2, I am yet another callback");
    p.fill("Some filled news", "...");
    shows("Listener 2, Some filled news, ...");
    p.resolve("Some resolved news", "...");
    // eqv p.fill( null, xxx ), please note , , in output, due to "null" first result
    shows("Listener 2, , Some resolved news, ...");
    p.resolve("Some more resolved news", "...");
    shows("Listener 2, , Some more resolved news, ...");
    p.reject("Some error news", "...");
    shows("Listener 2, Some error news, ...");
    p.reject("Some more error news", "...");
    shows("Listener 2, Some more error news, ...");
    p("Ready");
    shows("Listener 2, Ready");
    

    log(h1("Subscribers"));

    //p = P(); not a a new parole, previous listener is still active
    p.subscribe(clog("Subscriber 1"));
    shows("Subscriber 1, Ready");
    p.subscribe(clog("Subscriber 2"));
    shows("Subscriber 2, Ready");
    p("Some published news", "...");
    shows("Listener 2, Some published news, ...",
        "Subscriber 1, Some published news, ...",
        "Subscriber 2, Some published news, ...");
    p("Some more cool news", "...");
    shows("Listener 2, Some more cool news, ...",
        "Subscriber 1, Some more cool news, ...",
        "Subscriber 2, Some more cool news, ...");

    p = P();
    log(".");
    p.subscribe(clog("Subscriber 1"));
    p("Some published news", "...");
    shows("Subscriber 1, Some published news, ...");
    p.subscribe(clog("Subscriber 2"));
    shows("Subscriber 2, Some published news, ...");
    p("Some more news", "...");
    shows("Subscriber 1, Some more news, ...",
        "Subscriber 2, Some more news, ...");
        

    log(h1("Chains of steps"));

    p = P();
    P.scheduler("sync");
    p.will(function () {
        this(log("First will step"));
        shows();
    }).will(function () {
        this(log("Second will step"), "it is final");
    }).on(clog("Chain results"));
    shows("First will step",
        "Second will step",
        "Chain results, Second will step, it is final");

    P.scheduler("sync"); // Forced sync mode, useful for test, bad for deep stacks
    

    log(h1("Fork/Join"));
    
    p = P();
    p.fork( function(){
      this( "fork 1" );
    }).fork( function(){
      this( "fork 2" );
    }).fork( function(){
      this( "fork 3" );
    }).will( function( _, results ){
      log( results );
      shows( "fork 1,fork 2,fork 3" );
    });
    p();


    log(h1("Generators"));

    var fibonacci = P.generator(function () {
        var i = 0,
            j = 1;
        this.will(function () {
            var tmp = i;
            i = j;
            j += tmp;
            this.yield(tmp);
        }).will(function () {
            this.jump();
        });
    });
    var gen = fibonacci();
    gen(clog("1 gen"));
    shows("1 gen, 0");
    gen(clog("2 gen"));
    shows("2 gen, 1");
    gen(clog("3 gen"));
    shows("3 gen, 1");
    gen(clog("4 gen"));
    shows("4 gen, 2");
    gen(clog("5 gen"));
    shows("5 gen, 3");
    gen(clog("6 gen"));
    shows("6 gen, 5");
    gen(clog("7 gen"));
    shows("7 gen, 8");


    log(h1("Async functions"));

    var async_done_count = 0;

    function async_done(p) {
        log(p + " and result delivered");
        if (++async_done_count === 3) {
            log("3 async calls done");
        }
    }
    var async_f = P.define(function (p) {
        this.will(function () {
            log(p);
            shows("Async parameter");
            this(p);
        }).will(function (p) {
            log("Second step, " + p);
            shows("Second step, Async parameter");
            this(p + " processed");
        })
    })
    async_f("Async parameter", async_done);
    async_f("Async parameter", async_done);
    async_f("Async parameter", async_done);
    shows("Async parameter processed and result delivered",
        "3 async calls done");


    log(h1("Pipes"));

    function transform1(input, callback) {
        callback("*" + input + "*");
    }

    function transform2(input, callback) {
        callback("!" + input + "!");
    }

    var pipe1 = P.from().will(function (input) {
        transform1(input, this);
    }).pipe();

    var pipe2 = P.from().will(function (input) {
        transform2(input, this);
    }).pipe();

    pipe1.pipe(pipe2).pipe(function (output) {
        log(output);
    });
    pipe1("Hello")("World");
    shows("!*Hello*!", "!*World*!");


    log(h1("Promises"));

    p = P();
    log(".");
    p.then(clog("resolve() Success"));
    p.resolve();
    shows("Success,");

    p = P();
    log(".");
    p.then(clog("p() Success"));
    p();
    shows("Success,");

    p = P();
    log(".");
    p.then(null, clog("reject() Failure"));
    p.reject();
    shows("Failure,");

    p = P();
    log(".");
    p.then(null, clog("p() Failure"));
    p(!false);
    shows("Failure, true");

    p = P();
    log(".");
    p.then(null,function(e){ throw e;})
    .then( null, clog("p() thrown failure"));
    p( "error!" )
    shows("thrown failure, error!")

    p = P();
    log(".");
    p.then(clog("when() Success"));
    p.when("Now");
    shows("Success, Now");

    p = P();
    log(".");
    p.then(clog("when() Success"));
    p2 = P();
    p.when(p2);
    p2.resolve("Later");
    shows("Success, Later");

    p = P();
    log(".");
    p.then(clog("when() Success"));
    p2 = P();
    p3 = P();
    p.when(p2, p3);
    p2.resolve("First");
    p3.resolve("Last");
    shows("Success, First,Last");
    // Please note that First,Last is an array, there is no space after the comma

    p = P();
    log(".");
    p.then(null, clog("when() Failure"));
    p2 = P();
    p3 = P();
    p.when(p2, p3);
    p2.resolve("First");
    p3.reject("Last");
    shows("Failure, Last");

    p = P();
    log(".");
    p.then(null, clog("reject() Failure"));
    p2 = p.upgrade("Upgraded");
    p2.then(clog("upgrade() Success"));
    p.reject("Error");
    shows("Failure, Error", "Success, Upgraded");

    p = P();
    log(".");
    p.then(clog("and() Success"));
    p2 = P();
    p3 = P();
    p.and(p2, p3);
    p3.resolve("p3 First");
    p2.resolve("p2 Last");
    shows("Success, p2 Last");

    p = P();
    log(".");
    p.then(clog("and() Success"));
    p2 = P();
    p3 = P();
    p.and(p2, p3);
    p2.resolve(false);
    shows("Success, false");

    p = P();
    log(".");
    p.then(clog("or() Success"));
    p2 = P();
    p3 = P();
    p.or(p2, p3);
    p3.resolve("p3 First");
    shows("Success, p3 First");

    p = P();
    log(".");
    p.then(null, clog("or() Failure"));
    p2 = P();
    p3 = P();
    p.or(p2, p3);
    p3.reject("p3 First");
    shows("Failure, p3 First");

    p = P();
    log(".");
    p.then(clog("not(f) Success"));
    p2 = P();
    p.not(p2);
    p2.resolve(false);
    shows("Success, true");

    p = P();
    log(".");
    p.then(clog("not(t) Success"));
    p2 = P();
    p.not(p2);
    p2.resolve(true);
    shows("Success, false");

    p = P();
    log(".");
    p.then(clog("not(t, t) Success"));
    p2 = P();
    p3 = P();
    p.not(p2, p3);
    p2.resolve(true);
    p3.resolve(true);
    shows("Success, false");

    p = P();
    log(".");
    p.then(clog("not(t, f) Success"));
    p2 = P();
    p3 = P();
    p.not(p2, p3);
    p2.resolve(true);
    p3.resolve(false);
    shows("Success, false");

    p = P();
    log(".");
    p.then(clog("not(f, f) Success"));
    p2 = P();
    p3 = P();
    p.not(p2, p3);
    p2.resolve(false);
    p3.resolve(false);
    shows("Success, true");

    p = P();
    log(".");
    p.then(clog("nand(f) Success"));
    p2 = P();
    p.nand(p2);
    p2.resolve(false);
    shows("Success, true");

    p = P();
    log(".");
    p.then(clog("nand(t) Success"));
    p2 = P();
    p.nand(p2);
    p2.resolve(true);
    shows("Success, false");

    p = P();
    log(".");
    p.then(clog("nand(t, t) Success"));
    p2 = P();
    p3 = P();
    p.nand(p2, p3);
    p2.resolve(true);
    p3.resolve(true);
    shows("Success, false");

    p = P();
    log(".");
    p.then(clog("nand(t, f) Success"));
    p2 = P();
    p3 = P();
    p.nand(p2, p3);
    p2.resolve(true);
    p3.resolve(false);
    shows("Success, true");

    p = P();
    log(".");
    p.then(clog("nand(f, f) Success"));
    p2 = P();
    p3 = P();
    p.nand(p2, p3);
    p2.resolve(false);
    p3.resolve(false);
    shows("Success, true");

    log(".");
    p = P.collect("A", P("B"), "C", P("D")).then(clog("collect() Success"));
    shows("Success, A,B,C,D");
    // Note: A,B,C,D is an array

    p_general.resolve("general test done");

} catch (err) {
    p_general.reject(err);
    log(err);
}

var timeout;
setTimeout(timeout = P());
timeout.on(function () {
    log("Queued start");
});



// Test loops

var loop_done = false;
var label1;
var label2;
var p_loop = p = P().will(function () {
    log("Entering outer loop");
    label1 = this(3);
}).will(function (n_out) {
    log("Entering inner loop for outer loop " + n_out);
    label2 = this(n_out, 5);
}).will(function (n_out, n_in) {
    log("Inner loop " + n_in--+" inside outer loop " + n_out);
    if (n_in) return this.jump(label2, n_out, n_in);
    this(n_out);
}).will(function (n_out) {
    if (--n_out) return this.jump(label1, n_out);
    this.resolve("p_loop done");
});

p.then(function (r) {
    log("Loop " + (loop_done = r));
    assert(r = "p_loop done");
});

// Test chains

var p_start = P();
p = p_start.from().will(function (start) {
    log("start: " + start);
    setTimeout(this, 1000);
}).will(function () {
    log("first next ");
    this.timeout(1000);
}).will(function (err) {
    log("second next: " + err);
    assert(err && err.name === "ParoleTimeout");
    this(null, "hello", "world!");
}).will(function (err, hello, world) {
    log("third next: ", err, hello, world);
    this.each(["hello", "world!"]);
}).will(function (err, hello_world) {
    log("4th next: ", err, hello_world[0], hello_world[1]);
    assert(!err);
    assert(hello_world[0] === "hello");
    assert(hello_world[1] === "world!");
    this.collect("hello", "world!");
}).wills(function (err, hello, world) {
    log("42th next: ", err, hello, world);
    assert(!err);
    assert(hello === "hello");
    assert(world === "world!");
    this.partial(null, "hello")("world!");
}).will(function (err, hello, world) {
    log("5th next: ", err, hello, world);
    assert(!err);
    assert(hello === "hello");
    assert(world === "world!");
    this.conclude(null, "p_start DONE");
}).will(function skipped_step(err) {
    log("!!! unexpected skipped step !!! ", err);
    throw "Parole error";
}).then(function done(ok) {
    log("done: " + ok);
    assert(ok === "p_start DONE");
    var p = P();
    setTimeout(p, 1000);
    return p;
}).then(function () {
    return log("Chain is very done");
}, function () {
    log("Unexpected error");
    process.exit(1);
});

p.then(function () {
    log("END");
}).then(function () {
    throw "ERR1";
}).then().then(null, function (err) {
    log("Expected error: ", err);
    assert(err === "ERR1");
    return "OK";
}).then(function (ok) {
    log("ok: ", ok);
    assert(ok === "OK");
    throw "ERR2";
}).then(null, function (err) {
    log("Expected error 2: ", err);
    assert(err === "ERR2");
    assert(loop_done === "p_loop done");
});

p_start.from("start");


// Test generators

var succ = P.generator(function (seed, increment) {
    this.will(

    function (new_inc) {
        if (new_inc) {
            log("Succ increment changed to " + new_inc)
            increment = new_inc;
        }
        var current = seed;
        seed += increment;
        this.yield(current);
    }).will(function (new_inc) {
        this.jump(new_inc);
    });
});

var logged_succ;
var log_succ = P.define(function () {
    this.will(function (msg) {
        logged_succ = msg;
        this(msg)
    }).will(function (msg) {
        log("Succ: " + msg);
        this();
    })
});

var succ_exp = succ(5, 10);
succ_exp(10, log_succ); // outputs 5, change increment
succ_exp(100, log_succ); // outputs 15, change increment
succ_exp(log_succ); // outputs 115, don't change increment
succ_exp(log_succ); // outputs 215

//P.scheduler("sync"); // Forced sync mode, useful for test, bad for deep stacks
var p_fibonacci = P();
var fibonacci = P.generator(function () {
    var i = 0,
        j = 1;
    this.will(function () {
        var tmp = i;
        i = j;
        j += tmp;
        this.yield(tmp);
    }).will(function () {
        this.jump();
    });
});
var gen = fibonacci();
gen(log.bind(null, "1 gen"));
gen(log.bind(null, "2 gen"));
gen(log.bind(null, "3 gen"));
gen(log.bind(null, "4 gen"));
gen(log.bind(null, "5 gen"));
gen(log.bind(null, "6 gen"));
gen(function () {
    p_fibonacci.resolve();
});

var fib = P.generator(function () {
    var i = 0,
        j = 1;
    this.will(function () {
        var tmp = i;
        i = j;
        j += tmp;
        this.yield(0, tmp);
    }).will(function (hint) {
        log("fib next, hint: " + hint);
        this.jump();
    });
});
var fib_loop;
var fibo = fib();
var p_fib = p.then(function () {
    log("Branch");
}).will(function () {
    fib_loop = this;
    this(10);
}).will(function (n) {
    if (!n) return this.conclude();
    fibo("some hint " + n, this.partial(n - 1));
}).will(function (n, err, r) {
    log("nth: " + n + " fib: " + r);
    this.jump(fib_loop, n);
}).then(

function () {
    log("Branch done");
    return "p_fib done";
},

function (err) {
    log("Unexpected error in fib: " + err, err.stack);
});

// Test pipes

var log_pipe = P.from().will(function (msg) {
    log(msg);
    this(msg);
}).pipe();

var p_log = p.then(function () {
    log("Another Branch");
    shows("Another Branch");
    log_pipe("Direct call to log_pipe()");
    return log_pipe.from("From() call").upgrade("Done");
}).then(

function (done) {
    log("Another Branch: " + done);
    assert(done === "Done");
    shows("Another Branch: Done");
    return "p_log done";
},

function (err) {
    log("Another Branch, unexpected err: " + err);
    assert(false);
});

// Test collect and collect results

var all = [p_general, p_loop, p_start, p_log, p_fibonacci, p_fib];
P.each(P.collect, all).then(

function (results) {
    P.schedule(function () {
        assert(logged_succ === 215);
        log("TEST results", results);
        shows("TEST results, general test done,p_loop done,,p_start DONE,p_fib done,p_log done");
        log("More than " + count_tests + " tests");
        if (count_fails) {
            log("!!! " + count_fails + " failures");
            process.exit(1);
        }
        log("test/parole.js -- TEST SUCCESS");
        process.exit(0);
    });
},

function (err) {
    log("Unexpected promise failure: " + err, err.stack);
});


if (!html) {
    var l8 = require("l8/lib/l8.js");
    l8.countdown(10);
}
// promise.js
//   adapter for promises-aplus/promises-tests
// See https://github.com/promises-aplus/promises-tests

var Parole = require( "l8/lib/whisper" );

module.exports.deferred = function(){
  var p = Parole();
  return {
    promise: p,
    resolve: function( v ){ return p.resolve( v ); },
    reject:  function( r ){ return p.reject(  r ); }
  };
};

// If debugging
if( 0 ){
  var promisesAplusTests = require("promises-aplus-tests");
  // The "unfunk" reporter is TTY friendly, ie not funky
  require( "mocha-unfunk-reporter" );
  promisesAplusTests(
    module.exports,
    // Please change the grep expression to match the target test to debug
    { reporter: "mocha-unfunk-reporter", grep: "" },
    function (err) {}
  );
}
/*
 *  l8 test suite
 */

"use strict";

var l8 = require( "l8/lib/l8" )
require( "l8/lib/transpiler"  )
require( "l8/lib/call"        )
require( "l8/lib/selector"    )
require( "l8/lib/aggregator"  )
require( "l8/lib/timeout"     )
require( "l8/lib/generator"   )
require( "l8/lib/semaphore"   )
require( "l8/lib/signal"      )
require( "l8/lib/queue"       )
require( "l8/lib/mutex"       )
require( "l8/lib/lock"        )
require( "l8/lib/parole"      )

/* ----------------------------------------------------------------------------
 *  Tests
 */

var trace = l8.trace
var bug   = trace
var de    = true
l8.debug( true)
l8.logger( function(){ return function(){} } )
l8.trace( "SILENT TRACE" )
l8.logger( null )
l8.trace( "L8 TEST SUITE" )

var test // current test id

  var traces = []
  function t(){
    if( traces.length > 200 ){
      trace( "!!! too many traces, infinite loop? exiting...")
      process.exit( 1)
    }
    var buf = ["test" + (test ? " " + test : ""), "" + l8.current.currentStep]
    for( var ii = 0 ; ii < arguments.length ; ii++ ) buf.push( arguments[ii])
    buf = trace.apply( this, buf)
    traces.push( buf)
    return buf
  }

  function check(){
    var ii = 0
    var msg
    var tt = 0
    var tmsg
    while( ii < arguments.length ){
      msg = arguments[ii++]
      while( true ){
        tmsg = traces[tt]
        if( tmsg && tmsg.indexOf( msg) >= 0 )break;
        if( ++tt >= traces.length ){
          msg = "FAILED test " + test + ", missing trace: " + msg
          trace( msg)
          for( var jj = 0 ; jj < ii ; jj++ ){
            trace( arguments[jj])
          }
          traces = []
          throw new Error( msg)
        }
      }
    }
    trace( "Test " + test, "PASSED")
    traces = []
  }

  var test_1 = function test1(){
    test = 1
    t( "go")
    l8.begin
      .step(  function(){ t( "start")      })
      .step(  function(){ t( "step")       })
      .step(  function(){ t( "sleep")
                          this.sleep( 100)
                          t( "sleeping")   })
      .step(  function(){ t( "sleep done") })
      .failure( function( e ){ t( "!!! unexpected failure", e) })
      .final( function(){ t( "final")
        check( "start",
               "step",
               "sleep",
               "sleeping",
               "sleep done",
               "final"
        )
        test_2()
      })
    .end
  }

  var test_2 = l8.Task( function test2(){
    test = 2; this
    .step(  function(){ t( "start")               })
    .step(  function(){ setTimeout( this.walk, 0) })
    .step(  function(){ t( "sleep/timeout done")  })
    .failure( function( e ){ t( "unexpected failure", e) })
    .final( function(){ t( "final")
      check( "start",
             "sleep/timeout done",
             "final"
      )
      test_3()
    })
  })

  var test_3 = l8.Task( function test3(){
    test = 3; this
    .step(    function(){ t( "start")             })
    .step(    function(){ t( "add step 1"); this
      .step(  function(){   t( "first step")  })
                          t( "add step 2"); this
      .step(  function(){   t( "second step") })  })
    .step(    function(){ t("third & final step") })
    .success( function(){ t("success")            })
    .failure( function( e ){ t( "unexpected failure", e) })
    .final(   function(){ t( "final")
      check( "start",
             "success",
             "final"
      )
      test_4()
    })
  })

  var test_4 = l8.Task( function test4(){
    test = 4; this
    .step(    function(){ t( "start")                    })
    .step(    function(){ t( "raise error")
                          throw new Error( "step error") })
    .step(    function(){ t("!!! skipped step")          })
    .failure( function(){ t("error raised", this.error)  })
    .final(   function(){ t( "final")
      check( "start",
             "error raised",
             "final"
      )
      test_5()
    })
  })

  var test_5 = l8.Task( function test5(){
    test = 5; t( "start"); this
    .fork(    function(){ this.label = t( "fork 1"); this
      .step(  function(){ this.sleep( 10)       })
      .step(  function(){ t( "end fork 1")      })        })
    .fork(    function(){ this.label = t( "fork 2"); this
      .step(  function(){ this.sleep( 5)        })
      .step(  function(){ t( "end fork 2")      })        })
    .step(    function(){ t( "joined")          })
    .fork(    function(){ this.label = t( "fork 3"); this
      .step(  function(){ this.sleep( 1)        })
      .final( function(){ t( "final of fork 3") })        })
    .fork(    function(){ this.label = t( "fork 4"); this
      .final( function(){ t( "final of fork 4") })        })
    .step(    function(){ t( "joined again") })
    .failure( function( e ){ t( "unexpected failure", e)  })
    .final(   function(){ t( "final")
      check( "start",
             "fork 1",
             "fork 2",
             "end fork 2",
             "end fork 1",
             "joined",
             "fork 3",
             "fork 4",
             "final of fork 4",
             "final of fork 3",
             "joined again",
             "final"
      )
      test_6()
    })
  })

  var test_6 = l8.Task( function test6(){
    function other1(){ l8.step( function(){ t( "in other1")} )}
    function other2(){ l8.fork( function(){ t( "in other2")} )}
    test = 6; this
    .step(  function(){ other1(); t( "other1() called")        })
    .step(  function(){ t( "other1 result", this.result); this
                        other2(); t( "other2() called")        })
    .step(  function(){ t( "other2 result", this.result)       })
    .failure( function( e ){ t( "unexpected failure", e) })
    .final( function(){ t( "final result", this.result)
      check( "other1() called",
             "in other1",
             "other1 result",
             "other2() called",
             "in other2",
             "other2 result",
             "final result"
      )
      test_7()
    })
  })

  var test_7 = l8.Task( function test7(){
    test = 7
    var ii; this
    .step(   function(){ t( "simple, times", ii = 3)     })
    .repeat( function(){ t( "repeat simple step", ii)
                         if( --ii === 0 ){
                           t( "break simple repeat")
                           this.break
                         }                               })
    .step(   function(){ t( "simple repeat done")        })
    .step(   function(){ t( "sleep, times", ii = 2)      })
    .repeat( function(){ this
      .step( function(){   t( "repeat sleep", ii)
                           this.sleep( 1)                })
      .step( function(){   t( "done sleep", ii)          })
      .step( function(){   if( --ii === 0 ){
                             t( "break sleep repeat")
                             this.break
                           }                          }) })
    .step(   function(){ t( "done ")                     })
    .failure( function( e ){ t( "unexpected failure", e) })
    .final(  function(){ t( "final result", this.result)
      check( "simple, times",
             "repeat simple step",
             "break simple repeat",
             "simple repeat done",
             "sleep, times",
             "done sleep",
             "break sleep repeat",
             "done",
             "final result"
      )
      test_8()
    })
  })

  // l8.compile() needs to be provided a well scoped "eval()" or else it's result
  // function would lack access to the global variables referenced by the code to
  // (re)compile.
  l8.eval = function( expr ){ return eval( expr) }

  var test_8 = l8.compile( function xx(){
    test = 8
    var f1 = l8.Task( function( p1, p2 ){
      t( "p1", p1, "p2", p2)
      return [p1,p2]
    })
    step;
      t( "pass parameter, get result");
      f1( "aa", "bb")
    step( r );
      t( "both", r.join( "+"))
      f1( "11", "22")
    step( a, b ); t( "a", a, "b", b)
    fork; return "f1"
    fork; return "f2"
    step( f1, f2 ); t( "f1", f1, "f2", f2)
    fork; f1( "hello", "world")
    fork; f1( "keep calm", "carry on")
    step( h, k ); t( h.join( "! "), k.join( "? "))
    failure( e ); t( "unexpected error", e)
    final; check(
      "p1, aa, p2, bb",
      "both, aa+bb",
      "a, 11, b, 22",
      "f1, f1, f2, f2",
      "hello! world, keep calm? carry on"
    )
    test_9()
  })

  var test_9 = l8.Task( function(){
    test = 9
    var fibonacci = function(){
      var i = 0, j = 1;
      repeat; begin
        t( "yield", i)
        this.yield( i);
        var tmp = i;
        i  = j;
        j += tmp;
      end
      step; t( "producer done")
      failure( e ); t( "fib, unexpected error", e)
    }
    fibonacci = l8.compileGenerator( fibonacci)
    var gen = fibonacci()
    var count_down = 10
    this.repeat( function(){
      this.step( function(   ){
        if( !count_down-- ) this.break
        gen.next()
      }).step( function( r ){
        t( count_down, "fibo", r)
      })
    }).step( function(){
      t( "consumer done")
    }).failure( function( e ){ t( "unexpected error", e)
    }).final( function(){
      check(
        "fibo, 1",
        "fibo, 1",
        "fibo, 2",
        "fibo, 3",
        "fibo, 5",
        "fibo, 8",
        "fibo, 13",
        "fibo, 21",
        "fibo, 34",
        "yield, 55",
        "consumer done"
      )
      test_10()
    })
  })

  var test_10 = l8.Task( function(){
    test = 10
    var inner = l8.Task( function(){
      innerer( this)
      this.step(    function(      ){ t( "!!! Unexpected step in inner()")})
      this.success( function( r    ){ t( "inner success", r) })
      this.final(   function( e, r ){ t( "inner final", e, r) })
    })
    var innerer = l8.Task( function( ret ){
      innerest( ret)
      this.step(    function(      ){ t( "!!! Unexpected step in innerer()")})
      this.success( function( r    ){ t( "innerer success", r) })
      this.final(   function( e, r ){ t( "innerer final", e, r) })
    })
    var innerest = l8.Task( function( ret ){
      this.final(   function( e, r ){ t( "innerest final", e, r) })
      ret.return( "From innerest")
      this.step(    function(      ){ t( "!!! Unexpected step in innerer()")})
      this.success( function( r    ){ t( "!!! Unexpected success", r) })
    })
    this
    .step(    function(   ){ t( "inner()")             })
    .step(    function(   ){ inner()                   })
    .step(    function( r ){ t( "return", r)           })
    .failure( function( e ){ t( "Unexpected error", e) })
    .final(   function(   ){
      check(
        "inner()",
        "innerest final, From innerest",
        "innerer success, From innerest",
        "innerer final, From innerest",
        "inner success, From innerest",
        "inner final, From innerest",
        "return, From innerest"
      )
      test_11()
    })
  })

  var test_11 = l8.Task( function(){
    test = 11
    // Let's compare the speed, first "classical" style, using callbacks
    function recur( n, next ){
      if( --n > 0 ){
        // Note: l8.tick() is about 20 times slower in chrome than in nodejs...
        l8.tick( function(){ recur( n, next) })
      }else{
        next()
      }
    }
    // And then l8 style, using steps
    var l8recur = l8.Task( function l8recur_task( n ){
      // No l8.tick() involved, l8 scheduler instead
      if( --n > 0 ){ l8recur( n) }
    })
    var now
    var n = 3
    var p = 10000 // 100000; sometimes, it si very very slow, browser issue?
    var factor = 2  // 50 by december 2012, 2 by feb 2013
    var ii          // 15 was average in nodejs initially.
    var duration    // 2013/02/03, 0,23 in Chrome, with browserify, 5 in cloud9
    var l8duration
    var tid
    var last_tid
    var was_debug = l8.debug()
    this
    .step( function(){ this.sleep( 1) })
    .step( function(){ now = l8.now; l8.debug( false) })
    .step( function(){
      var done = 0
      var task = this
      for( var ii = 0 ; ii < p ; ii++ ){
        l8.tick( function(){
          recur( n, function(){ if( ++done === p ) task.resume() })
        })
      }
      task.pause()
    })
    .step( function(){ this.sleep( 1) })
    .step( function(){
      duration = -1 + l8.now - now
      t( n * p, "times async recur()", duration, "millisecs")
    })
    .step( function(){ this.sleep( 1) })
    .step( function(){
      now = l8.now
      ii  = 0
      tid = l8.current.id
    })
    .repeat( function(){
      if( ii >= p / factor ) this.break
      l8recur( n)
      ii++
    })
    .step( function(){ this.sleep( 1) })
    .fork( function(){ last_tid = this.current.id } )
    .step( function(){
      l8.debug( was_debug )
      l8duration = (-1 + (l8.now - now)) * factor
      t( n * p, "times l8recur()", l8duration, "estimated millisecs")
      t( l8duration / duration, "times slower than if native")
      t( (n * p) / duration   * 1000, "native calls/sec")
      t( (n * p) / l8duration * 1000, "l8 calls/sec")
      t( (last_tid - tid) / l8duration * 1000 * factor, "l8 tasks/sec")
    })
    .failure( function( e ){ t( "!!! unexpected error", e) })
    .final( function(){
      check(
        "l8 calls/sec"
      )
      test_12()
    })
  })

  var test_12 = l8.Task( function(){
  try{
    test = 12
    var trace = function(){
      t( "Current task " + l8.current
      + " gets message '" + l8.get( "message")
      + "' from " + l8.binding( "message").task)
    }
    var subtask = function(){
      l8.label = "sub"
      l8.step( function(){ trace()                       })
      l8.step( function(){ l8.var( "message", "deeper")  })
      l8.step( function(){ l8.sleep( 100)                })
      l8.step( function(){ trace()                       })
    }
    l8.task( function(){
      l8.label = "main"
      l8.var( "message", "top")
      l8.spawn( subtask )
      l8.step( function(){ trace()                       })
      l8.step( function(){ l8.join()                     })
    })
    l8.failure( function( e ){ t( "!!! unexpected error", e) })
    l8.final( function(){
      check(
        "top",
        "top",
        "deeper"
      )
      test_last()
    })
  }catch( e ){ t( "!!! error " + e) }
  })

  var test_last = function(){
    trace( "SUCCESS!!! All tests ok")
    process.exit( 0)
  }

trace( "starting l8")
l8.countdown( 10)
test_1()
Error { [TypeError: Property 'delegations' of object [object Object] is not a function]
  stack: 'TypeError: Property \'delegations\' of object [object Object] is not a function\n    at Topic.add_delegation (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:2563:26)\n    at C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:3282:15\n    at Array.forEach (native)\n    at Function.update (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:3280:15)\n    at Function.app.error_traced (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:62:16)\n    at transform_call (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\lib\\water.js:623:24)\n    at Function.a_water (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\lib\\water.js:1036:17)\n    at try_apply (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\lib\\water.js:641:19)\n    at dispatch (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\lib\\water.js:590:11)\n    at update (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\lib\\water.js:718:5)' } TypeError: Property 'delegations' of object [object Object] is not a function
    at Topic.add_delegation (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:2563:26)
    at C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:3282:15
    at Array.forEach (native)
    at Function.update (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:3280:15)
    at Function.app.error_traced (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:62:16)
    at transform_call (C:\Users\jean__000\Documents\GitHub\l8\lib\water.js:623:24)
    at Function.a_water (C:\Users\jean__000\Documents\GitHub\l8\lib\water.js:1036:17)
    at try_apply (C:\Users\jean__000\Documents\GitHub\l8\lib\water.js:641:19)
    at dispatch (C:\Users\jean__000\Documents\GitHub\l8\lib\water.js:590:11)
    at update (C:\Users\jean__000\Documents\GitHub\l8\lib\water.js:718:5)
Activate delegation
Update on Vote.@jhr.hulot_president[@jhr/disagree], key:@jhr.hulot_president, update: Vote.@jhr.hulot_president
Error { [TypeError: Property 'propositions' of object [object Object] is not a function]
  stack: 'TypeError: Property \'propositions\' of object [object Object] is not a function\n    at C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:3419:36\n    at Array.forEach (native)\n    at Delegation.vote_on_tags (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:3416:15)\n    at Delegation.update_votes (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:3403:14)\n    at Function.update (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:3299:18)\n    at Function.app.error_traced (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:62:16)\n    at transform_call (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\lib\\water.js:623:24)\n    at Function.a_water (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\lib\\water.js:1036:17)\n    at try_apply (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\lib\\water.js:641:19)\n    at dispatch (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\lib\\water.js:590:11)' } TypeError: Property 'propositions' of object [object Object] is not a function
    at C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:3419:36
    at Array.forEach (native)
    at Delegation.vote_on_tags (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:3416:15)
    at Delegation.update_votes (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:3403:14)
    at Function.update (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:3299:18)
    at Function.app.error_traced (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:62:16)
    at transform_call (C:\Users\jean__000\Documents\GitHub\l8\lib\water.js:623:24)
    at Function.a_water (C:\Users\jean__000\Documents\GitHub\l8\lib\water.js:1036:17)
    at try_apply (C:\Users\jean__000\Documents\GitHub\l8\lib\water.js:641:19)
    at dispatch (C:\Users\jean__000\Documents\GitHub\l8\lib\water.js:590:11)
Remove vote Vote.@jhr.hulot_president[@jhr/disagree] previously disagree of Persona.@jhr[@jhr] via @jhr.@n_hulot.#president from proposition Topic.hulot_president[hulot_president]
Add vote Vote.@jhr.hulot_president[@jhr/neutral] now neutral of Persona.@jhr[@jhr] via direct for proposition Topic.hulot_president[hulot_president]
  Total for Result.10855[hulot_president] is: 2 was: 3 direct: 2
  Against about Result.10855[hulot_president] is: 1 was: 2
  Win about Result.10855[hulot_president] is: false was: false
  Computing orientation for Result.10855[hulot_president] expired: false agree: 1 against: 1 protest: 0 blank: 0
  Computed orientation Result.10855[hulot_president] was: disagree is: disagree

Change.process, invoke create on ProtoTopic.12 p: { label: '#jhr', id: 10044, ts: 1401379239109 }
Key for new Topic.#jhr[#jhr] is: #jhr
Key for new Result.10868 is: #jhr
  Total for Result.10868[#jhr] is: 0 was: undefined direct: 0
  Against about Result.10868[#jhr] is: 0 was: undefined
  Win about Result.10868[#jhr] is: false was: undefined
  Computing orientation for Result.10868[#jhr] expired: false agree: 0 against: 0 protest: 0 blank: 0
  Computed orientation Result.10868[#jhr] was: neutral is: neutral

Change.process, invoke create on ProtoTopic.12 p: { label: 'n_hulot',
  tags: [ '#president', '#jhr' ],
  id: 10045,
  ts: 1401379239109 }
Key for new Topic.n_hulot[n_hulot] is: n_hulot
Key for new Result.10869 is: n_hulot
  Total for Result.10869[n_hulot] is: 0 was: undefined direct: 0
  Against about Result.10869[n_hulot] is: 0 was: undefined
  Win about Result.10869[n_hulot] is: false was: undefined
  Computing orientation for Result.10869[n_hulot] expired: false agree: 0 against: 0 protest: 0 blank: 0
  Computed orientation Result.10869[n_hulot] was: neutral is: neutral
Missing .propositions for tag Topic.#president[#president] { id: '#president',
  key: '#president',
  timestamp: 1401374801375,
  time_touched: 1401374801375,
  duration: 31536000000,
  expire: 1432910801375,
  label: '#president',
  name: '#president',
  result: false }
l8/test/vote.js, assert errorundefined
Could not process change { t: 'Topic',
  p: 
   { label: 'n_hulot',
     tags: [ '#president', '#jhr' ],
     id: 10045,
     ts: 1401379239109 },
  to: 'n_hulot' } { [TypeError: Property 'propositions' of object [object Object] is not a function]
  stack: 'TypeError: Property \'propositions\' of object [object Object] is not a function\n    at Topic.add_proposition (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:2480:19)\n    at C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:2189:11\n    at Array.forEach (native)\n    at new Topic (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:2184:18)\n    at Topic.ctor.create.sub_proto.create [as create] (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:723:18)\n    at Object.Change.process (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:1109:32)\n    at Function.<anonymous> (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:1645:37)\n    at try_call (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\lib\\water.js:636:19)\n    at Function.<anonymous> (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\lib\\water.js:1590:16)\n    at transform_call (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\lib\\water.js:623:24)' } TypeError: Property 'propositions' of object [object Object] is not a function
    at Topic.add_proposition (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:2480:19)
    at C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:2189:11
    at Array.forEach (native)
    at new Topic (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:2184:18)
    at Topic.ctor.create.sub_proto.create [as create] (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:723:18)
    at Object.Change.process (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:1109:32)
    at Function.<anonymous> (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:1645:37)
    at try_call (C:\Users\jean__000\Documents\GitHub\l8\lib\water.js:636:19)
    at Function.<anonymous> (C:\Users\jean__000\Documents\GitHub\l8\lib\water.js:1590:16)
    at transform_call (C:\Users\jean__000\Documents\GitHub\l8\lib\water.js:623:24)

Change.process, invoke create on ProtoTopic.12 p: { label: '#bar', id: 10046, ts: 1401379362740 }
Key for new Topic.#bar[#bar] is: #bar
Key for new Result.10870 is: #bar
  Total for Result.10870[#bar] is: 0 was: undefined direct: 0
  Against about Result.10870[#bar] is: 0 was: undefined
  Win about Result.10870[#bar] is: false was: undefined
  Computing orientation for Result.10870[#bar] expired: false agree: 0 against: 0 protest: 0 blank: 0
  Computed orientation Result.10870[#bar] was: neutral is: neutral

Change.process, invoke create on ProtoTopic.12 p: { label: 'Cyrnea_is_the_best',
  tags: [ '#jhr', '#bar' ],
  id: 10047,
  ts: 1401379362740 }
Key for new Topic.cyrnea_is_the_best[Cyrnea_is_the_best] is: cyrnea_is_the_best
Key for new Result.10871 is: cyrnea_is_the_best
  Total for Result.10871[Cyrnea_is_the_best] is: 0 was: undefined direct: 0
  Against about Result.10871[Cyrnea_is_the_best] is: 0 was: undefined
  Win about Result.10871[Cyrnea_is_the_best] is: false was: undefined
  Computing orientation for Result.10871[Cyrnea_is_the_best] expired: false agree: 0 against: 0 protest: 0 blank: 0
  Computed orientation Result.10871[Cyrnea_is_the_best] was: neutral is: neutral

Change.process, invoke create on ProtoTopic.12 p: { label: '#best', id: 10048, ts: 1401379402156 }
Key for new Topic.#best[#best] is: #best
Key for new Result.10872 is: #best
  Total for Result.10872[#best] is: 0 was: undefined direct: 0
  Against about Result.10872[#best] is: 0 was: undefined
  Win about Result.10872[#best] is: false was: undefined
  Computing orientation for Result.10872[#best] expired: false agree: 0 against: 0 protest: 0 blank: 0
  Computed orientation Result.10872[#best] was: neutral is: neutral

Change.process, invoke create on ProtoTopic.12 p: { label: 'Rex_is_the_best',
  tags: [ '#jhr', '#bar', '#best' ],
  id: 10049,
  ts: 1401379402156 }
Key for new Topic.rex_is_the_best[Rex_is_the_best] is: rex_is_the_best
Key for new Result.10873 is: rex_is_the_best
  Total for Result.10873[Rex_is_the_best] is: 0 was: undefined direct: 0
  Against about Result.10873[Rex_is_the_best] is: 0 was: undefined
  Win about Result.10873[Rex_is_the_best] is: false was: undefined
  Computing orientation for Result.10873[Rex_is_the_best] expired: false agree: 0 against: 0 protest: 0 blank: 0
  Computed orientation Result.10873[Rex_is_the_best] was: neutral is: neutral

Change.process, invoke create on ProtoTagging.13 p: { proposition: 'cyrnea_is_the_best',
  tags: [ '#jhr', '#best', '#bar' ],
  id: 10050,
  ts: 1401379423268 }

Change.process, invoke create on ProtoTopic.12 p: { label: '#cool', id: 10051, ts: 1401379432387 }
Key for new Topic.#cool[#cool] is: #cool
Key for new Result.10874 is: #cool
  Total for Result.10874[#cool] is: 0 was: undefined direct: 0
  Against about Result.10874[#cool] is: 0 was: undefined
  Win about Result.10874[#cool] is: false was: undefined
  Computing orientation for Result.10874[#cool] expired: false agree: 0 against: 0 protest: 0 blank: 0
  Computed orientation Result.10874[#cool] was: neutral is: neutral

Change.process, invoke create on ProtoTopic.12 p: { label: 'chloe_is_the_best',
  tags: [ '#jhr', '#best', '#cool' ],
  id: 10052,
  ts: 1401379432387 }
Key for new Topic.chloe_is_the_best[chloe_is_the_best] is: chloe_is_the_best
Key for new Result.10875 is: chloe_is_the_best
  Total for Result.10875[chloe_is_the_best] is: 0 was: undefined direct: 0
  Against about Result.10875[chloe_is_the_best] is: 0 was: undefined
  Win about Result.10875[chloe_is_the_best] is: false was: undefined
  Computing orientation for Result.10875[chloe_is_the_best] expired: false agree: 0 against: 0 protest: 0 blank: 0
  Computed orientation Result.10875[chloe_is_the_best] was: neutral is: neutral

Change.process, invoke create on ProtoTopic.12 p: { label: 'JanekIsTheBest',
  tags: [ '#jhr', '#best', '#cool' ],
  id: 10053,
  ts: 1401379442883 }
Key for new Topic.janekisthebest[JanekIsTheBest] is: janekisthebest
Key for new Result.10876 is: janekisthebest
  Total for Result.10876[JanekIsTheBest] is: 0 was: undefined direct: 0
  Against about Result.10876[JanekIsTheBest] is: 0 was: undefined
  Win about Result.10876[JanekIsTheBest] is: false was: undefined
  Computing orientation for Result.10876[JanekIsTheBest] expired: false agree: 0 against: 0 protest: 0 blank: 0
  Computed orientation Result.10876[JanekIsTheBest] was: neutral is: neutral

Change.process, invoke create on ProtoVersion.4 p: { label: '1', id: 10081, ts: 1401379795695 }

Change.process, invoke create on ProtoDelegation.18 p: { persona: '@jhr',
  agent: '@n_hulot',
  tags: [ '#best' ],
  id: 10082,
  ts: 1401379795695 }
Key for new Delegation.@jhr.@n_hulot.#best is: @jhr.@n_hulot.#best
Add delegation Delegation.@jhr.@n_hulot.#best[@n_hulot] for persona Persona.@jhr[@jhr] for topics tagged [Topic.#best[#best]] to agent Persona.@n_hulot[@n_hulot]
Add delegation Delegation.@jhr.@n_hulot.#best[@n_hulot] by agent Persona.@n_hulot[@n_hulot] for topics tagged [Topic.#best[#best]] from persona Persona.@jhr[@jhr]
Add tag Topic.#best[#best] for fresh delegation Delegation.@jhr.@n_hulot.#best[@n_hulot]
Activate delegation
BUG? unexpected vote on Topic.rex_is_the_best[Rex_is_the_best] of Persona.@n_hulot[@n_hulot]
BUG? unexpected vote on Topic.cyrnea_is_the_best[Cyrnea_is_the_best] of Persona.@n_hulot[@n_hulot]
BUG? unexpected vote on Topic.chloe_is_the_best[chloe_is_the_best] of Persona.@n_hulot[@n_hulot]
BUG? unexpected vote on Topic.janekisthebest[JanekIsTheBest] of Persona.@n_hulot[@n_hulot]

Change.process, invoke create on ProtoTopic.12 p: { label: '__n_hulot',
  tags: [ '#jhr', '#best' ],
  id: 10082,
  ts: 1401379795695 }
Key for new Topic.__n_hulot[__n_hulot] is: __n_hulot
Key for new Result.10877 is: __n_hulot
  Total for Result.10877[__n_hulot] is: 0 was: undefined direct: 0
  Against about Result.10877[__n_hulot] is: 0 was: undefined
  Win about Result.10877[__n_hulot] is: false was: undefined
  Computing orientation for Result.10877[__n_hulot] expired: false agree: 0 against: 0 protest: 0 blank: 0
  Computed orientation Result.10877[__n_hulot] was: neutral is: neutral
ToDo: handle delegation Delegation.@jhr.@n_hulot.#best[@n_hulot] in update_votes()
BUG? unexpected vote on Topic.__n_hulot[__n_hulot] of Persona.@n_hulot[@n_hulot]

Change.process, invoke create on ProtoDelegation.18 p: { persona: '@jhr',
  agent: '@n_hulot',
  tags: [ '#best' ],
  id: 10083,
  ts: 1401379855406 }
Update on Delegation.@jhr.@n_hulot.#best[@n_hulot], key:@jhr.@n_hulot.#best, update: Delegation.@jhr.@n_hulot.#best

Change.process, invoke create on ProtoTagging.13 p: { proposition: '__n_hulot',
  tags: [ '#jhr', '#best' ],
  id: 10083,
  ts: 1401379855406 }

Change.process, invoke create on ProtoVersion.4 p: { label: '1', id: 10112, ts: 1401381930712 }

Change.process, invoke create on ProtoDelegation.18 p: { persona: '@jhr',
  agent: '@n_hulot',
  tags: [ '#president' ],
  id: 10113,
  ts: 1401381930712 }
Update on Delegation.@jhr.@n_hulot.#president[@n_hulot], key:@jhr.@n_hulot.#president, update: Delegation.@jhr.@n_hulot.#president

Change.process, invoke create on ProtoTagging.13 p: { proposition: 'n_hulot',
  tags: [ '#jhr', '#president' ],
  id: 10114,
  ts: 1401381930712 }

Change.process, invoke create on ProtoVersion.4 p: { label: '1', id: 10144, ts: 1401382603313 }

Change.process, invoke create on ProtoDelegation.18 p: { persona: '@jhr',
  agent: '@n_hulot',
  tags: [ '#president' ],
  id: 10145,
  ts: 1401382603313 }
Update on Delegation.@jhr.@n_hulot.#president[@n_hulot], key:@jhr.@n_hulot.#president, update: Delegation.@jhr.@n_hulot.#president

Change.process, invoke create on ProtoTagging.13 p: { proposition: '#jhr',
  tags: [ '#jhr', '#president' ],
  id: 10145,
  ts: 1401382603313 }
Could not process change { t: 'Tagging',
  p: 
   { proposition: '#jhr',
     tags: [ '#jhr', '#president' ],
     id: 10145,
     ts: 1401382603313 },
  to: 10145 } { [TypeError: Property 'propositions' of object [object Object] is not a function]
  stack: 'TypeError: Property \'propositions\' of object [object Object] is not a function\n    at Topic.add_proposition (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:2480:19)\n    at Topic.add_tag (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:2429:9)\n    at C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:2635:24\n    at Array.forEach (native)\n    at new Tagging (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:2626:13)\n    at Tagging.ctor.create.sub_proto.create [as create] (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:723:18)\n    at Object.Change.process (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:1109:32)\n    at Function.<anonymous> (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:1645:37)\n    at try_call (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\lib\\water.js:636:19)\n    at Function.<anonymous> (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\lib\\water.js:1590:16)' } TypeError: Property 'propositions' of object [object Object] is not a function
    at Topic.add_proposition (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:2480:19)
    at Topic.add_tag (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:2429:9)
    at C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:2635:24
    at Array.forEach (native)
    at new Tagging (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:2626:13)
    at Tagging.ctor.create.sub_proto.create [as create] (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:723:18)
    at Object.Change.process (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:1109:32)
    at Function.<anonymous> (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:1645:37)
    at try_call (C:\Users\jean__000\Documents\GitHub\l8\lib\water.js:636:19)
    at Function.<anonymous> (C:\Users\jean__000\Documents\GitHub\l8\lib\water.js:1590:16)

Change.process, invoke create on ProtoVersion.4 p: { label: '1', id: 10175, ts: 1401382949878 }

Change.process, invoke create on ProtoDelegation.18 p: { persona: '@jhr',
  agent: '@n_hulot',
  tags: [ '#president' ],
  id: 10176,
  ts: 1401382949878 }
Update on Delegation.@jhr.@n_hulot.#president[@n_hulot], key:@jhr.@n_hulot.#president, update: Delegation.@jhr.@n_hulot.#president

Change.process, invoke create on ProtoTagging.13 p: { proposition: '#jhr',
  tags: [ '#jhr', '#president' ],
  id: 10176,
  ts: 1401382949878 }

Change.process, invoke create on ProtoDelegation.18 p: { persona: '@jhr',
  agent: '@n_hulot',
  tags: [ '#president' ],
  id: 10177,
  ts: 1401383074143 }
Update on Delegation.@jhr.@n_hulot.#president[@n_hulot], key:@jhr.@n_hulot.#president, update: Delegation.@jhr.@n_hulot.#president

Change.process, invoke create on ProtoTagging.13 p: { proposition: '#jhr',
  tags: [ '#jhr', '#president' ],
  id: 10177,
  ts: 1401383074143 }

Change.process, invoke create on ProtoVersion.4 p: { label: '1', id: 10207, ts: 1401387063570 }

Change.process, invoke create on ProtoVote.15 p: { persona: '@jhr',
  proposition: 'kudocracy',
  orientation: 'agree',
  id: 10208,
  ts: 1401387063570 }
Key for new Vote.@jhr.kudocracy is: @jhr.kudocracy
Add vote Vote.@jhr.kudocracy[@jhr/agree] now agree of Persona.@jhr[@jhr] via direct for proposition Topic.kudocracy[kudocracy]
  Total for Result.10853[kudocracy] is: 1 was: 0 direct: 1
  Win about Result.10853[kudocracy] is: true was: false
  Computing orientation for Result.10853[kudocracy] expired: false agree: 1 against: 0 protest: 0 blank: 0
  Computed orientation Result.10853[kudocracy] was: neutral is: agree
  Change of orientation, create a transition

Change.process, invoke create on ProtoVote.15 p: { persona: '@jhr',
  proposition: 'hollande_president',
  orientation: 'disagree',
  id: 10209,
  ts: 1401387078870 }
Key for new Vote.@jhr.hollande_president is: @jhr.hollande_president
Add vote Vote.@jhr.hollande_president[@jhr/disagree] now disagree of Persona.@jhr[@jhr] via direct for proposition Topic.hollande_president[hollande_president]
  Total for Result.10854[hollande_president] is: 1 was: 0 direct: 1
  Against about Result.10854[hollande_president] is: 1 was: 0
  Win about Result.10854[hollande_president] is: false was: false
  Computing orientation for Result.10854[hollande_president] expired: false agree: 0 against: 1 protest: 0 blank: 0
  Computed orientation Result.10854[hollande_president] was: neutral is: disagree
  Change of orientation, create a transition

Change.process, invoke create on ProtoVote.15 p: { persona: '@jhr',
  proposition: 'n_hulot',
  orientation: 'agree',
  id: 10210,
  ts: 1401387085538 }
Key for new Vote.@jhr.n_hulot is: @jhr.n_hulot
Add vote Vote.@jhr.n_hulot[@jhr/agree] now agree of Persona.@jhr[@jhr] via direct for proposition Topic.n_hulot[n_hulot]
  Total for Result.10869[n_hulot] is: 1 was: 0 direct: 1
  Win about Result.10869[n_hulot] is: true was: false
  Computing orientation for Result.10869[n_hulot] expired: false agree: 1 against: 0 protest: 0 blank: 0
  Computed orientation Result.10869[n_hulot] was: neutral is: agree
  Change of orientation, create a transition

Change.process, invoke create on ProtoVote.15 p: { persona: '@jhr',
  proposition: 'cyrnea_is_the_best',
  orientation: 'agree',
  id: 10211,
  ts: 1401387092817 }
Key for new Vote.@jhr.cyrnea_is_the_best is: @jhr.cyrnea_is_the_best
Add vote Vote.@jhr.cyrnea_is_the_best[@jhr/agree] now agree of Persona.@jhr[@jhr] via direct for proposition Topic.cyrnea_is_the_best[Cyrnea_is_the_best]
  Total for Result.10871[Cyrnea_is_the_best] is: 1 was: 0 direct: 1
  Win about Result.10871[Cyrnea_is_the_best] is: true was: false
  Computing orientation for Result.10871[Cyrnea_is_the_best] expired: false agree: 1 against: 0 protest: 0 blank: 0
  Computed orientation Result.10871[Cyrnea_is_the_best] was: neutral is: agree
  Change of orientation, create a transition

Change.process, invoke create on ProtoVote.15 p: { persona: '@jhr',
  proposition: 'chloe_is_the_best',
  orientation: 'agree',
  id: 10212,
  ts: 1401387102490 }
Key for new Vote.@jhr.chloe_is_the_best is: @jhr.chloe_is_the_best
Add vote Vote.@jhr.chloe_is_the_best[@jhr/agree] now agree of Persona.@jhr[@jhr] via direct for proposition Topic.chloe_is_the_best[chloe_is_the_best]
  Total for Result.10875[chloe_is_the_best] is: 1 was: 0 direct: 1
  Win about Result.10875[chloe_is_the_best] is: true was: false
  Computing orientation for Result.10875[chloe_is_the_best] expired: false agree: 1 against: 0 protest: 0 blank: 0
  Computed orientation Result.10875[chloe_is_the_best] was: neutral is: agree
  Change of orientation, create a transition

Change.process, invoke create on ProtoVote.15 p: { persona: '@jhr',
  proposition: 'janekisthebest',
  orientation: 'agree',
  id: 10213,
  ts: 1401387105761 }
Key for new Vote.@jhr.janekisthebest is: @jhr.janekisthebest
Add vote Vote.@jhr.janekisthebest[@jhr/agree] now agree of Persona.@jhr[@jhr] via direct for proposition Topic.janekisthebest[JanekIsTheBest]
  Total for Result.10876[JanekIsTheBest] is: 1 was: 0 direct: 1
  Win about Result.10876[JanekIsTheBest] is: true was: false
  Computing orientation for Result.10876[JanekIsTheBest] expired: false agree: 1 against: 0 protest: 0 blank: 0
  Computed orientation Result.10876[JanekIsTheBest] was: neutral is: agree
  Change of orientation, create a transition

Change.process, invoke create on ProtoVote.15 p: { persona: '@jhr',
  proposition: 'rex_is_the_best',
  orientation: 'disagree',
  id: 10214,
  ts: 1401387122816 }
Key for new Vote.@jhr.rex_is_the_best is: @jhr.rex_is_the_best
Add vote Vote.@jhr.rex_is_the_best[@jhr/disagree] now disagree of Persona.@jhr[@jhr] via direct for proposition Topic.rex_is_the_best[Rex_is_the_best]
  Total for Result.10873[Rex_is_the_best] is: 1 was: 0 direct: 1
  Against about Result.10873[Rex_is_the_best] is: 1 was: 0
  Win about Result.10873[Rex_is_the_best] is: false was: false
  Computing orientation for Result.10873[Rex_is_the_best] expired: false agree: 0 against: 1 protest: 0 blank: 0
  Computed orientation Result.10873[Rex_is_the_best] was: neutral is: disagree
  Change of orientation, create a transition

Change.process, invoke create on ProtoVote.15 p: { persona: '@jhr',
  proposition: '__n_hulot',
  orientation: 'protest',
  id: 10215,
  ts: 1401387166780 }
Key for new Vote.@jhr.__n_hulot is: @jhr.__n_hulot
Add vote Vote.@jhr.__n_hulot[@jhr/protest] now protest of Persona.@jhr[@jhr] via direct for proposition Topic.__n_hulot[__n_hulot]
  Total for Result.10877[__n_hulot] is: 1 was: 0 direct: 1
  Against about Result.10877[__n_hulot] is: 1 was: 0
  Win about Result.10877[__n_hulot] is: false was: false
  Computing orientation for Result.10877[__n_hulot] expired: false agree: 0 against: 1 protest: 1 blank: 0
  Computed orientation Result.10877[__n_hulot] was: neutral is: protest
  Change of orientation, create a transition

Change.process, invoke create on ProtoVersion.4 p: { label: '1', id: 10253, ts: 1401405268132 }

Change.process, invoke create on ProtoVote.15 p: { persona: '@jhr',
  proposition: 'n_hulot',
  orientation: 'blank',
  id: 10254,
  ts: 1401405268132 }
Update on Vote.@jhr.n_hulot[@jhr/agree], key:@jhr.n_hulot, update: Vote.@jhr.n_hulot
Remove vote Vote.@jhr.n_hulot[@jhr/agree] previously agree of Persona.@jhr[@jhr] via direct from proposition Topic.n_hulot[n_hulot]
Add vote Vote.@jhr.n_hulot[@jhr/blank] now blank of Persona.@jhr[@jhr] via direct for proposition Topic.n_hulot[n_hulot]
  Total for Result.10869[n_hulot] is: 1 was: 1 direct: 1
  Win about Result.10869[n_hulot] is: false was: true
  Computing orientation for Result.10869[n_hulot] expired: false agree: 0 against: 0 protest: 0 blank: 1
  Computed orientation Result.10869[n_hulot] was: agree is: blank
  Change of orientation, create a transition

Change.process, invoke create on ProtoVersion.4 p: { label: '1', id: 10293, ts: 1401411062335 }

Change.process, invoke create on ProtoPersona.9 p: { label: '@jvincent', id: 10294, ts: 1401411062335 }
Key for new Persona.@jvincent[@jvincent] is: @jvincent

Change.process, invoke create on ProtoVote.15 p: { persona: '@jvincent',
  proposition: 'n_hulot',
  orientation: 'agree',
  id: 10294,
  ts: 1401411095372 }
Key for new Vote.@jvincent.n_hulot is: @jvincent.n_hulot
Add vote Vote.@jvincent.n_hulot[@jvincent/agree] now agree of Persona.@jvincent[@jvincent] via direct for proposition Topic.n_hulot[n_hulot]
  Total for Result.10869[n_hulot] is: 2 was: 1 direct: 2
  Win about Result.10869[n_hulot] is: true was: false
  Computing orientation for Result.10869[n_hulot] expired: false agree: 1 against: 0 protest: 0 blank: 1
  Computed orientation Result.10869[n_hulot] was: blank is: blank

Change.process, invoke create on ProtoVote.15 p: { persona: '@jvincent',
  proposition: 'hulot_president',
  orientation: 'blank',
  id: 10294,
  ts: 1401411103419 }
Key for new Vote.@jvincent.hulot_president is: @jvincent.hulot_president
Add vote Vote.@jvincent.hulot_president[@jvincent/blank] now blank of Persona.@jvincent[@jvincent] via direct for proposition Topic.hulot_president[hulot_president]
  Total for Result.10855[hulot_president] is: 3 was: 2 direct: 3
  Computing orientation for Result.10855[hulot_president] expired: false agree: 1 against: 1 protest: 0 blank: 1
  Computed orientation Result.10855[hulot_president] was: disagree is: blank
  Change of orientation, create a transition

Change.process, invoke create on ProtoVote.15 p: { persona: '@jvincent',
  proposition: 'kudocracy',
  orientation: 'agree',
  id: 10295,
  ts: 1401411107092 }
Key for new Vote.@jvincent.kudocracy is: @jvincent.kudocracy
Add vote Vote.@jvincent.kudocracy[@jvincent/agree] now agree of Persona.@jvincent[@jvincent] via direct for proposition Topic.kudocracy[kudocracy]
  Total for Result.10853[kudocracy] is: 2 was: 1 direct: 2
  Win about Result.10853[kudocracy] is: true was: true
  Computing orientation for Result.10853[kudocracy] expired: false agree: 2 against: 0 protest: 0 blank: 0
  Computed orientation Result.10853[kudocracy] was: agree is: agree

Change.process, invoke create on ProtoVote.15 p: { persona: '@jvincent',
  proposition: 'hollande_president',
  orientation: 'disagree',
  id: 10295,
  ts: 1401411110542 }
Key for new Vote.@jvincent.hollande_president is: @jvincent.hollande_president
Add vote Vote.@jvincent.hollande_president[@jvincent/disagree] now disagree of Persona.@jvincent[@jvincent] via direct for proposition Topic.hollande_president[hollande_president]
  Total for Result.10854[hollande_president] is: 2 was: 1 direct: 2
  Against about Result.10854[hollande_president] is: 2 was: 1
  Win about Result.10854[hollande_president] is: false was: false
  Computing orientation for Result.10854[hollande_president] expired: false agree: 0 against: 2 protest: 0 blank: 0
  Computed orientation Result.10854[hollande_president] was: disagree is: disagree

Change.process, invoke create on ProtoVote.15 p: { persona: '@jvincent',
  proposition: 'cyrnea_is_the_best',
  orientation: 'blank',
  id: 10295,
  ts: 1401411114467 }
Key for new Vote.@jvincent.cyrnea_is_the_best is: @jvincent.cyrnea_is_the_best
Add vote Vote.@jvincent.cyrnea_is_the_best[@jvincent/blank] now blank of Persona.@jvincent[@jvincent] via direct for proposition Topic.cyrnea_is_the_best[Cyrnea_is_the_best]
  Total for Result.10871[Cyrnea_is_the_best] is: 2 was: 1 direct: 2
  Computing orientation for Result.10871[Cyrnea_is_the_best] expired: false agree: 1 against: 0 protest: 0 blank: 1
  Computed orientation Result.10871[Cyrnea_is_the_best] was: agree is: blank
  Change of orientation, create a transition

Change.process, invoke create on ProtoVote.15 p: { persona: '@jvincent',
  proposition: 'chloe_is_the_best',
  orientation: 'blank',
  id: 10296,
  ts: 1401411120484 }
Key for new Vote.@jvincent.chloe_is_the_best is: @jvincent.chloe_is_the_best
Add vote Vote.@jvincent.chloe_is_the_best[@jvincent/blank] now blank of Persona.@jvincent[@jvincent] via direct for proposition Topic.chloe_is_the_best[chloe_is_the_best]
  Total for Result.10875[chloe_is_the_best] is: 2 was: 1 direct: 2
  Computing orientation for Result.10875[chloe_is_the_best] expired: false agree: 1 against: 0 protest: 0 blank: 1
  Computed orientation Result.10875[chloe_is_the_best] was: agree is: blank
  Change of orientation, create a transition

Change.process, invoke create on ProtoVote.15 p: { persona: '@jvincent',
  proposition: 'janekisthebest',
  orientation: 'blank',
  id: 10297,
  ts: 1401411125715 }
Key for new Vote.@jvincent.janekisthebest is: @jvincent.janekisthebest
Add vote Vote.@jvincent.janekisthebest[@jvincent/blank] now blank of Persona.@jvincent[@jvincent] via direct for proposition Topic.janekisthebest[JanekIsTheBest]
  Total for Result.10876[JanekIsTheBest] is: 2 was: 1 direct: 2
  Computing orientation for Result.10876[JanekIsTheBest] expired: false agree: 1 against: 0 protest: 0 blank: 1
  Computed orientation Result.10876[JanekIsTheBest] was: agree is: blank
  Change of orientation, create a transition

Change.process, invoke create on ProtoVote.15 p: { persona: '@jvincent',
  proposition: 'chloe_is_the_best',
  orientation: 'blank',
  id: 10298,
  ts: 1401411134723 }
Update on Vote.@jvincent.chloe_is_the_best[@jvincent/blank], key:@jvincent.chloe_is_the_best, update: Vote.@jvincent.chloe_is_the_best
BUG? useless update of vote Vote.@jvincent.chloe_is_the_best[@jvincent/blank]

Change.process, invoke create on ProtoVote.15 p: { persona: '@jvincent',
  proposition: '__n_hulot',
  orientation: 'protest',
  id: 10298,
  ts: 1401411142555 }
Key for new Vote.@jvincent.__n_hulot is: @jvincent.__n_hulot
Add vote Vote.@jvincent.__n_hulot[@jvincent/protest] now protest of Persona.@jvincent[@jvincent] via direct for proposition Topic.__n_hulot[__n_hulot]
  Total for Result.10877[__n_hulot] is: 2 was: 1 direct: 2
  Against about Result.10877[__n_hulot] is: 2 was: 1
  Win about Result.10877[__n_hulot] is: false was: false
  Computing orientation for Result.10877[__n_hulot] expired: false agree: 0 against: 2 protest: 2 blank: 0
  Computed orientation Result.10877[__n_hulot] was: protest is: protest

Change.process, invoke create on ProtoVote.15 p: { persona: '@jvincent',
  proposition: 'hulot_president',
  orientation: 'agree',
  id: 10298,
  ts: 1401411429697 }
Update on Vote.@jvincent.hulot_president[@jvincent/blank], key:@jvincent.hulot_president, update: Vote.@jvincent.hulot_president
Remove vote Vote.@jvincent.hulot_president[@jvincent/blank] previously blank of Persona.@jvincent[@jvincent] via direct from proposition Topic.hulot_president[hulot_president]
Add vote Vote.@jvincent.hulot_president[@jvincent/agree] now agree of Persona.@jvincent[@jvincent] via direct for proposition Topic.hulot_president[hulot_president]
  Total for Result.10855[hulot_president] is: 3 was: 3 direct: 3
  Computing orientation for Result.10855[hulot_president] expired: false agree: 2 against: 1 protest: 0 blank: 0
  Computed orientation Result.10855[hulot_president] was: blank is: agree
  Change of orientation, create a transition
  Win about Result.10855[hulot_president] is: true was: false

Change.process, invoke create on ProtoVersion.4 p: { label: '1', id: 10339, ts: 1401445419406 }

Change.process, invoke create on ProtoVersion.4 p: { label: '1', id: 10380, ts: 1401445763016 }

Change.process, invoke create on ProtoVersion.4 p: { label: '1', id: 10421, ts: 1401445974198 }

Change.process, invoke create on ProtoVersion.4 p: { label: '1', id: 10462, ts: 1401446041782 }

Change.process, invoke create on ProtoVersion.4 p: { label: '1', id: 10503, ts: 1401446163566 }

Change.process, invoke create on ProtoVersion.4 p: { label: '1', id: 10544, ts: 1401446231253 }

Change.process, invoke create on ProtoVersion.4 p: { label: '1', id: 10585, ts: 1401446542874 }

Change.process, invoke create on ProtoVersion.4 p: { label: '1', id: 10626, ts: 1401446653895 }

Change.process, invoke create on ProtoDelegation.18 p: { id_key: '@jhr.@n_hulot.#president',
  privacy: 'secret',
  id: 10627,
  ts: 1401446653895 }
Update on Delegation.@jhr.@n_hulot.#president[@n_hulot], key:@jhr.@n_hulot.#president, update: Delegation.@jhr.@n_hulot.#president

Change.process, invoke create on ProtoDelegation.18 p: { id_key: '@jhr.@n_hulot.#president',
  privacy: 'public',
  id: 10627,
  ts: 1401446677960 }
Update on Delegation.@jhr.@n_hulot.#president[@n_hulot], key:@jhr.@n_hulot.#president, update: Delegation.@jhr.@n_hulot.#president

Change.process, invoke create on ProtoVersion.4 p: { label: '1', id: 10668, ts: 1401468184689 }

Change.process, invoke create on ProtoPersona.9 p: { label: '@LucasRobert', id: 10669, ts: 1401468184689 }
Key for new Persona.@lucasrobert[@LucasRobert] is: @lucasrobert

Change.process, invoke create on ProtoVersion.4 p: { label: '1', id: 10710, ts: 1401483941159 }

Change.process, invoke create on ProtoVote.15 p: { persona: '@jhr',
  proposition: 'cyrnea_is_the_best',
  id: 10711,
  ts: 1401483941159 }
Update on Vote.@jhr.cyrnea_is_the_best[@jhr/agree], key:@jhr.cyrnea_is_the_best, update: Vote.@jhr.cyrnea_is_the_best
BUG? useless update of vote Vote.@jhr.cyrnea_is_the_best[@jhr/agree]

Change.process, invoke create on ProtoVersion.4 p: { label: '1', id: 10752, ts: 1401484891757 }

Change.process, invoke create on ProtoComment.14 p: { vote: '@jhr.cyrnea_is_the_best',
  text: 'C\'est le bar le plus sympa de Corté !',
  id: 10753,
  ts: 1401484891757 }
BUG! this should not happen...

Change.process, invoke create on ProtoVersion.4 p: { label: '1', id: 10794, ts: 1401498556365 }

Change.process, invoke create on ProtoVote.15 p: { persona: '@jhr',
  proposition: '#jhr',
  orientation: 'agree',
  id: 10795,
  ts: 1401498556365 }
Key for new Vote.@jhr.#jhr is: @jhr.#jhr
Add vote Vote.@jhr.#jhr[@jhr/agree] now agree of Persona.@jhr[@jhr] via direct for proposition Topic.#jhr[#jhr]
  Total for Result.10868[#jhr] is: 1 was: 0 direct: 1
  Win about Result.10868[#jhr] is: true was: false
  Computing orientation for Result.10868[#jhr] expired: false agree: 1 against: 0 protest: 0 blank: 0
  Computed orientation Result.10868[#jhr] was: neutral is: agree
  Change of orientation, create a transition

Change.process, invoke create on ProtoVote.15 p: { id_key: '@jhr.#jhr',
  orientation: 'disagree',
  id: 10796,
  ts: 1401498585145 }
Update on Vote.@jhr.#jhr[@jhr/agree], key:@jhr.#jhr, update: Vote.@jhr.#jhr
Remove vote Vote.@jhr.#jhr[@jhr/agree] previously agree of Persona.@jhr[@jhr] via direct from proposition Topic.#jhr[#jhr]
Add vote Vote.@jhr.#jhr[@jhr/disagree] now disagree of Persona.@jhr[@jhr] via direct for proposition Topic.#jhr[#jhr]
  Total for Result.10868[#jhr] is: 1 was: 1 direct: 1
  Against about Result.10868[#jhr] is: 1 was: 0
  Win about Result.10868[#jhr] is: false was: true
  Computing orientation for Result.10868[#jhr] expired: false agree: 0 against: 1 protest: 0 blank: 0
  Computed orientation Result.10868[#jhr] was: agree is: disagree
  Change of orientation, create a transition

Change.process, invoke create on ProtoVersion.4 p: { label: '1', id: 10839, ts: 1401499305901 }

Change.process, invoke create on ProtoVote.15 p: { persona: '@jhr',
  proposition: '#best',
  orientation: 'agree',
  id: 10840,
  ts: 1401499305901 }
Key for new Vote.@jhr.#best is: @jhr.#best
Add vote Vote.@jhr.#best[@jhr/agree] now agree of Persona.@jhr[@jhr] via direct for proposition Topic.#best[#best]
  Total for Result.10872[#best] is: 1 was: 0 direct: 1
  Win about Result.10872[#best] is: true was: false
  Computing orientation for Result.10872[#best] expired: false agree: 1 against: 0 protest: 0 blank: 0
  Computed orientation Result.10872[#best] was: neutral is: agree
  Change of orientation, create a transition

Change.process, invoke create on ProtoVote.15 p: { persona: '@jhr',
  proposition: '#president',
  orientation: 'agree',
  id: 10841,
  ts: 1401499333421 }
Key for new Vote.@jhr.#president is: @jhr.#president
Add vote Vote.@jhr.#president[@jhr/agree] now agree of Persona.@jhr[@jhr] via direct for proposition Topic.#president[#president]
Could not process vote Vote.@jhr.#president[@jhr/agree] { [TypeError: Property 'votes_log' of object [object Object] is not a function]
  stack: 'TypeError: Property \'votes_log\' of object [object Object] is not a function\n    at Topic.log_vote (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:2385:24)\n    at Topic.add_vote (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:2363:8)\n    at Vote.add (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:2874:20)\n    at Function.update (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:2746:12)\n    at Function.app.error_traced (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:62:16)\n    at transform_call (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\lib\\water.js:623:24)\n    at Function.a_water (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\lib\\water.js:1036:17)\n    at try_apply (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\lib\\water.js:641:19)\n    at dispatch (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\lib\\water.js:590:11)\n    at update (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\lib\\water.js:718:5)' } TypeError: Property 'votes_log' of object [object Object] is not a function
    at Topic.log_vote (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:2385:24)
    at Topic.add_vote (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:2363:8)
    at Vote.add (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:2874:20)
    at Function.update (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:2746:12)
    at Function.app.error_traced (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:62:16)
    at transform_call (C:\Users\jean__000\Documents\GitHub\l8\lib\water.js:623:24)
    at Function.a_water (C:\Users\jean__000\Documents\GitHub\l8\lib\water.js:1036:17)
    at try_apply (C:\Users\jean__000\Documents\GitHub\l8\lib\water.js:641:19)
    at dispatch (C:\Users\jean__000\Documents\GitHub\l8\lib\water.js:590:11)
    at update (C:\Users\jean__000\Documents\GitHub\l8\lib\water.js:718:5)

Change.process, invoke create on ProtoVote.15 p: { persona: '@jhr',
  proposition: '#bar',
  orientation: 'agree',
  id: 10842,
  ts: 1401499381189 }
Key for new Vote.@jhr.#bar is: @jhr.#bar
Add vote Vote.@jhr.#bar[@jhr/agree] now agree of Persona.@jhr[@jhr] via direct for proposition Topic.#bar[#bar]
  Total for Result.10870[#bar] is: 1 was: 0 direct: 1
  Win about Result.10870[#bar] is: true was: false
  Computing orientation for Result.10870[#bar] expired: false agree: 1 against: 0 protest: 0 blank: 0
  Computed orientation Result.10870[#bar] was: neutral is: agree
  Change of orientation, create a transition

Change.process, invoke create on ProtoVote.15 p: { persona: '@jhr',
  proposition: '#cool',
  orientation: 'agree',
  id: 10843,
  ts: 1401499388941 }
Key for new Vote.@jhr.#cool is: @jhr.#cool
Add vote Vote.@jhr.#cool[@jhr/agree] now agree of Persona.@jhr[@jhr] via direct for proposition Topic.#cool[#cool]
  Total for Result.10874[#cool] is: 1 was: 0 direct: 1
  Win about Result.10874[#cool] is: true was: false
  Computing orientation for Result.10874[#cool] expired: false agree: 1 against: 0 protest: 0 blank: 0
  Computed orientation Result.10874[#cool] was: neutral is: agree
  Change of orientation, create a transition

Change.process, invoke create on ProtoVote.15 p: { persona: '@jhr',
  proposition: '#kudocracy',
  orientation: 'agree',
  id: 10844,
  ts: 1401499393741 }
Key for new Vote.@jhr.#kudocracy is: @jhr.#kudocracy
Add vote Vote.@jhr.#kudocracy[@jhr/agree] now agree of Persona.@jhr[@jhr] via direct for proposition Topic.#kudocracy[#kudocracy]
  Total for Result.10851[#kudocracy] is: 1 was: 0 direct: 1
  Win about Result.10851[#kudocracy] is: true was: false
  Computing orientation for Result.10851[#kudocracy] expired: false agree: 1 against: 0 protest: 0 blank: 0
  Computed orientation Result.10851[#kudocracy] was: neutral is: agree
  Change of orientation, create a transition

Change.process, invoke create on ProtoVote.15 p: { id_key: '@jhr.#jhr',
  orientation: 'agree',
  id: 10845,
  ts: 1401499452072 }
Update on Vote.@jhr.#jhr[@jhr/disagree], key:@jhr.#jhr, update: Vote.@jhr.#jhr
Remove vote Vote.@jhr.#jhr[@jhr/disagree] previously disagree of Persona.@jhr[@jhr] via direct from proposition Topic.#jhr[#jhr]
Add vote Vote.@jhr.#jhr[@jhr/agree] now agree of Persona.@jhr[@jhr] via direct for proposition Topic.#jhr[#jhr]
  Total for Result.10868[#jhr] is: 1 was: 1 direct: 1
  Against about Result.10868[#jhr] is: 0 was: 1
  Win about Result.10868[#jhr] is: true was: false
  Computing orientation for Result.10868[#jhr] expired: false agree: 1 against: 0 protest: 0 blank: 0
  Computed orientation Result.10868[#jhr] was: disagree is: agree
  Change of orientation, create a transition

Change.process, invoke create on ProtoComment.14 p: { vote: '@jhr.#jhr',
  text: 'It\'s me!',
  id: 10846,
  ts: 1401499452072 }
BUG! this should not happen...

Change.process, invoke create on ProtoVote.15 p: { id_key: '@jhr.#kudocracy',
  orientation: 'blank',
  id: 10847,
  ts: 1401499531479 }
Update on Vote.@jhr.#kudocracy[@jhr/agree], key:@jhr.#kudocracy, update: Vote.@jhr.#kudocracy
Remove vote Vote.@jhr.#kudocracy[@jhr/agree] previously agree of Persona.@jhr[@jhr] via direct from proposition Topic.#kudocracy[#kudocracy]
Add vote Vote.@jhr.#kudocracy[@jhr/blank] now blank of Persona.@jhr[@jhr] via direct for proposition Topic.#kudocracy[#kudocracy]
  Total for Result.10851[#kudocracy] is: 1 was: 1 direct: 1
  Win about Result.10851[#kudocracy] is: false was: true
  Computing orientation for Result.10851[#kudocracy] expired: false agree: 0 against: 0 protest: 0 blank: 1
  Computed orientation Result.10851[#kudocracy] was: agree is: blank
  Change of orientation, create a transition

Change.process, invoke create on ProtoComment.14 p: { vote: '@jhr.#kudocracy',
  text: 'It\'s me!',
  id: 10848,
  ts: 1401499531479 }
BUG! this should not happen...

Change.process, invoke create on ProtoVote.15 p: { id_key: '@jhr.#kudocracy',
  orientation: 'agree',
  id: 10849,
  ts: 1401499635839 }
Update on Vote.@jhr.#kudocracy[@jhr/blank], key:@jhr.#kudocracy, update: Vote.@jhr.#kudocracy
Remove vote Vote.@jhr.#kudocracy[@jhr/blank] previously blank of Persona.@jhr[@jhr] via direct from proposition Topic.#kudocracy[#kudocracy]
Add vote Vote.@jhr.#kudocracy[@jhr/agree] now agree of Persona.@jhr[@jhr] via direct for proposition Topic.#kudocracy[#kudocracy]
  Total for Result.10851[#kudocracy] is: 1 was: 1 direct: 1
  Computing orientation for Result.10851[#kudocracy] expired: false agree: 1 against: 0 protest: 0 blank: 0
  Computed orientation Result.10851[#kudocracy] was: blank is: agree
  Change of orientation, create a transition
  Win about Result.10851[#kudocracy] is: true was: false

Change.process, invoke create on ProtoComment.14 p: { vote: '@jhr.#kudocracy',
  text: ' ',
  id: 10850,
  ts: 1401499722520 }
BUG! this should not happen...
Restore, stream split error { [SyntaxError: Unexpected end of input]
  stack: 'SyntaxError: Unexpected end of input\n    at parse (native)\n    at emit (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\node_modules\\split\\index.js:27:17)\n    at Stream.<anonymous> (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\node_modules\\split\\index.js:59:7)\n    at _end (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\node_modules\\split\\node_modules\\through\\index.js:65:9)\n    at Stream.stream.end (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\node_modules\\split\\node_modules\\through\\index.js:74:5)\n    at ReadStream.onend (_stream_readable.js:499:10)\n    at ReadStream.g (events.js:196:16)\n    at ReadStream.EventEmitter.emit (events.js:126:20)\n    at _stream_readable.js:896:16\n    at process._tickCallback (node.js:664:11)' }
EOF reached vote.json.log
End of restore
Restored from vote.json.log
--- ENTITY DUMP ---
Version.10000[1]
Membership.&m.@jhr.hulot_friends{chng{.} updates|[].3 key"@jhr.hulot_friends" ts-128273504 touch-128273504 duration|1year !expr mmbrPersona.@jhr[@jhr] grpPersona.hulot_friends[Hulot_friends] insrt_ndx0 inactive|_f}
Membership.&m.@jhr.hulot_friends{chng{.} key"@jhr.hulot_friends" effctMembership.&m.@jhr.hulot_friends ts-128273504 touch-128273504 duration|1year !expr}
Membership.&m.@jhr.hulot_friends{chng{.} key"@jhr.hulot_friends" effctMembership.&m.@jhr.hulot_friends ts-128273504 touch-128273504 duration|1year !expr}
Topic.#kudocracy[#kudocracy]{chng{.} nxt_ffctResult.10851[#kudocracy] key"#kudocracy" ts-128273504 touch-128273504 duration|1year !expr nm"#kudocracy" source|_ votes_log|[].3 propositions|[] tags|[] delegations|[] comments|[].2 +Result.10851[#kudocracy]}
Topic.#president[#president]{chng{.} nxt_ffctResult.10852[#president] updates|[].2 key"#president" ts-128273504 touch-128273504 duration|1year !expr nm"#president" source|_ votes_log|[] propositions|[].2 tags|[] delegations|[].1 comments|[] +Result.10852[#president]}
Topic.kudocracy[kudocracy]{chng{.} nxt_ffctResult.10853[kudocracy] key"kudocracy" ts-128273504 touch-128273504 duration|1year !expr nm"kudocracy" source|"bootstrap" votes_log|[].2 propositions|[] tags|[] delegations|[] comments|[] +Result.10853[kudocracy]}
Topic.hollande_president[hollande_president]{chng{.} nxt_ffctResult.10854[hollande_president] key"hollande_president" ts-128273504 touch-128273504 duration|1year !expr nm"hollande_president" source|"bootstrap" votes_log|[].2 propositions|[] tags|[].1 delegations|[] comments|[] +Result.10854[hollande_president]}
Topic.hulot_president[hulot_president]{chng{.} nxt_ffctResult.10855[hulot_president] key"hulot_president" ts-128273504 touch-128273504 duration|1year !expr nm"hulot_president" source|"bootstrap" votes_log|[].21 propositions|[] tags|[].1 delegations|[] comments|[] +Result.10855[hulot_president]}
Delegation.@jhr.@n_hulot.#president[@n_hulot]{chng{.} updates|[].8 key"@jhr.@n_hulot.#president" ts-128273504 touch-56396919 duration|1year !expr @Persona.@jhr[@jhr] agntPersona.@n_hulot[@n_hulot] votes|[].1 privacy|"public" tags|[].1 inactive|_f prvs_tg[].1 !ws_nctv}
Vote.@peter.hulot_president[@peter/agree]{chng{.} nxt_ffctTransition.10856 updates|[].7 key"@peter.hulot_president" ts-128273504 touch-128273504 duration|1year !expr @Persona.@peter[@peter] propTopic.hulot_president[hulot_president] analyst|_ source|_ comment|_ delegation|"direct" privacy|"public" snpsht{.} previously|"neutral" orientation|"agree"}
Vote.@peter.hulot_president[@peter/agree]{chng{.} nxt_ffctTransition.10857 key"@peter.hulot_president" effctVote.@peter.hulot_president[@peter/agree] ts-128273504 touch-128273504 dura_ !expr @Persona.@peter[@peter] propTopic.hulot_president[hulot_president] anlyst_ src_ prvsly_ prvcy_ dlgtn"direct" o"agree"}
Vote.@peter.hulot_president[@peter/blank]{chng{.} nxt_ffctTransition.10858 key"@peter.hulot_president" effctVote.@peter.hulot_president[@peter/agree] ts-128273504 touch-128273504 dura_ !expr @Persona.@peter[@peter] propTopic.hulot_president[hulot_president] anlyst_ src_ prvsly_ prvcy_ dlgtn"direct" o"blank"}
Vote.@peter.hulot_president[@peter/protest]{chng{.} nxt_ffctTransition.10859 key"@peter.hulot_president" effctVote.@peter.hulot_president[@peter/agree] ts-128273504 touch-128273504 dura_ !expr @Persona.@peter[@peter] propTopic.hulot_president[hulot_president] anlyst_ src_ prvsly_ prvcy_ dlgtn"direct" o"protest"}
Vote.@peter.hulot_president[@peter/neutral]{chng{.} nxt_ffctTransition.10860 key"@peter.hulot_president" effctVote.@peter.hulot_president[@peter/agree] ts-128273504 touch-128273504 dura_ !expr @Persona.@peter[@peter] propTopic.hulot_president[hulot_president] anlyst_ src_ prvsly_ prvcy_ dlgtn"direct" o"neutral"}
Vote.@n_hulot.hulot_president[@n_hulot/disagree]{chng{.} nxt_ffctVote.@jhr.hulot_president[@jhr/neutral] updates|[].6 key"@n_hulot.hulot_president" ts-128273504 touch-128273504 duration|1year !expr @Persona.@n_hulot[@n_hulot] propTopic.hulot_president[hulot_president] analyst|_ source|_ comment|_ delegation|"direct" privacy|"public" snpsht{.} previously|"agree" orientation|"disagree"}
Vote.@n_hulot.hulot_president[@n_hulot/neutral]{chng{.} nxt_ffctVote.@jhr.hulot_president[@jhr/neutral] key"@n_hulot.hulot_president" effctVote.@n_hulot.hulot_president[@n_hulot/disagree] ts-128273504 touch-128273504 dura_ !expr @Persona.@n_hulot[@n_hulot] propTopic.hulot_president[hulot_president] anlyst_ src_ prvsly_ prvcy_ dlgtn"direct" o"neutral"}
Vote.@n_hulot.hulot_president[@n_hulot/agree]{chng{.} nxt_ffctVote.@jhr.hulot_president[@jhr/agree] key"@n_hulot.hulot_president" effctVote.@n_hulot.hulot_president[@n_hulot/disagree] ts-128273504 touch-128273504 dura_ !expr @Persona.@n_hulot[@n_hulot] propTopic.hulot_president[hulot_president] anlyst_ src_ prvsly_ prvcy_ dlgtn"direct" o"agree"}
Vote.@jhr.hulot_president[@jhr/disagree]{chng{.} nxt_ffctTransition.10864 key"@jhr.hulot_president" effctVote.@jhr.hulot_president[@jhr/neutral] ts-128273504 touch-128273504 dura_ !expr @Persona.@jhr[@jhr] propTopic.hulot_president[hulot_president] anlyst_ src_ prvsly_ prvcy_ dlgtn"direct" o"disagree"}
Vote.@n_hulot.hulot_president[@n_hulot/blank]{chng{.} nxt_ffctVote.@jhr.hulot_president[@jhr/blank] key"@n_hulot.hulot_president" effctVote.@n_hulot.hulot_president[@n_hulot/disagree] ts-128273504 touch-128273504 dura_ !expr @Persona.@n_hulot[@n_hulot] propTopic.hulot_president[hulot_president] anlyst_ src_ prvsly_ prvcy_ dlgtn"direct" o"blank"}
Tagging.10020{chng{.} key_ propTopic.hulot_president[hulot_president] #[] dtg[]}
Tagging.10021{chng{.} nxt_ffctTopic.#president[#president] key_ propTopic.hulot_president[hulot_president] #[].1 dtg[].1}
Vote.@n_hulot.hulot_president[@n_hulot/agree]{chng{.} nxt_ffctVote.@jhr.hulot_president[@jhr/agree] key"@n_hulot.hulot_president" effctVote.@n_hulot.hulot_president[@n_hulot/disagree] ts-128273504 touch-128273504 dura_ !expr @Persona.@n_hulot[@n_hulot] propTopic.hulot_president[hulot_president] anlyst_ src_ prvsly_ prvcy_ dlgtn"direct" o"agree"}
Vote.@n_hulot.hulot_president[@n_hulot/disagree]{chng{.} nxt_ffctVote.@jhr.hulot_president[@jhr/disagree] key"@n_hulot.hulot_president" effctVote.@n_hulot.hulot_president[@n_hulot/disagree] ts-128273504 touch-128273504 dura_ !expr @Persona.@n_hulot[@n_hulot] propTopic.hulot_president[hulot_president] anlyst_ src_ prvsly_ prvcy_ dlgtn"direct" o"disagree"}
Vote.@peter.hulot_president[@peter/agree]{chng{.} key"@peter.hulot_president" effctVote.@peter.hulot_president[@peter/agree] ts-128273504 touch-128273504 dura_ !expr @Persona.@peter[@peter] propTopic.hulot_president[hulot_president] anlyst_ src_ prvsly_ prvcy_ dlgtn"direct" o"agree"}
Version.10043[1]
Topic.#jhr[#jhr]{chng{.} nxt_ffctResult.10868[#jhr] key"#jhr" ts-123835770 touch-123835770 duration|1year !expr nm"#jhr" source|_ votes_log|[].3 propositions|[].6 tags|[].2 delegations|[] comments|[].1 +Result.10868[#jhr]}
Topic.n_hulot[n_hulot]{chng{.} nxt_ffctResult.10869[n_hulot] key"n_hulot" ts-123835770 touch-123835770 duration|1year !expr nm"n_hulot" source|_ votes_log|[].3 propositions|[] tags|[].2 delegations|[] comments|[] +Result.10869[n_hulot]}
Topic.#bar[#bar]{chng{.} nxt_ffctResult.10870[#bar] key"#bar" ts-123712139 touch-123712139 duration|1year !expr nm"#bar" source|_ votes_log|[].1 propositions|[].2 tags|[] delegations|[] comments|[] +Result.10870[#bar]}
Topic.cyrnea_is_the_best[Cyrnea_is_the_best]{chng{.} nxt_ffctResult.10871[Cyrnea_is_the_best] key"cyrnea_is_the_best" ts-123712139 touch-123712139 duration|1year !expr nm"cyrnea_is_the_best" source|_ votes_log|[].2 propositions|[] tags|[].3 delegations|[] comments|[].1 +Result.10871[Cyrnea_is_the_best]}
Topic.#best[#best]{chng{.} nxt_ffctResult.10872[#best] key"#best" ts-123672723 touch-123672723 duration|1year !expr nm"#best" source|_ votes_log|[].1 propositions|[].5 tags|[] delegations|[].1 comments|[] +Result.10872[#best]}
Topic.rex_is_the_best[Rex_is_the_best]{chng{.} nxt_ffctResult.10873[Rex_is_the_best] key"rex_is_the_best" ts-123672723 touch-123672723 duration|1year !expr nm"rex_is_the_best" source|_ votes_log|[].1 propositions|[] tags|[].3 delegations|[] comments|[] +Result.10873[Rex_is_the_best]}
Tagging.10050{chng{.} key_ propTopic.cyrnea_is_the_best[Cyrnea_is_the_best] #[].3 dtg[].3}
Topic.#cool[#cool]{chng{.} nxt_ffctResult.10874[#cool] key"#cool" ts-123642492 touch-123642492 duration|1year !expr nm"#cool" source|_ votes_log|[].1 propositions|[].2 tags|[] delegations|[] comments|[] +Result.10874[#cool]}
Topic.chloe_is_the_best[chloe_is_the_best]{chng{.} nxt_ffctResult.10875[chloe_is_the_best] key"chloe_is_the_best" ts-123642492 touch-123642492 duration|1year !expr nm"chloe_is_the_best" source|_ votes_log|[].2 propositions|[] tags|[].3 delegations|[] comments|[] +Result.10875[chloe_is_the_best]}
Topic.janekisthebest[JanekIsTheBest]{chng{.} nxt_ffctResult.10876[JanekIsTheBest] key"janekisthebest" ts-123631996 touch-123631996 duration|1year !expr nm"janekisthebest" source|_ votes_log|[].2 propositions|[] tags|[].3 delegations|[] comments|[] +Result.10876[JanekIsTheBest]}
Version.10081[1]
Topic.__n_hulot[__n_hulot]{chng{.} nxt_ffctResult.10877[__n_hulot] key"__n_hulot" ts-123279184 touch-123279184 duration|1year !expr nm"__n_hulot" source|_ votes_log|[].2 propositions|[] tags|[].2 delegations|[] comments|[] +Result.10877[__n_hulot]}
Tagging.10083{chng{.} key_ propTopic.__n_hulot[__n_hulot] #[].2 dtg[].2}
Version.10112[1]
Delegation.@jhr.@n_hulot.#president[@n_hulot]{chng{.} key"@jhr.@n_hulot.#president" effctDelegation.@jhr.@n_hulot.#president[@n_hulot] ts-121144167 touch-121144167 duration|1year !expr @Persona.@jhr[@jhr] agntPersona.@n_hulot[@n_hulot] v[] prvcy_ #[] inctv_}
Tagging.10114{chng{.} key_ propTopic.n_hulot[n_hulot] #[].2 dtg[].2}
Version.10144[1]
Tagging.10145{chng{.} key_ propTopic.#jhr[#jhr] #[].2 dtg[]}
Version.10175[1]
Tagging.10176{chng{.} key_ propTopic.#jhr[#jhr] #[].2 dtg[].2}
Tagging.10177{chng{.} key_ propTopic.#jhr[#jhr] #[].2 dtg[].2}
Version.10207[1]
Vote.@jhr.kudocracy[@jhr/agree]{chng{.} nxt_ffctTransition.10878 key"@jhr.kudocracy" ts-116011309 touch-116011309 duration|1year !expr @Persona.@jhr[@jhr] propTopic.kudocracy[kudocracy] analyst|_ source|_ comment|_ delegation|"direct" privacy|"public" snpsht{.} previously|"neutral" orientation|"agree"}
Vote.@jhr.hollande_president[@jhr/disagree]{chng{.} nxt_ffctTransition.10879 key"@jhr.hollande_president" ts-115996009 touch-115996009 duration|1year !expr @Persona.@jhr[@jhr] propTopic.hollande_president[hollande_president] analyst|_ source|_ comment|_ delegation|"direct" privacy|"public" snpsht{.} previously|"neutral" orientation|"disagree"}
Vote.@jhr.n_hulot[@jhr/blank]{chng{.} nxt_ffctTransition.10880 updates|[].2 key"@jhr.n_hulot" ts-115989341 touch-97806747 duration|1year !expr @Persona.@jhr[@jhr] propTopic.n_hulot[n_hulot] analyst|_ source|_ comment|_ delegation|"direct" privacy|"public" snpsht{.} previously|"agree" orientation|"blank"}
Vote.@jhr.cyrnea_is_the_best[@jhr/agree]{chng{.} nxt_ffctTransition.10881 updates|[].2 key"@jhr.cyrnea_is_the_best" ts-115982062 touch-18183122 duration|1year !expr @Persona.@jhr[@jhr] propTopic.cyrnea_is_the_best[Cyrnea_is_the_best] analyst|_ source|_ comment|Comment.10753 delegation|"direct" privacy|"public" snpsht{.} previously|"neutral" orientation|"agree"}
Vote.@jhr.chloe_is_the_best[@jhr/agree]{chng{.} nxt_ffctTransition.10882 key"@jhr.chloe_is_the_best" ts-115972389 touch-115972389 duration|1year !expr @Persona.@jhr[@jhr] propTopic.chloe_is_the_best[chloe_is_the_best] analyst|_ source|_ comment|_ delegation|"direct" privacy|"public" snpsht{.} previously|"neutral" orientation|"agree"}
Vote.@jhr.janekisthebest[@jhr/agree]{chng{.} nxt_ffctTransition.10883 key"@jhr.janekisthebest" ts-115969118 touch-115969118 duration|1year !expr @Persona.@jhr[@jhr] propTopic.janekisthebest[JanekIsTheBest] analyst|_ source|_ comment|_ delegation|"direct" privacy|"public" snpsht{.} previously|"neutral" orientation|"agree"}
Vote.@jhr.rex_is_the_best[@jhr/disagree]{chng{.} nxt_ffctTransition.10884 key"@jhr.rex_is_the_best" ts-115952063 touch-115952063 duration|1year !expr @Persona.@jhr[@jhr] propTopic.rex_is_the_best[Rex_is_the_best] analyst|_ source|_ comment|_ delegation|"direct" privacy|"public" snpsht{.} previously|"neutral" orientation|"disagree"}
Vote.@jhr.__n_hulot[@jhr/protest]{chng{.} nxt_ffctTransition.10885 key"@jhr.__n_hulot" ts-115908099 touch-115908099 duration|1year !expr @Persona.@jhr[@jhr] propTopic.__n_hulot[__n_hulot] analyst|_ source|_ comment|_ delegation|"direct" privacy|"public" snpsht{.} previously|"neutral" orientation|"protest"}
Version.10253[1]
Vote.@jhr.n_hulot[@jhr/blank]{chng{.} nxt_ffctTransition.10886 key"@jhr.n_hulot" effctVote.@jhr.n_hulot[@jhr/blank] ts-97806747 touch-97806747 dura_ !expr @Persona.@jhr[@jhr] propTopic.n_hulot[n_hulot] anlyst_ src_ prvsly_ prvcy_ dlgtn"direct" o"blank"}
Version.10293[1]
Vote.@jvincent.hulot_president[@jvincent/agree]{chng{.} nxt_ffctTransition.10887 updates|[].2 key"@jvincent.hulot_president" ts-91971460 touch-91645182 duration|1year !expr @Persona.@jvincent[@jvincent] propTopic.hulot_president[hulot_president] analyst|_ source|_ comment|_ delegation|"direct" privacy|"public" snpsht{.} previously|"blank" orientation|"agree"}
Vote.@jvincent.cyrnea_is_the_best[@jvincent/blank]{chng{.} nxt_ffctTransition.10888 key"@jvincent.cyrnea_is_the_best" ts-91960412 touch-91960412 duration|1year !expr @Persona.@jvincent[@jvincent] propTopic.cyrnea_is_the_best[Cyrnea_is_the_best] analyst|_ source|_ comment|_ delegation|"direct" privacy|"public" snpsht{.} previously|"neutral" orientation|"blank"}
Vote.@jvincent.chloe_is_the_best[@jvincent/blank]{chng{.} nxt_ffctTransition.10889 updates|[].2 key"@jvincent.chloe_is_the_best" ts-91954395 touch-91940156 duration|1year !expr @Persona.@jvincent[@jvincent] propTopic.chloe_is_the_best[chloe_is_the_best] analyst|_ source|_ comment|_ delegation|"direct" privacy|"public" snpsht{.} previously|"neutral" orientation|"blank"}
Vote.@jvincent.janekisthebest[@jvincent/blank]{chng{.} nxt_ffctTransition.10890 key"@jvincent.janekisthebest" ts-91949164 touch-91949164 duration|1year !expr @Persona.@jvincent[@jvincent] propTopic.janekisthebest[JanekIsTheBest] analyst|_ source|_ comment|_ delegation|"direct" privacy|"public" snpsht{.} previously|"neutral" orientation|"blank"}
Vote.@jvincent.hulot_president[@jvincent/agree]{chng{.} nxt_ffctTransition.10891 key"@jvincent.hulot_president" effctVote.@jvincent.hulot_president[@jvincent/agree] ts-91645182 touch-91645182 dura_ !expr @Persona.@jvincent[@jvincent] propTopic.hulot_president[hulot_president] anlyst_ src_ prvsly_ prvcy_ dlgtn"direct" o"agree"}
Version.10339[1]
Version.10380[1]
Version.10421[1]
Version.10462[1]
Version.10503[1]
Version.10544[1]
Version.10585[1]
Version.10626[1]
Delegation.@jhr.@n_hulot.#president[@n_hulot]{chng{.} key"@jhr.@n_hulot.#president" effctDelegation.@jhr.@n_hulot.#president[@n_hulot] ts-56396919 touch-56396919 duration|1year !expr @Persona.@jhr[@jhr] agntPersona.@n_hulot[@n_hulot] v[] prvcy"public" #[] inctv_}
Version.10668[1]
Persona.@lucasrobert[@LucasRobert]{chng{.} key"@lucasrobert" ts-34890190 touch-34890190 duration|1year !expr nm"@lucasrobert" rl"individual" members|[] memberships|[] delegations|[] delegations_from|[] votes|[] _vts_ndxd_by_prpstn{.}}
Version.10710[1]
Vote.@jhr.cyrnea_is_the_best[@jhr/undefined]{chng{.} key"@jhr.cyrnea_is_the_best" effctVote.@jhr.cyrnea_is_the_best[@jhr/agree] ts-19133720 touch-19133720 dura_ !expr @Persona.@jhr[@jhr] propTopic.cyrnea_is_the_best[Cyrnea_is_the_best] anlyst_ src_ prvsly_ prvcy_ dlgtn"direct" o_}
Version.10752[1]
Comment.10753{chng{.} key_ vVote.@jhr.cyrnea_is_the_best[@jhr/agree] txt"C'est le bar le plus sympa de Corté !"}
Version.10794[1]
Vote.@jhr.#jhr[@jhr/agree]{chng{.} nxt_ffctTransition.10892 updates|[].3 key"@jhr.#jhr" ts-4518514 touch-3622807 duration|1year !expr @Persona.@jhr[@jhr] propTopic.#jhr[#jhr] analyst|_ source|_ comment|Comment.10846 delegation|"direct" privacy|"public" snpsht{.} previously|"disagree" orientation|"agree"}
Vote.@jhr.#jhr[@jhr/disagree]{chng{.} nxt_ffctTransition.10893 key"@jhr.#jhr" effctVote.@jhr.#jhr[@jhr/agree] ts-4489734 touch-4489734 dura_ !expr @Persona.@jhr[@jhr] propTopic.#jhr[#jhr] anlyst_ src_ prvsly_ prvcy_ dlgtn"direct" o"disagree"}
Version.10839[1]
Vote.@jhr.#best[@jhr/agree]{chng{.} nxt_ffctTransition.10894 key"@jhr.#best" ts-3768978 touch-3768978 duration|1year !expr @Persona.@jhr[@jhr] propTopic.#best[#best] analyst|_ source|_ comment|_ delegation|"direct" privacy|"public" snpsht{.} previously|"neutral" orientation|"agree"}
Vote.@jhr.#president[@jhr/agree]{chng{.} key"@jhr.#president" ts-3741458 touch-3741458 duration|1year !expr @Persona.@jhr[@jhr] propTopic.#president[#president] analyst|_ source|_ comment|_ delegation|"direct" privacy|"public" snpsht{.} previously|"neutral" orientation|"agree"}
Vote.@jhr.#bar[@jhr/agree]{chng{.} nxt_ffctTransition.10895 key"@jhr.#bar" ts-3693690 touch-3693690 duration|1year !expr @Persona.@jhr[@jhr] propTopic.#bar[#bar] analyst|_ source|_ comment|_ delegation|"direct" privacy|"public" snpsht{.} previously|"neutral" orientation|"agree"}
Vote.@jhr.#cool[@jhr/agree]{chng{.} nxt_ffctTransition.10896 key"@jhr.#cool" ts-3685938 touch-3685938 duration|1year !expr @Persona.@jhr[@jhr] propTopic.#cool[#cool] analyst|_ source|_ comment|_ delegation|"direct" privacy|"public" snpsht{.} previously|"neutral" orientation|"agree"}
Vote.@jhr.#kudocracy[@jhr/agree]{chng{.} nxt_ffctTransition.10897 updates|[].3 key"@jhr.#kudocracy" ts-3681138 touch-3352359 duration|1year !expr @Persona.@jhr[@jhr] propTopic.#kudocracy[#kudocracy] analyst|_ source|_ comment|Comment.10850 delegation|"direct" privacy|"public" snpsht{.} previously|"blank" orientation|"agree"}
Vote.@jhr.#jhr[@jhr/agree]{chng{.} nxt_ffctTransition.10898 key"@jhr.#jhr" effctVote.@jhr.#jhr[@jhr/agree] ts-3622807 touch-3622807 dura_ !expr @Persona.@jhr[@jhr] propTopic.#jhr[#jhr] anlyst_ src_ prvsly_ prvcy_ dlgtn"direct" o"agree"}
Comment.10846{chng{.} key_ vVote.@jhr.#jhr[@jhr/agree] txt"It's me!"}
Vote.@jhr.#kudocracy[@jhr/blank]{chng{.} nxt_ffctTransition.10899 key"@jhr.#kudocracy" effctVote.@jhr.#kudocracy[@jhr/agree] ts-3543400 touch-3543400 dura_ !expr @Persona.@jhr[@jhr] propTopic.#kudocracy[#kudocracy] anlyst_ src_ prvsly_ prvcy_ dlgtn"direct" o"blank"}
Comment.10848{chng{.} key_ vVote.@jhr.#kudocracy[@jhr/agree] txt"It's me!"}
Vote.@jhr.#kudocracy[@jhr/agree]{chng{.} nxt_ffctTransition.10900 key"@jhr.#kudocracy" effctVote.@jhr.#kudocracy[@jhr/agree] ts-3439040 touch-3439040 dura_ !expr @Persona.@jhr[@jhr] propTopic.#kudocracy[#kudocracy] anlyst_ src_ prvsly_ prvcy_ dlgtn"direct" o"agree"}
Comment.10850{chng{.} key_ vVote.@jhr.#kudocracy[@jhr/agree] txt" "}
Result.10851[#kudocracy]{chng{.} key"#kudocracy" touch-128273504 propTopic.#kudocracy[#kudocracy] neutral|0 blank|0 protest|0 agree|1 disagree|0 direct|1 secret|0 private|0 count|4 total|1 against|0 win|_t orientation|"agree"}
Result.10852[#president]{chng{.} key"#president" touch-128273504 propTopic.#president[#president] neutral|0 blank|0 protest|0 agree|0 disagree|0 direct|0 secret|0 private|0 count|1 total|0 against|0 win|_f orientation|_}
Result.10853[kudocracy]{chng{.} key"kudocracy" touch-128273504 propTopic.kudocracy[kudocracy] neutral|0 blank|0 protest|0 agree|2 disagree|0 direct|2 secret|0 private|0 count|3 total|2 against|0 win|_t orientation|"agree"}
Result.10854[hollande_president]{chng{.} key"hollande_president" touch-128273504 propTopic.hollande_president[hollande_president] neutral|0 blank|0 protest|0 agree|0 disagree|2 direct|2 secret|0 private|0 count|3 total|2 against|2 win|_f orientation|"disagree"}
Result.10855[hulot_president]{chng{.} key"hulot_president" touch-128273504 propTopic.hulot_president[hulot_president] neutral|0 blank|0 protest|0 agree|2 disagree|1 direct|3 secret|0 private|0 count|24 total|3 against|1 win|_t orientation|"agree"}
Transition.10856{chng{.} key_ +Result.10855[hulot_president] o"disagree" prvsly"neutral"}
Transition.10857{chng{.} key_ +Result.10855[hulot_president] o"agree" prvsly"disagree"}
Transition.10858{chng{.} key_ +Result.10855[hulot_president] o"blank" prvsly"agree"}
Transition.10859{chng{.} key_ +Result.10855[hulot_president] o"protest" prvsly"blank"}
Transition.10860{chng{.} key_ +Result.10855[hulot_president] o"neutral" prvsly"protest"}
Transition.10861{chng{.} key_ +Result.10855[hulot_president] o"agree" prvsly"neutral"}
Transition.10862{chng{.} key_ +Result.10855[hulot_president] o"neutral" prvsly"agree"}
Transition.10863{chng{.} key_ +Result.10855[hulot_president] o"agree" prvsly"neutral"}
Transition.10864{chng{.} key_ +Result.10855[hulot_president] o"disagree" prvsly"agree"}
Transition.10865{chng{.} key_ +Result.10855[hulot_president] o"blank" prvsly"disagree"}
Transition.10866{chng{.} key_ +Result.10855[hulot_president] o"agree" prvsly"blank"}
Transition.10867{chng{.} key_ +Result.10855[hulot_president] o"disagree" prvsly"agree"}
Result.10868[#jhr]{chng{.} key"#jhr" touch-123835770 propTopic.#jhr[#jhr] neutral|0 blank|0 protest|0 agree|1 disagree|0 direct|1 secret|0 private|0 count|4 total|1 against|0 win|_t orientation|"agree"}
Result.10869[n_hulot]{chng{.} key"n_hulot" touch-123835770 propTopic.n_hulot[n_hulot] neutral|0 blank|1 protest|0 agree|1 disagree|0 direct|2 secret|0 private|0 count|4 total|2 against|0 win|_t orientation|"blank"}
Result.10870[#bar]{chng{.} key"#bar" touch-123712139 propTopic.#bar[#bar] neutral|0 blank|0 protest|0 agree|1 disagree|0 direct|1 secret|0 private|0 count|2 total|1 against|0 win|_t orientation|"agree"}
Result.10871[Cyrnea_is_the_best]{chng{.} key"cyrnea_is_the_best" touch-123712139 propTopic.cyrnea_is_the_best[Cyrnea_is_the_best] neutral|0 blank|1 protest|0 agree|1 disagree|0 direct|2 secret|0 private|0 count|3 total|2 against|0 win|_t orientation|"blank"}
Result.10872[#best]{chng{.} key"#best" touch-123672723 propTopic.#best[#best] neutral|0 blank|0 protest|0 agree|1 disagree|0 direct|1 secret|0 private|0 count|2 total|1 against|0 win|_t orientation|"agree"}
Result.10873[Rex_is_the_best]{chng{.} key"rex_is_the_best" touch-123672723 propTopic.rex_is_the_best[Rex_is_the_best] neutral|0 blank|0 protest|0 agree|0 disagree|1 direct|1 secret|0 private|0 count|2 total|1 against|1 win|_f orientation|"disagree"}
Result.10874[#cool]{chng{.} key"#cool" touch-123642492 propTopic.#cool[#cool] neutral|0 blank|0 protest|0 agree|1 disagree|0 direct|1 secret|0 private|0 count|2 total|1 against|0 win|_t orientation|"agree"}
Result.10875[chloe_is_the_best]{chng{.} key"chloe_is_the_best" touch-123642492 propTopic.chloe_is_the_best[chloe_is_the_best] neutral|0 blank|1 protest|0 agree|1 disagree|0 direct|2 secret|0 private|0 count|3 total|2 against|0 win|_t orientation|"blank"}
Result.10876[JanekIsTheBest]{chng{.} key"janekisthebest" touch-123631996 propTopic.janekisthebest[JanekIsTheBest] neutral|0 blank|1 protest|0 agree|1 disagree|0 direct|2 secret|0 private|0 count|3 total|2 against|0 win|_t orientation|"blank"}
Result.10877[__n_hulot]{chng{.} key"__n_hulot" touch-123279184 propTopic.__n_hulot[__n_hulot] neutral|0 blank|0 protest|2 agree|0 disagree|0 direct|2 secret|0 private|0 count|3 total|2 against|2 win|_f orientation|"protest"}
Transition.10878{chng{.} key_ +Result.10853[kudocracy] o"agree" prvsly"neutral"}
Transition.10879{chng{.} key_ +Result.10854[hollande_president] o"disagree" prvsly"neutral"}
Transition.10880{chng{.} key_ +Result.10869[n_hulot] o"agree" prvsly"neutral"}
Transition.10881{chng{.} key_ +Result.10871[Cyrnea_is_the_best] o"agree" prvsly"neutral"}
Transition.10882{chng{.} key_ +Result.10875[chloe_is_the_best] o"agree" prvsly"neutral"}
Transition.10883{chng{.} key_ +Result.10876[JanekIsTheBest] o"agree" prvsly"neutral"}
Transition.10884{chng{.} key_ +Result.10873[Rex_is_the_best] o"disagree" prvsly"neutral"}
Transition.10885{chng{.} key_ +Result.10877[__n_hulot] o"protest" prvsly"neutral"}
Transition.10886{chng{.} key_ +Result.10869[n_hulot] o"blank" prvsly"agree"}
Transition.10887{chng{.} key_ +Result.10855[hulot_president] o"blank" prvsly"disagree"}
Transition.10888{chng{.} key_ +Result.10871[Cyrnea_is_the_best] o"blank" prvsly"agree"}
Transition.10889{chng{.} key_ +Result.10875[chloe_is_the_best] o"blank" prvsly"agree"}
Transition.10890{chng{.} key_ +Result.10876[JanekIsTheBest] o"blank" prvsly"agree"}
Transition.10891{chng{.} key_ +Result.10855[hulot_president] o"agree" prvsly"blank"}
Transition.10892{chng{.} key_ +Result.10868[#jhr] o"agree" prvsly"neutral"}
Transition.10893{chng{.} key_ +Result.10868[#jhr] o"disagree" prvsly"agree"}
Transition.10894{chng{.} key_ +Result.10872[#best] o"agree" prvsly"neutral"}
Transition.10895{chng{.} key_ +Result.10870[#bar] o"agree" prvsly"neutral"}
Transition.10896{chng{.} key_ +Result.10874[#cool] o"agree" prvsly"neutral"}
Transition.10897{chng{.} key_ +Result.10851[#kudocracy] o"agree" prvsly"neutral"}
Transition.10898{chng{.} key_ +Result.10868[#jhr] o"agree" prvsly"disagree"}
Transition.10899{chng{.} key_ +Result.10851[#kudocracy] o"blank" prvsly"agree"}
Transition.10900{chng{.} key_ +Result.10851[#kudocracy] o"agree" prvsly"blank"}
--- END DUMP ---
Start duration: 72911 ms
READY!
Web test UI is running on port 8080
--- ENTITY DUMP ---
--- END DUMP ---
Restore, max id: 10850
Forward UID 10850

Change.process, invoke create on ProtoVersion.4 p: { label: '1', id: 10000, ts: 1401374801375 }

Change.process, invoke create on ProtoPersona.9 p: { label: '@kudocracy', id: 10001, ts: 1401374801375 }
Key for new Persona.@kudocracy[@kudocracy] is: @kudocracy

Change.process, invoke create on ProtoPersona.9 p: { label: '@jhr', id: 10001, ts: 1401374801375 }
Key for new Persona.@jhr[@jhr] is: @jhr

Change.process, invoke create on ProtoPersona.9 p: { label: '@john', id: 10001, ts: 1401374801375 }
Key for new Persona.@john[@john] is: @john

Change.process, invoke create on ProtoPersona.9 p: { label: '@luke', id: 10001, ts: 1401374801375 }
Key for new Persona.@luke[@luke] is: @luke

Change.process, invoke create on ProtoPersona.9 p: { label: '@marc', id: 10001, ts: 1401374801375 }
Key for new Persona.@marc[@marc] is: @marc

Change.process, invoke create on ProtoPersona.9 p: { label: '@peter', id: 10001, ts: 1401374801375 }
Key for new Persona.@peter[@peter] is: @peter

Change.process, invoke create on ProtoPersona.9 p: { label: '@n_hulot', id: 10001, ts: 1401374801375 }
Key for new Persona.@n_hulot[@n_hulot] is: @n_hulot

Change.process, invoke create on ProtoPersona.9 p: { label: 'Hulot_friends',
  role: 'group',
  id: 10001,
  ts: 1401374801375 }
Key for new Persona.hulot_friends[Hulot_friends] is: hulot_friends

Change.process, invoke create on ProtoMembership.19 p: { member: '@jhr',
  group: 'hulot_friends',
  id: 10001,
  ts: 1401374801375 }
Key for new Membership.&m.@jhr.hulot_friends is: @jhr.hulot_friends
Activate membership

Change.process, invoke create on ProtoMembership.19 p: { member: '@jhr',
  group: 'hulot_friends',
  inactive: true,
  id: 10002,
  ts: 1401374801375 }
Update on Membership.&m.@jhr.hulot_friends, key:@jhr.hulot_friends, update: Membership.&m.@jhr.hulot_friends
Deactivate membership

Change.process, invoke create on ProtoMembership.19 p: { member: '@jhr',
  group: 'hulot_friends',
  id: 10003,
  ts: 1401374801375 }
Update on Membership.&m.@jhr.hulot_friends, key:@jhr.hulot_friends, update: Membership.&m.@jhr.hulot_friends
Activate membership

Change.process, invoke create on ProtoTopic.12 p: { label: '#kudocracy', id: 10004, ts: 1401374801375 }
Key for new Topic.#kudocracy[#kudocracy] is: #kudocracy
Key for new Result.10851 is: #kudocracy
  Total for Result.10851[#kudocracy] is: 0 was: undefined direct: 0
  Against about Result.10851[#kudocracy] is: 0 was: undefined
  Win about Result.10851[#kudocracy] is: false was: undefined
  Computing orientation for Result.10851[#kudocracy] expired: false agree: 0 against: 0 protest: 0 blank: 0
  Computed orientation Result.10851[#kudocracy] was: neutral is: neutral

Change.process, invoke create on ProtoTopic.12 p: { label: '#president', id: 10005, ts: 1401374801375 }
Key for new Topic.#president[#president] is: #president
Key for new Result.10852 is: #president
  Total for Result.10852[#president] is: 0 was: undefined direct: 0
  Against about Result.10852[#president] is: 0 was: undefined
  Win about Result.10852[#president] is: false was: undefined
  Computing orientation for Result.10852[#president] expired: false agree: 0 against: 0 protest: 0 blank: 0
  Computed orientation Result.10852[#president] was: neutral is: neutral

Change.process, invoke create on ProtoTopic.12 p: { label: 'kudocracy',
  source: 'bootstrap',
  tags: [],
  id: 10006,
  ts: 1401374801375 }
Key for new Topic.kudocracy[kudocracy] is: kudocracy
Key for new Result.10853 is: kudocracy
  Total for Result.10853[kudocracy] is: 0 was: undefined direct: 0
  Against about Result.10853[kudocracy] is: 0 was: undefined
  Win about Result.10853[kudocracy] is: false was: undefined
  Computing orientation for Result.10853[kudocracy] expired: false agree: 0 against: 0 protest: 0 blank: 0
  Computed orientation Result.10853[kudocracy] was: neutral is: neutral

Change.process, invoke create on ProtoTopic.12 p: { label: 'hollande_president',
  source: 'bootstrap',
  tags: [ '#president' ],
  id: 10007,
  ts: 1401374801375 }
Key for new Topic.hollande_president[hollande_president] is: hollande_president
Key for new Result.10854 is: hollande_president
  Total for Result.10854[hollande_president] is: 0 was: undefined direct: 0
  Against about Result.10854[hollande_president] is: 0 was: undefined
  Win about Result.10854[hollande_president] is: false was: undefined
  Computing orientation for Result.10854[hollande_president] expired: false agree: 0 against: 0 protest: 0 blank: 0
  Computed orientation Result.10854[hollande_president] was: neutral is: neutral

Change.process, invoke create on ProtoTopic.12 p: { label: 'hulot_president',
  source: 'bootstrap',
  tags: [ '#president' ],
  id: 10008,
  ts: 1401374801375 }
Key for new Topic.hulot_president[hulot_president] is: hulot_president
Key for new Result.10855 is: hulot_president
  Total for Result.10855[hulot_president] is: 0 was: undefined direct: 0
  Against about Result.10855[hulot_president] is: 0 was: undefined
  Win about Result.10855[hulot_president] is: false was: undefined
  Computing orientation for Result.10855[hulot_president] expired: false agree: 0 against: 0 protest: 0 blank: 0
  Computed orientation Result.10855[hulot_president] was: neutral is: neutral

Change.process, invoke create on ProtoDelegation.18 p: { persona: '@jhr',
  tags: [ '#president' ],
  agent: '@n_hulot',
  id: 10009,
  ts: 1401374801375 }
Key for new Delegation.@jhr.@n_hulot.#president is: @jhr.@n_hulot.#president
Add delegation Delegation.@jhr.@n_hulot.#president[@n_hulot] for persona Persona.@jhr[@jhr] for topics tagged [Topic.#president[#president]] to agent Persona.@n_hulot[@n_hulot]
Add delegation Delegation.@jhr.@n_hulot.#president[@n_hulot] by agent Persona.@n_hulot[@n_hulot] for topics tagged [Topic.#president[#president]] from persona Persona.@jhr[@jhr]
Add tag Topic.#president[#president] for fresh delegation Delegation.@jhr.@n_hulot.#president[@n_hulot]
Activate delegation
BUG? unexpected vote on Topic.hollande_president[hollande_president] of Persona.@n_hulot[@n_hulot]
BUG? unexpected vote on Topic.hulot_president[hulot_president] of Persona.@n_hulot[@n_hulot]

Change.process, invoke create on ProtoVote.15 p: { persona: '@peter',
  proposition: 'hulot_president',
  orientation: 'disagree',
  id: 10010,
  ts: 1401374801375 }
Key for new Vote.@peter.hulot_president is: @peter.hulot_president
Add vote Vote.@peter.hulot_president[@peter/disagree] now disagree of Persona.@peter[@peter] via direct for proposition Topic.hulot_president[hulot_president]
  Total for Result.10855[hulot_president] is: 1 was: 0 direct: 1
  Against about Result.10855[hulot_president] is: 1 was: 0
  Win about Result.10855[hulot_president] is: false was: false
  Computing orientation for Result.10855[hulot_president] expired: false agree: 0 against: 1 protest: 0 blank: 0
  Computed orientation Result.10855[hulot_president] was: neutral is: disagree
  Change of orientation, create a transition

Change.process, invoke create on ProtoVote.15 p: { persona: '@peter',
  proposition: 'hulot_president',
  orientation: 'agree',
  id: 10011,
  ts: 1401374801375 }
Update on Vote.@peter.hulot_president[@peter/disagree], key:@peter.hulot_president, update: Vote.@peter.hulot_president
Remove vote Vote.@peter.hulot_president[@peter/disagree] previously disagree of Persona.@peter[@peter] via direct from proposition Topic.hulot_president[hulot_president]
Add vote Vote.@peter.hulot_president[@peter/agree] now agree of Persona.@peter[@peter] via direct for proposition Topic.hulot_president[hulot_president]
  Total for Result.10855[hulot_president] is: 1 was: 1 direct: 1
  Against about Result.10855[hulot_president] is: 0 was: 1
  Win about Result.10855[hulot_president] is: true was: false
  Computing orientation for Result.10855[hulot_president] expired: false agree: 1 against: 0 protest: 0 blank: 0
  Computed orientation Result.10855[hulot_president] was: disagree is: agree
  Change of orientation, create a transition

Change.process, invoke create on ProtoVote.15 p: { persona: '@peter',
  proposition: 'hulot_president',
  orientation: 'blank',
  id: 10012,
  ts: 1401374801375 }
Update on Vote.@peter.hulot_president[@peter/agree], key:@peter.hulot_president, update: Vote.@peter.hulot_president
Remove vote Vote.@peter.hulot_president[@peter/agree] previously agree of Persona.@peter[@peter] via direct from proposition Topic.hulot_president[hulot_president]
Add vote Vote.@peter.hulot_president[@peter/blank] now blank of Persona.@peter[@peter] via direct for proposition Topic.hulot_president[hulot_president]
  Total for Result.10855[hulot_president] is: 1 was: 1 direct: 1
  Win about Result.10855[hulot_president] is: false was: true
  Computing orientation for Result.10855[hulot_president] expired: false agree: 0 against: 0 protest: 0 blank: 1
  Computed orientation Result.10855[hulot_president] was: agree is: blank
  Change of orientation, create a transition

Change.process, invoke create on ProtoVote.15 p: { persona: '@peter',
  proposition: 'hulot_president',
  orientation: 'protest',
  id: 10013,
  ts: 1401374801375 }
Update on Vote.@peter.hulot_president[@peter/blank], key:@peter.hulot_president, update: Vote.@peter.hulot_president
Remove vote Vote.@peter.hulot_president[@peter/blank] previously blank of Persona.@peter[@peter] via direct from proposition Topic.hulot_president[hulot_president]
Add vote Vote.@peter.hulot_president[@peter/protest] now protest of Persona.@peter[@peter] via direct for proposition Topic.hulot_president[hulot_president]
  Total for Result.10855[hulot_president] is: 1 was: 1 direct: 1
  Against about Result.10855[hulot_president] is: 1 was: 0
  Win about Result.10855[hulot_president] is: false was: false
  Computing orientation for Result.10855[hulot_president] expired: false agree: 0 against: 1 protest: 1 blank: 0
  Computed orientation Result.10855[hulot_president] was: blank is: protest
  Change of orientation, create a transition

Change.process, invoke create on ProtoVote.15 p: { persona: '@peter',
  proposition: 'hulot_president',
  orientation: 'neutral',
  id: 10014,
  ts: 1401374801375 }
Update on Vote.@peter.hulot_president[@peter/protest], key:@peter.hulot_president, update: Vote.@peter.hulot_president
Remove vote Vote.@peter.hulot_president[@peter/protest] previously protest of Persona.@peter[@peter] via direct from proposition Topic.hulot_president[hulot_president]
Add vote Vote.@peter.hulot_president[@peter/neutral] now neutral of Persona.@peter[@peter] via direct for proposition Topic.hulot_president[hulot_president]
  Total for Result.10855[hulot_president] is: 0 was: 1 direct: 0
  Against about Result.10855[hulot_president] is: 0 was: 1
  Win about Result.10855[hulot_president] is: false was: false
  Computing orientation for Result.10855[hulot_president] expired: false agree: 0 against: 0 protest: 0 blank: 0
  Computed orientation Result.10855[hulot_president] was: protest is: neutral
  Change of orientation, create a transition

Change.process, invoke create on ProtoVote.15 p: { persona: '@n_hulot',
  proposition: 'hulot_president',
  orientation: 'agree',
  id: 10015,
  ts: 1401374801375 }
Key for new Vote.@n_hulot.hulot_president is: @n_hulot.hulot_president
Add vote Vote.@n_hulot.hulot_president[@n_hulot/agree] now agree of Persona.@n_hulot[@n_hulot] via direct for proposition Topic.hulot_president[hulot_president]
Persona Persona.@n_hulot[@n_hulot] votes agree on proposition Topic.hulot_president[hulot_president] for at most 1 other personas
Cascade delegated vote by Persona.@n_hulot[@n_hulot] on behalf of Persona.@jhr[@jhr] for proposition: Topic.hulot_president[hulot_president], orientation: agree
Key for new Vote.@jhr.hulot_president is: @jhr.hulot_president
  Total for Result.10855[hulot_president] is: 1 was: 0 direct: 1
  Win about Result.10855[hulot_president] is: true was: false
  Computing orientation for Result.10855[hulot_president] expired: false agree: 1 against: 0 protest: 0 blank: 0
  Computed orientation Result.10855[hulot_president] was: neutral is: agree
  Change of orientation, create a transition
Add vote Vote.@jhr.hulot_president[@jhr/agree] now agree of Persona.@jhr[@jhr] via Delegation.@jhr.@n_hulot.#president[@n_hulot] for proposition Topic.hulot_president[hulot_president]
  Total for Result.10855[hulot_president] is: 2 was: 1 direct: 1
  Win about Result.10855[hulot_president] is: true was: true
  Computing orientation for Result.10855[hulot_president] expired: false agree: 2 against: 0 protest: 0 blank: 0
  Computed orientation Result.10855[hulot_president] was: agree is: agree

Change.process, invoke create on ProtoVote.15 p: { persona: '@n_hulot',
  proposition: 'hulot_president',
  orientation: 'neutral',
  id: 10016,
  ts: 1401374801375 }
Update on Vote.@n_hulot.hulot_president[@n_hulot/agree], key:@n_hulot.hulot_president, update: Vote.@n_hulot.hulot_president
Remove vote Vote.@n_hulot.hulot_president[@n_hulot/agree] previously agree of Persona.@n_hulot[@n_hulot] via direct from proposition Topic.hulot_president[hulot_president]
Add vote Vote.@n_hulot.hulot_president[@n_hulot/neutral] now neutral of Persona.@n_hulot[@n_hulot] via direct for proposition Topic.hulot_president[hulot_president]
Persona Persona.@n_hulot[@n_hulot] votes neutral on proposition Topic.hulot_president[hulot_president] for at most 1 other personas
Cascade delegated vote by Persona.@n_hulot[@n_hulot] on behalf of Persona.@jhr[@jhr] for proposition: Topic.hulot_president[hulot_president], orientation: neutral
Update on Vote.@jhr.hulot_president[@jhr/agree], key:@jhr.hulot_president, update: Vote.@jhr.hulot_president
  Total for Result.10855[hulot_president] is: 1 was: 2 direct: 0
  Win about Result.10855[hulot_president] is: true was: true
  Computing orientation for Result.10855[hulot_president] expired: false agree: 1 against: 0 protest: 0 blank: 0
  Computed orientation Result.10855[hulot_president] was: agree is: agree
Remove vote Vote.@jhr.hulot_president[@jhr/agree] previously agree of Persona.@jhr[@jhr] via @jhr.@n_hulot.#president from proposition Topic.hulot_president[hulot_president]
  Total for Result.10855[hulot_president] is: 0 was: 1 direct: 0
  Win about Result.10855[hulot_president] is: false was: true
  Computing orientation for Result.10855[hulot_president] expired: false agree: 0 against: 0 protest: 0 blank: 0
  Computed orientation Result.10855[hulot_president] was: agree is: neutral
  Change of orientation, create a transition

Change.process, invoke create on ProtoVote.15 p: { persona: '@n_hulot',
  proposition: 'hulot_president',
  orientation: 'agree',
  id: 10017,
  ts: 1401374801375 }
Update on Vote.@n_hulot.hulot_president[@n_hulot/neutral], key:@n_hulot.hulot_president, update: Vote.@n_hulot.hulot_president
Add vote Vote.@n_hulot.hulot_president[@n_hulot/agree] now agree of Persona.@n_hulot[@n_hulot] via direct for proposition Topic.hulot_president[hulot_president]
Persona Persona.@n_hulot[@n_hulot] votes agree on proposition Topic.hulot_president[hulot_president] for at most 1 other personas
Cascade delegated vote by Persona.@n_hulot[@n_hulot] on behalf of Persona.@jhr[@jhr] for proposition: Topic.hulot_president[hulot_president], orientation: agree
Update on Vote.@jhr.hulot_president[@jhr/neutral], key:@jhr.hulot_president, update: Vote.@jhr.hulot_president
  Total for Result.10855[hulot_president] is: 1 was: 0 direct: 1
  Win about Result.10855[hulot_president] is: true was: false
  Computing orientation for Result.10855[hulot_president] expired: false agree: 1 against: 0 protest: 0 blank: 0
  Computed orientation Result.10855[hulot_president] was: neutral is: agree
  Change of orientation, create a transition
Add vote Vote.@jhr.hulot_president[@jhr/agree] now agree of Persona.@jhr[@jhr] via Delegation.@jhr.@n_hulot.#president[@n_hulot] for proposition Topic.hulot_president[hulot_president]
  Total for Result.10855[hulot_president] is: 2 was: 1 direct: 1
  Win about Result.10855[hulot_president] is: true was: true
  Computing orientation for Result.10855[hulot_president] expired: false agree: 2 against: 0 protest: 0 blank: 0
  Computed orientation Result.10855[hulot_president] was: agree is: agree

Change.process, invoke create on ProtoVote.15 p: { persona: '@jhr',
  proposition: 'hulot_president',
  orientation: 'disagree',
  id: 10018,
  ts: 1401374801375 }
Update on Vote.@jhr.hulot_president[@jhr/agree], key:@jhr.hulot_president, update: Vote.@jhr.hulot_president
Remove vote Vote.@jhr.hulot_president[@jhr/agree] previously agree of Persona.@jhr[@jhr] via @jhr.@n_hulot.#president from proposition Topic.hulot_president[hulot_president]
Add vote Vote.@jhr.hulot_president[@jhr/disagree] now disagree of Persona.@jhr[@jhr] via direct for proposition Topic.hulot_president[hulot_president]
  Total for Result.10855[hulot_president] is: 2 was: 2 direct: 2
  Against about Result.10855[hulot_president] is: 1 was: 0
  Win about Result.10855[hulot_president] is: false was: true
  Computing orientation for Result.10855[hulot_president] expired: false agree: 1 against: 1 protest: 0 blank: 0
  Computed orientation Result.10855[hulot_president] was: agree is: disagree
  Change of orientation, create a transition

Change.process, invoke create on ProtoVote.15 p: { persona: '@n_hulot',
  proposition: 'hulot_president',
  orientation: 'blank',
  id: 10019,
  ts: 1401374801375 }
Update on Vote.@n_hulot.hulot_president[@n_hulot/agree], key:@n_hulot.hulot_president, update: Vote.@n_hulot.hulot_president
Remove vote Vote.@n_hulot.hulot_president[@n_hulot/agree] previously agree of Persona.@n_hulot[@n_hulot] via direct from proposition Topic.hulot_president[hulot_president]
Add vote Vote.@n_hulot.hulot_president[@n_hulot/blank] now blank of Persona.@n_hulot[@n_hulot] via direct for proposition Topic.hulot_president[hulot_president]
Persona Persona.@n_hulot[@n_hulot] votes blank on proposition Topic.hulot_president[hulot_president] for at most 1 other personas
Cascade delegated vote by Persona.@n_hulot[@n_hulot] on behalf of Persona.@jhr[@jhr] for proposition: Topic.hulot_president[hulot_president], orientation: blank
Update on Vote.@jhr.hulot_president[@jhr/disagree], key:@jhr.hulot_president, update: Vote.@jhr.hulot_president
Not delegated, direct vote rules
  Total for Result.10855[hulot_president] is: 2 was: 2 direct: 2
  Win about Result.10855[hulot_president] is: false was: false
  Computing orientation for Result.10855[hulot_president] expired: false agree: 0 against: 1 protest: 0 blank: 1
  Computed orientation Result.10855[hulot_president] was: disagree is: blank
  Change of orientation, create a transition

Change.process, invoke create on ProtoVote.15 p: { persona: '@jhr',
  proposition: 'hulot_president',
  orientation: 'neutral',
  id: 10020,
  ts: 1401374801375 }
Update on Vote.@jhr.hulot_president[@jhr/disagree], key:@jhr.hulot_president, update: Vote.@jhr.hulot_president
Remove vote Vote.@jhr.hulot_president[@jhr/disagree] previously disagree of Persona.@jhr[@jhr] via direct from proposition Topic.hulot_president[hulot_president]
Delegated vote by Persona.@n_hulot[@n_hulot] on behalf of Persona.@jhr[@jhr] for proposition: Topic.hulot_president[hulot_president], orientation: blank
Update on Vote.@jhr.hulot_president[@jhr/neutral], key:@jhr.hulot_president, update: Vote.@jhr.hulot_president
  Total for Result.10855[hulot_president] is: 1 was: 2 direct: 1
  Against about Result.10855[hulot_president] is: 0 was: 1
Add vote Vote.@jhr.hulot_president[@jhr/blank] now blank of Persona.@jhr[@jhr] via Delegation.@jhr.@n_hulot.#president[@n_hulot] for proposition Topic.hulot_president[hulot_president]
  Win about Result.10855[hulot_president] is: false was: false
  Computing orientation for Result.10855[hulot_president] expired: false agree: 0 against: 0 protest: 0 blank: 2
  Computed orientation Result.10855[hulot_president] was: blank is: blank
  Total for Result.10855[hulot_president] is: 2 was: 1 direct: 1

Change.process, invoke create on ProtoTagging.13 p: { proposition: 'hulot_president',
  detags: [ '#president' ],
  tags: [],
  id: 10020,
  ts: 1401374801375 }
Cannot detag, inexistent tag #president

Change.process, invoke create on ProtoTagging.13 p: { proposition: 'hulot_president',
  detags: [],
  tags: [ '#president' ],
  id: 10021,
  ts: 1401374801375 }
On the fly creation of first seen tag #president
Update on Topic.#president[#president], key:#president, update: Topic.#president[#president]

Change.process, invoke create on ProtoVote.15 p: { persona: '@n_hulot',
  proposition: 'hulot_president',
  orientation: 'agree',
  id: 10022,
  ts: 1401374801375 }
Update on Vote.@n_hulot.hulot_president[@n_hulot/blank], key:@n_hulot.hulot_president, update: Vote.@n_hulot.hulot_president
Remove vote Vote.@n_hulot.hulot_president[@n_hulot/blank] previously blank of Persona.@n_hulot[@n_hulot] via direct from proposition Topic.hulot_president[hulot_president]
Add vote Vote.@n_hulot.hulot_president[@n_hulot/agree] now agree of Persona.@n_hulot[@n_hulot] via direct for proposition Topic.hulot_president[hulot_president]
Persona Persona.@n_hulot[@n_hulot] votes agree on proposition Topic.hulot_president[hulot_president] for at most 1 other personas
Cascade delegated vote by Persona.@n_hulot[@n_hulot] on behalf of Persona.@jhr[@jhr] for proposition: Topic.hulot_president[hulot_president], orientation: agree
Update on Vote.@jhr.hulot_president[@jhr/blank], key:@jhr.hulot_president, update: Vote.@jhr.hulot_president
  Total for Result.10855[hulot_president] is: 2 was: 2 direct: 1
  Computing orientation for Result.10855[hulot_president] expired: false agree: 1 against: 0 protest: 0 blank: 1
  Computed orientation Result.10855[hulot_president] was: blank is: blank
  Win about Result.10855[hulot_president] is: true was: false
Remove vote Vote.@jhr.hulot_president[@jhr/blank] previously blank of Persona.@jhr[@jhr] via @jhr.@n_hulot.#president from proposition Topic.hulot_president[hulot_president]
Add vote Vote.@jhr.hulot_president[@jhr/agree] now agree of Persona.@jhr[@jhr] via Delegation.@jhr.@n_hulot.#president[@n_hulot] for proposition Topic.hulot_president[hulot_president]
  Total for Result.10855[hulot_president] is: 2 was: 2 direct: 1
  Computing orientation for Result.10855[hulot_president] expired: false agree: 2 against: 0 protest: 0 blank: 0
  Computed orientation Result.10855[hulot_president] was: blank is: agree
  Change of orientation, create a transition
  Win about Result.10855[hulot_president] is: true was: true

Change.process, invoke create on ProtoVote.15 p: { persona: '@peter',
  proposition: 'hulot_president',
  orientation: 'neutral',
  id: 10023,
  ts: 1401374801375 }
Update on Vote.@peter.hulot_president[@peter/neutral], key:@peter.hulot_president, update: Vote.@peter.hulot_president
BUG? useless update of vote Vote.@peter.hulot_president[@peter/neutral]

Change.process, invoke create on ProtoVote.15 p: { persona: '@n_hulot',
  proposition: 'hulot_president',
  orientation: 'disagree',
  id: 10023,
  ts: 1401374801375 }
Update on Vote.@n_hulot.hulot_president[@n_hulot/agree], key:@n_hulot.hulot_president, update: Vote.@n_hulot.hulot_president
Remove vote Vote.@n_hulot.hulot_president[@n_hulot/agree] previously agree of Persona.@n_hulot[@n_hulot] via direct from proposition Topic.hulot_president[hulot_president]
Add vote Vote.@n_hulot.hulot_president[@n_hulot/disagree] now disagree of Persona.@n_hulot[@n_hulot] via direct for proposition Topic.hulot_president[hulot_president]
Persona Persona.@n_hulot[@n_hulot] votes disagree on proposition Topic.hulot_president[hulot_president] for at most 1 other personas
Cascade delegated vote by Persona.@n_hulot[@n_hulot] on behalf of Persona.@jhr[@jhr] for proposition: Topic.hulot_president[hulot_president], orientation: disagree
Update on Vote.@jhr.hulot_president[@jhr/agree], key:@jhr.hulot_president, update: Vote.@jhr.hulot_president
  Total for Result.10855[hulot_president] is: 2 was: 2 direct: 1
  Against about Result.10855[hulot_president] is: 1 was: 0
Remove vote Vote.@jhr.hulot_president[@jhr/agree] previously agree of Persona.@jhr[@jhr] via @jhr.@n_hulot.#president from proposition Topic.hulot_president[hulot_president]
Add vote Vote.@jhr.hulot_president[@jhr/disagree] now disagree of Persona.@jhr[@jhr] via Delegation.@jhr.@n_hulot.#president[@n_hulot] for proposition Topic.hulot_president[hulot_president]
  Total for Result.10855[hulot_president] is: 2 was: 2 direct: 1
  Against about Result.10855[hulot_president] is: 2 was: 1
  Win about Result.10855[hulot_president] is: false was: true
  Computing orientation for Result.10855[hulot_president] expired: false agree: 0 against: 2 protest: 0 blank: 0
  Computed orientation Result.10855[hulot_president] was: agree is: disagree
  Change of orientation, create a transition

Change.process, invoke create on ProtoVote.15 p: { persona: '@peter',
  proposition: 'hulot_president',
  orientation: 'agree',
  id: 10024,
  ts: 1401374801375 }
Update on Vote.@peter.hulot_president[@peter/neutral], key:@peter.hulot_president, update: Vote.@peter.hulot_president
Add vote Vote.@peter.hulot_president[@peter/agree] now agree of Persona.@peter[@peter] via direct for proposition Topic.hulot_president[hulot_president]
  Total for Result.10855[hulot_president] is: 3 was: 2 direct: 2
  Win about Result.10855[hulot_president] is: false was: false
  Computing orientation for Result.10855[hulot_president] expired: false agree: 1 against: 2 protest: 0 blank: 0
  Computed orientation Result.10855[hulot_president] was: disagree is: disagree

Change.process, invoke create on ProtoVersion.4 p: { label: '1', id: 10043, ts: 1401379239109 }

Change.process, invoke create on ProtoDelegation.18 p: { persona: '@jhr',
  agent: '@n_hulot',
  tags: [ '#president' ],
  id: 10044,
  ts: 1401379239109 }
Update on Delegation.@jhr.@n_hulot.#president[@n_hulot], key:@jhr.@n_hulot.#president, update: Delegation.@jhr.@n_hulot.#president
ToDo: deactivate a delegation
ToDo: handle removed tag Topic.#president[#president] for fresh delegation Delegation.@jhr.@n_hulot.#president[@n_hulot]
Add tag Topic.#president[#president] for fresh delegation Delegation.@jhr.@n_hulot.#president[@n_hulot]
Error { [TypeError: Property 'delegations' of object [object Object] is not a function]
  stack: 'TypeError: Property \'delegations\' of object [object Object] is not a function\n    at Topic.add_delegation (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:2563:26)\n    at C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:3282:15\n    at Array.forEach (native)\n    at Function.update (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:3280:15)\n    at Function.app.error_traced (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:62:16)\n    at transform_call (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\lib\\water.js:623:24)\n    at Function.a_water (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\lib\\water.js:1036:17)\n    at try_apply (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\lib\\water.js:641:19)\n    at dispatch (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\lib\\water.js:590:11)\n    at update (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\lib\\water.js:718:5)' } TypeError: Property 'delegations' of object [object Object] is not a function
    at Topic.add_delegation (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:2563:26)
    at C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:3282:15
    at Array.forEach (native)
    at Function.update (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:3280:15)
    at Function.app.error_traced (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:62:16)
    at transform_call (C:\Users\jean__000\Documents\GitHub\l8\lib\water.js:623:24)
    at Function.a_water (C:\Users\jean__000\Documents\GitHub\l8\lib\water.js:1036:17)
    at try_apply (C:\Users\jean__000\Documents\GitHub\l8\lib\water.js:641:19)
    at dispatch (C:\Users\jean__000\Documents\GitHub\l8\lib\water.js:590:11)
    at update (C:\Users\jean__000\Documents\GitHub\l8\lib\water.js:718:5)
Activate delegation
Update on Vote.@jhr.hulot_president[@jhr/disagree], key:@jhr.hulot_president, update: Vote.@jhr.hulot_president
Error { [TypeError: Property 'propositions' of object [object Object] is not a function]
  stack: 'TypeError: Property \'propositions\' of object [object Object] is not a function\n    at C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:3419:36\n    at Array.forEach (native)\n    at Delegation.vote_on_tags (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:3416:15)\n    at Delegation.update_votes (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:3403:14)\n    at Function.update (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:3299:18)\n    at Function.app.error_traced (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:62:16)\n    at transform_call (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\lib\\water.js:623:24)\n    at Function.a_water (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\lib\\water.js:1036:17)\n    at try_apply (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\lib\\water.js:641:19)\n    at dispatch (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\lib\\water.js:590:11)' } TypeError: Property 'propositions' of object [object Object] is not a function
    at C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:3419:36
    at Array.forEach (native)
    at Delegation.vote_on_tags (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:3416:15)
    at Delegation.update_votes (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:3403:14)
    at Function.update (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:3299:18)
    at Function.app.error_traced (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:62:16)
    at transform_call (C:\Users\jean__000\Documents\GitHub\l8\lib\water.js:623:24)
    at Function.a_water (C:\Users\jean__000\Documents\GitHub\l8\lib\water.js:1036:17)
    at try_apply (C:\Users\jean__000\Documents\GitHub\l8\lib\water.js:641:19)
    at dispatch (C:\Users\jean__000\Documents\GitHub\l8\lib\water.js:590:11)
Remove vote Vote.@jhr.hulot_president[@jhr/disagree] previously disagree of Persona.@jhr[@jhr] via @jhr.@n_hulot.#president from proposition Topic.hulot_president[hulot_president]
Add vote Vote.@jhr.hulot_president[@jhr/neutral] now neutral of Persona.@jhr[@jhr] via direct for proposition Topic.hulot_president[hulot_president]
  Total for Result.10855[hulot_president] is: 2 was: 3 direct: 2
  Against about Result.10855[hulot_president] is: 1 was: 2
  Win about Result.10855[hulot_president] is: false was: false
  Computing orientation for Result.10855[hulot_president] expired: false agree: 1 against: 1 protest: 0 blank: 0
  Computed orientation Result.10855[hulot_president] was: disagree is: disagree

Change.process, invoke create on ProtoTopic.12 p: { label: '#jhr', id: 10044, ts: 1401379239109 }
Key for new Topic.#jhr[#jhr] is: #jhr
Key for new Result.10868 is: #jhr
  Total for Result.10868[#jhr] is: 0 was: undefined direct: 0
  Against about Result.10868[#jhr] is: 0 was: undefined
  Win about Result.10868[#jhr] is: false was: undefined
  Computing orientation for Result.10868[#jhr] expired: false agree: 0 against: 0 protest: 0 blank: 0
  Computed orientation Result.10868[#jhr] was: neutral is: neutral

Change.process, invoke create on ProtoTopic.12 p: { label: 'n_hulot',
  tags: [ '#president', '#jhr' ],
  id: 10045,
  ts: 1401379239109 }
Key for new Topic.n_hulot[n_hulot] is: n_hulot
Key for new Result.10869 is: n_hulot
  Total for Result.10869[n_hulot] is: 0 was: undefined direct: 0
  Against about Result.10869[n_hulot] is: 0 was: undefined
  Win about Result.10869[n_hulot] is: false was: undefined
  Computing orientation for Result.10869[n_hulot] expired: false agree: 0 against: 0 protest: 0 blank: 0
  Computed orientation Result.10869[n_hulot] was: neutral is: neutral
Missing .propositions for tag Topic.#president[#president] { id: '#president',
  key: '#president',
  timestamp: 1401374801375,
  time_touched: 1401374801375,
  duration: 31536000000,
  expire: 1432910801375,
  label: '#president',
  name: '#president',
  result: false }
l8/test/vote.js, assert errorundefined
Could not process change { t: 'Topic',
  p: 
   { label: 'n_hulot',
     tags: [ '#president', '#jhr' ],
     id: 10045,
     ts: 1401379239109 },
  to: 'n_hulot' } { [TypeError: Property 'propositions' of object [object Object] is not a function]
  stack: 'TypeError: Property \'propositions\' of object [object Object] is not a function\n    at Topic.add_proposition (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:2480:19)\n    at C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:2189:11\n    at Array.forEach (native)\n    at new Topic (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:2184:18)\n    at Topic.ctor.create.sub_proto.create [as create] (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:723:18)\n    at Object.Change.process (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:1109:32)\n    at Function.<anonymous> (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:1645:37)\n    at try_call (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\lib\\water.js:636:19)\n    at Function.<anonymous> (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\lib\\water.js:1590:16)\n    at transform_call (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\lib\\water.js:623:24)' } TypeError: Property 'propositions' of object [object Object] is not a function
    at Topic.add_proposition (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:2480:19)
    at C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:2189:11
    at Array.forEach (native)
    at new Topic (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:2184:18)
    at Topic.ctor.create.sub_proto.create [as create] (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:723:18)
    at Object.Change.process (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:1109:32)
    at Function.<anonymous> (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:1645:37)
    at try_call (C:\Users\jean__000\Documents\GitHub\l8\lib\water.js:636:19)
    at Function.<anonymous> (C:\Users\jean__000\Documents\GitHub\l8\lib\water.js:1590:16)
    at transform_call (C:\Users\jean__000\Documents\GitHub\l8\lib\water.js:623:24)

Change.process, invoke create on ProtoTopic.12 p: { label: '#bar', id: 10046, ts: 1401379362740 }
Key for new Topic.#bar[#bar] is: #bar
Key for new Result.10870 is: #bar
  Total for Result.10870[#bar] is: 0 was: undefined direct: 0
  Against about Result.10870[#bar] is: 0 was: undefined
  Win about Result.10870[#bar] is: false was: undefined
  Computing orientation for Result.10870[#bar] expired: false agree: 0 against: 0 protest: 0 blank: 0
  Computed orientation Result.10870[#bar] was: neutral is: neutral

Change.process, invoke create on ProtoTopic.12 p: { label: 'Cyrnea_is_the_best',
  tags: [ '#jhr', '#bar' ],
  id: 10047,
  ts: 1401379362740 }
Key for new Topic.cyrnea_is_the_best[Cyrnea_is_the_best] is: cyrnea_is_the_best
Key for new Result.10871 is: cyrnea_is_the_best
  Total for Result.10871[Cyrnea_is_the_best] is: 0 was: undefined direct: 0
  Against about Result.10871[Cyrnea_is_the_best] is: 0 was: undefined
  Win about Result.10871[Cyrnea_is_the_best] is: false was: undefined
  Computing orientation for Result.10871[Cyrnea_is_the_best] expired: false agree: 0 against: 0 protest: 0 blank: 0
  Computed orientation Result.10871[Cyrnea_is_the_best] was: neutral is: neutral

Change.process, invoke create on ProtoTopic.12 p: { label: '#best', id: 10048, ts: 1401379402156 }
Key for new Topic.#best[#best] is: #best
Key for new Result.10872 is: #best
  Total for Result.10872[#best] is: 0 was: undefined direct: 0
  Against about Result.10872[#best] is: 0 was: undefined
  Win about Result.10872[#best] is: false was: undefined
  Computing orientation for Result.10872[#best] expired: false agree: 0 against: 0 protest: 0 blank: 0
  Computed orientation Result.10872[#best] was: neutral is: neutral

Change.process, invoke create on ProtoTopic.12 p: { label: 'Rex_is_the_best',
  tags: [ '#jhr', '#bar', '#best' ],
  id: 10049,
  ts: 1401379402156 }
Key for new Topic.rex_is_the_best[Rex_is_the_best] is: rex_is_the_best
Key for new Result.10873 is: rex_is_the_best
  Total for Result.10873[Rex_is_the_best] is: 0 was: undefined direct: 0
  Against about Result.10873[Rex_is_the_best] is: 0 was: undefined
  Win about Result.10873[Rex_is_the_best] is: false was: undefined
  Computing orientation for Result.10873[Rex_is_the_best] expired: false agree: 0 against: 0 protest: 0 blank: 0
  Computed orientation Result.10873[Rex_is_the_best] was: neutral is: neutral

Change.process, invoke create on ProtoTagging.13 p: { proposition: 'cyrnea_is_the_best',
  tags: [ '#jhr', '#best', '#bar' ],
  id: 10050,
  ts: 1401379423268 }

Change.process, invoke create on ProtoTopic.12 p: { label: '#cool', id: 10051, ts: 1401379432387 }
Key for new Topic.#cool[#cool] is: #cool
Key for new Result.10874 is: #cool
  Total for Result.10874[#cool] is: 0 was: undefined direct: 0
  Against about Result.10874[#cool] is: 0 was: undefined
  Win about Result.10874[#cool] is: false was: undefined
  Computing orientation for Result.10874[#cool] expired: false agree: 0 against: 0 protest: 0 blank: 0
  Computed orientation Result.10874[#cool] was: neutral is: neutral

Change.process, invoke create on ProtoTopic.12 p: { label: 'chloe_is_the_best',
  tags: [ '#jhr', '#best', '#cool' ],
  id: 10052,
  ts: 1401379432387 }
Key for new Topic.chloe_is_the_best[chloe_is_the_best] is: chloe_is_the_best
Key for new Result.10875 is: chloe_is_the_best
  Total for Result.10875[chloe_is_the_best] is: 0 was: undefined direct: 0
  Against about Result.10875[chloe_is_the_best] is: 0 was: undefined
  Win about Result.10875[chloe_is_the_best] is: false was: undefined
  Computing orientation for Result.10875[chloe_is_the_best] expired: false agree: 0 against: 0 protest: 0 blank: 0
  Computed orientation Result.10875[chloe_is_the_best] was: neutral is: neutral

Change.process, invoke create on ProtoTopic.12 p: { label: 'JanekIsTheBest',
  tags: [ '#jhr', '#best', '#cool' ],
  id: 10053,
  ts: 1401379442883 }
Key for new Topic.janekisthebest[JanekIsTheBest] is: janekisthebest
Key for new Result.10876 is: janekisthebest
  Total for Result.10876[JanekIsTheBest] is: 0 was: undefined direct: 0
  Against about Result.10876[JanekIsTheBest] is: 0 was: undefined
  Win about Result.10876[JanekIsTheBest] is: false was: undefined
  Computing orientation for Result.10876[JanekIsTheBest] expired: false agree: 0 against: 0 protest: 0 blank: 0
  Computed orientation Result.10876[JanekIsTheBest] was: neutral is: neutral

Change.process, invoke create on ProtoVersion.4 p: { label: '1', id: 10081, ts: 1401379795695 }

Change.process, invoke create on ProtoDelegation.18 p: { persona: '@jhr',
  agent: '@n_hulot',
  tags: [ '#best' ],
  id: 10082,
  ts: 1401379795695 }
Key for new Delegation.@jhr.@n_hulot.#best is: @jhr.@n_hulot.#best
Add delegation Delegation.@jhr.@n_hulot.#best[@n_hulot] for persona Persona.@jhr[@jhr] for topics tagged [Topic.#best[#best]] to agent Persona.@n_hulot[@n_hulot]
Add delegation Delegation.@jhr.@n_hulot.#best[@n_hulot] by agent Persona.@n_hulot[@n_hulot] for topics tagged [Topic.#best[#best]] from persona Persona.@jhr[@jhr]
Add tag Topic.#best[#best] for fresh delegation Delegation.@jhr.@n_hulot.#best[@n_hulot]
Activate delegation
BUG? unexpected vote on Topic.rex_is_the_best[Rex_is_the_best] of Persona.@n_hulot[@n_hulot]
BUG? unexpected vote on Topic.cyrnea_is_the_best[Cyrnea_is_the_best] of Persona.@n_hulot[@n_hulot]
BUG? unexpected vote on Topic.chloe_is_the_best[chloe_is_the_best] of Persona.@n_hulot[@n_hulot]
BUG? unexpected vote on Topic.janekisthebest[JanekIsTheBest] of Persona.@n_hulot[@n_hulot]

Change.process, invoke create on ProtoTopic.12 p: { label: '__n_hulot',
  tags: [ '#jhr', '#best' ],
  id: 10082,
  ts: 1401379795695 }
Key for new Topic.__n_hulot[__n_hulot] is: __n_hulot
Key for new Result.10877 is: __n_hulot
  Total for Result.10877[__n_hulot] is: 0 was: undefined direct: 0
  Against about Result.10877[__n_hulot] is: 0 was: undefined
  Win about Result.10877[__n_hulot] is: false was: undefined
  Computing orientation for Result.10877[__n_hulot] expired: false agree: 0 against: 0 protest: 0 blank: 0
  Computed orientation Result.10877[__n_hulot] was: neutral is: neutral
ToDo: handle delegation Delegation.@jhr.@n_hulot.#best[@n_hulot] in update_votes()
BUG? unexpected vote on Topic.__n_hulot[__n_hulot] of Persona.@n_hulot[@n_hulot]

Change.process, invoke create on ProtoDelegation.18 p: { persona: '@jhr',
  agent: '@n_hulot',
  tags: [ '#best' ],
  id: 10083,
  ts: 1401379855406 }
Update on Delegation.@jhr.@n_hulot.#best[@n_hulot], key:@jhr.@n_hulot.#best, update: Delegation.@jhr.@n_hulot.#best

Change.process, invoke create on ProtoTagging.13 p: { proposition: '__n_hulot',
  tags: [ '#jhr', '#best' ],
  id: 10083,
  ts: 1401379855406 }

Change.process, invoke create on ProtoVersion.4 p: { label: '1', id: 10112, ts: 1401381930712 }

Change.process, invoke create on ProtoDelegation.18 p: { persona: '@jhr',
  agent: '@n_hulot',
  tags: [ '#president' ],
  id: 10113,
  ts: 1401381930712 }
Update on Delegation.@jhr.@n_hulot.#president[@n_hulot], key:@jhr.@n_hulot.#president, update: Delegation.@jhr.@n_hulot.#president

Change.process, invoke create on ProtoTagging.13 p: { proposition: 'n_hulot',
  tags: [ '#jhr', '#president' ],
  id: 10114,
  ts: 1401381930712 }

Change.process, invoke create on ProtoVersion.4 p: { label: '1', id: 10144, ts: 1401382603313 }

Change.process, invoke create on ProtoDelegation.18 p: { persona: '@jhr',
  agent: '@n_hulot',
  tags: [ '#president' ],
  id: 10145,
  ts: 1401382603313 }
Update on Delegation.@jhr.@n_hulot.#president[@n_hulot], key:@jhr.@n_hulot.#president, update: Delegation.@jhr.@n_hulot.#president

Change.process, invoke create on ProtoTagging.13 p: { proposition: '#jhr',
  tags: [ '#jhr', '#president' ],
  id: 10145,
  ts: 1401382603313 }
Could not process change { t: 'Tagging',
  p: 
   { proposition: '#jhr',
     tags: [ '#jhr', '#president' ],
     id: 10145,
     ts: 1401382603313 },
  to: 10145 } { [TypeError: Property 'propositions' of object [object Object] is not a function]
  stack: 'TypeError: Property \'propositions\' of object [object Object] is not a function\n    at Topic.add_proposition (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:2480:19)\n    at Topic.add_tag (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:2429:9)\n    at C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:2635:24\n    at Array.forEach (native)\n    at new Tagging (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:2626:13)\n    at Tagging.ctor.create.sub_proto.create [as create] (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:723:18)\n    at Object.Change.process (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:1109:32)\n    at Function.<anonymous> (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:1645:37)\n    at try_call (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\lib\\water.js:636:19)\n    at Function.<anonymous> (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\lib\\water.js:1590:16)' } TypeError: Property 'propositions' of object [object Object] is not a function
    at Topic.add_proposition (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:2480:19)
    at Topic.add_tag (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:2429:9)
    at C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:2635:24
    at Array.forEach (native)
    at new Tagging (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:2626:13)
    at Tagging.ctor.create.sub_proto.create [as create] (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:723:18)
    at Object.Change.process (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:1109:32)
    at Function.<anonymous> (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:1645:37)
    at try_call (C:\Users\jean__000\Documents\GitHub\l8\lib\water.js:636:19)
    at Function.<anonymous> (C:\Users\jean__000\Documents\GitHub\l8\lib\water.js:1590:16)

Change.process, invoke create on ProtoVersion.4 p: { label: '1', id: 10175, ts: 1401382949878 }

Change.process, invoke create on ProtoDelegation.18 p: { persona: '@jhr',
  agent: '@n_hulot',
  tags: [ '#president' ],
  id: 10176,
  ts: 1401382949878 }
Update on Delegation.@jhr.@n_hulot.#president[@n_hulot], key:@jhr.@n_hulot.#president, update: Delegation.@jhr.@n_hulot.#president

Change.process, invoke create on ProtoTagging.13 p: { proposition: '#jhr',
  tags: [ '#jhr', '#president' ],
  id: 10176,
  ts: 1401382949878 }

Change.process, invoke create on ProtoDelegation.18 p: { persona: '@jhr',
  agent: '@n_hulot',
  tags: [ '#president' ],
  id: 10177,
  ts: 1401383074143 }
Update on Delegation.@jhr.@n_hulot.#president[@n_hulot], key:@jhr.@n_hulot.#president, update: Delegation.@jhr.@n_hulot.#president

Change.process, invoke create on ProtoTagging.13 p: { proposition: '#jhr',
  tags: [ '#jhr', '#president' ],
  id: 10177,
  ts: 1401383074143 }

Change.process, invoke create on ProtoVersion.4 p: { label: '1', id: 10207, ts: 1401387063570 }

Change.process, invoke create on ProtoVote.15 p: { persona: '@jhr',
  proposition: 'kudocracy',
  orientation: 'agree',
  id: 10208,
  ts: 1401387063570 }
Key for new Vote.@jhr.kudocracy is: @jhr.kudocracy
Add vote Vote.@jhr.kudocracy[@jhr/agree] now agree of Persona.@jhr[@jhr] via direct for proposition Topic.kudocracy[kudocracy]
  Total for Result.10853[kudocracy] is: 1 was: 0 direct: 1
  Win about Result.10853[kudocracy] is: true was: false
  Computing orientation for Result.10853[kudocracy] expired: false agree: 1 against: 0 protest: 0 blank: 0
  Computed orientation Result.10853[kudocracy] was: neutral is: agree
  Change of orientation, create a transition

Change.process, invoke create on ProtoVote.15 p: { persona: '@jhr',
  proposition: 'hollande_president',
  orientation: 'disagree',
  id: 10209,
  ts: 1401387078870 }
Key for new Vote.@jhr.hollande_president is: @jhr.hollande_president
Add vote Vote.@jhr.hollande_president[@jhr/disagree] now disagree of Persona.@jhr[@jhr] via direct for proposition Topic.hollande_president[hollande_president]
  Total for Result.10854[hollande_president] is: 1 was: 0 direct: 1
  Against about Result.10854[hollande_president] is: 1 was: 0
  Win about Result.10854[hollande_president] is: false was: false
  Computing orientation for Result.10854[hollande_president] expired: false agree: 0 against: 1 protest: 0 blank: 0
  Computed orientation Result.10854[hollande_president] was: neutral is: disagree
  Change of orientation, create a transition

Change.process, invoke create on ProtoVote.15 p: { persona: '@jhr',
  proposition: 'n_hulot',
  orientation: 'agree',
  id: 10210,
  ts: 1401387085538 }
Key for new Vote.@jhr.n_hulot is: @jhr.n_hulot
Add vote Vote.@jhr.n_hulot[@jhr/agree] now agree of Persona.@jhr[@jhr] via direct for proposition Topic.n_hulot[n_hulot]
  Total for Result.10869[n_hulot] is: 1 was: 0 direct: 1
  Win about Result.10869[n_hulot] is: true was: false
  Computing orientation for Result.10869[n_hulot] expired: false agree: 1 against: 0 protest: 0 blank: 0
  Computed orientation Result.10869[n_hulot] was: neutral is: agree
  Change of orientation, create a transition

Change.process, invoke create on ProtoVote.15 p: { persona: '@jhr',
  proposition: 'cyrnea_is_the_best',
  orientation: 'agree',
  id: 10211,
  ts: 1401387092817 }
Key for new Vote.@jhr.cyrnea_is_the_best is: @jhr.cyrnea_is_the_best
Add vote Vote.@jhr.cyrnea_is_the_best[@jhr/agree] now agree of Persona.@jhr[@jhr] via direct for proposition Topic.cyrnea_is_the_best[Cyrnea_is_the_best]
  Total for Result.10871[Cyrnea_is_the_best] is: 1 was: 0 direct: 1
  Win about Result.10871[Cyrnea_is_the_best] is: true was: false
  Computing orientation for Result.10871[Cyrnea_is_the_best] expired: false agree: 1 against: 0 protest: 0 blank: 0
  Computed orientation Result.10871[Cyrnea_is_the_best] was: neutral is: agree
  Change of orientation, create a transition

Change.process, invoke create on ProtoVote.15 p: { persona: '@jhr',
  proposition: 'chloe_is_the_best',
  orientation: 'agree',
  id: 10212,
  ts: 1401387102490 }
Key for new Vote.@jhr.chloe_is_the_best is: @jhr.chloe_is_the_best
Add vote Vote.@jhr.chloe_is_the_best[@jhr/agree] now agree of Persona.@jhr[@jhr] via direct for proposition Topic.chloe_is_the_best[chloe_is_the_best]
  Total for Result.10875[chloe_is_the_best] is: 1 was: 0 direct: 1
  Win about Result.10875[chloe_is_the_best] is: true was: false
  Computing orientation for Result.10875[chloe_is_the_best] expired: false agree: 1 against: 0 protest: 0 blank: 0
  Computed orientation Result.10875[chloe_is_the_best] was: neutral is: agree
  Change of orientation, create a transition

Change.process, invoke create on ProtoVote.15 p: { persona: '@jhr',
  proposition: 'janekisthebest',
  orientation: 'agree',
  id: 10213,
  ts: 1401387105761 }
Key for new Vote.@jhr.janekisthebest is: @jhr.janekisthebest
Add vote Vote.@jhr.janekisthebest[@jhr/agree] now agree of Persona.@jhr[@jhr] via direct for proposition Topic.janekisthebest[JanekIsTheBest]
  Total for Result.10876[JanekIsTheBest] is: 1 was: 0 direct: 1
  Win about Result.10876[JanekIsTheBest] is: true was: false
  Computing orientation for Result.10876[JanekIsTheBest] expired: false agree: 1 against: 0 protest: 0 blank: 0
  Computed orientation Result.10876[JanekIsTheBest] was: neutral is: agree
  Change of orientation, create a transition

Change.process, invoke create on ProtoVote.15 p: { persona: '@jhr',
  proposition: 'rex_is_the_best',
  orientation: 'disagree',
  id: 10214,
  ts: 1401387122816 }
Key for new Vote.@jhr.rex_is_the_best is: @jhr.rex_is_the_best
Add vote Vote.@jhr.rex_is_the_best[@jhr/disagree] now disagree of Persona.@jhr[@jhr] via direct for proposition Topic.rex_is_the_best[Rex_is_the_best]
  Total for Result.10873[Rex_is_the_best] is: 1 was: 0 direct: 1
  Against about Result.10873[Rex_is_the_best] is: 1 was: 0
  Win about Result.10873[Rex_is_the_best] is: false was: false
  Computing orientation for Result.10873[Rex_is_the_best] expired: false agree: 0 against: 1 protest: 0 blank: 0
  Computed orientation Result.10873[Rex_is_the_best] was: neutral is: disagree
  Change of orientation, create a transition

Change.process, invoke create on ProtoVote.15 p: { persona: '@jhr',
  proposition: '__n_hulot',
  orientation: 'protest',
  id: 10215,
  ts: 1401387166780 }
Key for new Vote.@jhr.__n_hulot is: @jhr.__n_hulot
Add vote Vote.@jhr.__n_hulot[@jhr/protest] now protest of Persona.@jhr[@jhr] via direct for proposition Topic.__n_hulot[__n_hulot]
  Total for Result.10877[__n_hulot] is: 1 was: 0 direct: 1
  Against about Result.10877[__n_hulot] is: 1 was: 0
  Win about Result.10877[__n_hulot] is: false was: false
  Computing orientation for Result.10877[__n_hulot] expired: false agree: 0 against: 1 protest: 1 blank: 0
  Computed orientation Result.10877[__n_hulot] was: neutral is: protest
  Change of orientation, create a transition

Change.process, invoke create on ProtoVersion.4 p: { label: '1', id: 10253, ts: 1401405268132 }

Change.process, invoke create on ProtoVote.15 p: { persona: '@jhr',
  proposition: 'n_hulot',
  orientation: 'blank',
  id: 10254,
  ts: 1401405268132 }
Update on Vote.@jhr.n_hulot[@jhr/agree], key:@jhr.n_hulot, update: Vote.@jhr.n_hulot
Remove vote Vote.@jhr.n_hulot[@jhr/agree] previously agree of Persona.@jhr[@jhr] via direct from proposition Topic.n_hulot[n_hulot]
Add vote Vote.@jhr.n_hulot[@jhr/blank] now blank of Persona.@jhr[@jhr] via direct for proposition Topic.n_hulot[n_hulot]
  Total for Result.10869[n_hulot] is: 1 was: 1 direct: 1
  Win about Result.10869[n_hulot] is: false was: true
  Computing orientation for Result.10869[n_hulot] expired: false agree: 0 against: 0 protest: 0 blank: 1
  Computed orientation Result.10869[n_hulot] was: agree is: blank
  Change of orientation, create a transition

Change.process, invoke create on ProtoVersion.4 p: { label: '1', id: 10293, ts: 1401411062335 }

Change.process, invoke create on ProtoPersona.9 p: { label: '@jvincent', id: 10294, ts: 1401411062335 }
Key for new Persona.@jvincent[@jvincent] is: @jvincent

Change.process, invoke create on ProtoVote.15 p: { persona: '@jvincent',
  proposition: 'n_hulot',
  orientation: 'agree',
  id: 10294,
  ts: 1401411095372 }
Key for new Vote.@jvincent.n_hulot is: @jvincent.n_hulot
Add vote Vote.@jvincent.n_hulot[@jvincent/agree] now agree of Persona.@jvincent[@jvincent] via direct for proposition Topic.n_hulot[n_hulot]
  Total for Result.10869[n_hulot] is: 2 was: 1 direct: 2
  Win about Result.10869[n_hulot] is: true was: false
  Computing orientation for Result.10869[n_hulot] expired: false agree: 1 against: 0 protest: 0 blank: 1
  Computed orientation Result.10869[n_hulot] was: blank is: blank

Change.process, invoke create on ProtoVote.15 p: { persona: '@jvincent',
  proposition: 'hulot_president',
  orientation: 'blank',
  id: 10294,
  ts: 1401411103419 }
Key for new Vote.@jvincent.hulot_president is: @jvincent.hulot_president
Add vote Vote.@jvincent.hulot_president[@jvincent/blank] now blank of Persona.@jvincent[@jvincent] via direct for proposition Topic.hulot_president[hulot_president]
  Total for Result.10855[hulot_president] is: 3 was: 2 direct: 3
  Computing orientation for Result.10855[hulot_president] expired: false agree: 1 against: 1 protest: 0 blank: 1
  Computed orientation Result.10855[hulot_president] was: disagree is: blank
  Change of orientation, create a transition

Change.process, invoke create on ProtoVote.15 p: { persona: '@jvincent',
  proposition: 'kudocracy',
  orientation: 'agree',
  id: 10295,
  ts: 1401411107092 }
Key for new Vote.@jvincent.kudocracy is: @jvincent.kudocracy
Add vote Vote.@jvincent.kudocracy[@jvincent/agree] now agree of Persona.@jvincent[@jvincent] via direct for proposition Topic.kudocracy[kudocracy]
  Total for Result.10853[kudocracy] is: 2 was: 1 direct: 2
  Win about Result.10853[kudocracy] is: true was: true
  Computing orientation for Result.10853[kudocracy] expired: false agree: 2 against: 0 protest: 0 blank: 0
  Computed orientation Result.10853[kudocracy] was: agree is: agree

Change.process, invoke create on ProtoVote.15 p: { persona: '@jvincent',
  proposition: 'hollande_president',
  orientation: 'disagree',
  id: 10295,
  ts: 1401411110542 }
Key for new Vote.@jvincent.hollande_president is: @jvincent.hollande_president
Add vote Vote.@jvincent.hollande_president[@jvincent/disagree] now disagree of Persona.@jvincent[@jvincent] via direct for proposition Topic.hollande_president[hollande_president]
  Total for Result.10854[hollande_president] is: 2 was: 1 direct: 2
  Against about Result.10854[hollande_president] is: 2 was: 1
  Win about Result.10854[hollande_president] is: false was: false
  Computing orientation for Result.10854[hollande_president] expired: false agree: 0 against: 2 protest: 0 blank: 0
  Computed orientation Result.10854[hollande_president] was: disagree is: disagree

Change.process, invoke create on ProtoVote.15 p: { persona: '@jvincent',
  proposition: 'cyrnea_is_the_best',
  orientation: 'blank',
  id: 10295,
  ts: 1401411114467 }
Key for new Vote.@jvincent.cyrnea_is_the_best is: @jvincent.cyrnea_is_the_best
Add vote Vote.@jvincent.cyrnea_is_the_best[@jvincent/blank] now blank of Persona.@jvincent[@jvincent] via direct for proposition Topic.cyrnea_is_the_best[Cyrnea_is_the_best]
  Total for Result.10871[Cyrnea_is_the_best] is: 2 was: 1 direct: 2
  Computing orientation for Result.10871[Cyrnea_is_the_best] expired: false agree: 1 against: 0 protest: 0 blank: 1
  Computed orientation Result.10871[Cyrnea_is_the_best] was: agree is: blank
  Change of orientation, create a transition

Change.process, invoke create on ProtoVote.15 p: { persona: '@jvincent',
  proposition: 'chloe_is_the_best',
  orientation: 'blank',
  id: 10296,
  ts: 1401411120484 }
Key for new Vote.@jvincent.chloe_is_the_best is: @jvincent.chloe_is_the_best
Add vote Vote.@jvincent.chloe_is_the_best[@jvincent/blank] now blank of Persona.@jvincent[@jvincent] via direct for proposition Topic.chloe_is_the_best[chloe_is_the_best]
  Total for Result.10875[chloe_is_the_best] is: 2 was: 1 direct: 2
  Computing orientation for Result.10875[chloe_is_the_best] expired: false agree: 1 against: 0 protest: 0 blank: 1
  Computed orientation Result.10875[chloe_is_the_best] was: agree is: blank
  Change of orientation, create a transition

Change.process, invoke create on ProtoVote.15 p: { persona: '@jvincent',
  proposition: 'janekisthebest',
  orientation: 'blank',
  id: 10297,
  ts: 1401411125715 }
Key for new Vote.@jvincent.janekisthebest is: @jvincent.janekisthebest
Add vote Vote.@jvincent.janekisthebest[@jvincent/blank] now blank of Persona.@jvincent[@jvincent] via direct for proposition Topic.janekisthebest[JanekIsTheBest]
  Total for Result.10876[JanekIsTheBest] is: 2 was: 1 direct: 2
  Computing orientation for Result.10876[JanekIsTheBest] expired: false agree: 1 against: 0 protest: 0 blank: 1
  Computed orientation Result.10876[JanekIsTheBest] was: agree is: blank
  Change of orientation, create a transition

Change.process, invoke create on ProtoVote.15 p: { persona: '@jvincent',
  proposition: 'chloe_is_the_best',
  orientation: 'blank',
  id: 10298,
  ts: 1401411134723 }
Update on Vote.@jvincent.chloe_is_the_best[@jvincent/blank], key:@jvincent.chloe_is_the_best, update: Vote.@jvincent.chloe_is_the_best
BUG? useless update of vote Vote.@jvincent.chloe_is_the_best[@jvincent/blank]

Change.process, invoke create on ProtoVote.15 p: { persona: '@jvincent',
  proposition: '__n_hulot',
  orientation: 'protest',
  id: 10298,
  ts: 1401411142555 }
Key for new Vote.@jvincent.__n_hulot is: @jvincent.__n_hulot
Add vote Vote.@jvincent.__n_hulot[@jvincent/protest] now protest of Persona.@jvincent[@jvincent] via direct for proposition Topic.__n_hulot[__n_hulot]
  Total for Result.10877[__n_hulot] is: 2 was: 1 direct: 2
  Against about Result.10877[__n_hulot] is: 2 was: 1
  Win about Result.10877[__n_hulot] is: false was: false
  Computing orientation for Result.10877[__n_hulot] expired: false agree: 0 against: 2 protest: 2 blank: 0
  Computed orientation Result.10877[__n_hulot] was: protest is: protest

Change.process, invoke create on ProtoVote.15 p: { persona: '@jvincent',
  proposition: 'hulot_president',
  orientation: 'agree',
  id: 10298,
  ts: 1401411429697 }
Update on Vote.@jvincent.hulot_president[@jvincent/blank], key:@jvincent.hulot_president, update: Vote.@jvincent.hulot_president
Remove vote Vote.@jvincent.hulot_president[@jvincent/blank] previously blank of Persona.@jvincent[@jvincent] via direct from proposition Topic.hulot_president[hulot_president]
Add vote Vote.@jvincent.hulot_president[@jvincent/agree] now agree of Persona.@jvincent[@jvincent] via direct for proposition Topic.hulot_president[hulot_president]
  Total for Result.10855[hulot_president] is: 3 was: 3 direct: 3
  Computing orientation for Result.10855[hulot_president] expired: false agree: 2 against: 1 protest: 0 blank: 0
  Computed orientation Result.10855[hulot_president] was: blank is: agree
  Change of orientation, create a transition
  Win about Result.10855[hulot_president] is: true was: false

Change.process, invoke create on ProtoVersion.4 p: { label: '1', id: 10339, ts: 1401445419406 }

Change.process, invoke create on ProtoVersion.4 p: { label: '1', id: 10380, ts: 1401445763016 }

Change.process, invoke create on ProtoVersion.4 p: { label: '1', id: 10421, ts: 1401445974198 }

Change.process, invoke create on ProtoVersion.4 p: { label: '1', id: 10462, ts: 1401446041782 }

Change.process, invoke create on ProtoVersion.4 p: { label: '1', id: 10503, ts: 1401446163566 }

Change.process, invoke create on ProtoVersion.4 p: { label: '1', id: 10544, ts: 1401446231253 }

Change.process, invoke create on ProtoVersion.4 p: { label: '1', id: 10585, ts: 1401446542874 }

Change.process, invoke create on ProtoVersion.4 p: { label: '1', id: 10626, ts: 1401446653895 }

Change.process, invoke create on ProtoDelegation.18 p: { id_key: '@jhr.@n_hulot.#president',
  privacy: 'secret',
  id: 10627,
  ts: 1401446653895 }
Update on Delegation.@jhr.@n_hulot.#president[@n_hulot], key:@jhr.@n_hulot.#president, update: Delegation.@jhr.@n_hulot.#president

Change.process, invoke create on ProtoDelegation.18 p: { id_key: '@jhr.@n_hulot.#president',
  privacy: 'public',
  id: 10627,
  ts: 1401446677960 }
Update on Delegation.@jhr.@n_hulot.#president[@n_hulot], key:@jhr.@n_hulot.#president, update: Delegation.@jhr.@n_hulot.#president

Change.process, invoke create on ProtoVersion.4 p: { label: '1', id: 10668, ts: 1401468184689 }

Change.process, invoke create on ProtoPersona.9 p: { label: '@LucasRobert', id: 10669, ts: 1401468184689 }
Key for new Persona.@lucasrobert[@LucasRobert] is: @lucasrobert

Change.process, invoke create on ProtoVersion.4 p: { label: '1', id: 10710, ts: 1401483941159 }

Change.process, invoke create on ProtoVote.15 p: { persona: '@jhr',
  proposition: 'cyrnea_is_the_best',
  id: 10711,
  ts: 1401483941159 }
Update on Vote.@jhr.cyrnea_is_the_best[@jhr/agree], key:@jhr.cyrnea_is_the_best, update: Vote.@jhr.cyrnea_is_the_best
BUG? useless update of vote Vote.@jhr.cyrnea_is_the_best[@jhr/agree]

Change.process, invoke create on ProtoVersion.4 p: { label: '1', id: 10752, ts: 1401484891757 }

Change.process, invoke create on ProtoComment.14 p: { vote: '@jhr.cyrnea_is_the_best',
  text: 'C\'est le bar le plus sympa de Corté !',
  id: 10753,
  ts: 1401484891757 }
BUG! this should not happen...

Change.process, invoke create on ProtoVersion.4 p: { label: '1', id: 10794, ts: 1401498556365 }

Change.process, invoke create on ProtoVote.15 p: { persona: '@jhr',
  proposition: '#jhr',
  orientation: 'agree',
  id: 10795,
  ts: 1401498556365 }
Key for new Vote.@jhr.#jhr is: @jhr.#jhr
Add vote Vote.@jhr.#jhr[@jhr/agree] now agree of Persona.@jhr[@jhr] via direct for proposition Topic.#jhr[#jhr]
  Total for Result.10868[#jhr] is: 1 was: 0 direct: 1
  Win about Result.10868[#jhr] is: true was: false
  Computing orientation for Result.10868[#jhr] expired: false agree: 1 against: 0 protest: 0 blank: 0
  Computed orientation Result.10868[#jhr] was: neutral is: agree
  Change of orientation, create a transition

Change.process, invoke create on ProtoVote.15 p: { id_key: '@jhr.#jhr',
  orientation: 'disagree',
  id: 10796,
  ts: 1401498585145 }
Update on Vote.@jhr.#jhr[@jhr/agree], key:@jhr.#jhr, update: Vote.@jhr.#jhr
Remove vote Vote.@jhr.#jhr[@jhr/agree] previously agree of Persona.@jhr[@jhr] via direct from proposition Topic.#jhr[#jhr]
Add vote Vote.@jhr.#jhr[@jhr/disagree] now disagree of Persona.@jhr[@jhr] via direct for proposition Topic.#jhr[#jhr]
  Total for Result.10868[#jhr] is: 1 was: 1 direct: 1
  Against about Result.10868[#jhr] is: 1 was: 0
  Win about Result.10868[#jhr] is: false was: true
  Computing orientation for Result.10868[#jhr] expired: false agree: 0 against: 1 protest: 0 blank: 0
  Computed orientation Result.10868[#jhr] was: agree is: disagree
  Change of orientation, create a transition

Change.process, invoke create on ProtoVersion.4 p: { label: '1', id: 10839, ts: 1401499305901 }

Change.process, invoke create on ProtoVote.15 p: { persona: '@jhr',
  proposition: '#best',
  orientation: 'agree',
  id: 10840,
  ts: 1401499305901 }
Key for new Vote.@jhr.#best is: @jhr.#best
Add vote Vote.@jhr.#best[@jhr/agree] now agree of Persona.@jhr[@jhr] via direct for proposition Topic.#best[#best]
  Total for Result.10872[#best] is: 1 was: 0 direct: 1
  Win about Result.10872[#best] is: true was: false
  Computing orientation for Result.10872[#best] expired: false agree: 1 against: 0 protest: 0 blank: 0
  Computed orientation Result.10872[#best] was: neutral is: agree
  Change of orientation, create a transition

Change.process, invoke create on ProtoVote.15 p: { persona: '@jhr',
  proposition: '#president',
  orientation: 'agree',
  id: 10841,
  ts: 1401499333421 }
Key for new Vote.@jhr.#president is: @jhr.#president
Add vote Vote.@jhr.#president[@jhr/agree] now agree of Persona.@jhr[@jhr] via direct for proposition Topic.#president[#president]
Could not process vote Vote.@jhr.#president[@jhr/agree] { [TypeError: Property 'votes_log' of object [object Object] is not a function]
  stack: 'TypeError: Property \'votes_log\' of object [object Object] is not a function\n    at Topic.log_vote (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:2385:24)\n    at Topic.add_vote (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:2363:8)\n    at Vote.add (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:2874:20)\n    at Function.update (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:2746:12)\n    at Function.app.error_traced (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\test\\vote.js:62:16)\n    at transform_call (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\lib\\water.js:623:24)\n    at Function.a_water (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\lib\\water.js:1036:17)\n    at try_apply (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\lib\\water.js:641:19)\n    at dispatch (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\lib\\water.js:590:11)\n    at update (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\lib\\water.js:718:5)' } TypeError: Property 'votes_log' of object [object Object] is not a function
    at Topic.log_vote (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:2385:24)
    at Topic.add_vote (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:2363:8)
    at Vote.add (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:2874:20)
    at Function.update (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:2746:12)
    at Function.app.error_traced (C:\Users\jean__000\Documents\GitHub\l8\test\vote.js:62:16)
    at transform_call (C:\Users\jean__000\Documents\GitHub\l8\lib\water.js:623:24)
    at Function.a_water (C:\Users\jean__000\Documents\GitHub\l8\lib\water.js:1036:17)
    at try_apply (C:\Users\jean__000\Documents\GitHub\l8\lib\water.js:641:19)
    at dispatch (C:\Users\jean__000\Documents\GitHub\l8\lib\water.js:590:11)
    at update (C:\Users\jean__000\Documents\GitHub\l8\lib\water.js:718:5)

Change.process, invoke create on ProtoVote.15 p: { persona: '@jhr',
  proposition: '#bar',
  orientation: 'agree',
  id: 10842,
  ts: 1401499381189 }
Key for new Vote.@jhr.#bar is: @jhr.#bar
Add vote Vote.@jhr.#bar[@jhr/agree] now agree of Persona.@jhr[@jhr] via direct for proposition Topic.#bar[#bar]
  Total for Result.10870[#bar] is: 1 was: 0 direct: 1
  Win about Result.10870[#bar] is: true was: false
  Computing orientation for Result.10870[#bar] expired: false agree: 1 against: 0 protest: 0 blank: 0
  Computed orientation Result.10870[#bar] was: neutral is: agree
  Change of orientation, create a transition

Change.process, invoke create on ProtoVote.15 p: { persona: '@jhr',
  proposition: '#cool',
  orientation: 'agree',
  id: 10843,
  ts: 1401499388941 }
Key for new Vote.@jhr.#cool is: @jhr.#cool
Add vote Vote.@jhr.#cool[@jhr/agree] now agree of Persona.@jhr[@jhr] via direct for proposition Topic.#cool[#cool]
  Total for Result.10874[#cool] is: 1 was: 0 direct: 1
  Win about Result.10874[#cool] is: true was: false
  Computing orientation for Result.10874[#cool] expired: false agree: 1 against: 0 protest: 0 blank: 0
  Computed orientation Result.10874[#cool] was: neutral is: agree
  Change of orientation, create a transition

Change.process, invoke create on ProtoVote.15 p: { persona: '@jhr',
  proposition: '#kudocracy',
  orientation: 'agree',
  id: 10844,
  ts: 1401499393741 }
Key for new Vote.@jhr.#kudocracy is: @jhr.#kudocracy
Add vote Vote.@jhr.#kudocracy[@jhr/agree] now agree of Persona.@jhr[@jhr] via direct for proposition Topic.#kudocracy[#kudocracy]
  Total for Result.10851[#kudocracy] is: 1 was: 0 direct: 1
  Win about Result.10851[#kudocracy] is: true was: false
  Computing orientation for Result.10851[#kudocracy] expired: false agree: 1 against: 0 protest: 0 blank: 0
  Computed orientation Result.10851[#kudocracy] was: neutral is: agree
  Change of orientation, create a transition

Change.process, invoke create on ProtoVote.15 p: { id_key: '@jhr.#jhr',
  orientation: 'agree',
  id: 10845,
  ts: 1401499452072 }
Update on Vote.@jhr.#jhr[@jhr/disagree], key:@jhr.#jhr, update: Vote.@jhr.#jhr
Remove vote Vote.@jhr.#jhr[@jhr/disagree] previously disagree of Persona.@jhr[@jhr] via direct from proposition Topic.#jhr[#jhr]
Add vote Vote.@jhr.#jhr[@jhr/agree] now agree of Persona.@jhr[@jhr] via direct for proposition Topic.#jhr[#jhr]
  Total for Result.10868[#jhr] is: 1 was: 1 direct: 1
  Against about Result.10868[#jhr] is: 0 was: 1
  Win about Result.10868[#jhr] is: true was: false
  Computing orientation for Result.10868[#jhr] expired: false agree: 1 against: 0 protest: 0 blank: 0
  Computed orientation Result.10868[#jhr] was: disagree is: agree
  Change of orientation, create a transition

Change.process, invoke create on ProtoComment.14 p: { vote: '@jhr.#jhr',
  text: 'It\'s me!',
  id: 10846,
  ts: 1401499452072 }
BUG! this should not happen...

Change.process, invoke create on ProtoVote.15 p: { id_key: '@jhr.#kudocracy',
  orientation: 'blank',
  id: 10847,
  ts: 1401499531479 }
Update on Vote.@jhr.#kudocracy[@jhr/agree], key:@jhr.#kudocracy, update: Vote.@jhr.#kudocracy
Remove vote Vote.@jhr.#kudocracy[@jhr/agree] previously agree of Persona.@jhr[@jhr] via direct from proposition Topic.#kudocracy[#kudocracy]
Add vote Vote.@jhr.#kudocracy[@jhr/blank] now blank of Persona.@jhr[@jhr] via direct for proposition Topic.#kudocracy[#kudocracy]
  Total for Result.10851[#kudocracy] is: 1 was: 1 direct: 1
  Win about Result.10851[#kudocracy] is: false was: true
  Computing orientation for Result.10851[#kudocracy] expired: false agree: 0 against: 0 protest: 0 blank: 1
  Computed orientation Result.10851[#kudocracy] was: agree is: blank
  Change of orientation, create a transition

Change.process, invoke create on ProtoComment.14 p: { vote: '@jhr.#kudocracy',
  text: 'It\'s me!',
  id: 10848,
  ts: 1401499531479 }
BUG! this should not happen...

Change.process, invoke create on ProtoVote.15 p: { id_key: '@jhr.#kudocracy',
  orientation: 'agree',
  id: 10849,
  ts: 1401499635839 }
Update on Vote.@jhr.#kudocracy[@jhr/blank], key:@jhr.#kudocracy, update: Vote.@jhr.#kudocracy
Remove vote Vote.@jhr.#kudocracy[@jhr/blank] previously blank of Persona.@jhr[@jhr] via direct from proposition Topic.#kudocracy[#kudocracy]
Add vote Vote.@jhr.#kudocracy[@jhr/agree] now agree of Persona.@jhr[@jhr] via direct for proposition Topic.#kudocracy[#kudocracy]
  Total for Result.10851[#kudocracy] is: 1 was: 1 direct: 1
  Computing orientation for Result.10851[#kudocracy] expired: false agree: 1 against: 0 protest: 0 blank: 0
  Computed orientation Result.10851[#kudocracy] was: blank is: agree
  Change of orientation, create a transition
  Win about Result.10851[#kudocracy] is: true was: false

Change.process, invoke create on ProtoComment.14 p: { vote: '@jhr.#kudocracy',
  text: ' ',
  id: 10850,
  ts: 1401499722520 }
BUG! this should not happen...
Restore, stream split error { [SyntaxError: Unexpected end of input]
  stack: 'SyntaxError: Unexpected end of input\n    at parse (native)\n    at emit (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\node_modules\\split\\index.js:27:17)\n    at Stream.<anonymous> (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\node_modules\\split\\index.js:59:7)\n    at _end (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\node_modules\\split\\node_modules\\through\\index.js:65:9)\n    at Stream.stream.end (C:\\Users\\jean__000\\Documents\\GitHub\\l8\\node_modules\\split\\node_modules\\through\\index.js:74:5)\n    at ReadStream.onend (_stream_readable.js:499:10)\n    at ReadStream.g (events.js:196:16)\n    at ReadStream.EventEmitter.emit (events.js:126:20)\n    at _stream_readable.js:896:16\n    at process._tickCallback (node.js:664:11)' }
EOF reached vote.json.log
End of restore
Restored from vote.json.log
--- ENTITY DUMP ---
Version.10000[1]
Membership.&m.@jhr.hulot_friends{chng{.} updates|[].3 key"@jhr.hulot_friends" ts-128544815 touch-128544815 duration|1year !expr mmbrPersona.@jhr[@jhr] grpPersona.hulot_friends[Hulot_friends] insrt_ndx0 inactive|_f}
Membership.&m.@jhr.hulot_friends{chng{.} key"@jhr.hulot_friends" effctMembership.&m.@jhr.hulot_friends ts-128544815 touch-128544815 duration|1year !expr}
Membership.&m.@jhr.hulot_friends{chng{.} key"@jhr.hulot_friends" effctMembership.&m.@jhr.hulot_friends ts-128544815 touch-128544815 duration|1year !expr}
Topic.#kudocracy[#kudocracy]{chng{.} nxt_ffctResult.10851[#kudocracy] key"#kudocracy" ts-128544815 touch-128544815 duration|1year !expr nm"#kudocracy" source|_ votes_log|[].3 propositions|[] tags|[] delegations|[] comments|[].2 +Result.10851[#kudocracy]}
Topic.#president[#president]{chng{.} nxt_ffctResult.10852[#president] updates|[].2 key"#president" ts-128544815 touch-128544815 duration|1year !expr nm"#president" source|_ votes_log|[] propositions|[].2 tags|[] delegations|[].1 comments|[] +Result.10852[#president]}
Topic.kudocracy[kudocracy]{chng{.} nxt_ffctResult.10853[kudocracy] key"kudocracy" ts-128544815 touch-128544815 duration|1year !expr nm"kudocracy" source|"bootstrap" votes_log|[].2 propositions|[] tags|[] delegations|[] comments|[] +Result.10853[kudocracy]}
Topic.hollande_president[hollande_president]{chng{.} nxt_ffctResult.10854[hollande_president] key"hollande_president" ts-128544815 touch-128544815 duration|1year !expr nm"hollande_president" source|"bootstrap" votes_log|[].2 propositions|[] tags|[].1 delegations|[] comments|[] +Result.10854[hollande_president]}
Topic.hulot_president[hulot_president]{chng{.} nxt_ffctResult.10855[hulot_president] key"hulot_president" ts-128544815 touch-128544815 duration|1year !expr nm"hulot_president" source|"bootstrap" votes_log|[].21 propositions|[] tags|[].1 delegations|[] comments|[] +Result.10855[hulot_president]}
Delegation.@jhr.@n_hulot.#president[@n_hulot]{chng{.} updates|[].8 key"@jhr.@n_hulot.#president" ts-128544815 touch-56668230 duration|1year !expr @Persona.@jhr[@jhr] agntPersona.@n_hulot[@n_hulot] votes|[].1 privacy|"public" tags|[].1 inactive|_f prvs_tg[].1 !ws_nctv}
Vote.@peter.hulot_president[@peter/agree]{chng{.} nxt_ffctTransition.10856 updates|[].7 key"@peter.hulot_president" ts-128544815 touch-128544815 duration|1year !expr @Persona.@peter[@peter] propTopic.hulot_president[hulot_president] analyst|_ source|_ comment|_ delegation|"direct" privacy|"public" snpsht{.} previously|"neutral" orientation|"agree"}
Vote.@peter.hulot_president[@peter/agree]{chng{.} nxt_ffctTransition.10857 key"@peter.hulot_president" effctVote.@peter.hulot_president[@peter/agree] ts-128544815 touch-128544815 dura_ !expr @Persona.@peter[@peter] propTopic.hulot_president[hulot_president] anlyst_ src_ prvsly_ prvcy_ dlgtn"direct" o"agree"}
Vote.@peter.hulot_president[@peter/blank]{chng{.} nxt_ffctTransition.10858 key"@peter.hulot_president" effctVote.@peter.hulot_president[@peter/agree] ts-128544815 touch-128544815 dura_ !expr @Persona.@peter[@peter] propTopic.hulot_president[hulot_president] anlyst_ src_ prvsly_ prvcy_ dlgtn"direct" o"blank"}
Vote.@peter.hulot_president[@peter/protest]{chng{.} nxt_ffctTransition.10859 key"@peter.hulot_president" effctVote.@peter.hulot_president[@peter/agree] ts-128544815 touch-128544815 dura_ !expr @Persona.@peter[@peter] propTopic.hulot_president[hulot_president] anlyst_ src_ prvsly_ prvcy_ dlgtn"direct" o"protest"}
Vote.@peter.hulot_president[@peter/neutral]{chng{.} nxt_ffctTransition.10860 key"@peter.hulot_president" effctVote.@peter.hulot_president[@peter/agree] ts-128544815 touch-128544815 dura_ !expr @Persona.@peter[@peter] propTopic.hulot_president[hulot_president] anlyst_ src_ prvsly_ prvcy_ dlgtn"direct" o"neutral"}
Vote.@n_hulot.hulot_president[@n_hulot/disagree]{chng{.} nxt_ffctVote.@jhr.hulot_president[@jhr/neutral] updates|[].6 key"@n_hulot.hulot_president" ts-128544815 touch-128544815 duration|1year !expr @Persona.@n_hulot[@n_hulot] propTopic.hulot_president[hulot_president] analyst|_ source|_ comment|_ delegation|"direct" privacy|"public" snpsht{.} previously|"agree" orientation|"disagree"}
Vote.@n_hulot.hulot_president[@n_hulot/neutral]{chng{.} nxt_ffctVote.@jhr.hulot_president[@jhr/neutral] key"@n_hulot.hulot_president" effctVote.@n_hulot.hulot_president[@n_hulot/disagree] ts-128544815 touch-128544815 dura_ !expr @Persona.@n_hulot[@n_hulot] propTopic.hulot_president[hulot_president] anlyst_ src_ prvsly_ prvcy_ dlgtn"direct" o"neutral"}
Vote.@n_hulot.hulot_president[@n_hulot/agree]{chng{.} nxt_ffctVote.@jhr.hulot_president[@jhr/agree] key"@n_hulot.hulot_president" effctVote.@n_hulot.hulot_president[@n_hulot/disagree] ts-128544815 touch-128544815 dura_ !expr @Persona.@n_hulot[@n_hulot] propTopic.hulot_president[hulot_president] anlyst_ src_ prvsly_ prvcy_ dlgtn"direct" o"agree"}
Vote.@jhr.hulot_president[@jhr/disagree]{chng{.} nxt_ffctTransition.10864 key"@jhr.hulot_president" effctVote.@jhr.hulot_president[@jhr/neutral] ts-128544815 touch-128544815 dura_ !expr @Persona.@jhr[@jhr] propTopic.hulot_president[hulot_president] anlyst_ src_ prvsly_ prvcy_ dlgtn"direct" o"disagree"}
Vote.@n_hulot.hulot_president[@n_hulot/blank]{chng{.} nxt_ffctVote.@jhr.hulot_president[@jhr/blank] key"@n_hulot.hulot_president" effctVote.@n_hulot.hulot_president[@n_hulot/disagree] ts-128544815 touch-128544815 dura_ !expr @Persona.@n_hulot[@n_hulot] propTopic.hulot_president[hulot_president] anlyst_ src_ prvsly_ prvcy_ dlgtn"direct" o"blank"}
Tagging.10020{chng{.} key_ propTopic.hulot_president[hulot_president] #[] dtg[]}
Tagging.10021{chng{.} nxt_ffctTopic.#president[#president] key_ propTopic.hulot_president[hulot_president] #[].1 dtg[].1}
Vote.@n_hulot.hulot_president[@n_hulot/agree]{chng{.} nxt_ffctVote.@jhr.hulot_president[@jhr/agree] key"@n_hulot.hulot_president" effctVote.@n_hulot.hulot_president[@n_hulot/disagree] ts-128544815 touch-128544815 dura_ !expr @Persona.@n_hulot[@n_hulot] propTopic.hulot_president[hulot_president] anlyst_ src_ prvsly_ prvcy_ dlgtn"direct" o"agree"}
Vote.@n_hulot.hulot_president[@n_hulot/disagree]{chng{.} nxt_ffctVote.@jhr.hulot_president[@jhr/disagree] key"@n_hulot.hulot_president" effctVote.@n_hulot.hulot_president[@n_hulot/disagree] ts-128544815 touch-128544815 dura_ !expr @Persona.@n_hulot[@n_hulot] propTopic.hulot_president[hulot_president] anlyst_ src_ prvsly_ prvcy_ dlgtn"direct" o"disagree"}
Vote.@peter.hulot_president[@peter/agree]{chng{.} key"@peter.hulot_president" effctVote.@peter.hulot_president[@peter/agree] ts-128544815 touch-128544815 dura_ !expr @Persona.@peter[@peter] propTopic.hulot_president[hulot_president] anlyst_ src_ prvsly_ prvcy_ dlgtn"direct" o"agree"}
Version.10043[1]
Topic.#jhr[#jhr]{chng{.} nxt_ffctResult.10868[#jhr] key"#jhr" ts-124107081 touch-124107081 duration|1year !expr nm"#jhr" source|_ votes_log|[].3 propositions|[].6 tags|[].2 delegations|[] comments|[].1 +Result.10868[#jhr]}
Topic.n_hulot[n_hulot]{chng{.} nxt_ffctResult.10869[n_hulot] key"n_hulot" ts-124107081 touch-124107081 duration|1year !expr nm"n_hulot" source|_ votes_log|[].3 propositions|[] tags|[].2 delegations|[] comments|[] +Result.10869[n_hulot]}
Topic.#bar[#bar]{chng{.} nxt_ffctResult.10870[#bar] key"#bar" ts-123983450 touch-123983450 duration|1year !expr nm"#bar" source|_ votes_log|[].1 propositions|[].2 tags|[] delegations|[] comments|[] +Result.10870[#bar]}
Topic.cyrnea_is_the_best[Cyrnea_is_the_best]{chng{.} nxt_ffctResult.10871[Cyrnea_is_the_best] key"cyrnea_is_the_best" ts-123983450 touch-123983450 duration|1year !expr nm"cyrnea_is_the_best" source|_ votes_log|[].2 propositions|[] tags|[].3 delegations|[] comments|[].1 +Result.10871[Cyrnea_is_the_best]}
Topic.#best[#best]{chng{.} nxt_ffctResult.10872[#best] key"#best" ts-123944034 touch-123944034 duration|1year !expr nm"#best" source|_ votes_log|[].1 propositions|[].5 tags|[] delegations|[].1 comments|[] +Result.10872[#best]}
Topic.rex_is_the_best[Rex_is_the_best]{chng{.} nxt_ffctResult.10873[Rex_is_the_best] key"rex_is_the_best" ts-123944034 touch-123944034 duration|1year !expr nm"rex_is_the_best" source|_ votes_log|[].1 propositions|[] tags|[].3 delegations|[] comments|[] +Result.10873[Rex_is_the_best]}
Tagging.10050{chng{.} key_ propTopic.cyrnea_is_the_best[Cyrnea_is_the_best] #[].3 dtg[].3}
Topic.#cool[#cool]{chng{.} nxt_ffctResult.10874[#cool] key"#cool" ts-123913803 touch-123913803 duration|1year !expr nm"#cool" source|_ votes_log|[].1 propositions|[].2 tags|[] delegations|[] comments|[] +Result.10874[#cool]}
Topic.chloe_is_the_best[chloe_is_the_best]{chng{.} nxt_ffctResult.10875[chloe_is_the_best] key"chloe_is_the_best" ts-123913803 touch-123913803 duration|1year !expr nm"chloe_is_the_best" source|_ votes_log|[].2 propositions|[] tags|[].3 delegations|[] comments|[] +Result.10875[chloe_is_the_best]}
Topic.janekisthebest[JanekIsTheBest]{chng{.} nxt_ffctResult.10876[JanekIsTheBest] key"janekisthebest" ts-123903307 touch-123903307 duration|1year !expr nm"janekisthebest" source|_ votes_log|[].2 propositions|[] tags|[].3 delegations|[] comments|[] +Result.10876[JanekIsTheBest]}
Version.10081[1]
Topic.__n_hulot[__n_hulot]{chng{.} nxt_ffctResult.10877[__n_hulot] key"__n_hulot" ts-123550495 touch-123550495 duration|1year !expr nm"__n_hulot" source|_ votes_log|[].2 propositions|[] tags|[].2 delegations|[] comments|[] +Result.10877[__n_hulot]}
Tagging.10083{chng{.} key_ propTopic.__n_hulot[__n_hulot] #[].2 dtg[].2}
Version.10112[1]
Delegation.@jhr.@n_hulot.#president[@n_hulot]{chng{.} key"@jhr.@n_hulot.#president" effctDelegation.@jhr.@n_hulot.#president[@n_hulot] ts-121415478 touch-121415478 duration|1year !expr @Persona.@jhr[@jhr] agntPersona.@n_hulot[@n_hulot] v[] prvcy_ #[] inctv_}
Tagging.10114{chng{.} key_ propTopic.n_hulot[n_hulot] #[].2 dtg[].2}
Version.10144[1]
Tagging.10145{chng{.} key_ propTopic.#jhr[#jhr] #[].2 dtg[]}
Version.10175[1]
Tagging.10176{chng{.} key_ propTopic.#jhr[#jhr] #[].2 dtg[].2}
Tagging.10177{chng{.} key_ propTopic.#jhr[#jhr] #[].2 dtg[].2}
Version.10207[1]
Vote.@jhr.kudocracy[@jhr/agree]{chng{.} nxt_ffctTransition.10878 key"@jhr.kudocracy" ts-116282620 touch-116282620 duration|1year !expr @Persona.@jhr[@jhr] propTopic.kudocracy[kudocracy] analyst|_ source|_ comment|_ delegation|"direct" privacy|"public" snpsht{.} previously|"neutral" orientation|"agree"}
Vote.@jhr.hollande_president[@jhr/disagree]{chng{.} nxt_ffctTransition.10879 key"@jhr.hollande_president" ts-116267320 touch-116267320 duration|1year !expr @Persona.@jhr[@jhr] propTopic.hollande_president[hollande_president] analyst|_ source|_ comment|_ delegation|"direct" privacy|"public" snpsht{.} previously|"neutral" orientation|"disagree"}
Vote.@jhr.n_hulot[@jhr/blank]{chng{.} nxt_ffctTransition.10880 updates|[].2 key"@jhr.n_hulot" ts-116260652 touch-98078058 duration|1year !expr @Persona.@jhr[@jhr] propTopic.n_hulot[n_hulot] analyst|_ source|_ comment|_ delegation|"direct" privacy|"public" snpsht{.} previously|"agree" orientation|"blank"}
Vote.@jhr.cyrnea_is_the_best[@jhr/agree]{chng{.} nxt_ffctTransition.10881 updates|[].2 key"@jhr.cyrnea_is_the_best" ts-116253373 touch-18454433 duration|1year !expr @Persona.@jhr[@jhr] propTopic.cyrnea_is_the_best[Cyrnea_is_the_best] analyst|_ source|_ comment|Comment.10753 delegation|"direct" privacy|"public" snpsht{.} previously|"neutral" orientation|"agree"}
Vote.@jhr.chloe_is_the_best[@jhr/agree]{chng{.} nxt_ffctTransition.10882 key"@jhr.chloe_is_the_best" ts-116243700 touch-116243700 duration|1year !expr @Persona.@jhr[@jhr] propTopic.chloe_is_the_best[chloe_is_the_best] analyst|_ source|_ comment|_ delegation|"direct" privacy|"public" snpsht{.} previously|"neutral" orientation|"agree"}
Vote.@jhr.janekisthebest[@jhr/agree]{chng{.} nxt_ffctTransition.10883 key"@jhr.janekisthebest" ts-116240429 touch-116240429 duration|1year !expr @Persona.@jhr[@jhr] propTopic.janekisthebest[JanekIsTheBest] analyst|_ source|_ comment|_ delegation|"direct" privacy|"public" snpsht{.} previously|"neutral" orientation|"agree"}
Vote.@jhr.rex_is_the_best[@jhr/disagree]{chng{.} nxt_ffctTransition.10884 key"@jhr.rex_is_the_best" ts-116223374 touch-116223374 duration|1year !expr @Persona.@jhr[@jhr] propTopic.rex_is_the_best[Rex_is_the_best] analyst|_ source|_ comment|_ delegation|"direct" privacy|"public" snpsht{.} previously|"neutral" orientation|"disagree"}
Vote.@jhr.__n_hulot[@jhr/protest]{chng{.} nxt_ffctTransition.10885 key"@jhr.__n_hulot" ts-116179410 touch-116179410 duration|1year !expr @Persona.@jhr[@jhr] propTopic.__n_hulot[__n_hulot] analyst|_ source|_ comment|_ delegation|"direct" privacy|"public" snpsht{.} previously|"neutral" orientation|"protest"}
Version.10253[1]
Vote.@jhr.n_hulot[@jhr/blank]{chng{.} nxt_ffctTransition.10886 key"@jhr.n_hulot" effctVote.@jhr.n_hulot[@jhr/blank] ts-98078058 touch-98078058 dura_ !expr @Persona.@jhr[@jhr] propTopic.n_hulot[n_hulot] anlyst_ src_ prvsly_ prvcy_ dlgtn"direct" o"blank"}
Version.10293[1]
Vote.@jvincent.hulot_president[@jvincent/agree]{chng{.} nxt_ffctTransition.10887 updates|[].2 key"@jvincent.hulot_president" ts-92242771 touch-91916493 duration|1year !expr @Persona.@jvincent[@jvincent] propTopic.hulot_president[hulot_president] analyst|_ source|_ comment|_ delegation|"direct" privacy|"public" snpsht{.} previously|"blank" orientation|"agree"}
Vote.@jvincent.cyrnea_is_the_best[@jvincent/blank]{chng{.} nxt_ffctTransition.10888 key"@jvincent.cyrnea_is_the_best" ts-92231723 touch-92231723 duration|1year !expr @Persona.@jvincent[@jvincent] propTopic.cyrnea_is_the_best[Cyrnea_is_the_best] analyst|_ source|_ comment|_ delegation|"direct" privacy|"public" snpsht{.} previously|"neutral" orientation|"blank"}
Vote.@jvincent.chloe_is_the_best[@jvincent/blank]{chng{.} nxt_ffctTransition.10889 updates|[].2 key"@jvincent.chloe_is_the_best" ts-92225706 touch-92211467 duration|1year !expr @Persona.@jvincent[@jvincent] propTopic.chloe_is_the_best[chloe_is_the_best] analyst|_ source|_ comment|_ delegation|"direct" privacy|"public" snpsht{.} previously|"neutral" orientation|"blank"}
Vote.@jvincent.janekisthebest[@jvincent/blank]{chng{.} nxt_ffctTransition.10890 key"@jvincent.janekisthebest" ts-92220475 touch-92220475 duration|1year !expr @Persona.@jvincent[@jvincent] propTopic.janekisthebest[JanekIsTheBest] analyst|_ source|_ comment|_ delegation|"direct" privacy|"public" snpsht{.} previously|"neutral" orientation|"blank"}
Vote.@jvincent.hulot_president[@jvincent/agree]{chng{.} nxt_ffctTransition.10891 key"@jvincent.hulot_president" effctVote.@jvincent.hulot_president[@jvincent/agree] ts-91916493 touch-91916493 dura_ !expr @Persona.@jvincent[@jvincent] propTopic.hulot_president[hulot_president] anlyst_ src_ prvsly_ prvcy_ dlgtn"direct" o"agree"}
Version.10339[1]
Version.10380[1]
Version.10421[1]
Version.10462[1]
Version.10503[1]
Version.10544[1]
Version.10585[1]
Version.10626[1]
Delegation.@jhr.@n_hulot.#president[@n_hulot]{chng{.} key"@jhr.@n_hulot.#president" effctDelegation.@jhr.@n_hulot.#president[@n_hulot] ts-56668230 touch-56668230 duration|1year !expr @Persona.@jhr[@jhr] agntPersona.@n_hulot[@n_hulot] v[] prvcy"public" #[] inctv_}
Version.10668[1]
Persona.@lucasrobert[@LucasRobert]{chng{.} key"@lucasrobert" ts-35161501 touch-35161501 duration|1year !expr nm"@lucasrobert" rl"individual" members|[] memberships|[] delegations|[] delegations_from|[] votes|[] _vts_ndxd_by_prpstn{.}}
Version.10710[1]
Vote.@jhr.cyrnea_is_the_best[@jhr/undefined]{chng{.} key"@jhr.cyrnea_is_the_best" effctVote.@jhr.cyrnea_is_the_best[@jhr/agree] ts-19405031 touch-19405031 dura_ !expr @Persona.@jhr[@jhr] propTopic.cyrnea_is_the_best[Cyrnea_is_the_best] anlyst_ src_ prvsly_ prvcy_ dlgtn"direct" o_}
Version.10752[1]
Comment.10753{chng{.} key_ vVote.@jhr.cyrnea_is_the_best[@jhr/agree] txt"C'est le bar le plus sympa de Corté !"}
Version.10794[1]
Vote.@jhr.#jhr[@jhr/agree]{chng{.} nxt_ffctTransition.10892 updates|[].3 key"@jhr.#jhr" ts-4789825 touch-3894118 duration|1year !expr @Persona.@jhr[@jhr] propTopic.#jhr[#jhr] analyst|_ source|_ comment|Comment.10846 delegation|"direct" privacy|"public" snpsht{.} previously|"disagree" orientation|"agree"}
Vote.@jhr.#jhr[@jhr/disagree]{chng{.} nxt_ffctTransition.10893 key"@jhr.#jhr" effctVote.@jhr.#jhr[@jhr/agree] ts-4761045 touch-4761045 dura_ !expr @Persona.@jhr[@jhr] propTopic.#jhr[#jhr] anlyst_ src_ prvsly_ prvcy_ dlgtn"direct" o"disagree"}
Version.10839[1]
Vote.@jhr.#best[@jhr/agree]{chng{.} nxt_ffctTransition.10894 key"@jhr.#best" ts-4040289 touch-4040289 duration|1year !expr @Persona.@jhr[@jhr] propTopic.#best[#best] analyst|_ source|_ comment|_ delegation|"direct" privacy|"public" snpsht{.} previously|"neutral" orientation|"agree"}
Vote.@jhr.#president[@jhr/agree]{chng{.} key"@jhr.#president" ts-4012769 touch-4012769 duration|1year !expr @Persona.@jhr[@jhr] propTopic.#president[#president] analyst|_ source|_ comment|_ delegation|"direct" privacy|"public" snpsht{.} previously|"neutral" orientation|"agree"}
Vote.@jhr.#bar[@jhr/agree]{chng{.} nxt_ffctTransition.10895 key"@jhr.#bar" ts-3965001 touch-3965001 duration|1year !expr @Persona.@jhr[@jhr] propTopic.#bar[#bar] analyst|_ source|_ comment|_ delegation|"direct" privacy|"public" snpsht{.} previously|"neutral" orientation|"agree"}
Vote.@jhr.#cool[@jhr/agree]{chng{.} nxt_ffctTransition.10896 key"@jhr.#cool" ts-3957249 touch-3957249 duration|1year !expr @Persona.@jhr[@jhr] propTopic.#cool[#cool] analyst|_ source|_ comment|_ delegation|"direct" privacy|"public" snpsht{.} previously|"neutral" orientation|"agree"}
Vote.@jhr.#kudocracy[@jhr/agree]{chng{.} nxt_ffctTransition.10897 updates|[].3 key"@jhr.#kudocracy" ts-3952449 touch-3623670 duration|1year !expr @Persona.@jhr[@jhr] propTopic.#kudocracy[#kudocracy] analyst|_ source|_ comment|Comment.10850 delegation|"direct" privacy|"public" snpsht{.} previously|"blank" orientation|"agree"}
Vote.@jhr.#jhr[@jhr/agree]{chng{.} nxt_ffctTransition.10898 key"@jhr.#jhr" effctVote.@jhr.#jhr[@jhr/agree] ts-3894118 touch-3894118 dura_ !expr @Persona.@jhr[@jhr] propTopic.#jhr[#jhr] anlyst_ src_ prvsly_ prvcy_ dlgtn"direct" o"agree"}
Comment.10846{chng{.} key_ vVote.@jhr.#jhr[@jhr/agree] txt"It's me!"}
Vote.@jhr.#kudocracy[@jhr/blank]{chng{.} nxt_ffctTransition.10899 key"@jhr.#kudocracy" effctVote.@jhr.#kudocracy[@jhr/agree] ts-3814711 touch-3814711 dura_ !expr @Persona.@jhr[@jhr] propTopic.#kudocracy[#kudocracy] anlyst_ src_ prvsly_ prvcy_ dlgtn"direct" o"blank"}
Comment.10848{chng{.} key_ vVote.@jhr.#kudocracy[@jhr/agree] txt"It's me!"}
Vote.@jhr.#kudocracy[@jhr/agree]{chng{.} nxt_ffctTransition.10900 key"@jhr.#kudocracy" effctVote.@jhr.#kudocracy[@jhr/agree] ts-3710351 touch-3710351 dura_ !expr @Persona.@jhr[@jhr] propTopic.#kudocracy[#kudocracy] anlyst_ src_ prvsly_ prvcy_ dlgtn"direct" o"agree"}
Comment.10850{chng{.} key_ vVote.@jhr.#kudocracy[@jhr/agree] txt" "}
Result.10851[#kudocracy]{chng{.} key"#kudocracy" touch-128544815 propTopic.#kudocracy[#kudocracy] neutral|0 blank|0 protest|0 agree|1 disagree|0 direct|1 secret|0 private|0 count|4 total|1 against|0 win|_t orientation|"agree"}
Result.10852[#president]{chng{.} key"#president" touch-128544815 propTopic.#president[#president] neutral|0 blank|0 protest|0 agree|0 disagree|0 direct|0 secret|0 private|0 count|1 total|0 against|0 win|_f orientation|_}
Result.10853[kudocracy]{chng{.} key"kudocracy" touch-128544815 propTopic.kudocracy[kudocracy] neutral|0 blank|0 protest|0 agree|2 disagree|0 direct|2 secret|0 private|0 count|3 total|2 against|0 win|_t orientation|"agree"}
Result.10854[hollande_president]{chng{.} key"hollande_president" touch-128544815 propTopic.hollande_president[hollande_president] neutral|0 blank|0 protest|0 agree|0 disagree|2 direct|2 secret|0 private|0 count|3 total|2 against|2 win|_f orientation|"disagree"}
Result.10855[hulot_president]{chng{.} key"hulot_president" touch-128544815 propTopic.hulot_president[hulot_president] neutral|0 blank|0 protest|0 agree|2 disagree|1 direct|3 secret|0 private|0 count|24 total|3 against|1 win|_t orientation|"agree"}
Transition.10856{chng{.} key_ +Result.10855[hulot_president] o"disagree" prvsly"neutral"}
Transition.10857{chng{.} key_ +Result.10855[hulot_president] o"agree" prvsly"disagree"}
Transition.10858{chng{.} key_ +Result.10855[hulot_president] o"blank" prvsly"agree"}
Transition.10859{chng{.} key_ +Result.10855[hulot_president] o"protest" prvsly"blank"}
Transition.10860{chng{.} key_ +Result.10855[hulot_president] o"neutral" prvsly"protest"}
Transition.10861{chng{.} key_ +Result.10855[hulot_president] o"agree" prvsly"neutral"}
Transition.10862{chng{.} key_ +Result.10855[hulot_president] o"neutral" prvsly"agree"}
Transition.10863{chng{.} key_ +Result.10855[hulot_president] o"agree" prvsly"neutral"}
Transition.10864{chng{.} key_ +Result.10855[hulot_president] o"disagree" prvsly"agree"}
Transition.10865{chng{.} key_ +Result.10855[hulot_president] o"blank" prvsly"disagree"}
Transition.10866{chng{.} key_ +Result.10855[hulot_president] o"agree" prvsly"blank"}
Transition.10867{chng{.} key_ +Result.10855[hulot_president] o"disagree" prvsly"agree"}
Result.10868[#jhr]{chng{.} key"#jhr" touch-124107081 propTopic.#jhr[#jhr] neutral|0 blank|0 protest|0 agree|1 disagree|0 direct|1 secret|0 private|0 count|4 total|1 against|0 win|_t orientation|"agree"}
Result.10869[n_hulot]{chng{.} key"n_hulot" touch-124107081 propTopic.n_hulot[n_hulot] neutral|0 blank|1 protest|0 agree|1 disagree|0 direct|2 secret|0 private|0 count|4 total|2 against|0 win|_t orientation|"blank"}
Result.10870[#bar]{chng{.} key"#bar" touch-123983450 propTopic.#bar[#bar] neutral|0 blank|0 protest|0 agree|1 disagree|0 direct|1 secret|0 private|0 count|2 total|1 against|0 win|_t orientation|"agree"}
Result.10871[Cyrnea_is_the_best]{chng{.} key"cyrnea_is_the_best" touch-123983450 propTopic.cyrnea_is_the_best[Cyrnea_is_the_best] neutral|0 blank|1 protest|0 agree|1 disagree|0 direct|2 secret|0 private|0 count|3 total|2 against|0 win|_t orientation|"blank"}
Result.10872[#best]{chng{.} key"#best" touch-123944034 propTopic.#best[#best] neutral|0 blank|0 protest|0 agree|1 disagree|0 direct|1 secret|0 private|0 count|2 total|1 against|0 win|_t orientation|"agree"}
Result.10873[Rex_is_the_best]{chng{.} key"rex_is_the_best" touch-123944034 propTopic.rex_is_the_best[Rex_is_the_best] neutral|0 blank|0 protest|0 agree|0 disagree|1 direct|1 secret|0 private|0 count|2 total|1 against|1 win|_f orientation|"disagree"}
Result.10874[#cool]{chng{.} key"#cool" touch-123913803 propTopic.#cool[#cool] neutral|0 blank|0 protest|0 agree|1 disagree|0 direct|1 secret|0 private|0 count|2 total|1 against|0 win|_t orientation|"agree"}
Result.10875[chloe_is_the_best]{chng{.} key"chloe_is_the_best" touch-123913803 propTopic.chloe_is_the_best[chloe_is_the_best] neutral|0 blank|1 protest|0 agree|1 disagree|0 direct|2 secret|0 private|0 count|3 total|2 against|0 win|_t orientation|"blank"}
Result.10876[JanekIsTheBest]{chng{.} key"janekisthebest" touch-123903307 propTopic.janekisthebest[JanekIsTheBest] neutral|0 blank|1 protest|0 agree|1 disagree|0 direct|2 secret|0 private|0 count|3 total|2 against|0 win|_t orientation|"blank"}
Result.10877[__n_hulot]{chng{.} key"__n_hulot" touch-123550495 propTopic.__n_hulot[__n_hulot] neutral|0 blank|0 protest|2 agree|0 disagree|0 direct|2 secret|0 private|0 count|3 total|2 against|2 win|_f orientation|"protest"}
Transition.10878{chng{.} key_ +Result.10853[kudocracy] o"agree" prvsly"neutral"}
Transition.10879{chng{.} key_ +Result.10854[hollande_president] o"disagree" prvsly"neutral"}
Transition.10880{chng{.} key_ +Result.10869[n_hulot] o"agree" prvsly"neutral"}
Transition.10881{chng{.} key_ +Result.10871[Cyrnea_is_the_best] o"agree" prvsly"neutral"}
Transition.10882{chng{.} key_ +Result.10875[chloe_is_the_best] o"agree" prvsly"neutral"}
Transition.10883{chng{.} key_ +Result.10876[JanekIsTheBest] o"agree" prvsly"neutral"}
Transition.10884{chng{.} key_ +Result.10873[Rex_is_the_best] o"disagree" prvsly"neutral"}
Transition.10885{chng{.} key_ +Result.10877[__n_hulot] o"protest" prvsly"neutral"}
Transition.10886{chng{.} key_ +Result.10869[n_hulot] o"blank" prvsly"agree"}
Transition.10887{chng{.} key_ +Result.10855[hulot_president] o"blank" prvsly"disagree"}
Transition.10888{chng{.} key_ +Result.10871[Cyrnea_is_the_best] o"blank" prvsly"agree"}
Transition.10889{chng{.} key_ +Result.10875[chloe_is_the_best] o"blank" prvsly"agree"}
Transition.10890{chng{.} key_ +Result.10876[JanekIsTheBest] o"blank" prvsly"agree"}
Transition.10891{chng{.} key_ +Result.10855[hulot_president] o"agree" prvsly"blank"}
Transition.10892{chng{.} key_ +Result.10868[#jhr] o"agree" prvsly"neutral"}
Transition.10893{chng{.} key_ +Result.10868[#jhr] o"disagree" prvsly"agree"}
Transition.10894{chng{.} key_ +Result.10872[#best] o"agree" prvsly"neutral"}
Transition.10895{chng{.} key_ +Result.10870[#bar] o"agree" prvsly"neutral"}
Transition.10896{chng{.} key_ +Result.10874[#cool] o"agree" prvsly"neutral"}
Transition.10897{chng{.} key_ +Result.10851[#kudocracy] o"agree" prvsly"neutral"}
Transition.10898{chng{.} key_ +Result.10868[#jhr] o"agree" prvsly"disagree"}
Transition.10899{chng{.} key_ +Result.10851[#kudocracy] o"blank" prvsly"agree"}
Transition.10900{chng{.} key_ +Result.10851[#kudocracy] o"agree" prvsly"blank"}
--- END DUMP ---
Start duration: 31450 ms
READY!
Web test UI is running on port 8080
// test/vote.js
//  sample test application: reactive liquid democracy
//
// "When liquid democracy meets Twitter..."
//
// april 2014 by @jhr

"use strict";

function ephemeral( app ){

app.version = "0.1";

/*
 *  First, let's create an "ephemeral" reactive dataflow framework.
 *  Application specific code comes next.
 */
 
var l8    = app.l8    = require( "l8/lib/l8.js"    );

// Boxons are similar to promises, but very light
var boxon = app.boxon = require( "l8/lib/boxon.js" );

// Water sources are reactive variables
var water = app.water = require( "l8/lib/water.js" );

// Fluids are streams of piped data
var fluid = app.fluid = water.fluid;

// My de&&bug() darling, traces that can be disabled with low overhead
var de        = true;
var debugging = true; // Interactive mode, useful to debug test cases
var trace     = app.trace = l8.trace;
var bug       = app.bug   = trace;

app.debug_mode = function( x ){
// Get/set debug mode
  if( arguments.length ){
    de = !!x;
  }
  return de;
}

function mand( b, msg ){
// de&&mand() is like assert()
  if( b )return;
  var tmp = msg ? ": " + msg : msg;
  bug( "l8/test/vote.js, assert error" + tmp );
  if( de && debugging )debugger;
  if( ! (de && debugging ) )throw new Error( "vote.js assert" );
}
app.assert = mand;

// de&&bugger() invokes the debugger only in debugging mode
function bugger(){ if( debugging )debugger; }
app.bugger = bugger;

function error_traced( f ){
// error_traced( fn ) is like fn but with exceptions traced in debug mode
  return !de ? f : function(){
    try{
      return f.apply( this, arguments );
    }catch( err ){
      trace( "Error", err, err.stack );
      if( debugging ){
        debugger;
      }else{
        throw err;
      }
    }
  };
}
app.error_traced = error_traced;


// Misc. util

function noop(){}

var _ = app._ = noop();      // _ === undefined

var extend = function( to, from ){
// Fast inject of properties. Note: not just owned ones, prototype's too
  for( var attr in from ){
    if( attr !== "__proto__" ){
      to[ attr ] = from[ attr ];
    }
  }
  return to;
};
app.extend = extend;

// Cool to load all vocabulary at once in some scope.
// Usage: require( "ephemeral.js" ).into( global )
app.into  = function( obj ){ extend( obj, app ); };

var cached_array_diff = {};
function array_diff( old, now, no_cache ){
// Compare two sets of objects and detect changes.
// Returns { old:[.], now:[.], added:[.], removed:[.], kept:[.], changes: nn );
  if( !old ){ old = [] }
  if( !now ){ now = [] }
  if( !old.length ){
    return cached_array_diff = {
      old:     old,
      now:     now,
      added:   now,
      removed: [],
      kept:    [],
      changes: now.length
    };
  }
  if( !now || !now.length ){
    return cached_array_diff = {
      old:     old,
      now:     now,
      removed: old,
      added:   [],
      kept:    [],
      changes: old.length
    };
  }
  // Return cached value if diff about same arrays
  // ToDo: that won't work if array content got changed, ie mutable arrays
  if( old === cached_array_diff.old
  &&  now === cached_array_diff.now
  && !no_cache
  )return cached_array_diff;
  var added   = [];
  var removed = [];
  var kept    = [];
  old.forEach( function( v ){
    if( now.indexOf( v ) === -1 ){
      removed.push( v );
    }else{
      kept.push( v );
    }
  });
  now.forEach( function( v ){
    if( old.indexOf( v ) === -1 ){
      added.push( v );
    }
  });
  return cached_array_diff = {
    old:     old,
    now:     now,
    added:   added,
    removed: removed,
    kept:    kept,
    changes: added.length + removed.length
  };
}
app.diff = array_diff;


/*
 *  Reactive entities management
 */

//var global = this;

var epoch = 0; // 1397247088461; // 2034 is too soon
function now(){
  return now.now || l8.now - epoch;
}

app.now = now;
var ONE_YEAR   = app.ONE_YEAR   = 365 * 24 * 60 * 60 * 1000;
var ONE_MONTH  = app.ONE_MONTH  =  31 * 24 * 60 * 60 * 1000;
var ONE_WEEK   = app.ONE_WEEK   =   7 * 24 * 60 * 60 * 1000;
var ONE_DAY    = app.ONE_DAY    =       24 * 60 * 60 * 1000;
var ONE_HOUR   = app.ONE_HOUR   =            60 * 60 * 1000;
var ONE_MINUTE = app.ONE_MINUTE =                 60 * 1000;


/*
 *  Computation steps managements
 *
 *  Steps create or update entities.
 *  They can trigger consequences by pushing an entity into a fluid.
 *  If the same entity is pushed multiple times into the same fluid, only
 *  the first push is actually performed.
 */

var Stepping  = 0;
var StepQueue = [];
var PushQueue = [];
var PushMap   = {};

function steps( list ){
  de&&mand( !Stepping );
  Stepping++;
  //debugger;
  if( list ){
    list.forEach( function( item ){
      step( item );
    });
  }
  var queue  = StepQueue;
  StepQueue = [];
  var box = boxon();
  water.steps( queue ).boxon( function( err ){
    if( err ){
      // Get rid of potential new steps, cancelled
      StepQueue = [];
      Stepping--;
      box( err );
      return;
    }
    // If new steps where created, perform them now
    if( StepQueue.length ){
      steps().boxon( function( err ){
        Stepping--;
        box( err ); } );
    }else{
      Stepping--;
      box();
    }
  } );
  return box;
}

function step( fn ){
  var s = function(){
    de&&mand( !StepQueue.length );
    try{
      fn();
    }catch( err ){
      trace( "Failed step", err, err.stack );
      throw err;
    }
    // Code was run, do pushes, at most one per fluid
    var queue = PushQueue;
    PushQueue = [];
    var map   = PushMap;
    PushMap = {};
    queue.forEach( function( f_e ){
      var fluid  = f_e.fluid;
      var entity = f_e.entity;
      var push_id = "" + fluid.water().id + "." + entity.id;
      // If such push is still pending, push and mark as 'done'
      if( map[ push_id ] !== "done" ){
        map[ push_id ] = "done";
        fluid.push( entity );
      }
    } );
  };
  StepQueue.push( s );
}

function push( f, e ){
// Add a push operation for an entity, done at end of current 'step'.
// During a step, multiple push operations are reduced to a single operation.
  var push_id = "" + f.water().id + "." + e.id;
  var state = PushMap[ push_id ];
  if( !state || state === "done" ){
    PushMap[ push_id ] = "pending"; // pending
    PushQueue.push( { fluid: f, entity: e } );
  }
  return e;
}


/*
 *  Voting machines.
 *
 *  There is a main voting machine and domain specific ones.
 *  Machines belongs to some "owner".
 *  Vote in domain specific machine is possible for persons who belong to
 *  that domain only. When the owner is a Twitter user, only followed users
 *  can vote.
 *  Note: each vote in a domain specific machine also impact the same topic
 *  in the main machine. That way, results for domain members can be compared
 *  with results from the general audience.
 *
 *  ToDo: factorize to make this application neutral.
 */
 
function Machine( options ){
  this.options = options;
  this.owner   = options.owner || "@jhr";
}

app.machine = Machine;
var MainMachine = Machine.current = Machine.main = new Machine({});


/*
 *  Ids - increasing integers
 *
 *  Ids are integers. When an entity needs one, NextId is provided and
 *  then incremented. NextId is adjusted to always be more than any previously
 *  used id (stored ones typically).
 */

// Global pool of all entities, id indexed
var NextId      = 1;
var MaxSharedId = 9999;
var AllEntities = [];
app.AllEntities = AllEntities;

var lookup = function( id ){
// Look for an existing entity based on id, xor undefined.
// Also detect forward reference ids and adjust NextId accordingly.
  // Sometimes the UID is actually already an entity or a type
  if( id.is_entity )return id;
  if( id.prototype && id.prototype.is_entity )return id.prototype;
  // Sometimes the UID is actually an entity type name
  if( typeof id === "string" )return AllEntities[ id ];
  if( id >= NextId ){
    de&&bug( "Forward UID lookup", id );
    NextId = id + 1;
  }
  return AllEntities[ id ];
};

var debug_entity;
app.set_debug_entity = function( x ){
// Helper to start traces, before failing test cases typically
  debug_entity = x || NextId;
};

var alloc_id = function( x ){
// Entities have an unique id. This function checks if a provided id is
// a forward reference id and adjusts NextId accordingly. If no id is
// provided, one is returned and NextId is incremented.
  if( x ){
    if( x >= NextId ){
      de&&bug( "Forward UID", x );
      NextId = x + 1;
    }
    return x;
  }
  // de&&bug( "New UID", NextId );

  // debug_entity, when met, starts debug mode, useful for failing test cases
  if( NextId === debug_entity ){
    trace( "Start interactive debugging for entity " + NextId );
    de = true;
    debugging = true;
  }
  return NextId++;
};


/*
 *  Base class for all entities.
 *
 *  From latin "ens" + "itas", is being (real, physical).
 *   aka: a thing.
 *
 *  Entities have an ID, usually.
 *  There is a global table of all entities: AllEntities.
 *  Ephemeral entities will "expire", sometimes prematurely.
 *  Entities without an ID are "updates": they describe changes about
 *  properties of an existing entity; they are "values", not "objects".
 *
 *  Attributes:
 *    - id -- an integer, unique, increasing
 */

function Entity( options ){
  // Make sure the entity has an id
  this.id = alloc_id( options.id );
  // Track all entities, some of them will expire
  AllEntities[ this.id ] = this;
}
app.Entity = Entity;

// Define __proto__ for Entity instances
extend( Entity.prototype, {
  
  // To enable "duck" typing
  is_entity: true,
  
  // Redefined by sub types
  type: "Entity",

  // Type checker
  is_a: function( type ){ return this.constructor === type; },

  // Change the id, to be called in .create() only
  identity: function( new_id ){
    if( this.is_update() )return;
    var old_id = this.id;
    this.id = new_id;
    AllEntities[ new_id ] = this;
    // Free last allocated auto incr id if possible
    if( old_id === NextId - 1 ){
      AllEntities[ old_id ] = _;
      NextId--;
    }
  },
  
  // Create a new entity or update an existing one (ie one with same "key")
  create: function( options ){ return new Entity( options ); },
  
  // Most entities "expires", usually after some delay. Some may "resurrect"
  expired: function(){ return false; },

  // Some entities are actually updates about another entity
  is_update: function(){ return false; },
  is_create: function(){ return !this.is_update(); },
  
  // Queue a push, done at end of current step
  push: function( a_fluid ){ return push( a_fluid, this ); },
  
  // Debug related
  log: function( f ){ trace( f ? f.call( this, this ) : this.toString() ); },
  toString: function(){
    return ""
    + (this === this.constructor.prototype ? "Proto" : "")
    + this.type
    + "." + this.id
    + (this.label ? "[" + this.label + "]" : "" );
  }
  
} );

// ToDo: is this OK?
Entity.prototype.constructor = Entity;
Entity.type = function( named_f ){ return type( named_f, this ); };

// Pretty print for debugging
var abbreviations = {
  orientation: "o",      // short, because frequent
  vote:        "v",
  win:         "win",
  disagree:    "disa",
  against:     "again",
  total:       "tot",
  direct:      "dir",
  duration:    "dura",
  topic:       "&",
  tag:         "#",       // so called #hashtags
  timestamp:   "ts",
  proposition: "prop",
  persona:     "@",       // @name for users/personas
  "result":    "+",       // +results of votes on a proposition
  "time_touched": "touch"
};

function abbreviate( str ){
// Improve signal/noise in long traces using abbreviations
  var tmp = str;
  if( tmp.length <= 3 )return tmp;
  // Remove plural, ie remove ending 's'
  if( tmp[ tmp.length - 1 ] === "s" && tmp !== "ts" ){
    tmp = tmp.substring( 0, tmp.length - 1 );
  }
  // Either use an abbreviation or remove voyels
  return abbreviations[ tmp ]
  || tmp[0] + tmp.substring( 1 ).replace( /[aeiou]/g, "" );
}


function pretty( v, level ){
// Similar to inspect() but customized for entities
  
  if( arguments.length < 2 ){ level = 1; }
  
  if( level < 0 )return ".";
  
  var buf = "";
  
  if( v === _ )return "_";
  
  if( typeof v === "function" || typeof v === "object" ){

    if( v === null )return "null";
    if( typeof v === "function" ){

      // Water, get current |value
      if( v._water ){
        buf += "|" + pretty( v._water.current, level && level - 1 );
        return buf;

      // ref() => &id
      }else if( v.rid ){
        if( v.entity ){
          buf += "&" + pretty( v.entity, level && level - 1 );
        }else{
          buf += "&" + v.rid;
        }

      // normal functions
      }else{
        if( v.name ){
          buf += "." + v.name + "()";
        }else{
          buf += "()";
        }
      }

    // Water errors!
    }else if( v.watered ){
      buf += "!" + pretty( v.error, level && level - 1) + "!";
      
    }else if( Array.isArray( v ) ){
      if( level === 0 || !v.length ){
        return "[]" + (v.length ? "." + v.length : "");
      }else{
        var abuf = [];
        v.forEach( function( v ){
          abuf.push( pretty( v, level - 1 ) );
        });
        return "[" + abuf.join( " " ) + "]";
      }

    // Objects, if entity => toString()
    }else{
      if( level <= 1 ){
        if( v.is_entity ){
          buf += v.toString(); 
        }else{
          if( level === 0 )return "{.}";
        }
      }
    }

    if( level <= 0 )return buf;

    // Display attributes of object
    var lbuf = [];
    var val;
    for( var attr in v ){
      if( attr !== "id" && v.hasOwnProperty( attr ) ){
        val = v[ attr ];
        // Skip label, if already displayed
        if( v.is_entity && attr === "label" )continue;
        // Skip "buried" unless actually buried
        if( attr === "buried" ){
          if( val ){ lbuf.push( "buried" ) }
          continue;
        // Show "timestamp" & "time_touched" relative to now vs since epoch
        }else if( attr === "timestamp" || attr === "time_touched" ){
          val -= now();
        // Turn "expire" into a boolean that is false if expiration is remote
        }else if( attr === "expire" ){
          if( ( val && val.water && val() || val ) - now() > 2 * 24 * 60 * 60 * 1000 ){
            val = false;
          }
        // Skip "effect" when there is none
        }else if( attr === "effect" ){
          if( val === _ )continue;
          // Skip "next_effect" when there is none
        }else if( attr === "next_effect" ){
          if( !val )continue;
        // Skip "updates" when only the initial create update is there
        }else if( attr === "updates" ){
          if( val && val._water && val() && val().length === 1 )continue;
          if( Array.isArray( val ) && val.length === 1 )continue;
        // Skip "now" and "was" attributes, too much noise
        }else if( attr === "now" || attr === "was" )continue;
        // For booleans, show the flag name, with a ! prefix if false
        if( val === true || val === false ){
          lbuf.push( (val ? "" : "!") + abbreviate( attr ) );
          continue;
        }
        if( typeof val !== "function" ){ attr = abbreviate( attr ); }
        lbuf.push( "" + attr + "" + pretty( val, level && level - 1 ) );
      }
    }
    if( !lbuf.length )return buf;
    return buf + "{" + lbuf.join( " " ) + "}";
    
  }else if( typeof v === "string" ){
    return buf + '"' + v + '"';
    
  }else if( v === ONE_YEAR ){
    return "1year";
    
  }else if( v === true ){
    return "_t";
    
  }else if( v === false ){
    return "_f";
    
  }else{
    return buf + "" + v;
  }
}
app.pretty = pretty;

function dump_entity( x, level ){
  if( !level ){ level = 1; }
  trace( pretty( x, level ) );
  //console.log( "Value", x.value() );
}
app.dump_entity = dump_entity;

function dump_entities( from, level ){
// This is a debugging tool at the moment.
// ToDo: implement a "dump_to_file()" that basically store a snapshot of the
// entire "image" of all entities.
// It should then be easy to later restore memory image of the entities and
// from that starting point handle the additional change log to fully restore
// any state.
// This is probably the simple way to compress a change log.
//   image + change log => new image.
// Nota: the compression is not a size compression, it is a speed compression
// because rebuilding the image from a blank image + the full log of changes
// takes much longer than rebuilding it from a snapshot image + the log of
// additional changes. The size of the image will shrink only when some
// entities expires. Consequently, an image can get quite large, which is
// an issue when memory is limited.
// Nota: storing an image let external programs perform analysis on that image
// to extract relevant information without having to duplicate the full
// update logic implemented by the image producer.
// Nota: for large image, the dump could block the machine for too long. In
// such cases, some incremental dump could be implemented, probably using some
// copy on change logic during the dump to avoid inconsistencies.
// Nota: if the image can be compressed to a reasonable size, it could be
// sent to subscribers, together with further changes, so that such subscribers
// could run the update logic locally and maintain a synchronized copy of the
// original image.
// Nota: an incremental sharing of the image is possible if changes done on the
// copy fail when they miss parts of the image, ask for these parts, and then
// replay that change, until it succeeds. This works like virtual memory, where
// accesses may generate "page faults" when data must be restored from swap.
// Nota: this master/slaves scheme can scale somehow but the "master" image
// is still a bottleneck. Specially considering the fact that any slave
// initiated update must be sent to the master in order to receive the changes
// to apply on the local copy (potentially partial) of the image.
// Nota: the slave could maintain a "shadow" copy of the image, in parallel to
// the true synchronized image, in order to provide quick feedback to whoever
// initiated the update ; there is a risk that such a shadow image never gets
// discarded by the true image, if connection with the master gets lost
// for too long for example. The issue is even more complex if sub slaves
// are informed about that shadow image. But it is feasible!
  trace( "--- ENTITY DUMP ---" );
  if( !level ){ level = 1; }
  var list = AllEntities;
  var ii = from || 0;
  var item;
  if( ii <= MaxSharedId ){
    while( item = list[ ii++ ] ){
      dump_entity( item, level );
    }
    ii = MaxSharedId + 1;
  }
  while( ii < NextId ){
    item = list[ ii++ ];
    item && dump_entity( item, level );
  }
  //console.log( "RootTopic:", value( RootTopic, true ) );
  trace( "--- END DUMP ---" );
}
app.dump_entities = dump_entities;


/*
 *  Types for ephemeral entities.
 *
 *  Usage:
 *     base_type.type( sub_type );
 *     function sub_type( options ){
 *        ... called by sub_type.create( options ) ...
 *        return this; // or something else, like constructors
 *     }
 *     sub_type.prototype.instance_method_xx = function( xxx ){ xxx };
 */

var type = function( ctor, base, opt_name ){
// Prototypal style inheritance with typed entities.
// "ctor" is a function. It's name is the subtype name.
// It is called in two cases:
// - To initialize a newly created entity
// - To update an existing entity
// It must call this.register( key ) to distinguish these cases.
//  'key' can be any string, including a combination of ids, "." separated.
// After that call, this.is_update() is false for creations.
//   this.water() returns l8 water() for entities xor almost idem() for updates
// Note: classes are "closed", it is not possible to add a method to a base
// class and expect it to be visible from it's subclasses ; this is so because
// methods are copied when the class is created (versus referenced). This
// is an optimization that speeds up method lookup a little.
  if( !base ){ base = Ephemeral; }
  var base_proto = base.prototype;
  de&&mand( base_proto.constructor = base );
  var name = opt_name || ctor.name;
  // Copy base class's prototype to init the new class prototype, for speed
  var sub_proto = ctor.prototype = extend( {}, base_proto );
  sub_proto.type = name;
  sub_proto.constructor = ctor;
  sub_proto.super  = base_proto;  // Access to super instance stuff, like instance methods
  ctor.super = base;   // Access to super static stuff, like class methods
  ctor.ctors = [];     // All constructors, from Entity, down to this new type
  var a_ctor = ctor;
  while( a_ctor ){
    ctor.ctors.unshift( a_ctor );
    a_ctor = a_ctor.super;
  }
  var entity_fluid = ctor.fluid = fluid();
  sub_proto.push = function( f ){
    if( f ){
      de&&mand( !f.is_update() );
      push( f, this );
      return this;
    }
    de&&mand( !this.is_update() );
    push( entity_fluid, this );
    var sup = base.prototype.push;
    // ToDo: fix stack overflow
    if( 0 && sup ){
      sup.call( this );
    }
    return this;
  };
  // Build the instance creation/update function
  ctor.create = sub_proto.create = function( options ){
    var obj = Entity.created = Object.create( sub_proto );
    var obj0 = obj;
    //if( !options ){ obj.machine = Machine.current; }
     // Call all constructors, including super, super's super, etc
    var ii = 1;
    var list = ctor.ctors;
    var a_ctor;
    var r;
    // ToDo: unroll for speed
    Entity.call( obj, options );
    while( a_ctor = list[ ii++ ] ){
      r = a_ctor.call( obj, options );
      if( r ){ obj = r; }
    }
    //de&&bug( "New entity", "" + pretty( obj, 2 ) );
    // Push new entity on the fluid bound to the entity's type, unless proto
    if( proto_entity ){
      if( obj === obj0 ){
        ctor.count++;
        obj.push();
      }
    }
    return obj;
  };
  // ToDo: improve create/update syntax
  sub_proto.update = function( options ){
    options.key = this.key;
    return this.create( options );
  };
  // Create the prototypal instance. It will will create new instances
  var proto_entity = Object.create( sub_proto );
  // Copy properties, to speed up lookup
  extend( proto_entity, sub_proto );
  Entity.call( proto_entity, { machine: MainMachine } );
  // ctor.create( { machine: MainMachine } );
  ctor.prototype = sub_proto = AllEntities[ name ] = proto_entity;
  ctor.id = proto_entity.id;
  app[ name ] = ctor;
  de&&bug( "Create entity " + pretty( proto_entity ) );
  // Create global table of all entities of this new type
  ctor.all   = {};
  ctor.count = 0;
  ctor.find = function( key ){
    var entity = ctor.all[ key ]
    if( entity && !entity.buried )return entity;
    return _;
  };
  // Ease sub typing
  ctor.type = function( sub_type, opt_name ){
    return type( sub_type, ctor, opt_name );
  };
  de&&mand( proto_entity === proto_entity.constructor.prototype );
  de&&mand( proto_entity.is_entity );
  de&&mand( proto_entity.id );
  de&&mand( proto_entity.constructor === ctor );
  de&&mand( proto_entity.constructor.prototype === proto_entity );
  de&&mand( proto_entity.create !== base_proto.create );
  return proto_entity;
};


Function.prototype.water = Function.prototype.when = function(){
// Ember style computed property.
// Usage, during entity's .create() only:
//  this.attr = function(){ this.other_attr() * 10 }.water( this.other_attr );
// When .create() is called, Entity.created points to the being created obj
  var w = water();
  // Bind the water obj with the transform function and with the target entity
  w.entity = Entity.created;
  w.entity_transform = this;
  w( _, function_watered, arguments );
  return w;
};

function function_watered(){
  var entity    = Water.current.entity;
  var transform = Water.current.entity_transform;
  var r;
  try{
    r = transform.apply( entity, arguments );
  }catch( err ){
    trace( "Water transform error", err, "on entity " + entity, err.stack );
    de&&bugger();
  }
  return r;
}


/*
 *  Entities sometimes reference each others using ids, when stored typically
 */

function ref(){
  var f = function(){
    // Set
    if( arguments.length ){
      var entity = arguments[0];
      // r( some_entity )
      if( typeof entity === "object" ){
        f.entity = entity;
        f.rid   = entity.id;
      // r( some_id )
      }else{
        f.entity = null;
        f.rid   = alloc_id( entity ) || 0;
      }
      return f;
    }
    // Get
    if( f.entity )return f.entity;
    return f.entity = AllEntities[ f.rid ];
  };
  if( arguments.length ){
    f.apply( null, arguments );
  }else{
    f.entity = null;
    f.rid   = 0;
  }
  return f;
}

function deref( o, seen ){
// Resolve id references into pointers
  if( !o )return o;
  if( typeof o === "function" ){
    // o can be a type sometimes, it is the prototype that is an entity
    if( o.prototype.is_entity ){
      o = o.prototype;
    }else{
      if( o.rid )return o();
      return o;
    }
  }
  if( typeof o !== "object" )return o;
  if( !seen ){
    seen = {};
  }else{
    if( o.is_entity ){
      if( seen[ o.id ] )return o;
      seen[ o.id ] = true;
    }
  }
  for( var attr in o ){
    if( o.hasOwnProperty( attr ) ){
      if( attr !== "machine" ){
        o[ attr ] = deref( o[ attr ], seen );
      }
    }
  }
  return o;
}

/*
 *  json encoding of entity requires changing pointers into references.
 *  if o.attr points to an entity, it is replaced by an o.$attr with an id.
 *  In arrays, pointers are replaced by { $: id } values.
 */

var cached_rattr_encode = {};
var cached_rattr_decode = {};

function rattr_encode( attr ){
  var v;
  if( v = cached_rattr_encode[ attr ] )return v;
  v = "$" + attr;
  cached_rattr_encode[ attr ] = v;
  cached_rattr_decode[ v    ] = attr;
  return v;
}

function rattr_decode( attr ){
  var v;
  if( v = cached_rattr_decode[ attr ] )return v;
  v = attr.substring( 1 );
  cached_rattr_encode[ v    ] = attr;
  cached_rattr_decode[ attr ] = v;
  return v;  
}

function json_encode( o ){
// Change pointers into id references for json storage
  if( typeof o !== "object" )return o;
  var json;
  if( Array.isArray( o ) ){
    json = [];
    o.forEach( function( v, ii ){
      if( v ){
        if( v.id ){
          json[ ii ] = { $: v.id };
        }else if( v.rid ){
          json[ ii ] = { $: v.rid };
        }else{
          json[ ii ] = json_encode( v );
        }
      }else{
        json[ ii ] = v;
      }
    });
    return json;
  }
  json = {};
  for( var attr in o ){
    if( o.hasOwnProperty( attr ) ){
      if( attr === "machine" )continue;
      if( o[ attr ] ){
        if( o[ attr ].is_entity ){
          json[ rattr_encode( attr ) ] = o[ attr ].id;
        }else if( o[ attr ].rid ){
          json[ rattr_encode( attr ) ] = o[ attr ].rid;
        }else{
          json[ attr ] = json_encode( o[ attr ] );
        }
      }else{
        json[ attr ] = o[ attr ];
      }
    }
  }
  return json;
}

function json_decode_resolve( id ){
  alloc_id( id );
  var entity = lookup( id );
  return entity || ref( id );
}

function json_decode( o ){
  if( typeof o !== "object" )return o;
  var decoded;
  if( Array.isArray( o ) ){
    decoded = [];
    o.forEach( function( v, ii ){
      if( v && v.$ ){
        decoded[ ii ] = json_decode_resolve( v.$ );
      }else{
        decoded[ ii ] = v;
      }
    });
    return decoded;
  }
  decoded = {};
  for( var attr in o ){
    if( o.hasOwnProperty( attr ) ){
      if( attr[0] === "$" ){
        decoded[ rattr_decode( attr ) ] = json_decode_resolve( o[ attr ] );
      }else{
        decoded[ attr ] = json_decode( o[ attr ] );
      }
    }
  }
  return decoded;
}

var value_dont_copy = {
  "__proto__": true,
  machine: true,
  type : true,
  v: true,
  super: true,
  is_entity: true,
  entity: true,
  buried: true,
  was: true,
  now: true,
  updates: true,
  next_effect: true,
  last_effect: true,
  effect: true,
  change: true,
  snapshot: true
};

function value( x, force ){
// Entity's value is a snapshot of the entity's current state
  // console.log( x );
  var o;
  var a;
  var r;
  if( x ){
    if( x.snaptime ){
      de&&bug( "Copying a value?" );
      de&&bugger();
      return x;
    }
    if( x.is_entity && x.buried ){
      return _;
    }else if( x.is_entity && !force ){
      return x.id;
    }else if( typeof x === "function" ){
      if( x._water ){
        return value( x._water.current );
      }
    }else if( typeof x === "object" ){
      if( x.watered ){
        return { watered: "water", error: value( x.error ) };
      }else if( Array.isArray( x ) ){
        a = [];
        x.forEach( function( v, ii ){
          a[ ii ] = value( v );
        });
        return a;
      }else{
        o = {};
        // Scan all properties, including inherited ones
        for( var attr in x ){
          r = x[ attr ];
          if( typeof r !== "undefined"
          // Filter out some attributes
          &&  !value_dont_copy[ attr ]
          &&  attr[0] !== "_"
          ){
            r = value( r  );
            if( typeof r !== "undefined" ){
              if( de && !force ){
                // bug( "Copied attr " + attr );
              }
              o[ attr ] = r;
            }
          }
        }
        return o;
      }
    }else{
      return x;
    }
  }else{
    return x;
  }
}
app.value = value;

Entity.prototype.value = function(){
// The "value" of an entity is a snapshot copy of the current value of all
// it's attributes. Some attributes are actually skipped because they relate
// to the internal mechanic of the change processing.
  //de&&mand( Machine.current = this.machine );
  return value( this, true );
};

Entity.prototype.json_value = function(){
  return JSON.stringify( this.value() );
};


/*
 *  The only constant is change - Heraclitus
 *
 *  Changes are TOPs: Target.Operation( Parameter ). They describe an event/
 *  action about something. Usually it's about creating or updating an entity.
 *
 *  Changes are the only inputs of the Ephemeral machine.
 *
 *  The processing of change produces one or more effects. The first effect
 *  is linked with the changed entity and linked with further effects from
 *  there. An effect, see Effect entity base type below, is an entity, either
 *  a new one or an updated one.
 *
 *  Attributes:
 *  - Entity/id
 *  - ts          -- timestamp
 *  - t           -- target type
 *  - o           -- operation, ie "create" typically, it's a create/update
 *  - p           -- parameters, sent to the type.create() function
 *  - from        -- optional link to some previous change
 *  - to          -- the first entity that was impacted by the change
 *  - last_effect -- the last entity that was impacted by the change
 *  - change      -- optional, when change is somehow an effect itself
 */

Entity.type( Change );
function Change( options ){
  this.ts   = options.timestamp || now();
  this.t    = options.t;
  this.o    = options.o || "create";
  this.p    = options.p || {};
  this.from = options.from;
  this.to   = options.to;
  this.last_effect = null; // Tail of linked effect, see .next_effect
  this.change = null;      // When change is somehow an effect itself
}

Change.prototype.process = function(){
// This is the mapping function applied on the fluid of Changes
  var target = lookup( this.t );
  de&&mand( target );
  var operation = this.o || "create";
  de&&bug( "\nChange.process, invoke", operation, "on " + target, "p:", value( this.p ) );
  try{
    // If not id was provided for the new entity, reuse the change's id itself
    if( this.p && !this.p.id && this.id ){
      // This is useful to avoid id excessive expansion during restarts
      this.p.id = this.id;
    }
    // Remember what is the change currently processed, see Effect constructor
    Change.current = this;
    // Freeze time until next change
    now.now = this.p.ts;
    return target[ operation ].call( target, this.p );
  }catch( err ){
    trace( "Could not process change", value( this, true ), err, err.stack );
    return water.fail( err );
  }
};


/*
 *  Effect entity, abstract type
 *  aka Mutable
 *
 *  Changes produce effects. Let's track the updates.
 *  All effects come from some Change, the last change involved is remembered
 *  and other effects due to that same last change are linked together. This
 *  is mainly for auditing/debugging but it might be useful for other
 *  purposes.
 *
 *  Attributes:
 *  - Entity/id   -- an integer, unique, increasing
 *  - key         -- a unique key, a string
 *  - change      -- the change that triggered the effect
 *  - next_effect -- next effect in change's list of effects (see Change/to)
 *  - effect      -- optional, the updated entity, if effect is an update
 *  If the effect is not an update, then it is the updated entity:
 *  - updates     -- array of snapshot values of the entity, ie log
 *  - was         -- the last snapshot value of the entity
 */

Entity.type( Effect );
function Effect( options ){

  var change = Change.current;
  de&&mand( change );

  // Effect is due to a change, link change to effects, linked list
  this.change = change;

  // If first effect
  if( !change.to ){
    change.to = this;
    change.last_effect = this;
    this.next_effect = null;

  // Else effect is an indirect effect of the initial change, link them
  }else{
    de&&mand( change.last_effect );
    change.last_effect.next_effect = this;
    change.last_effect = this;
    this.next_effect = null;
  }

  // Also remember this change as the "first" update, ie the "create" update
  this.updates = water( [ change.p ] );
  this.was     = null;

  // Some effects are about a pre existing entity, ie they are updates.
  // .register( key ) will detect such cases
  this.key    = options.key;
  this.effect = _;
}

Effect.prototype.update = function( other ){
// Default update() injects other's attributes into entity.
  de&&mand( other.is_update() );
  for( var attr in other ){
    if( !other.hasOwnProperty( attr ) )continue;
    // Skip inherited attributes
    if( attr in Effect.prototype )continue;
    // If target attribute is a function, call it, ie update water sources
    if( typeof this[ attr ] === "function" && this[ attr ]._water ){
      // Updates are values, no water in them
      de&&mand( typeof other[ attr ] !== "function" );
      this[ attr ]( other[ attr ] );
      continue;
    }
    // Skip attributes that don't already exists
    if( !this.hasOwnProperty( attr ) )continue;
    this[ attr ] = other[ attr ];
  }
  return this;
};

Effect.prototype.touch = function(){
// Called by .register(), when there is an update.
// To be redefined by sub types
  return this;
};


Effect.prototype.expiration = function(){
  if( this.key ){
    this.constructor.all[ this.key ] = null;
  }
  // ToDo: cascade expiration, should bury dependant effects somehow
  //Effec.super.prototype.expiration.call( this );
}

Effect.prototype.register = function( key ){
// Register entity and detect updates about pre-existing entities
  //if( this.id === 10009 )debugger;
  if( typeof key !== "string" ){
    var tmp = AllEntities[ key ];
    if( !tmp ){
      trace( "BUG? .register( " + key + ") with integer id of missing entitiy" );
      throw( new Error( "bad id, missing entity" ) );
    }
    tmp = tmp.key;
    if( !tmp ){
      trace( "BUG? .register( " + key + ") with integer id of invalid entitiy"
      + tmp );
      throw( new Error( "bad id, missing key" ) );
    }
    key = tmp;
  }
  // Look for an existing entity with same type and same key
  this.key = key;
  var entity = this.constructor.all[ key ];
  // If found then this entity is actually an update for that existing entity
  if( entity ){
    de&&bug( "Update on " + entity + ", key:" + key + ", update: " + this );
    de&&mand( entity !== this );
    de&&mand( !entity.is_update() );
    // ToDo: does such an update need UID?
    // Remember the target entity that this update produces an effect on
    if( this.id === 10016 )debugger;
    this.effect = entity;
    //this.to = entity;
    de&&mand( this.is_update() );
    de&&mand( !entity.is_update() );
    // Add the update to the entity's log of updates
    var updates = entity.updates();
    entity.was = entity.value();
    updates.push( entity.was );
    entity.updates( updates );
    // Invoke possibly redefined .touch()
    entity.touch();
    return entity;
  }
  // Genuine new entity, key first seen, track it
  de&&bug( "Key for new " + this + " is: " + key );
  this.constructor.all[ key ] = this;
  return this;
};
  
Effect.prototype.is_update = function(){ return !!this.effect; };
  
Effect.prototype.water = function( other ){
// Changes to entities involves watering the original with an update.
  // There must be actual water only in the original, not in the updates
  return other === this
  ? water
  : function water_update( init_val ){
    // x = water( init_val );
    if( typeof init_val !== "undefined" )return init_val;
    // x = water( _, ff, [ init_val, other_deps... ] )
    return arguments[2] && arguments[2][0];
  };
};


 /*
  *  Immutable entities are one shot effects, no updates
  */

Effect.type( Immutable );
function Immutable(){};

Immutable.prototype.register = function(){
  var target = Effect.prototype.register.apply( this, arguments );
  de&&mand( target === this );
  return target;
};


/*
 *  Version entity
 *
 *  Persisted entity are stored in "log" files. Whenever a new version of this
 *  software is created, with changes to the data schema, a new version entity
 *  is created.
 *  During restore (from log) global Change.versioning progresses until it
 *  reaches the value of Change.version, the current version of the schema.
 *  As a result, code can check Change.versioning to adapt the schema of older
 *  changes.
 */

Change.version    = "1";
Change.versioning = "";

Entity.type( Version );
function Version( options ){
  this.label = Change.version = options.label;
}


/*
 *  The rest is ephemeral. It will expire and be buried, unless resurrected.
 *  Abstract type.
 *
 *  Lifecycle: create(), [renew()], expiration(), [resurrect() + renew()]...
 *
 *  Attributes:
 *  - Entity/id
 *  - Effect/key
 *  - Effect/updates
 *  - Effect/was
 *  - timestamp    -- time at creation
 *  - time_touched -- time when last touched/updated
 *  - duration     -- life expectancy
 *  - buried       -- flag, true after expiration without resurrection
 *  - expire       -- time of expiration, is timestamp + duration
 */

Effect.type( Ephemeral );
function Ephemeral( options ){
  this.timestamp    = options.timestamp || now();
  this.time_touched = options.time_touched || this.timestamp;
  this.buried       = false;
  this.duration     = water( options.duration || ONE_YEAR );
  this.expire       = function(){
    var limit = this.timestamp + this.duration();
    if( now() > limit ){
      this.bury();
    }else{
      this.schedule( limit );
    }
    return limit;
  }.when( this.duration );
}

Ephemeral.prototype.expired = function(){
  if( this.buried )return true;
  var flag = now() > this.expire();
  flag && de&&bugger;
  return flag;
};

Ephemeral.prototype.bury = function(){
  if( this.buried )return;
  this.buried = true;
  this.expiration();
  // Clear object if not resurrected, this enables some garbage collection
  if( this.buried ){
    for( var attr in this ){
      if( !this.hasOwnProperty( attr ) )continue;
      if( attr !== "is_entity" && attr !== "buried" ){
        var v = this[ attr ];
        if( v ){
          if( v._water ){ water.dispose( v ); }
        }
        this[ attr ] = undefined;
      }
    }
    Ephemeral.count--;
    // Also remove from list of all entities to prevent new references to it
    AllEntities[ this.id ] = _;
  }
};

Ephemeral.prototype.expiration = function ephemeral_expiration(){
  // Default is to create an expiration entity but subtype can do differently
  Expiration.create( { entity: this } );
  Ephemeral.super.prototype.expiration.call( this );
};

Ephemeral.prototype.resurrect = function(){
// To be called from a redefined .expiration(), needs a renew().
  if( !this.buried )throw new Error( "Resurrect Entity" );
  this.buried = false;
  // Resurrection.create( { entity: this ); } );
};

Ephemeral.prototype.schedule = function( limit ){
  var delay = limit - now();
  if( delay < 0 ){ delay = 0; }
  var that = this;
  setTimeout( function(){
    if( that.expired() ){ that.bury(); }
  }, delay );
};

Ephemeral.prototype.age = function(){
  return now() - this.timestamp;
};

Ephemeral.prototype.age_touched = function(){
  return now() - this.time_touched;
};

Ephemeral.prototype.renew = function( duration ){
  if( this.buried )return;
  if( !duration ){ duration = ONE_WEEK; }
  var new_limit = now() + duration;
  var total_duration = new_limit - this.timestamp;
  this.duration( total_duration );
  // Renewal.create( { entity: this } );
};

Ephemeral.prototype.touch = function(){
  this.time_touched = now();
};


/*
 *  Base type of event entities
 *
 *  Attributes:
 *  - Entity/id
 */

Immutable.type( Event );
function Event(){}


/*
 *  Expiration entity
 *  This is the event that occurs when an entity expires.
 *
 *  When this event occurs, the entity cannot be resurrected anymore.
 *  To resurrected an entity when it is about to expire, one needs to
 *  redefine the .expiration() method of that entity.
 *
 *  Attributes:
 *  - Entity/id
 *  - entity     -- the entity that expired, most attributes were cleared
 *  - entity_id  -- it's id
 *  - entity_key -- it's key, if any
 */
 
 Event.type( Expiration );
 function Expiration( options ){
   this.entity     = options.entity;
   this.entity_id  = this.entity.id;
   this.entity_key = this.entity.key;
   de&&mand( this.entity.buried );
 }


/*
 *  Trace entity
 *
 *  This is for deployed systems
 *
 *  Attributes:
 *  - Entity/id
 *  - severity   -- critical/error/warn/info/debug
 *  - parameters -- list of parameters
 *  - subject    -- the entity this trace is about, if any
 */
 
Event.type( Trace );
function Trace( options ){
  this.subject    = options.subject;
  this.severity   = options.severity;
  this.parameters = options.parameters;
}

// Trace event severity
Trace.debug    = "debug";
Trace.info     = "info";
Trace.warn     = "warn";
Trace.error    = "error";
Trace.critical = "critical";

function TRACE( e, p ){ Trace.create({ event: e, parameters: p }); }
function DEBUG(){    TRACE( Trace.debug,    arguments ); }
function INFO(){     TRACE( Trace.info,     arguments ); }
function WARN(){     TRACE( Trace.warn,     arguments ); }
function ERROR(){    TRACE( Trace.error,    arguments ); }
function CRITICAL(){ TRACE( Trace.critical, arguments ); }

app.TRACE    = TRACE;
app.DEBUG    = DEBUG;
app.INFO     = INFO;
app.WARN     = WARN;
app.ERROR    = ERROR;
app.CRITICAL = CRITICAL;

/*
 *  Persistent changes processor
 */

function persist( fn, a_fluid, filter ){
  // At some point changes will have to be stored
  var restore_done = false;
  a_fluid.tap( function( item ){
    // Don't store while restoring from store...
    if( !restore_done )return;
    // Some changes don't deserve to be stored
    if( filter && !filter( item ) )return;
    // Don't log traces slowly
    if( item.type === "Trace" ){
      // ToDo: write traces, fast
      return;
    }
    try{
      de&&bug( "Write", fn, "id:", item.id );
      // ToDo: let entity decide about is own storage format
      var value = json_encode( deref( item ) );
      var json;
      if( 0 ){
        if( item.store_value ){
          value = item.store_value();
        }else{
          value = Entity.store_value.call( item );
        }
      }
      // Special handling for "Change" entity
      // ToDo: should be in Change.prototype.store_value()
      if( value.o === "create" ){
        // Remove default o:"create" member from Change entities
        value.o = _;
        // Get rid of duplicated id
        de&&mand( value.id === value.p.id );
        value.id = _;
        // Move timestamp into "options" parameter
        value.p.ts = value.ts;
        value.ts = _;
        // Remove .to if it points to the entity itself
        if( value.$to && value.p.$to === value.uid ){
          value.$to = _;
        }
        // Remove .last_effect and change, internal use only
        value.$last_effect = value.change = _;
        // As a result value.t is like an SQL table name
        // and value.p is like an SQL record
      }
      // Track max id so far, needed at restore time
      // value.lid = NextId - 1;
      json = JSON.stringify( value );
      fs.appendFileSync( fn, json + "\r\n" );
    }catch( err ){
      trace( "Could not write to", fn, "id:", item.id, "err:", err );
      trace( err );
    }
  });
  // Return a boxon, fulfilled when restore is done
  var next = boxon();
  var fs = require( "fs" );
  if( Ephemeral.force_bootstrap ){
    try{ fs.unlinkSync( fn ); }catch( _ ){}
    restore_done = true;
    next( "forced bootstrap" ); return next;
  }
  // Determine what should be the next UID, greater than anything stored
  // ToDo: avoid reading whole file!
  try{
    var content = fs.readFileSync( fn, "utf8" );
    var idx = content.lastIndexOf( '"id":' );
    if( idx !== -1 ){
      content = content.substring( idx + '"id":'.length );
      content = parseInt( content, 10 );
      de&&bug( "Restore, max id:", content );
      alloc_id( content );
    }
  }catch( err ){
    // File does not exist, nothing to restore
    restore_done = true;
    // Log version
    if( Change.version !== Change.versioning ){
      Change.versioning = null;
      step( function(){
        Change.create({ t: "Version", o: "create", p: { label: Change.version } });
      } );
    }
    next( err );
    return next;
  }
  // Will feed a flow with records streamed from the file
  var change_flow = fluid();
  var error;
  change_flow // .log( "Restore" )
  .map( json_decode )
  .failure( function( err ){
    // ToDo: errors should terminate program
    error = err;
    change_flow.close();
  })
  .final( function(){
    de&&bug( "End of restore" );
    // restore done. what is now pushed to "changes" gets logged
    restore_done = true;
    now.now = 0;
    // Log version
    if( Change.version !== Change.versioning ){
      Change.versioning = null;
      step( function(){
        Change.create({ t: "Version", o: "create", p: { label: Change.version } } ); 
      } );
    }
    next( error );
  })
  .to( a_fluid );
  // Use a Nodejs stream to read from previous changes from json text file
  // Use npm install split module to split stream into crlf lines
  var split = require( "split" );
  var input = fs.createReadStream( fn );
  input
  .on( "error", function( err    ){
    trace( "Error about test/vote.json", err );
    change_flow.fail( err );
    change_flow.close();
  })
  .pipe( split( JSON.parse ) )
  // ToDo: use "readable" + read() to avoid filling all data in memory
  .on( "data",  function( change ){ change_flow.push( change ); } )
  .on( "error", function( err ){
    trace( "Restore, stream split error", err );
    // ToDo: only "unexpected end of input" is a valid error
    // flow.fail( err );
  })
  .on( "end", function(){
    de&&bug( "EOF reached", fn );
    change_flow.close();
  });
  return next;
}

 
fluid.method( "pretty", function(){
  return fluid.it.map( function( it ){ return pretty( it ); } );
} );

de&&Expiration.fluid.pretty().log( "Log Expiration" );

function start( bootstrap, cb ){
// Start the "change processor".
// It replays logged changes and then plays new ones.
// When there is no log, it bootstraps first.
  var time_started = l8.update_now();
  if( !cb ){ cb = boxon(); }
  de&&dump_entities();
  // Here is the "change processor"
  Change.fluid
  .map( function( change ){
    return Change.prototype.process.call( deref( change ) ); })
  .failure( function( err ){
      trace( "Change process error", err );
  })
  ;//.pretty().log();
  // It replays old changes and log new ones
  persist(
    app.store || "ephemeral.json.log",
    Change.fluid,
    function( item ){ return item.t !== "Trace"; } // filter trace entities
  ).boxon( function( err ){
    var ready = boxon();
    if( !err ){
      de&&bug( "Restored from " + app.store );
      ready();
    }else{
      trace( "Restore error", err );
      // ToDo: handle error, only ENOENT is ok, ie file does not exist
      de&&bug( "Bootstrapping" );
      time_started = l8.update_now();
      var step_list = bootstrap();
      step_list.push( function(){
        trace( "Bootstrap duration: "
          + ( l8.update_now() - time_started )
          + " ms"
        );
      } );
      try{
        steps( step_list ).boxon( function( err ){
          de&&bug( "Bootstrap done" );
          ready( err );
        });
      }catch( err ){
        trace( "Bootstrap error", err, err.stack );
        ready( err );
      }
    }
    ready( function( err ){
      de&&dump_entities();
      trace( "Start duration: "
        + ( l8.update_now() - time_started )
        + " ms"
      );
      if( err ){
        CRITICAL( "Cannot proceed, corrupted " + app.store );
        dump_entities();
        cb( err ); // new Error( "Corrupted store" ) );
      }else{
        INFO( "READY" );
        cb();
      }
    });
  });
}

// More exports
Ephemeral.start = function( bootstrap, cb ){
  // id 0...9999 are reserved for meta objects
  NextId = MaxSharedId + 1;
  start( bootstrap, cb );
};

Ephemeral.inject = function( t, p ){
  if( Array.isArray( t ) )return steps( t );
  if( Stepping ){
    return Change.create( { t: t, o: "create", p: p } );
  }else{
    return steps( [
      function(){
        Change.create( { t: t, o: "create", p: p } )
      }
    ]);
  }
};

Ephemeral.get_next_id = function(){ return NextId; };
Ephemeral.ref = ref;

// Exports
app.ice    = function ice( v ){  // Uniform access water/constant
  return function(){ return v; }; // Unused, yet
};

return app;

} // end of function ephemeral()

// exports = ephemeral;



/* ========================================================================= *\
 * ========================= Application specific code ===================== *
\* ========================================================================= */


var vote = { store: "vote.json.log" }; // ToDo: "file://vote.json.log"
// require( "ephemeral.js" )( vote )
ephemeral( vote );

var l8        = vote.l8;
var Event     = vote.Event;
var Effect    = vote.Effect;
var Ephemeral = vote.Ephemeral;

// My de&&bug() and de&&mand() darlings
var de      = false;
var trace   = vote.trace;
var bug     = trace;
var bugger  = vote.bugger;
var error_traced = vote.error_traced;
var mand    = vote.assert;
var assert  = vote.assert;

// More imports
var value   = vote.value;
var pretty  = vote.pretty;
var water   = vote.water;
var diff    = vote.diff;
var _       = vote._;
//debugger;


var namize_cache = {};

function namize( label ){
  // Twitter name & hashtags are case insensitive but are displayed with case
  if( !label )return label;
  var tmp = namize_cache[ label ];
  if( tmp )return tmp;
  tmp = label.toLowerCase();
  namize_cache[ label ] = tmp;
  namize_cache[ tmp ] = tmp;
  return tmp;
}

function name_equal( a, b ){
  return namize( a ) === namize( b );
}


/*
 *  Persona entity
 *
 *  Individuals and groups.
 *
 *  Individuals can vote. Vote is about topics, either propositions or tags.
 *  Multiple votes on the same topic are possible, new vote erases the previous
 *  one. Delegations of voting power can be established, based on tags and
 *  given to an agent who can vote (or delegate) on behalf of the delegator.
 *
 *  Individual's label the twitter name of some twitter account, possibly an
 *  account bound to a "true human person" or a fake or whatever emerges (AI,
 *  ...). One individual, one vote.
 *
 *  Groups are personas that don't vote. However, groups have orientations like
 *  individuals. As a result, one can delegate to a group. The orientation of
 *  a group is the consolidation of the orientations of the group members,
 *  where each member's orientation is weighted according to the number of
 *  members in it (group members can be groups themselves).
 *
 *  Group's label is the twitter name of some twitter account. As a result,
 *  the management of the membership is done by whoever controls that
 *  twitter account. To add a member, follow that member.
 *
 *  Attributes:
 *    - Entity/id
 *    - Effect/key
 *    - label            -- unique name, idem to key
 *    - role             -- "individual" or "group"
 *    - members          -- friends or group's members
 *    - memberships      -- to groups
 *    - delegation       -- of persona to agent, about tagged topics
 *    - delegation_from  -- idem, agent's side, relation is bidirect
 *    - votes            -- all votes, both direct & indirect
 */

Ephemeral.type( Persona );
function Persona( options ){

  this.label            = options.label || options.key;
  this.name             = namize( this.label );
  this.identity( this.name );

  var persona = this.register( this.name );
  var water   = this.water( persona );

  this.role             = options.role || Persona.individual;
  this.members          = water( [] );
  this.memberships      = water( [] );
  this.delegations      = water( [] );
  this.delegations_from = water( [] );
  this.votes            = water( [] );
  // ToDo: total number of votes, including votes for others.
  // This would make it easy to detect "super delegates"

  // ToDo: test update()
  if( this.is_update() )return persona.update( this );

  // Increase default expiration
  this.duration( options.duration || vote.ONE_YEAR );

  // Indexes, for faster access
  this._votes_indexed_by_proposition = {};
}

// Persona roles
Persona.individual = "individual";
Persona.group      = "group";

Persona.prototype.is_group      = function(){ return this.role === "group"; };
Persona.prototype.is_individual = function(){ return !this.is_group();      };

Persona.find = function( key ){
// Key are case insensitive on twitter
  return Persona.super.find.call( namize( key ) );;
}

Persona.prototype.touch = function(){
  var delay = this.expire() - ( this.time_touched = vote.now() );
  // If touched after mid life, extend duration to twice the current age
  if( delay < this.age() / 2 ){
    this.renew( this.age() * 2 );
  }
  Persona.super.prototype.touch.call( this );
};


Persona.prototype.get_vote_on = function( proposition ){
// If there is a vote by persona on said topic, return it, or null/undef
  de&&mand( proposition.is_a( Topic ) );
  var found_vote = this._votes_indexed_by_proposition[ proposition.key ];
  if( typeof found_vote !== "undefined" )return found_vote;
  this.votes().every( function( vote ){
    if( vote.proposition === proposition ){
      found_vote = vote;
      return false;
    }
    return true;
  });
  trace( "BUG? unexpected vote on " + proposition + " of " + this );
  this._votes_indexed_by_proposition[ proposition.key ] = found_vote || null;
  return found_vote;
};

Persona.prototype.get_orientation_on = function( proposition ){
// Return orientation on topic if it exits, or else undefined
  de&&mand( proposition.is_a( Topic ) );
  var vote = this.get_vote_on( proposition );
  return vote && vote.orientation();
};

Persona.prototype.add_delegation = function( delegation, loop ){
// Called when a delegation is created. This will also add the reverse
// relationship (delegation_from), on the agent's side.
  de&&mand( delegation.is_a( Delegation ) );
  de&&mand( delegation.persona === this );
  var delegations = this.delegations() || [];
  if( delegations.indexOf( delegation ) !== -1 ){
    trace( "BUG? Delegation already added " + delegation
      + ", persona: " + this
      + ", agent: " + delegation.agent
    );
    return this;
  }
  var now = delegations.slice(); // ToDo: need a copy?
  now.push( delegation );
  de&&bug( "Add delegation " + delegation
   + " for persona " + this 
   + " for topics tagged " + pretty( delegation.tags() )
   + " to agent " + delegation.agent
  ); 
  this.delegations( now );
  if( !loop ){
    delegation.agent.add_delegation_from( delegation, true );
  }
  return this;
};

Persona.prototype.add_delegation_from = function( delegation, loop ){
// Called by Persona.add_delegation() to sync the agent side of the
// one to one bidirectional relation.
  de&&mand( delegation.agent === this );
  var delegations_from = this.delegations_from() || [];
  if( delegations_from.indexOf( delegation ) !== -1 ){
    trace( "BUG? Delegation 'from' already added: " + delegation
      + ", agent: " + delegation.agent
      + ", persona: ", delegation.persona
    );
  }
  var now = delegations_from.slice();
  now.push( delegation );
  de&&bug( "Add delegation " + delegation
   + " by agent " + this 
   + " for topics tagged " + pretty( delegation.tags() )
   + " from persona " + delegation.persona
  ); 
  this.delegations_from( now );
  if( !loop ){
    delegation.persona.add_delegation( delegation, true );
  }
  return this;
};


Persona.prototype.vote_for_others = function( vote ){
// When a persona was given delegation, her vote may cascade into votes for
// other personas, on the same proposition.
  de&&mand( vote.persona === this );
  var persona     = this;
  var orientation = vote.orientation();
  var proposition = vote.proposition;
  var delegations_from = this.delegations_from() || [];
  if( !delegations_from.length )return this;
  de&&bug( "Persona " + persona + " votes " + orientation
    + " on proposition " + vote.proposition
    + " for at most " + delegations_from.length + " other personas"
  );
  //debugger;
  delegations_from.forEach( function( delegation ){
    if( proposition.is_tagged( delegation.tags() ) ){
      de&&bug( "Cascade delegated vote by " + persona
        + " on behalf of " + delegation.persona 
        + " for proposition: " + proposition
        + ", orientation: " + orientation
      );
      var vote = Vote.create({
        persona:     delegation.persona,
        delegation:  delegation,
        proposition: proposition,
        orientation: orientation
      });
      // Remember all votes due to the said delegation
      delegation.track_vote( vote );
    }
  });
  return this;
};

Persona.prototype.delegates_to = function( agent, tags, seen ){
// Predicate to assert the existence of a delegation by a persona to some
// agent, directly or indirectly.
  if( !seen ){ seen = {}; }
  if( seen[ this.id ] ){
    trace( "Loop detected when looking for agent " + agent );
    return false;
  }
  seen[ this.id ] = true;
  return !this.delegations().every( function( delegation ){
    return !delegation.delegates_to( agent, tags, seen );
  });
};


Persona.prototype.find_applicable_delegations = function( proposition ){
  var found_delegations = [];
  var delegations = this.delegations();
  delegations.forEach( function( delegation ){
    if( delegation.is_active()
    && delegation.includes_proposition( proposition )
    ){
      found_delegations.push( delegation );
    }
  });
  return found_delegations;
};

Persona.prototype.track_vote = function( vote ){
// Called by Vote constructor
  de&&mand( vote.persona === this );
  var votes = this.votes();
  de&&mand( votes.indexOf( vote ) === -1 );
  votes.push( vote );
  this.votes( votes );
  this._votes_indexed_by_proposition[ vote.proposition.key ] = vote;
  return this;
};

Persona.prototype.add_member = function( member ){
  var members = this.members();
  de&&mand( members.indexOf( member ) === -1 );
  members.push( member );
  this.members( members );
  return this;
};

Persona.prototype.remove_member = function( member ){
  var members = this.members();
  var idx     = members.indexOf( member );
  if( idx === -1 )return this;
  members.splice( idx, 1 );
  this.members( members );
  return this;
};

Persona.prototype.is_member_of = function( group ){
  // ToDo: add index to speed things up
  // return group.members_indexed_by_persona( this.key );
  return group.members().indexOf( this ) !== -1;
};

Persona.prototype.has_member = function( persona ){
  return persona.is_member_of( this );
};

Persona.prototype.add_membership = function( membership ){
  var memberships = this.memberships();
  de&&mand( memberships.indexOf( membership ) === -1 );
  // Remember index inside persona's .memberships[], to speed up removal
  // ToDo: use an hashmap?
  membership.insert_index = memberships.length;
  memberships.push( membership );
  this.memberships( memberships );
  return this;
};

Persona.prototype.remove_membership = function( membership ){
  var memberships = this.memberships();
  var idx = membership.insert_index;
  de&&mand( typeof idx !== "undefined" );
  // ToDo: quid of compaction?
  memberships[ idx ] = _;
  membership.insert_index = _;
  // memberships.splice( idx, 1 );
  // Not cloned, not needed
  this.memberships( memberships );
  return this;
};


/*
 *  Source entity
 *
 *  - Describes the "reference material" that explains why a topic was created
 *  - or why a vote was assigned to some persona when that vote does not come
 *    from the persona herself. Note: a twitter persona can override such
 *    votes, as she is the most legitimate source.
 */

Ephemeral.type( Source );
function Source( options ){
  this.topic   = options.topic;
  this.persona = options.persona;
  this.label   = options.label;
  this.url     = options.url;
}


/*
 *  A Tweet entity.
 */

Ephemeral.type( Tweet );
function Tweet( options ){

  de&&mand( options.persona );
  de&&mand( options.id_str );

  this.persona     = options.persona;
  this.label       = options.id_str;
  this.text        = options.text || "?";
  this.user        = options.user; // id_str of the user
  this.screen_name = options.screen_name || "?"; // What comes after @
  this.name        = options.name || this.screen_name;
  this.vote        = water( options.vote ); // When associated to a vote
  this.topic       = water( options.topic || (options.vote && options.vote.proposition ) );
  this.api         = options.api; // Whatever the Twitter API provides
  this.origin      = options.origin || Tweet.received;
}

// Tweet origin
Tweet.sent     = "sent";     // Tweet sent to twitter
Tweet.received = "received"; // Tweet received from twitter


/*
 *  Topic entity
 *
 *  Proposition topics are the ultimate target of votes.
 *    their source, when known, is typically a tweet.
 *    they can be tagged.
 *  Tag topics help to classify propositions. 
 *    they don't have a source, maybe.
 *    they can be tagged & voted on too, like propositions => folksonomy
 *
 *  Attributes
 *    - Entity/id
 *    - Effect/key
 *    - label        -- name of proposition (an hash word) or #xxxx tag
 *    - name         -- lowercase version of label, key
 *    - source       -- source could be a url, typically
 *    - propositions -- tags track the propositions they tag
 *    - delegations  -- tags track the delegations they impact, can be huge!
 *    - tags         -- propositions & tags track the tags assigned to them
 *    - votes_log    -- propositions & tags track all the votes about them
 *    - result       -- the result of votes on the topic
 */
 
Ephemeral.type( Topic );
function Topic( options ){
  
  de&&mand( options.label );

  this.label = options.label;
  this.name  = namize( this.label );
  this.identity( this.name );

  var topic = this.register( this.name );
  var water = this.water( topic );
  
  this.source       = water( options.source );
  this.votes_log    = water( options.votes_log );
  this.propositions = water( options.propositions );
  this.tags         = water( options.tags );
  this.delegations  = water( options.delegations );
  this.comments     = water( options.comments );
  this.result       = options.result
    || ( this.is_create() && Result.create({ proposition: this } ) );

  // ToDo: implement .update()?
  if( this.is_update() )return topic.update( this );

  if( !options.votes_log   ){ this.votes_log(   [] ); }
  if( !options.delegations ){ this.delegations( [] ); }
  if( !options.comments    ){ this.comments(    [] ); }

  //de&&mand( this.delegations()  );
  
  // Let's tag the propositions
  if( options.propositions ){
    options.propositions.forEach( function( proposition ){
      proposition.add_tag( topic );
    });
  }else{
    topic.propositions( [] );
  }
  
  // Let the tags know that a new proposition uses them
  if( options.tags ){
    options.tags.forEach( function( tag ){
      if( !tag.propositions ){
        trace( "Missing .propositions for tag " + tag, value( tag, true ) );
      }
      de&&mand( tag.propositions && typeof tag.propositions === "function" );
      tag.add_proposition( topic );
    });
  }else{
    topic.tags( [] );
  }
}

Topic.find = function( key ){
  return Topic.super.find.call( namize( key ) );
}

Topic.prototype.update = function( other ){
  // ToDo: handle .tags and .propositions changes
  this.source( other.source );
  this.comments( other.comments );
  if( other.result ){ this.result = other.result };
  if( other.delegations ){ this.update_delegations( other.delegations ); }
  return this;
};


Topic.prototype.touch = function(){
  var delay = this.expire() - ( this.time_touched = vote.now() );
  // If touched after mid life, extend duration to twice the current age
  if( delay < this.age() / 2 ){
    this.renew( this.age() * 2 );
  }
  Topic.super.prototype.touch.call( this );
};


Topic.prototype.update_delegations = function( list ){
  trace( "ToDo: update delegations" );
  this.delegations( list );
  return this;
};

Topic.prototype.is_proposition = function(){ return this.label[0] !== "#"; };
Topic.prototype.is_tag         = function(){ return !this.is_proposition(); };

Topic.prototype.orientation = function(){
  return this.result.orientation();
}

Topic.prototype.heat = function(){
// Compute the "heat" of a topic. "Hot topics" should come first.
  var touched = this.result.time_touched || this.time_touched;
  // Recently touched are hot
  var age = vote.now() - touched;
  if( age < vote.ONE_MINUTE )return touched;
  if( age < vote.ONE_HOUR   )return touched;
  // Less recently touched topics are hot depending on number of direct votes
  // Less recently touched tags are hot depending on number of propositions
  return this.is_tag() ? this.propositions().length : this.result.direct();
};

Topic.prototype.filter_string = function(){
  var tags = this.tags() || [];
  var sorted_tags = tags.sort( function( a, b ){
    // Most agreed first
    var a_rank = a.result.orientation() + a.result.direct();
    var b_rank = a.result.orientation() + a.result.direct();
    if( a < b )return -1;
    if( a > b )return  1;
    return 0;
  })
  var buf = [];
  sorted_tags.forEach( function( tag ){
    buf.push( tag.label );
  });
  return buf.join( " " ) + this.computed_tags();
};

Topic.reserved_tags = {
  tag:        true,
  recent:     true,
  old:        true,
  today:      true,
  yesterday:  true,
  fade:       true,
  protest:    true,
  orphan:     true,
  referendum: true,
  persona:    true,
  topic:      true,
  result:     true,
  group:      true,
  membership: true,
  tagging:    true,
  delegation: true,
  yes:        true,
  no:         true,
  ok:         true,
  ko:         true,
  on:         true,
  off:        true,
  true:       true,
  false:      true,
  null:       true,
  undefined:  true,
  me:         true,
  you:        true,
  them:       true,
  abuse:      true,
  jhr:        true  // End Of List
};

Topic.reserved = function( tag ){
  if( !tag )return false;
  if( tag[0] === "#" ){
    tag = tag.substring( 1 );
  }
  // One letter tags are all reserved for future use
  if( tag.length < 2 )return true;
  return !!Topic.reserved_tags[ tag.toLowerCase() ];
};

Topic.prototype.computed_tags = function(){
  var buf = [];
  if( this.is_tag() ){
    buf.push( '#tag' )
  }
  if( Persona.find( "@" + this.label )
  || Persona.find( "@" + this.label.substring( 1 ) )
  ){
    buf.push( "#persona" );
  }
  if( this.age() <= vote.ONE_WEEK ){
    buf.push( "#recent" );
    if( this.age() <= vote.ONE_DAY ){
      buf.push( "#today" );
    }else if( this.age() <= 2 * vote.ONE_DAY ){
      buf.push( "#yesterday" );
    }
  }
  if( this.expire() < vote.now() + vote.ONE_WEEK ){
    buf.push( "#fade" );
  }
  // #protest if orientation is protest or if protest votes > 1% of votes
  if( ( this.result.orientation() === Vote.protest
    || this.result.protest() * 100 > this.result.total() )
  && Persona.count >= 50
  ){
    buf.push( "#protest" );
  }
  // #orphan if no votes after a week
  if( this.result.total() <= 1 && this.age() > vote.ONE_WEEK ){
    buf.push( "#orphan" );
  // #referendum if 1% of people voted
  }else if( this.result.total() * 100 >= Persona.count && Persona.count >= 50 ){
    buf.push( "#referendum" );
  }
  // ToDo: #hot, not an easy one
  if( !buf.length )return "";
  return " " + buf.join( " " );
};


Topic.prototype.expiration = function(){
// At expiration, topic is simply renewed, unless no votes remains
// ToDo: handle topic burial
  if( this.result && this.result.total() ){
    de&&bug( "Pre-expiration for " + this );
    this.resurrect();
    this.renew();
  }else{
    de&&bug( "Expiration for " + this );
    Topic.super.prototype.expiration.call( this );
  }
  return this;
};


Topic.prototype.add_vote = function( v ){
  this.log_vote( v );
  this.result.add_vote( v );
  return this;
};


Topic.prototype.remove_vote = function( was ){
// Called by vote.remove()
  //this.log_anti_vote( was );
  this.result.remove_vote( was );
};

Topic.prototype.log_vote = function( v ){
// Called by .add_vote()
// There is a log of all votes. It is a snapshot copy of the vote value that is
// kept because a persona's vote can change over time.
  var val = v.value();
  v.snapshot = val;
  val.snaptime = vote.now();
  val.comment_text = v.comment() && v.comment().text;
  val.entity = v;
  val.persona_label = v.persona.label;
  var votes_log = this.votes_log();
  if( !votes_log ){ votes_log = []; }
  votes_log.push( val );
  this.votes_log( votes_log );
  // Also log in global log
  Vote.log.push( val );
  return this;
};

Topic.prototype.log_anti_vote = function( was ){
// Called by remove_vote()
// When a vote is removed (erased), it is removed from the log of all the votes
// on the proposition.
  var votes_log = this.votes_log();
  // Look for the logged vote
  var found_idx;
  var ii = votes_log.length;
  while( ii-- ){
    if( votes_log[ ii ].entity.id === was.id ){
      found_idx = ii;
      break;
    }
  }
  // The vote must be there, ie log_vote() was called before
  de&&mand( typeof found_idx !== "undefined" );
  // No clone, votes contains the valid votes, ie not the removed ones
  // ToDo: this is rather slow, maybe nullification would be better, with
  // some eventual compaction
  votes_log.splice( found_idx, 1 );
  this.votes_log( votes_log );
  return this;
};


Topic.prototype.add_tag = function( tag, loop ){
  var list = this.tags() || [];
  var idx = list.indexOf( tag );
  // Done if already there
  if( idx !== -1 )return this;
  // No clone, not needed
  var new_list = list;
  new_list.push( tag );
  this.tags( new_list );
  if( !loop ){
    tag.add_proposition( this, true );
    tag.update_votes();
  }
  return this;
};

Topic.prototype.remove_tag = function( tag, loop ){
  var list = this.tags() || [];
  var idx = list.indexOf( tag );
  // Done if already not there
  if( idx === -1 )return this;
  // No clone, not needed
  var new_list = list;
  de&&mand( idx !== - 1 );
  new_list.splice( idx, 1 );
  this.tags( new_list );
  if( !loop ){
    tag.remove_proposition( this, true );
    tag.update_votes();
  }
  return this;
};

Topic.prototype.add_comment = function( comment ){
  var list = this.comments() || [];
  var idx = list.indexOf( comment );
  // Done if already there
  if( idx !== -1 )return this;
  // No clone, not needed
  var new_list = list;;
  new_list.push( comment );
  this.comments( new_list );
  return this;
};

Topic.prototype.remove_comment = function( comment ){
  var list = this.tags() || [];
  var idx = list.indexOf( comment );
  // Done if already not there
  if( idx === -1 )return this;
  // ToDo: avoid clone?
  var new_list = list;
  de&&mand( idx !== - 1 );
  new_list.splice( idx, 1 );
  this.comments( new_list );
  return this;
};


Topic.prototype.add_proposition = function( proposition, loop ){
// Each tag has a list of all the propositions that are tagged with it
  var list = this.propositions() || [];
  // Done if already there
  if( list.indexOf( proposition ) !== - 1 )return this;
  // ToDo: avoid clone?
  var new_list = list.slice();
  new_list.push( proposition );
  this.propositions( new_list );
  if( !loop ){
    proposition.add_tag( this, true );
    this.update_votes();
  }
  return this;
};

Topic.prototype.remove_proposition = function( proposition, loop ){
  var list = this.propositions()|| [];
  var idx = list.indexOf( proposition );
  // Done if already not there
  if( idx === -1 )return this;
  // ToDo: avoid clone
  var new_list = list;
  de&&mand( idx !== - 1 );
  new_list.splice( idx, 1 );
  this.propositions( new_list );
  if( !loop ){
    proposition.remove_tag( this, true );
    this.update_votes();
  }
  return this;
};

Topic.prototype.is_tagged = function( tags ){
// Returns true if a topic includes all the specified tags
// Note: #something always includes itself, ie proposition xxx is #xxx tagged
  if( typeof tags === "string" ){
    return string_tags_includes( this.tags_string(), tags );
  }
  return tags_includes( this.tags() || [], tags, this.label );
};

Topic.prototype.tags_string = function(){
  var topic_tags_str = this.is_tag() ? [ this.label ] : [ "#" + this.label ];
  var topic_tags = this.tags() || [];
  topic_tags = topic_tags
  .sort( function( a, b ){
    return a.heat() - b.heat()
  })
  .forEach( function( tag ){
    topic_tags_str.push( tag.label );
  });
  return topic_tags_str.join( " " ) + this.computed_tags();
};

function string_tags_includes( tags, other_tags ){
  tags       = " " + tags.toLowerCase().trim() + " ";
  other_tags = " " + other_tags.toLowerCase().trim() + " ";
  if( tags.length < other_tags.length )return false;
  return other_tags.split( " " ).every( function( tag ){
    if( !tag )return true;
    return tags.indexOf( tag  ) !== -1;
  });
}

function tags_includes( tags, other_tags, misc ){
// Checks that all the other tags are also inside the tags set
// [] does not include [ #a ]
// [ #a, #b, #c ] does include [ #a, #b ]
// [ #a, #b ] does not include [ #a, #c ]
  if( tags.length < other_tags.length )return false;
  for( var tag in other_tags ){
    if( tags.indexOf( other_tags[ tag ] ) === -1 ){
      // When an other tag is not found, enable the proposition to tag itself
      if( !misc
      || ( other_tags[ tag ].name !== misc
        && other_tags[ tag ].name !== '#' + misc )
      )return false;
    }
  }
  return true;
}

Topic.prototype.add_delegation = function( delegation, loop ){
// Each tag has a list of all the delegations that involve it
  var delegations = this.delegations() || [];
  if( delegations.indexOf( delegation ) === -1 ){
    delegations.push( delegation );
    this.delegations( delegations );
  }
  if( !loop ){
    delegation.add_tag( this, true );
  }
  return this;
};

Topic.prototype.update_votes = function(){
  // Something changed, this may have an impact on delegated votes
  var delegations = this.delegations() || [];
  delegations.forEach( function( delegation ){
    // ToDo: hum... complex!
    trace( "ToDo: handle delegation " + delegation + " in update_votes()" );
    delegation.update_votes();
  });
  return this;
};


/*
 *  Tagging event (or detagging)
 *
 *  This event is created typically when some UI changes the tags for a
 *  proposition/topic.
 *  Potential huge side effects...
 *  Only the owner of the proposition is supposed to have such a power!
 *  Specially when tags are removed.
 *  It is expected that the owner may change tags in order to favor the
 *  the proposition, by using tags that brings lots of positive votes but are
 *  either too general or not well related to the topic at hand. Voters can
 *  fight abusive tagging using Vote.protest.
 *
 *  ToDo: this should be an Action, not an Event
 */

Event.type( Tagging );
function Tagging( options ){
  de&&mand( options.proposition );
  this.proposition = options.proposition;
  // Tags/Detags are either #str or Tag entities, this gets normalized
  this.tags        = options.tags   || [];
  this.detags      = options.detags || [];
  var that = this;
  // Remove tags first, this will restrict the delegations that apply
  var detag_entities = [];
  this.detags.forEach( function( tag ){
    de&&mand( tag.substring( 0, 1 ) === '#' );
    var tag_entity = ( tag.is_entity && tag ) || Topic.find( tag );
    if( !tag_entity ){
      trace( "Cannot detag, inexistent tag " + tag );
    }else{
      if( detag_entities.indexOf( tag_entity ) === -1 ){
        detag_entities.push( tag_entity );
        that.proposition.remove_tag( tag_entity );
      }
    }
  });
  // Then add tags, this will expand the delegations that apply
  var tag_entities = [];
  this.tags.forEach( function( tag ){
    var tag_entity = ( tag.is_entity && tag ) || Topic.find(  tag );
    if( !tag_entity ){
      trace( "On the fly creation of first seen tag " + tag );
      de&&mand( tag[0] === "#" );
      tag_entity = Topic.create( { label: tag } );
    }
    if( tag_entities.indexOf( tag_entity ) === -1 ){
      tag_entities.push( tag_entity );
      that.proposition.add_tag( tag_entity );
    }
  });
  // Normalizes, keep entities only, no strings, no duplicates
  this.detags = tag_entities;
  this.tags   = tag_entities;
}


/*
 *   Comment entity
 *
 *   Personas can leave comments to explain things about their vote.
 */

Event.type( Comment );
function Comment( options ){

  de&&mand( options.vote );
  de&&mand( options.text );

  // ToDo: fix this, should be the true object
  if( options.vote !== Vote.find( options.vote.key ) ){
    trace( "BUG! this should not happen..." );
    options.vote = Vote.find( options.vote.key );
  }
  this.vote = options.vote;
  this.text = options.text;
  this.vote.set_comment( this );
  this.vote.proposition.add_comment( this );

}


Comment.prototype.expiration = function(){
  if( this.vote.comment() === this ){
    this.vote.comment( null );
  }
  this.topic.remove_comment( this );
}


/*
 *  Vote entity
 *
 *  Personas can vote on propositions. They can change their mind.
 *  A group votes when the consolidated orientation of the group changes.
 *  Vote is either "direct" or "indirect" with a delegation.
 *  Analysts can vote on behalf of personas, based on some public source.
 *  ToDo: analysts should be able to vote on behalf of personas only for
 *  some topics, based on tags.
 */
 
Ephemeral.type( Vote );
function Vote( options ){

  // Decide: is it a new entity or an update? key is @persona_id.proposition_id
  var key = options.id_key ||( "" + options.persona.id + "." + options.proposition.id );
  this.identity( key );
  var vote = this.register( key );

  var persona      = options.persona     || vote.persona;
  var proposition  = options.proposition || vote.proposition;
  var orientation  = options.orientation

  de&&mand( persona     );
  de&&mand( proposition );

  this.persona     = persona;
  this.label       = options.label || (persona.label + "/" + orientation );
  this.proposition = proposition;

  if( this.is_create() ){
    this.analyst     = water( options.analyst );
    this.source      = water( options.source );
    this.comment     = water( options.comment );
    this.delegation  = water( options.delegation  || Vote.direct  );
    // Analysts vote "in the open", no privacy ; otherwise defaults to private
    this.privacy     = water( (options.analyst && Vote.public )
      || options.privacy || Vote.public
    );
    this.snapshot = null; // See Topic.log_vote() & Topic.set_comment()
    this.previously  = water( options.previously  || Vote.neutral );
    this.orientation = water();
    var w = water( _, error_traced( update ), [ this.delegation, this.orientation ] );
    w.vote = this;
    this.persona.track_vote( this );
    this.orientation( orientation );
  }else{
    !vote.buried && vote.update( this, options );
  }
  return vote;
  
  // Trigger on orientation or delegation change
  function update(){
    var vote = water.current.vote;
    if( vote.expired() )return;
    try{
      if( vote.was
      &&  vote.was.orientation === vote.orientation()
      &&  vote.was.delegation  === vote.delegation()
      ){
        // No changes
        trace( "BUG? useless update of vote " + vote );
        return;
      }
      // Orientation or delegation changed
      if( vote.was ){ vote.remove( vote.was ); }
      if( !options.label ){
        vote.label = vote.persona.label + "/" + vote.orientation();
      }
      vote.add();
      // Push updated entity
      vote.push();
      // Handle delegated votes
      //water.effect( function(){
        vote.persona.vote_for_others( vote );
      //});
    }catch( err ){
      trace( "Could not process vote " + vote, err, err.stack );
      console.trace( err );
      de&&bugger();
    }
  }
}


// Vote orientations
Vote.indirect = "indirect";
Vote.neutral  = "neutral";
Vote.agree    = "agree";
Vote.disagree = "disagree";
Vote.protest  = "protest";
Vote.blank    = "blank";

// Vote delegation, "direct" or indirect via agent
Vote.direct = "direct";

// Vote privacy
Vote.public  = "public";
Vote.secret  = "secret";
Vote.private = "private";

// Log a snapshot of all votes
Vote.log = [];

Vote.prototype.touch = function(){
  //this.time_touched = vote.now();
  Vote.super.prototype.touch.call( this );
}

Vote.prototype.is_direct = function(){
  return this.delegation() === Vote.direct;
};

Vote.prototype.is_indirect = function(){
  return !this.is_direct();
};

Vote.prototype.is_public = function(){
  return this.privacy() === Vote.public;
};

Vote.prototype.is_secret = function(){
  return this.privacy() === Vote.secret;
};

Vote.prototype.is_private = function(){
  return this.privacy() === Vote.private;
};

Vote.prototype.update = function( other, options ){
  this.duration(    other.duration    = options.duration    );
  this.analyst(     other.analyst     = options.analyst     );
  this.source(      other.source      = options.source      );
  this.previously(  other.previously  = options.previously  );
  this.privacy(     other.privacy     = options.privacy     );
  // Don't delegate vote if a direct non neutral vote exists
  if( (options.delegation && options.delegations !== Vote.direct )
    && this.delegation() === Vote.direct
    && this.orientation() !== Vote.neutral
  ){
    de&&bug( "Not delegated, direct vote rules" );
    return this;
  }
  this.delegation(  other.delegation  = options.delegation || Vote.direct );
  this.orientation( other.orientation = options.orientation );
  return this;
};

Vote.prototype.expiration = function(){
// At expiration vote becomes private direct neutral for a while
  if( this.orientation && !this.is_neutral() ){
    de&&bug( "Pre-expiration for " + this );
    this.resurrect();
    this.renew();
    Vote.create({
      id_key: this.id,
      orientation: Vote.neutral,
      delegation:  Vote.direct,
      privacy:     Vote.private
    });
  }else{
    de&&bug( "Expiration for " + this );
    Vote.super.prototype.expiration.call( this );
  }
  return this;
};

Vote.prototype.is_neutral = function(){
  return this.orientation() === Vote.neutral;
};

Vote.prototype.add = function(){
  if( this.orientation() === Vote.neutral ){
    // Direct neutral vote enables delegated votes
    if( this.delegation() === Vote.direct ){
      this.delegate();
      if( this.delegation() !== Vote.direct ){
        return this;
      }
    }else{
      return this;
    }
  }
  var vote = this;
  // Votes of groups have no impacts on results
  if( vote.persona.is_group() )return this;
  de&&mand( this.proposition );
  de&&bug( "Add vote " + vote
    + " now " + vote.orientation()
    + " of " + vote.persona
    + " via " + vote.delegation()
    + " for proposition " + vote.proposition
  );
  // Keep persona alive
  if( vote.delegation() === Vote.direct ){
    vote.persona.touch();
  }
  vote.proposition.add_vote( vote );
  return this;
};

Vote.prototype.remove = function( was ){
  //debugger;
  de&&mand( !was.is_entity );
  this.previously( was.orientation );
  if( was.orientation === Vote.neutral )return this;
  var vote = this;
  // Votes of groups have no impacts on results
  if( vote.persona.is_group() )return this;
  de&&bug( "Remove vote " + vote
    + " previously " + was.orientation
    + " of " + vote.persona
    + " via " + was.delegation
    + " from proposition " + vote.proposition
  );
  //de&&bugger();
  vote.proposition.remove_vote( was );
return this;
};

Vote.prototype.delegate = function(){
// Direct neutral vote triggers delegations
  //de&&mand( this.orientation() === Vote.neutral );
  de&&mand( this.delegation()  === Vote.direct  );
  var delegations = this.find_applicable_delegations();
  if( !delegations.length )return this;
  // If multiple delegations apply, select the most recently touched active one
  // ToDo:
  var recent_delegation = null;
  delegations.forEach( function( delegation ){
    if( !recent_delegation
    || delegation.age_touched() < recent_delegation.age_touched()
    ){
      recent_delegation = delegation;
    }
  });
  return this.delegate_using( recent_delegation );
};

Vote.prototype.find_applicable_delegations = function(){
  return this.persona.find_applicable_delegations( this.proposition );
};

Vote.prototype.delegate_using = function( delegation ){
  var agent = delegation.agent;
  var agent_vote = agent.get_vote_on( this.proposition );
  if( !agent_vote )return this;
  var agent_orientation = agent_vote.orientation();
  if( agent_orientation === Vote.neutral )return this;
  de&&bug( "Delegated vote by " + agent
      + " on behalf of " + this.persona
      + " for proposition: " + this.proposition
      + ", orientation: " + agent_orientation
  );
  var vote = Vote.create({
    persona:     delegation.persona,
    delegation:  delegation,
    proposition: this.proposition,
    orientation: agent_orientation
  });
  delegation.track_vote( vote );
  return this;
};

Vote.prototype.set_comment = function( comment ){
  if( comment ){
    this.touch();
  }
  this.comment( comment );
  // Comments can occur after vote's value was logged, see Topic.log_vote()
  this.snapshot.comment_text = comment.text;;
  return this;
}


/*
 *  Result (of votes on a topic)
 */

Effect.type( Result );
function Result( options ){
  
  de&&mand( options.proposition );
  
  var result = this.register( "" + options.proposition.id );
  var water  = this.water( result );

  this.touch();
  this.proposition = options.proposition;
  this.label       = this.proposition.label;
  this.neutral     = water( options.neutral   || 0 ); // ToDo: remove this?
  this.blank       = water( options.blank     || 0 );
  this.protest     = water( options.protest   || 0 );
  this.agree       = water( options.agree     || 0 );
  this.disagree    = water( options.disagree  || 0 );
  this.direct      = water( options.direct    || 0 );
  this.secret      = water( options.secret    || 0 );
  this.private     = water( options.private   || 0 ),
  this.count       = water( 0 );

  // If this is an update, it simply supersedes the so far known result.
  // This is handy to import bulk results from an external system or to
  // compact the persistent log of changes.
  if( this.is_update() ){
    result.neutral(  this.neutral  );
    result.blank(    this.blank    );
    result.protest(  this.protest  );
    result.agree(    this.agree    );
    result.disagree( this.disagree );
    result.direct(   this.direct   );
    result.secret(   this.secret   );
    result.private(  this.private  );
    result.count(    this.count    );
    return result;
  }
  
  // Computed attributes, including orientation transition detection
  
  this.total = function(){
    this.count( this.count() + 1 );
    var old = this.total();
    var r = this.neutral()
    + this.blank()
    + this.protest()
    + this.agree()
    + this.disagree();
    de&&bug( "  Total for " + this, "is:", r, "was:", old,
      "direct:", this.direct()
    );
    return r;
  }.when( this.neutral, this.blank, this.protest, this.agree, this.disagree );
  this.total( 0 );
  de && ( this.total.label = "total" );
  
  this.against = function(){
    var old = this.against();
    var r = this.disagree() + this.protest();
    de&&bug( "  Against about " + this, "is:", r, "was:", old );
    return r;
  }.when( this.disagree, this.protest );
  this.against( 0 );
  de && ( this.against.label = "against" );
  
  this.win = function(){
    var old = this.win();
    var r = this.agree() > this.against();
    de&&bug( "  Win about " + this, "is:", r, "was:", old );
    return r;
  }.when( this.agree, this.against );
  this.win( false );
  de && ( this.win.label = "win" );
  
  this.orientation = function(){
    var old = this.orientation() || Vote.neutral;
    var now;
    //if( this.proposition.id === 10017 )de&&bugger();
    de&&bug( "  Computing orientation for " + this,
      "expired:", this.expired(),
      "agree:",   this.agree(),
      "against:", this.against(),
      "protest:", this.protest(),
      "blank:",   this.blank()
    );
    if( this.expired() ){
      now = Vote.neutral;
    }else if( this.agree() > this.against() ){
      // Won
      if( this.agree() > this.blank() ){
        // agree > blank, > against
        now = Vote.agree;
      }else{
        // blank > agree, > against
        now = Vote.blank;
      }
    }else{
      // Lost
      if( this.disagree() > this.neutral() ){
        if( this.disagree() > this.blank() ){
          if( this.disagree() > this.protest() ){
            now = Vote.disagree;
          }else{
            now = Vote.protest;
          }
        }else{
          if( this.blank() > this.protest() ){
            now = Vote.blank;
          }else{
            now = Vote.protest;
          }
        }
      }else{
        if( this.disagree() > this.blank() ){
          if( this.disagree() > this.protest() ){
            now = Vote.disagree;
          }else{
            now = Vote.protest;
          }
        }else{
          if( this.blank() > this.protest() ){
            now = Vote.blank;
          }else{
            now = this.protest() ? Vote.protest : Vote.neutral;
          }
        }
      }
    }
    de&&bug( "  Computed orientation " + this, "was:", old, "is:", now ); //, value( this, true ) );
    if( now !== old ){
      de&&bug( "  Change of orientation, create a transition" );
      //debugger;
      Transition.create({ result: this, orientation: now, previously: old });
      return now;
    }
    // Else don't produce a new value
    return _;
  }.when( this.agree, this.against, this.blank );

  this.orientation( Vote.neutral );
  de && ( this.orientation.label = "orientation" );

  return this;
}

Result.prototype.touch = function(){
  this.time_touched = vote.now();
}

Result.prototype.add_vote = function( vote ){
// Called by topic.add_vote()
  de&&mand( vote.proposition === this.proposition );
  // Neutral votes have no impacts at all
  if( vote.orientation() === Vote.neutral )return this;
  this[ vote.orientation() ]( this[ vote.orientation() ]() + 1 );
  if( vote.delegation() === Vote.direct ){
    this.direct( this.direct() + 1 );
  }
  return this;
};

Result.prototype.remove_vote = function( was ){
// Called by topic.remove_vote()
  de&&mand( was.proposition === this.proposition.id );
  // Nothing was done when neutral vote was added, nothing needed now either
  if( was.orientation === Vote.neutral )return this;
  var old_o = this[ was.orientation ]();
  de&&mand( old_o > 0 );
  this[ was.orientation ]( old_o - 1 );
  if( was.delegation === Vote.direct ){
    var old_d = this.direct();
    de&&mand( old_d > 0 );
    this.direct( old_d - 1 );
  }
  return this;
};


/*
 *  Transition event entity.
 *
 *  A transition is the event that occurs when the consolidated orientation
 *  changes on a topic.
 */
 
Event.type( Transition );
function Transition( options ){
  de&&mand( options.result );
  de&&mand( options.orientation );
  de&&mand( options.previously );
  this.result      = options.result;
  this.orientation = options.orientation;
  this.previously  = options.previously;
}


/*
 *  Delegation entity.
 *
 *  It describes how a persona's vote is delegated to another persona.
 *  A delegation involves a filter that detects the involved topics. That
 *  filter is a list of tags, with an "and" logic. A proposition tagged with
 *  all the tags in that list will pass the filter and be voted on by the
 *  designated agent persona.
 *  Because delegations are transitive, if an agent delegates to another
 *  agent that delegates to the first agent, directly or indirectly, then there
 *  is a "delegation loop". In such case, the delegation cannot be activated.
 *
 *  ToDo: consolidate all delegations to the same agent into a single
 *  delegation with multiple filters.
 *  ToDo: better, create votable delegation templates. Then persona can
 *  have a list of templates instead of a list of filters.
 *  The template should provide a default agent,
 */

Ephemeral.type( Delegation );
function Delegation( options ){
  
  de&&mand( options.persona || options.id_key );
  de&&mand( options.agent   || options.id_key );
  de&&mand( options.tags    || options.id_key );
  de&&mand( ( options.tags && options.tags.length > 0 ) || options.id_key );

  var key = options.id_key
  || ( "" + options.persona.id + "." + options.agent.id + "." + options.tags[0].label );
  this.identity( key );
  var delegation = this.register( key );
  var water      = this.water( delegation );

  var persona   = options.persona || delegation.persona;
  var agent     = options.agent   || delegation.agent;
  de&&mand( persona );
  de&&mand( agent   );

  // Delegation are transitive, there is a risk of loops
  if( !options.inactive
  && agent.delegates_to( persona, options.tags || delegation.tags )
  ){
    trace( "Loop detected for delegation " + pretty( options ) );
    // ToDo: should provide a "reason" to explain the deactivation
    options.inactive = true;
  }

  this.persona  = persona;
  this.agent    = agent;
  this.label    = agent.label;
  this.votes    = water( [] ); // Votes done because of the delegation
  this.privacy  = water( options.privacy );
  this.tags     = water( [] );
  this.inactive = water();

  if( this.is_update() ){
    delegation.privacy( this.privacy );
    // If change to list of tags
    if( options.tags && diff( options.tags, delegation.tags() ).changes ){
      this.inactive = options.inactive || delegation.inactive();
      // Deactivate delegated votes
      delegation.inactive( true );
      delegation.tags( options.tags );
      // Activate delegated votes
      // ToDo: is water.effect() needed?
      if( !this.inactive ){
        vote.water.effect( function(){ delegation.inactive( false ); } );
      }
      return delegation;
    }
    // If change to activation flag only
    delegation.inactive( this.inactive );
    return delegation;
  }

  this.previous_tags = null;
  this.was_inactive  = true;
  var w = water( _,  error_traced( update ), [ this.inactive, this.tags ] );
  w.delegation = this;

  // Fire initial update
  this.privacy( options.privacy || Vote.public );
  this.inactive( true );
  this.tags( options.tags );
  water.effect( function(){
    delegation.inactive( !!options.inactive );
  });
  this.persona.add_delegation( this );
  return this;

  function update(){
    //debugger;
    var delegation  = water.current.delegation;
    var delta       = diff( delegation.previous_tags, delegation.tags() );
    var inactive    = delegation.inactive();
    var need_update = false;
    // If change in activation
    if( inactive !== delegation.was_inactive ){
      need_update = true;
      delegation.was_inactive = inactive;
      // Delegation became active
      if( !inactive ){
        trace( "Activate delegation" );
        // Refuse to activate a delegation that loops
        if( delegation.agent.delegates_to( delegation.persona, delta.now ) ){
          trace( "Looping delegation is deactivated ", pretty( delegation ) );
          // ToDo: provide some explanation about why activation was refused
          delegation.inactive( true );
        }
        // Delegation becomes inactive
      }else{
        de&&bug( "ToDo: deactivate a delegation" );
      }
    }
    // If changes in tags
    if( delta.changes ){
      // Before such changes, delegation was deactivated
      de&&mand( inactive );
      need_update = true;
      delegation.previous_tags = delta.now;
      var added    = delta.added;
      var removed  = delta.removed;
      var kept     = delta.kept;
      // If totally different sets
      if( !kept.length ){
        removed.forEach( function( tag ){
          de&&bug( "ToDo: handle removed tag " + tag + " for fresh delegation " + delegation );

        });
        added.forEach( function( tag ){
          de&&bug( "Add tag " + tag + " for fresh delegation " + delegation );
          tag.add_delegation( delegation, true );
          // true => don't add tag back to delegation, it's being done here
        });
      // If sets with some commonality
      }else{
        removed.forEach( function( tag ){
          de&&bug( "ToDo: handle removed tag " + tag + " for delegation " + delegation );

        });
        added.forEach( function( tag ){
          de&&bug( "ToDo: handle added tag " + tag + " for delegation " + delegation );

        });
      }
    }
    // Update existing votes and make new delegated votes
    if( need_update ){
      delegation.update_votes();
    }
  }
}

Delegation.prototype.is_active = function(){
  return !this.inactive();
};

Delegation.prototype.is_inactive = function(){
  return !this.is_active();
};

Delegation.prototype.is_public = function(){
  return this.privacy() === Vote.public;
};

Delegation.prototype.is_secret = function(){
  return this.privacy() === Vote.secret;
};

Delegation.prototype.is_private = function(){
  return this.privacy() === Vote.private;
};

Delegation.prototype.filter_string = function(){
  var buf = [];
  this.tags().forEach( function( tag ){
    buf.push( tag.label );
  });
  return buf.join( " " );
};

Delegation.prototype.heat = function(){
// Compute the "heat" of a delegation. "Hot delegations" should come first.
  var touched = this.time_touched;
  // Recently touched are hot
  var age = vote.now() - touched;
  if( age < vote.ONE_MINUTE )return touched;
  if( age < vote.ONE_HOUR   )return touched;
  // Less recently touched delegations are hot depending on number of votes
  return this.votes().length;
};

Delegation.prototype.is_tagged = function( tags ){
// Returns true if a delegation includes all the specified tags
// Note: #something always includes itself, ie proposition xxx is #xxx tagged
  if( typeof tags === "string" ){
    return string_tags_includes( this.tags_string(), tags );
  }
  return tags_includes( this.tags() || [], tags, this.agent.label.substring( 1 ) );
};

Delegation.prototype.tags_string = function(){
  var tags_str = [ "#" + this.agent.label.substring( 1 ) ];
  var tags = this.tags() || [];
  tags
  .sort( function( a, b ){
    return a.heat() - b.heat()
  })
  .forEach( function( tag ){
    tags_str.push( tag.label );
  });
  return tags_str.join( " " ); // + this.computed_tags();
};

Delegation.prototype.update_votes = function(){
  var delegation = this;
  var tags     = delegation.tags();
  var inactive = delegation.inactive();
  var votes = delegation.votes() || [];
  votes.forEach( function( vote ){
    // Check that vote is still delegated as it was when last updated
    if( vote.delegation() !== delegation )return;
    // Does the delegation still include the voted proposition?
    var included = delegation.includes_proposition( vote.proposition );
    // If tags changed (now excludes the proposition) or agent's mind change
    var new_orientation = !inactive && included
      ? delegation.agent.get_orientation_on( vote.proposition )
      : Vote.neutral;
    if( new_orientation && new_orientation !== vote.orientation() ){
      // If vote becomes neutral, maybe another delegation thinks otherwise?
      if( false && new_orientation === Vote.neutral && !included ){
        vote.delegate();
        // If no other agent, true neutral
        if( vote.delegation() === delegation ){
          Vote.create({
            persona: vote.persona,
            delegation: Vote.direct,
            proposition: vote.proposition,
            orientation: Vote.neutral
          });
        }
      }else{
        Vote.create({
          persona: vote.persona,
          delegation: Vote.direct,
          proposition: vote.proposition,
          orientation: new_orientation
        });
      }
    }
  });
  // Discover new delegated votes for tagged propositions
  delegation.vote_on_tags( tags, inactive );
  return this;
};

Delegation.prototype.vote_on_tags = function( tags, inactive ){
  var delegation = this;
  if( inactive )return this;
  var candidate_propositions;
  // Sort tags by increasing number of topics, it speeds up the 'and' logic
  var sorted_tags = tags.slice();
  sorted_tags.sort( function( a, b ){
    return a.propositions().length - b.propositions().length; }
  );
  sorted_tags.forEach( function( tag ){
    // Start with a set of topics, the smaller one
    if( !candidate_propositions ){
      candidate_propositions = tag.propositions().slice();
      // Keep topics that are also tagged with the other tags
    }else{
      var propositions = tag.propositions();
      candidate_propositions.forEach( function( proposition, idx ){
        // If a proposition is not tagged, flag it for removal
        if( propositions.indexOf( proposition ) === -1 ){
          candidate_propositions[ idx ] = null;
        }
      });
    }
  });
  // Collect kept propositions, they match the tags
  if( candidate_propositions ){
    var all_tagged_propositions = [];
    candidate_propositions.forEach( function( proposition ){
      if( proposition ){ all_tagged_propositions.push( proposition ); }
    });
    // Vote on these propositions, based on agent's orientation
    all_tagged_propositions.forEach( function( proposition ){
      var orientation = delegation.agent.get_orientation_on( proposition );
      if( orientation ){
        // Create a vote
        de&&bug( "New delegation implies vote of " + delegation.persona
            + " thru agent " + delegation.agent
            + ", orientation: " + orientation
        );
        Vote.create( {
          persona:     delegation.persona,
          delegation:  delegation,
          proposition: proposition,
          orientation: orientation
        });
      }
    });
  }
  return this;
};

Delegation.prototype.add_tag = function( tag, loop ){
  var tags = this.tags() || [];
  if( tags.indexOf( tag ) !== -1 )return this;
  var now = tags.slice();
  now.push( tag );
  this.tags( now );
  if( !loop ){
    tag.add_delegation( this, true );
  }
  return this;
};


Delegation.prototype.track_vote = function( vote ){
// Called when a persona vote is created due to the agent voting
  var votes = this.votes();
  if( votes.indexOf( vote ) !== -1 )return this;
  // Note: no clone for the array, not needed
  votes.push( vote );
  this.votes( votes );
  return this;
};


// At expiration, the delegation becomes inactive for a while
Delegation.prototype.expiration = function(){
  if( this.inactive && !this.inactive() ){
    this.resurrect();
    this.renew();
    this.inactive( true );
    this.push();
  }else{
    Delegation.super.prototype.expiration.call( this );
  }
  return this;
};

Delegation.prototype.includes_tags = function( tags ){
  return tags_includes( tags, this.tags() );
};

Delegation.prototype.includes_proposition = function( proposition ){
  return this.includes_tags( proposition.tags() );
};

Delegation.prototype.delegates_to = function( agent, tags, seen ){
  if( !seen ){ seen = {}; }
  if( seen[ this.agent.id ] ){
    trace( "Loop detected when looking for agent " + agent
    + " in delegation " + this + " of " + this.persona );
    return false;
  }
  seen[ this.id ] = true;
  if( this.includes_tags( tags ) ){
    if( this.agent === agent
    || this.agent.delegates_to( agent, tags, seen )
    ){
      return false;
    }
  }
  return true;
};


/*
 *  Membership entity.
 *
 *  They make personas members of group personas.
 */

Ephemeral.type( Membership );
function Membership( options ){
  
  de&&mand( options.member ); // a persona
  de&&mand( options.group  ); // a group persona typically
  de&&mand( options.group.is_group() );

  var key = "" + options.member.id + "." + options.group.id;
  this.identity( "&m." + key );
  var membership = this.register( key );

  if( this.is_create() ){
    this.member   = options.member;
    this.group    = options.group;
    this.member.add_membership( this );
    this.inactive = water();
    this.inactive.membership = this;
    this.inactive( _, update, [ !!options.inactive ] );
  }else{
    membership.inactive( !!options.inactive )
  }
  return membership;

  // ToDo: handle change in membership activation
  function update( is_inactive ){
    var old = water.current.current;
    if( old === is_inactive )return _;
    // Change
    if( !is_inactive ){
      // Activate
      de&&bug( "Activate membership" );
      water.current.membership.group.add_member( membership.member );
    }else{
      // Deactivate
      de&&bug( "Deactivate membership" );
      water.current.membership.group.remove_member( membership.member );
    }
    return is_inactive;
  }
  
}


Membership.prototype.expiration = function(){
// Handle expiration, first deactivate membership and then remove it
  if( this.inactive && !this.inactive() ){
    this.resurrect();
    this.renew();
    this.inactive( true );
  }else{
    Membership.super.prototype.expiration.call( this );
    this.member.remove_membership( this );
  }
  return this;
};

// Exports
// export = vote;


/* ========================================================================= *\
 * ======================== Vote front end processor ======================= *
\* ========================================================================= */


/*
 *  For UI
 */
 
Ephemeral.type( Visitor );
function Visitor( options ){
  this.persona     = options.persona;
  this.twitter     = options.twitter; // Twitter credentials
  this.actions     = Ephemeral.fluid();
}


/*
 *  Action entity.
 *  This is what a Visitor does. She needs an UI for that purpose.
 */

Ephemeral.type( Action );
function Action( options ){
  this.visitor     = options.visitor;
  this.verb        = options.verb;
  this.parameters  = options.parameters;
}


var replized_verbs = {};
var replized_verbs_help = {};

function bootstrap(){
// This function returns a list of functions that when called can use
// Ephemeral.inject() to inject changes into the machine. The next function
// in the list is called once all effects of the previous function are fully
// done.
// The bootstrap() function is used in the main() function using Ephemeral.
// start(). That latter function will call bootstrap() only when there is
// no log file of persisted changes.

  var debugging = true;

  function def( f, help ){
    replized_verbs[ f.name ] = f;
    replized_verbs_help[ f.name ] = help;
  }

  function c( t, p ){
    trace( "INJECT " + t.name + " " + pretty( p ) );
    return Ephemeral.ref( Ephemeral.inject( t.name, p ).id );
  }
  def( c, "type +opt1:v1 +opt2:v2 ... -- inject a Change" );

  function p( n ){
    return p[n] = c( Persona, { label: n } );
  }
  def( p, "@name -- create a person" );

  function g( n ){
    return p[n] = c( Persona, { label: n, role: "group" } );
  }
  def( g,"@name -- create a group" );

  function t( n, l ){
  // Create a proposition topic, tagged
    if( !Array.isArray( l ) ){
      l = [ l ];
    }
    return t[n] = c( Topic, { label: n, source: "bootstrap", tags: l } );
  }
  def( t, "name +#tag1 +#tag2 ... -- create proposition topic, tagged" );

  function tag( n ){
    return t[n] = c( Topic, { label: n } );
  }
  def( tag, "#name -- create a tag topic" );

  function tagging( p, d, t ){
    if( !Array.isArray( d ) ){
      d = [ d ];
    }
    if( !Array.isArray( t ) ){
      t = [ t ];
    }
    return c( Tagging, { proposition: p, detags: d, tags: t } );
  }
  def( tagging, "&proposition +#detag1 ... , +#tag1 ... -- create a tagging" );


  function v( p, t, o ){
  // Create/Update a vote
    de&&mand( p ); de&&mand( t );
    return v[ v.n++ ]
    = c( Vote, { persona: p, proposition: t, orientation: o } );
  }
  v.n = 0;
  def( v, "&persona &proposition orientation -- create/update a vote" );

  function d( p, t, a, i ){
    if( !Array.isArray( t ) ){
      t = [ t ];
    }
    return d[ d.n++ ] = c( Delegation,
      { persona: p, tags: t, agent: a } );
  }
  d.n = 0;
  def( d, "&persona +#tag1 ... &agent -- create/update a delegation" );

  function r( t, a, d, p, b, n, dir ){
  // Update a result
    return c( Result, { proposition: t,
      agree: a, disagree: d, protest: p, blank: b, neutral: n, direct: dir
    } );
  }

  function m( p, g, i ){
  // Create/Update a membership
    return c( Membership, { member: p, group: g, inactive: i } );
  }
  def( m, "&member &group +inactive:? -- create/update a membership" );

  for( var verb in replized_verbs ){
    http_repl_commands[ verb ] = replized_verbs[ verb ];
  }

  var entity;
  function e( type, key ){
  // Retrieve an entity by key. Usage: e( type, entity or type, key, ... )
  //   ex: e( Persona, "@jhr" )
  //   ex: e( Vote, Persona, "@jhr", Topic, "Hulot president" );
  //   ex: e( Vote, e( Persona, "@jhr"), Topic, "Hulot president" );
  //   ex: e( Vote, Persona, @jhr, e( Topic, "Hulot president" ) );
    if( arguments.length === 1 && type && type.is_entity )return entity = type;
    if( arguments.length === 2 )return entity = type.find( key );
    var id = "";
    var ii = 1;
    while( ii < arguments.length ){
      if( arguments[ ii ].is_entity ){
        id += "." + arguments[ ii ].id;
        ii += 1;
      }else{
        id += "." + arguments[ ii ].find( arguments[ ii + 1 ] ).id;
        ii += 2;
      }
    }
    return entity = type.find( id.substring( 1 ) );
  }

  // This bootstrap is also the test suite...., a() is assert()
  var test_description = "none";
  function a( prop, msg ){
    if( prop )return;
    trace( "DESCRIPTION: " + test_description );
    trace( "Test, error on entity " + pretty( entity, 2 ) );
    console.trace();
    !( de && debugging ) && assert( false, msg );
    de&&bugger;
  }

  var test_count = 0;
  var test_list  = [];
  function describe( text ){
    return function(){
      test_count++;
      test_description = text;
      test_list.push( text );
    }
  }

  function summary(){
    trace( "TEST SUMMARY\n" + test_list.join( "\n" ) );
    trace( "TESTS, " + test_count + " successes"                )
  }

  // Test entities
  var /* individuals */ kudocracy, jhr, hulot, peter;
  var /* groups */ g_hulot;
  var /* tags */ t_president, t_kudocracy;
  var /* propositions */ p_kudocracy, p_hulot;
  var /* votes */ v_jhr, v_peter, v_hulot;
  var /* Results */ r_hulot;

  trace( "Bootstrap - vote.js test suite" );
  return [

    //                          *** Personas ***

    describe( "Personas creation " ),
    function(){ p( "@kudocracy"                                             )},
    function(){ kudocracy = e( Persona, "@kudocracy"                        )},
    function(){ a( kudocracy, "persona @kudocracy exists"                   )},
    function(){ p( "@jhr"                                                   )},
    function(){ jhr = e( Persona, "@jhr"                                    )},
    function(){ p( "@john"                                                  )},
    function(){ p( "@luke"                                                  )},
    function(){ p( "@marc"                                                  )},
    function(){ p( "@peter"                                                 )},
    function(){ peter = e( Persona, "@peter"                                )},
    function(){ p( "@n_hulot"                                               )},
    function(){ hulot = e( Persona, "@n_hulot"                              )},

    //                          *** Groups ***

    describe( "Groups creation" ),
    function(){ g( "Hulot_friends"                                          )},
    function(){ g_hulot = e( Persona, "Hulot_friends"                       )},
    function(){ a( g_hulot.is_group() && !g_hulot.is_individual()           )},

    //                        *** Membership ***

    describe( "Membership creation" ),
    function(){ m( jhr, g_hulot                                             )},
    function(){ a(  jhr.is_member_of( g_hulot)                              )},
    function(){ a(  g_hulot.has_member( jhr )                               )},
    function(){ m( jhr, g_hulot, true /* inactive */                        )},
    function(){ a( !jhr.is_member_of( g_hulot )                             )},
    function(){ a( !g_hulot.has_member( jhr )                               )},
    function(){ m( jhr, g_hulot                                             )},
    function(){ a(  jhr.is_member_of( g_hulot)                              )},
    function(){ a(  g_hulot.has_member( jhr )                               )},

    //                          *** Tags ***

    describe( "Tags creation" ),
    function(){ tag( "#kudocracy"                                           )},
    function(){ t_kudocracy = e( Topic, "#kudocracy"                        )},
    function(){ tag( "#president"                                           )},
    function(){ t_president = e( Topic, "#president"                        )},
    function(){ a(  t_president, "Topic #president exists"                  )},
    function(){ a(  t_president.is_tag()                                    )},
    function(){ a( !t_president.is_proposition()                            )},


    //                     *** Propositions ***

    describe( "Propositions creation" ),
    function(){ t( "kudocracy", []                                          )},
    function(){ p_kudocracy = e( Topic, "kudocracy"                         )},
    function(){ t( "hollande_president",  [ t_president ]                   )},
    function(){ a( e( Topic, "hollande_president").is_proposition()         )},
    function(){ t( "hulot_president",     [ t_president ]                   )},
    function(){ p_hulot = e( Topic, "hulot_president"                       )},
    function(){ a( p_hulot.is_proposition()                                 )},
    function(){ a( r_hulot = p_hulot.result                                 )},

    //                     *** Delegations ***

    function(){ d( jhr, [ t_president ], hulot                              )},

    //                        *** Votes ***

    describe( "@kudocray wants kudocracy" ),
    describe( "Peter first disagrees, about the 'Hulot president' prop" ),
    function(){ v( peter, p_hulot, "disagree"                               )},
    function(){ v_peter = e( Vote, peter, p_hulot                           )},
    function(){ a( r_hulot.orientation() === "disagree"                     )},
    function(){ a( !r_hulot.win()                                           )},
    function(){ a( r_hulot.disagree() === 1                                 )},
    function(){ a( r_hulot.against()  === 1                                 )},
    function(){ a( r_hulot.total()    === 1                                 )},
    function(){ a( r_hulot.direct()   === 1                                 )},

    describe( "Then Peter agrees" ),
    function(){ v( peter, p_hulot, "agree"                                  )},
    function(){ a( r_hulot.orientation() === "agree"                        )},
    function(){ a( r_hulot.win()                                            )},
    function(){ a( r_hulot.agree()    === 1                                 )},
    function(){ a( r_hulot.against()  === 0                                 )},
    function(){ a( r_hulot.total()    === 1                                 )},
    function(){ a( r_hulot.direct()   === 1                                 )},

    describe( "Then Peter votes blank" ),
    function(){ v( peter, p_hulot, "blank"                                  )},
    function(){ a( r_hulot.orientation() === "blank"                        )},
    function(){ a( !r_hulot.win()                                           )},
    function(){ a( r_hulot.agree()    === 0                                 )},
    function(){ a( r_hulot.against()  === 0                                 )},
    function(){ a( r_hulot.blank()    === 1                                 )},
    function(){ a( r_hulot.total()    === 1                                 )},
    function(){ a( r_hulot.direct()   === 1                                 )},

    describe( "Then Peter protests" ),
    function(){ v( peter, p_hulot, "protest"                                )},
    function(){ a( r_hulot.orientation() === "protest"                      )},
    function(){ a( !r_hulot.win()                                           )},
    function(){ a( r_hulot.agree()    === 0                                 )},
    function(){ a( r_hulot.against()  === 1                                 )},
    function(){ a( r_hulot.blank()    === 0                                 )},
    function(){ a( r_hulot.protest()  === 1                                 )},
    function(){ a( r_hulot.total()    === 1                                 )},
    function(){ a( r_hulot.direct()   === 1                                 )},

    describe( "Then Peters gets to neutral, equivalent to 'not voting'" ),
    function(){ v( peter, p_hulot, "neutral"                                )},
    function(){ a( r_hulot.orientation() === "neutral"                      )},
    function(){ a( !r_hulot.win()                                           )},
    function(){ a( r_hulot.agree()    === 0                                 )},
    function(){ a( r_hulot.against()  === 0                                 )},
    function(){ a( r_hulot.blank()    === 0                                 )},
    function(){ a( r_hulot.protest()  === 0                                 )},
    function(){ a( r_hulot.total()    === 0                                 )},
    function(){ a( r_hulot.direct()   === 0                                 )},

    describe( "Hulot votes, jhr too because of a delegation" ),
    function(){ v( hulot, p_hulot, "agree"                                  )},
    function(){ a( r_hulot.orientation() === "agree"                        )},
    function(){ a( r_hulot.win()                                            )},
    function(){ a( r_hulot.agree()    === 2                                 )},
    function(){ a( r_hulot.against()  === 0                                 )},
    function(){ a( r_hulot.total()    === 2                                 )},
    function(){ a( r_hulot.direct()   === 1                                 )},

    describe( "Then Hulot gets to neutral" ),
    function(){ v( hulot, p_hulot, "neutral"                                )},
    function(){ a( r_hulot.orientation() === "neutral"                      )},
    function(){ a( !r_hulot.win()                                           )},
    function(){ a( r_hulot.agree()    === 0                                 )},
    function(){ a( r_hulot.against()  === 0                                 )},
    function(){ a( r_hulot.blank()    === 0                                 )},
    function(){ a( r_hulot.protest()  === 0                                 )},
    function(){ a( r_hulot.total()    === 0                                 )},
    function(){ a( r_hulot.direct()   === 0                                 )},

    describe( "Hulot votes but jhr decides to vote directly" ),
    function(){ v( hulot, p_hulot, "agree"                                  )},
    function(){ a(  r_hulot.win()                                           )},
    function(){ a( r_hulot.total()    === 2                                 )},
    function(){ a( r_hulot.direct()   === 1                                 )},
    function(){ v( jhr, p_hulot, "disagree"                                 )},
    function(){ a( !r_hulot.win()                                           )},
    function(){ a( r_hulot.total()    === 2                                 )},
    function(){ a( r_hulot.direct()   === 2                                 )},

    describe( "Hulot votes but jhr decided to vote directly, respect" ),
    function(){ v( hulot, p_hulot, "blank"                                  )},
    function(){ a( r_hulot.total()    === 2                                 )},
    function(){ a( r_hulot.blank()    === 1                                 )},
    function(){ a( r_hulot.direct()   === 2                                 )},

    describe( "jhr erases his vote and so relies again on his delegation"),
    function(){ v( jhr, p_hulot, "neutral"                                  )},
    function(){ a( r_hulot.total()    === 2                                 )},
    function(){ a( r_hulot.blank()    === 2                                 )},
    function(){ a( r_hulot.direct()   === 1                                 )},

    describe( "Detag p_hulot, so that jhr's delegation does not apply" ),
    function(){ tagging( p_hulot, [ "#president" ], []                      )},
    function(){ a( r_hulot.total()    === 1                                 )},
    function(){ a( r_hulot.blank()    === 1                                 )},
    function(){ a( r_hulot.direct()   === 1                                 )},

    describe( "Restore that tag, jhr delegation applies" ),
    function(){ tagging( p_hulot, [], [ "#president" ]                      )},
    function(){ a( r_hulot.total()    === 2                                 )},
    function(){ a( r_hulot.blank()    === 2                                 )},
    function(){ a( r_hulot.direct()   === 1                                 )},

    describe( "Hulot votes, agree count includes jhr's delegated vote" ),
    function(){ v( hulot, p_hulot, "agree"                                  )},
    function(){ a( r_hulot.total()    === 2                                 )},
    function(){ a( r_hulot.blank()    === 0                                 )},
    function(){ a( r_hulot.agree()    === 2                                 )},
    function(){ a( r_hulot.direct()   === 1                                 )},

    function(){ trace( "**************************************************" )},
    function(){ v( peter, p_hulot, "neutral"                                )},
    function(){ v( hulot, p_hulot, "disagree"                               )},
    function(){ v( peter, p_hulot, "agree"                                  )},
    //function(){ r( p_hulot, 102, 101, 1, 12, 1000, 99                       )},
    function(){ summary(                                                    )},

  function(){} ];
}


/* ---------------------------------------------------------------------------
 *  Dataflow processing. TBD
 *  Each fluid is fed whenever an entity is created or updated.
 *  The only valid action is to inject a change in the machine:
 *    vote.ephemeral.push( type, {...named parameters...} );
 *  That change gets logged in a persistent store and will be replayed whenever
 *  the machine is restarted.
 */

if( de ){
  vote.Persona    .fluid.pretty().log( "-->Log Persona"    );
  vote.Membership .fluid.pretty().log( "-->Log Membership" );
  vote.Source     .fluid.pretty().log( "-->Log Source"     );
  vote.Topic      .fluid.pretty().log( "-->Log Topic"      );
  vote.Delegation .fluid.pretty().log( "-->Log Delegation" );
  vote.Vote       .fluid.pretty().log( "-->Log Vote"       );
  vote.Result     .fluid.pretty().log( "-->Log Result"     );
  vote.Transition .fluid.pretty().log( "-->Log Transition" );
  vote.Visitor    .fluid.pretty().log( "-->Log Visitor"    );
  vote.Action     .fluid.pretty().log( "-->Log Action"     );
}
//Ephemeral.persist( "test/vote.trace.log", Trace.fluid );

/*
 *  Minimal HTTP session management
 *    Session is associated to source ip address.
 *    ToDo: use a cookie
 */


function Session( ip ){
// Constructor, called by .login() only (except for default local session)
  // Return existing obj with same ip
  var session = Session.all[ ip ];
  if( session )return session;
  // Or init a new object
  this.ip            = ip;
  this.visitor       = null;
  this.filter        = "";
  this.filter_tags   = [];
  this.current_page  = [];
  this.previous_page = [];
  this.proposition   = null;
  Session.all[ ip ]  = this;
  return this;
}

Session.all = {};

// Defaults to local session
Session.current = new Session( "127.0.0.1" );

Session.prototype.login = function( ip ){
  if( ip !== Session.current.ip ){
    Session.current = new Session( ip );
    return Session.current;
  }else{
    return this;
  }
}

Session.prototype.is_local = function(){
  return this.ip === "127.0.0.1";
}

Session.prototype.has_filter = function(){
  return !!this.filter.length;
}

Session.prototype.filter_tags_label = function(){
// Return , separated list of tags extracted from filter
  return this.filter.replace( / /g, "," ).replace( /#/g, "" )
}

Session.prototype.set_filter = function( text ){
  if( typeof text !== "string" )return;
  if( text ){
    var tags = [];
    var tag_entity;
    // Sanitize
    this.filter = text.replace( /[^A-Za-z0-9_ ]/g, "" );
    if( this.filter === "all" ){
      this.filter = "";
    }else if( this.filter.length ){
      var buf = [];
      this.filter.split( " " ).forEach( function( tag ){
        if( tag.length >= 2 || Topic.reserved( tag ) ){
          buf.push( '#' + tag );
          tag_entity = Topic.find( '#' + tag );
          if( tag_entity ){
            tags.push( tag_entity );
          }
        }
      });
      this.filter = buf.join( " " );
      this.filter_tags = tags;
    }
  }
  if( !this.filter ){
    this.fitler_tags = [];
  }
  return this.filter;
}


/*
 *  scrollcue, embedded, see git/virteal/simpli
 */

// scrollcue.js
//
// JQuery plugin effect to make the screen easier to read when it is scrolled.
// It provides a visual clue that delimits the newly visible content.
//
// 09/29/2010, JeanHuguesRobert, based on previous work
// 10/09/2010, JHR, renamed from hotscroll to scrollcue
// 10/15/2010, JHR, with Jean Vincent, zIndex & image
//
// ToDo: it would be nice to be able to attach the effect to any element,
// not just the global window.
//
// License : VanityLicence
// (C) Copyright Virteal Jean Hugues Robert.
// ----
// http://virteal.com/VanityLicense
// Vanity License: You may take the money but I keep the glory.
// ----


// New scope, it encloses everything
function scrollcue( $ ){

// Global options, default values
var ScrollCue = {

  // Color of the effect, that's rgba()'s first 3 parameters, last is computed
  color: "255, 165, 0",	// Sorry, #AABBCC is not ok. Orange is my color

  // Maximal opacity of the effect. Effect fades away from this maximum to 0.
  opacity: 0.1, // Max is 1, for 100% opacity, very intruising

  // Duration of the effect, millisec
  duration: 1500,

  // Optional selector for elements to fade away when scrolling starts
  fade: null,	// I simply call .fadeTo( 0, 0) on these elements

  // max height of the visual cue. if none, goes up to top or down to bottom
  maxHeight: "3px",	// "px" preferred (see ToDo)

  // optional image, can be null
  image: "http://virteal.com/yanug16.png",

  // optional zIndex (if you want the effect to not obscure some content)
  zIndex: null,

  // Version, read only
  version: "0.3"

}

// Global variables
var Visible     = false	// True until scrollTop stops moving
var StillTop    = 0	// Value of scrollTop when it started moving
var ScrollDelta = 0	// Current scrollTop delta with StillTop
var Generation  = 0	// Increases whenever effect starts or stops
var ClueDiv     = null	// Effect is a semi transparent horizontal div


// My debug darling, see http://virteal.com/DebugDarling
var de = true	// Please use true to display debug traces
var bug = (console && console.log
  && function bug( m ){ console.log( "ScrollCue: " + m)})
|| (de = false)


function scroll(){
// This is the handler attached to the global window's scroll event

  // Init stuff first time we're called
  if( !ClueDiv ){
    // I create a rectangular div whose height may vary
    ClueDiv = document.createElement( "div")
    ClueDiv.style.position = "fixed";
    ClueDiv.style.left     = "0px"
    ClueDiv.style.width    = "100%"
    if( ScrollCue.zIndex ){
      ClueDiv.style.zIndex   = "-1"
    }
    if( ScrollCue.image ){
      ClueDiv.innerHTML = '<img src="' + ScrollCue.image + '"'
      + ' border="0" vspace="0" hspace="0">'
    }
    // Height is either up to top or down to bottom, unless there is a limit
    if( ScrollCue.maxHeight ){
      ClueDiv.style.maxHeight = ScrollCue.maxHeight
    }
    // During the effect the div is a semi transparent layer over content
    ClueDiv.style.display = "none"
    document.body.appendChild( ClueDiv)
  }

  // Where did the document scrolled to?
  var new_top = document.documentElement.scrollTop || document.body.scrollTop

  // What difference does it make with when document was still
  var new_delta = new_top - StillTop

  de&&bug( "still top: " + StillTop
    + ", new top: "      + new_top
    + ", old delta: "    + ScrollDelta
    + ", new delta: "    + new_delta
    + ", visible: "      + (Visible ? "true" : "false")
  )

  // If top was moving & there is a change in direction, abort previous effect
  if( Visible
  && ( (new_delta > 0 && ScrollDelta < 0)
    || (new_delta < 0 && ScrollDelta > 0))
  ){
    ScrollCue.abort()
    new_delta = ScrollDelta + new_delta
    de&&bug( "Scroll direction changed")
  }

  ScrollDelta = new_delta
  de&&bug( "top: " + new_top + ", ScrollDelta: " + ScrollDelta)

  // If motion starting...
  if( !Visible ){
    // Fade away things that don't need to be seen during scrolling
    if( ScrollCue.fade ){
      $(ScrollCue.fade).fadeTo( 0, 0)
    }
    // ToDo: should I "unfade" when effect is done?
  }

  // start/restart the effect (old generation effect will abort itself)
  effect_loop( (new Date().getTime()), ++Generation)

  function effect_loop( time_started, effect_generation ){

    // If a new effect was started, abort this one
    if( Generation != effect_generation )return

    // Adjust opacity as time passes, ends up transparent
    var new_time = (new Date()).getTime()
    var duration = new_time - time_started
    var opacity  = (ScrollCue.duration - duration) / 500

    // Are we done with the effect? is the document still again?
    // de&&bug( "opacity: " + opacity)
    if( opacity <= 0 ){
      ScrollCue.abort()
      // Set a new new start position for future effect
      StillTop = new_top
      de&&bug( "Still again, top: " + StillTop)
      return
    }

    // I display a semi opaque layer over some of the content
    if( ScrollDelta < 0 ){
      // Some new content appeared on the top of the screen
      if( ScrollCue.maxHeight ){
	// ToDo: should always substract the px height of maxHeight from top
	// but I don't know how to convert maxHeight into px units
	if( ScrollCue.maxHeight.substr( ScrollCue.maxHeight.length - 2)
	== "px"
	){
	 // Easy, px units, I adjust top
	  ClueDiv.style.top = ""
	  + ( -ScrollDelta
	    - parseInt( ScrollCue.maxHeight.replace( "px", ""), 10))
	  + "px"
	}else{
	  // Not easy. I don't ajust top as I should...
          ClueDiv.style.top = "" + -ScrollDelta + "px"
	}
	ClueDiv.style.height = "" + -ScrollDelta + "px"
      // If no maxHeight, I display up to top of screen
      }else{
        ClueDiv.style.top = "0px"
        ClueDiv.style.height = "" + -ScrollDelta + "px"
      }
    }else{
      // Some new content appeared at the bottom of the screen
      var scr_h = window.innerHeight ? window.innerHeight : $(window).height()
      ClueDiv.style.top = "" + (scr_h - ScrollDelta) + "px"
      // I display down to bottom, unless Div's maxHeigth told otherwise
      ClueDiv.style.height = "" + ScrollDelta + "px"
    }

    ClueDiv.style.backgroundColor
    = "rgba(" + ScrollCue.color + "," + (ScrollCue.opacity * opacity) + ")"

    // Display layer if it was not visible already
    if( !Visible ){
      ClueDiv.style.display = ""
      Visible = true
      de&&bug( "visible")
    }

    // Keep the effect running, next step in 50 ms
    setTimeout( effect_loop, 50, time_started, effect_generation)
  }
}


ScrollCue.abort = function(){
// Abort the current ongoing effect.
// Note: this does not stop future effects on new scroll events
// ToDo: method to detach effect
  if( Visible ){
    // Hide semi transparent layer
    ClueDiv.style.display = "none"
    Visible = false
    de&&bug( "hidden")
  }
  // Tell ongoing effect() to stop asap
  ++Generation
  return ScrollCue
}


ScrollCue.start = function( options ){
// Attach the effect to the global window
  if( options ){ $.extend( ScrollCue, options) }
  ScrollCue.abort()
  // On the global window only
  $(window).scroll( scroll)
  return ScrollCue
}

// Exports scrollCue() jQuery method
$.scrollCue = ScrollCue.start

// End of scope
}

// Usage:
//$.scrollCue( {fade:".fade"})

/*
 *  The http REPL (Read, Eval, Print, Loop) is a very simple UI
 *  to test interactively the Vote engine.
 *
 *  The BASIC style verbs were first introduced in test/input.coffee
 */

require( "l8/lib/queue" );
var http        = require( "http" );
var url         = require( "url" );
var querystring = require( "querystring" );

// IO tools. BASIC style

var screen    = [];

var cls = function(){
  screen = [];
  set_head( "" );
  set_body( "" );
};

var print     = function( msg ){
  ("" + msg).split( "\n" ).forEach( function( m ){ if( m ){ screen.push( m ); } } );
};

var printnl   = function( msg ){ print( msg ); print( "\n" ); };

var http_repl_head = "";
var set_head = function( x ){
  http_repl_head = x;
};

var http_repl_body = "";
var set_body = function( x ){
  http_repl_body = x;
};

var PendingResponse = null;
var respond = function( question ){
  if( !PendingResponse )return;
  if( PendingResponse.redirect ){
    PendingResponse.writeHead( 302, { Location: PendingResponse.redirect } );
    PendingResponse.end();
    PendingResponse = null;
    return;
  }
  PendingResponse.writeHead( 200, { 'Content-Type': 'text/html' } );
  var options = [];
  http_repl_history.forEach( function( item ){
    options.push( '<option value="' + item + '">' );
  });
  var head = http_repl_head;
  var body = http_repl_body;
  http_repl_head = http_repl_body = null;
  if( !body ){
    body = [
      '<div id="container" style="background-color: white;">',
      '<div class="content" id="content">',
      screen.join( "<br\>" ),
      '</div>',
      '<div id="footer">',
      '<form name="question" url="/" style="width:50%">',
      question,
      '<input type="text" name="input" placeholder="a command or help" autofocus list="history" style="width:99%">',
      '<datalist id="history">',
      options.join( "\n" ),
      '</datalist>',
      '<input type="submit">',
      link_to_command( "help" ),link_to_page( "index" ),
      '</form>',
      //'<script type="text/javascript" language="JavaScript">',
      //'document.question.input.focus();',
      //'</script>',
      '</div>', // footer
      '</div>', // container
    ].join( "\n" );
  }
  PendingResponse.end( [
    '<!DOCTYPE html><html>',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="'
    + 'width=device-width, initial-scale=1, maximum-scale=1.0, '
    + 'user-scalable=no, minimal-ui">',
    '<title>Kudocracy test UI, liquid democracy meets twitter...</title>',
    '<link rel="shortcut icon" href="http://simpliwiki.com/yanugred16.png" type="image/png">',
    head || '<link rel="stylesheet" type="text/css" href="/simpliwiki.css">',
    '</head>',
    '<body>',
    body,
    '</body>',
    '</html>'
  ].join( '\n' ) );
  PendingResponse = null;
};

var HttpQueue = l8.queue( 1000 );
var input = l8.Task( function( question ){ this
  .step( function(){
    respond( question );
    HttpQueue.get() } )
  .step( function( req, res ){
    //this.trace( "Handling new http request, " + req.method + ", " + req.url );
    if( req.method !== "GET" || !( req.url === "/" || req.url[1] == "?" ) ){
      res.writeHead( 404, { "Content-Type": "text/plain" } );
      res.end( "404 Not Found\n" );
      return input( question );
    }
    // Detect change in source ip address, when change, logout
    // ToDo: some session management
    var ip = req.headers[ "x-forwarded-for" ]
    || req.connection.remoteAddress
    || req.socket.remoteAddress
    || req.connection.socket.remoteAddress;
    Session.current.login( ip );
    PendingResponse = res;
    PendingResponse.request = req;
    PendingResponse.query = url.parse( req.url, true).query
    var data = PendingResponse.query.input;
    var more = PendingResponse.query.input2;
    if( data ){
      if( more ){ data += " " + more; }
      more = PendingResponse.query.input3;
      if( more ){ data += " " + more; }
      more = PendingResponse.query.input4;
      if( more ){ data += " " + more; }
      more = PendingResponse.query.input5;
      if( more ){ data += " " + more; }
      return data.substring( 0, 140 );
    }
    input( question );
  } );
} );

/*
 *  Test UI is made of pages.
 *
 *  Each page is a function that returns an array of two elements. The
 *  first element is to become the "head" of the HTML response, the second
 *  element is the body.
 *  Note: this is currently purely sync but moving to async will be simple to
 *  do when required.
 */

var http_repl_pages = {
  index:        page_index,
  help:         page_help,
  login:        page_login,
  visitor:      page_visitor,
  persona:      page_persona,
  delegations:  page_delegations,
  groups:       page_groups,
  proposition:  page_proposition,
  propositions: page_propositions,
  tags:         page_propositions,
  votes:        page_votes
};

function page( name ){
  var f = name && http_repl_pages[ name ];
  // No name => list names
  if( !f ){
    for( name in http_repl_pages ){
      printnl( name );
    }
    return;
  }
  var head = null;;
  var body = null;
  var result;
  try{
    result = f.apply( this, arguments );
    head = result[ 0 ];
    body = result[ 1 ];
    if( Array.isArray( head ) ){
      head = head.join( "" );
    }
    if( Array.isArray( body ) ){
      body = body.join( "" );
    }
    Session.current.previous_page = Session.current.current_page;
    Session.current.current_page  = Array.prototype.slice.call( arguments );
  }catch( err  ){
    trace( "Page error", name, err, err.stack );
  }
  set_head( head );
  set_body( body );
};

function redirect( page ){
// Set HTTP response to 302 redirect, to redirect to specified page
  if( !PendingResponse )return;
  if( !page ){ page = "index"; }
  page = encodeURIComponent( page );
  PendingResponse.redirect = "?input=page%20" + page;
}

function redirect_back(){
// Set HTTP response to 302 redirect, to redirect to the page from where the
// current HTTP request is coming.
  if( !Session.current.current_page )return redirect( "propositions" );
  redirect( Session.current.current_page.join( " " ) );
}

/*
 *  <a href="...">links</a>
 */

function link_to_command( cmd ){
  var url_code = querystring.escape( cmd );
  return '<a href="?input=' + url_code + '">' + cmd + '</a>';
}

function link_to_page( page, value, title ){
  var url_code;
  if( page[0] === "@" ){
    url_code= querystring.escape( page );
    if( !value ){ value = page; }
    page = value;
  }else{
    var url_code= querystring.escape( value || "" );
  }
  if( page === "index"){
    value = '<strong>Kudo<em>c</em>racy</strong>';
  }
  if( !value ){ value = page; }
  page = encodeURIComponent( page );
  return '<a href="?input=page+' + page + '+' + url_code + '">'
  + (title || value)
  + '</a>';
}

function link_to_twitter_user( user ){
  return '<a href="https://twitter.com/' + user + '">' + user + '</a>';
}

function link_to_twitter_tags( tags ){
  if( tags.indexOf( " " ) !== -1 ){
    var buf = [];
    tags.split( " " ).forEach( function( tag ){
      if( !tag )return;
      buf.push( link_to_twitter_tags( tag ) );
    });
    return buf.join( " " );
  }
  return '<a href="https://twitter.com/search?f=realtime&q=%23'
  + tags.substring( 1 )
  + '">' + tags + '</a>';
}

function link_to_twitter_filter( query ){
  return '<a href="https://twitter.com/search?f=realtime&q='
  + querystring.escape( query )
  + '">' + query + '</a>';
}


/*
 *  Page common elements/parts
 */


function page_style(){
  return '<link rel="stylesheet" href="http://simpliwiki.com/simpliwiki.css" type="text/css">'
  + '<script type="text/javascript" src="http://code.jquery.com/jquery-2.1.1.min.js"></script>'
  + '<script type="text/javascript">' + scrollcue + '\nscrollcue( $ );'
  + '\n$.scrollCue( { fade:".fade" } );\n'
  + '</script>\n';
}


function page_header( left, center, right ){
  if( !left ){
    left = link_to_page( "index" );
  }
  if( Session.current.visitor ){
    right = ( (right && (right + " ")) || "" )
    + link_to_page(
      Session.current.visitor.label,
      "visitor",
      Session.current.visitor.label
    );
  }else{
    right = ( (right && (right + " ")) || "" )
      + link_to_page( "login" );
  }
  return [
    '<div class="header" id="header"><div id="header_content">',
      '<div class="top_left">',
        left || "",
      '</div>',
      '<div class="top_center" id="top_center">',
        center || "",
      '</div>',
      '<div class="top_right">',
        ( (right && (right + " ")) || "" ) + link_to_page( "help" ),
      '</div>',
    '</div></div><br><br>',
    '<div id="container" style="margin:0.5em;"><div id="content" ><div id="content_text">',
    ''
  ].join( "\n" );
}

function page_footer(){
  return [
    '\n</div></div></div><div class="" id="footer"><div id="footer_content">',
    link_to_page( "propositions", "", "propositions" ), " ",
    link_to_page( "tags", "", "tags" ),
    '<div id="powered"><a href="https://github.com/virteal/kudocracy">',
    '<img src="http://simpliwiki.com/yanugred16.png"/>',
    '<strong>kudo<em>c</em>racy</strong>',
    '</a></div>',
    '</div></div>',
    '<script>!function(d,s,id){var js,fjs=d.getElementsByTagName(s)[0],p=/^http:/.test(d.location)?"http":"https";if(!d.getElementById(id)){js=d.createElement(s);js.id=id;js.src=p+"://platform.twitter.com/widgets.js";fjs.parentNode.insertBefore(js,fjs);}}(document, "script", "twitter-wjs");</script>',
  ].join( "" );
}

function page_index(){
  Session.current.visitor = null;
  return [ '<link rel="stylesheet" href="http://simpliwiki.com/style.css" type="text/css">',
  [
    '<img src="http://simpliwiki.com/alpha.gif" type="img/gif" style="position:absolute; top:0; right:0;"></img>',
    '<div id="background" class="background"></div>',
    '<div id="header" class="sw_header">',
      '<div class="sw_header_content">',
        '<div style="float:left;" class="sw_logo sw_boxed">',
          '<div style="float:left;">',
          '<img src="http://simpliwiki.com/yanugred64.png" width="64" height="64" type="image/png" alt="YanUg"/>',
          '</div>',
          '<div id="slogan" style="min-height:64px; height:64px;">',
          '<strong>' + link_to_twitter_tags( "#kudocracy" ) + '</strong>',
          '<br>new democracy',
          '</div>',
        '</div>',
        '<span id="tagline">',
        '<h3 id="tagline">',
          link_to_twitter_tags(
            "#democracy #vote #election #LiquidDemocracy #participation"
          ),
        '</h3>',
        //'<small><i>a tribute to <a href="http://wikipedia.org">Wikipedia</a></i></small>',
        '</span>',
      '</div>',
    '</div><br><br>',
    '<div id="footer" class="sw_footer sw_boxed">',
    '\n <form name="proposition" url="/">',
    '<span style="font-size:1.5em">' + emoji( "agree" ) + ' </span>',
    '<input type="hidden" name="input" maxlength="140" value="page propositions"/>',
    '<input type="search" placeholder="all" name="input2"/>',
    ' <input type="submit" value="propositions?"/>',
    '</form>\n',
    '</div>',
    '<br><a href="https://twitter.com/intent/tweet?button_hashtag=kudocracy&hashtags=vote&text=new%20democracy" class="twitter-hashtag-button" data-related="Kudocracy,vote">Tweet #kudocracy</a>',
    ' <a href="https://twitter.com/Kudocracy" class="twitter-follow-button" data-show-count="true">Follow @Kudocracy</a>',
    // Twitter buttons
    '<script>!function(d,s,id){var js,fjs=d.getElementsByTagName(s)[0],p=/^http:/.test(d.location)?"http":"https";if(!d.getElementById(id)){js=d.createElement(s);js.id=id;js.src=p+"://platform.twitter.com/widgets.js";fjs.parentNode.insertBefore(js,fjs);}}(document, "script", "twitter-wjs");</script>',
    //'<div><div><div>' + page_footer()
  ].join( "" ) ];
}


function page_help(){
  var r = [
    page_style(),
    [ ]
  ];
  r[1] = [
    page_header(
      _,
      link_to_twitter_tags( "#kudocracy" ),
      link_to_page( "propositions" )
    ),
    '<div style="max-width:50em">',
    '<h2>What is it?</h2><br>',
    'An experimental Liquid Democracy voting system where ',
    'people can ' + emoji( "agree" ) + 'like/'
    + emoji( "disagree" ) + 'dislike hashtags.',
    '<br><br><h2>hashtags?</h2><br>',
    'Hashtags are keywords used to categorize topics in social networks. ',
    'See also ',
    '#<a href="http://www.hashtags.org/quick-start/">hashtags.org</a>.',
    '<br><br><h2>How is it different?</h2><br>',
    'Traditional voting systems with elections every so often capture ',
    'infrequent snapshots of the opinion. Because voting often is inconvenient, ',
    'elections are either rare or participation suffers. Most decisions ',
    'are therefore concentrated in the hands of a few representatives ',
    'who are subject to corruption temptations. Liquid Democracy promises ',
    'to solves these issues thanks to modern technologies.',
    '<br><br><ul>',
    '<li>With <strong>Kudo<em>c</em>racy</strong>:</li>',
    '<li>Votes are reversible, you can change your mind.</li>',
    '<li>Propositions are searchable using tags.</li>',
    '<li>Delegates may vote for you on some propositions.</li>',
    '<li>You can follow their recommendations or vote directly.</li>',
    '<li>Votes and delegations are ephemeral and disappear unless renewed.</li>',
    '<li>Results are updated in realtime, trends are made visible.</li>',
    '<li>You can share your votes or hide them.</li>',
    '<li>It is <a href="https://github.com/virteal/kudocracy">open source</a>.</li>',
    '</ul>',
    '<br><h2>Is it available?</h2><br>',
    'No, not yet. What is available is a prototype. Depending on ',
    'success (vote #kudocracy!), the prototype will hopefully expand into ',
    'a robust system able to handle billions of votes from millions of ',
    'persons. That is not trivial and requires help.',
    '<br><br><h2>Who are you?</h2><br>',
    'My name is Jean Hugues Robert, ',
    link_to_twitter_user( "@jhr" ),
    '. I am a 48 years old software developper ',
    'from Corsica (the island where Napoleon was born). When I discovered the',
    ' <a href="http://en.wikipedia.org/wiki/Delegative_democracy">',
    'Delegative democracy</a> concept, I liked it. I think that it would ',
    'be a good thing to apply it broadly, using modern technology, technology ',
    'that people now use all over the world.<br>' +
    'I hope you agree. ',
    '</div>',
    // Twitter tweet & follow buttons
    (   '<a href="https://twitter.com/intent/tweet?button_hashtag=kudocracy'
      + '&hashtags=agree,kudocracy,democracy,vote,participation,LiquidDemocracy'
      + '&text=new%20democracy" '
      + 'class="twitter-hashtag-button" '
      + 'data-related="Kudocracy,vote">Tweet #kudocracy</a>'
    ),(
      ' <a href="https://twitter.com/Kudocracy'
      + '" class="twitter-follow-button" data-show-count="true">'
      + 'Follow @Kudocracy</a>'
    ),
    '<br><br><h2>Misc</h2><br>',
    'Debug console: ' + link_to_command( "help" ),
    '<br><br>',
    page_footer()
  ];
  return r;
}


function vote_menu( vote, proposition, orientation ){
  function o( v, l ){v
    return '\n<option value="' + v + '">' + (v || l) + '</option>';
  }
  var with_comment = "";
  // vote is either a vote or a persona
  var vote_id;
  if( vote.type === "Vote" ){
    vote_id = vote.id;
    proposition = vote.proposition;
    with_comment = true;
  }else{
    vote_id = "" + vote.id + "." + proposition.id;
  }
  if( with_comment ){
    with_comment = '<input type="search" name="comment" placeholder="comment" ';
    if( vote.comment() ){
      with_comment += 'value="' + Wiki.htmlizeAttr( vote.comment().text ) + '"';
    }
    with_comment += '/> ';
  }
  var tags = proposition.tags_string()
  .replace( " #recent", "" )
  .replace( " #yesterday", "" )
  .replace( " #today", "" );
  var comment;
  var remain = 140 - " #kudcracy #vote".length;
  if( with_comment && vote.comment() ){
    comment = encodeURIComponent( vote.comment().text.substring( 0, remain ) );
  }else{
    comment = "new democracy"
  }
  return [
    '\n<form name="vote" url="/">',
    '<input type="hidden" name="input" value="change_vote"/>',
    '<input type="hidden" name="vote_id" value="' + vote_id + '"/>',
    with_comment,
    '<select name="orientation">',
    // ToDo: randomize option order?
    o( "orientation" ), o( "agree"), o( "disagree" ), o( "protest" ), o( "blank" ), o( "delete" ),
    '</select>',
    '<select name="privacy">',
    o( "privacy" ), o( "public"), o( "secret" ), o( "private" ),
    '</select>',
    '<select name="duration">',
    o( "duration" ), o( "one year"), o( "one month" ), o( "one week" ),
    o( "24 hours" ), o( "one hour"),
    '</select>',
    ' <input type="submit" value="Vote"/>',
    '</form>\n',
    // Twitter tweet button
    '<a href="https://twitter.com/intent/tweet?button_hashtag='
    + (proposition.is_tag()
      ? proposition.label.substring( 1 )
      : proposition.label )
    + '&hashtags=kudocracy,vote,'
    + (vote.type !== "Vote"
      ? (orientation && orientation + "," || "")
      : vote.orientation() + ","
      )
    + tags.replace( / /g, "," ).replace( /#/g, "")
    + '&text=' + comment
    + '" class="twitter-hashtag-button" '
    + 'data-related="Kudocracy,vote">Tweet ' + proposition.label + '</a>'
  ].join( "" );
}


function delegate_menu( delegation ){
  function o( v, l ){v
    return '\n<option value="' + v + '">' + (v || l) + '</option>';
  }
  return [
    '\n<form name="delegation" url="/">',
    '<input type="hidden" name="input" '
      + 'value="change_delegation &' + delegation.id + '"/>',
    '<select name="privacy">',
    o( "privacy" ), o( "public"), o( "secret" ), o( "private" ),
    '</select>',
    ' <select name="duration">',
    o( "duration" ), o( "one year"), o( "one month" ), o( "one week" ),
    o( "24 hours" ), o( "one hour"),
    '</select>',
    ' <input type="submit" value="Delegate"/>',
    '</form>\n',
    // Twitter tweet button
    '\n<a href="https://twitter.com/intent/tweet?button_hashtag='
    + delegation.agent.label.substring( 1 )
    + '&hashtags=kudocracy,vote,'
    + delegation.tags_string().replace( / /g, "," ).replace( /#/g, "")
    + '&text=new%20democracy%20%40' + delegation.agent.label.substring( 1 ) + '" '
    + 'class="twitter-hashtag-button" '
    + 'data-related="Kudocracy,vote">Tweet #'
    + delegation.agent.label.substring( 1 ) + '</a>'
  ].join( "" );
}


function page_visitor( page_name, name, verb, filter ){
// The private page of a persona
  var persona = ( name && Persona.find( name ) ) || Session.current.visitor;
  if( !persona )return [ _, "Persona not found: " + name ];

  filter = Session.current.set_filter( filter || (verb = "Search" && "all" ) );

  // Header
  var r = [
    page_style(),
    [ page_header(
      _,
      link_to_twitter_user( persona.label ),
      link_to_page( "propositions" )
      + " " + link_to_page( persona.label, "delegations" )
      + " " + link_to_page( persona.label, "persona", "public" )
    ) ]
  ];
  var buf = [];

  buf.push( '<h1>' + persona.label + '</h1><br><br>' );

  // Query to filter for tags
  buf.push( filter_label( filter, "propositions" ) );
  buf.push( [
    '\n<form name="proposition" url="/">',
    '<input type="hidden" name="input" maxlength="140" value="page visitor ' + persona.label + '"/>',
    '<input type="search" placeholder="all" name="input3" value="',
      Session.current.has_filter() ? Session.current.filter + " #" : "",
    '"/>',
    ' <input type="submit" name="input2" value="Search"/>',
    '</form><br>\n'
  ].join( "" ) );

  // Votes, recent first
  var votes = persona.votes()
  votes = votes.sort( function( a, b ){
    return b.time_touched - a.time_touched;
  });
  buf.push( '<div><h2>Votes</h2>' );
  votes.forEach( function( entity ){
    if( entity.expired() || entity.proposition.expired() )return;
    if( Session.current.has_filter() ){
      if( !entity.proposition.is_tagged( Session.current.filter ) )return;
    }
    buf.push( '<br><br>'
      + ' ' + link_to_page( "proposition", entity.proposition.label ) + ' '
      //+ "<dfn>" + emojied( entity.proposition.result.orientation() ) + '</dfn>'
      + '<br><em>' + emojied( entity.orientation() ) + "</em> "
      + "<dfn>(" + entity.privacy() + ")</dfn>"
      + ( entity.is_direct()
        ? ""
        :  "<dfn>(via " + link_to_page( "persona", entity.delegation().agent.label ) + ")</dfn>" )
      + ", for " + duration_label( entity.expire() - vote.now() )
      + vote_menu( entity )
    )
  });
  buf.push( "</div><br>" );

  // Delegations
  var delegations = persona.delegations();
  buf.push( "<div><h2>Delegations</h2><br>" );
  //buf.push( "<ol>" );
  delegations.forEach( function( entity ){
    if( entity.expired() || entity.agent.expired() )return;
    if( Session.current.has_filter() ){
      if( !entity.is_tagged( Session.current.filter ) )return;
    }    buf.push( '<br>' // "<li>"
        + link_to_page( "persona", entity.agent.label )
        //+ ' <small>' + link_to_twitter_user( entity.agent.label ) + '</small> '
        + ( entity.is_inactive() ? " <dfn>(inactive)</dfn> " :  " " )
        + link_to_page( "propositions", entity.filter_string() )
        //+ ' <small>' + link_to_twitter_filter( entity.filter_string() ) + '</small>'
        + "</li>"
    )
  });

  // Footer
  buf.push( "</div><br>" );
  buf.push( page_footer() );
  r[1] = r[1].concat( buf );
  return r;
}


function page_persona( page_name, name, verb, filter ){
// This is the "public" aspect of a persona
  var persona = Persona.find( name );
  if( !persona )return [ _, "Persona not found: " + name ];

  filter = Session.current.set_filter( filter || (verb = "Search" && "all" ) );

  // Header
  var r = [
    page_style(),
    [ page_header(
      _,
      link_to_twitter_user( persona.label ),
      link_to_page( "propositions" )
      + ( Session.current.visitor === persona
        ?   " " + link_to_page( "delegations" )
          + " " + link_to_page( persona.label, "visitor", "votes" )
        : "" )
    ) ]
  ];
  var buf = [];

  buf.push( '<h1>' + persona.label + '</h1><br><br>' );

  // Twitter follow button
  buf.push(
    '<a href="https://twitter.com/' + persona.label
    + '" class="twitter-follow-button" data-show-count="true">'
    + 'Follow ' + persona.label + '</a>'
  );

  // Query to filter for tags in persona's votes
  buf.push( filter_label( filter ) );
  buf.push( [
    '\n<form name="proposition" url="/">',
    '<input type="hidden" name="input" maxlength="140" value="page persona ' + persona.label + '"/>',
    ' <input type="search" placeholder="all" name="input3" value="',
      Session.current.has_filter() ? Session.current.filter + " #" : "",
    '"/>',
    ' <input type="submit" name="input2" value="Search"/>',
    '</form>\n'
  ].join( "" ) );

  // Votes, recent first
  var votes = persona.votes();
  votes = votes.sort( function( a, b ){
    return b.time_touched - a.time_touched;
  });
  buf.push( '<br><br><div><h2>Votes</h2><br>' );
  //buf.push( "<ol>" );
  votes.forEach( function( entity ){
    if( entity.expired() )return;
    if( Session.current.filter.length ){
      if( !entity.proposition.is_tagged( Session.current.filter ) )return;
    }
    buf.push( '<br>' ); // "<li>" );
    if( entity.is_private() ){
      buf.push( "private" );
    }else{
      buf.push( ''
        +  ( entity.is_secret()
          ? "secret"
          : "<em>" + emojied( entity.orientation() ) ) + "</em> "
        + '' + link_to_page( "proposition", entity.proposition.label ) + ' '
        + " <dfn>" + time_label( entity.time_touched ) + "</dfn> "
        //+ " <dfn>" + emojied( entity.proposition.result.orientation() ) + "</dfn> "
        //+ time_label( entity.proposition.result.time_touched )
        //+ "<dfn>(" + entity.privacy() + ")</dfn>"
        + ( entity.is_direct() || !entity.delegation().is_public()
          ? ""
          :  "<dfn>(via " + link_to_page( "persona", entity.delegation().agent.label ) + ")</dfn> " )
        //+ ", for " + duration_label( entity.expire() - vote.now() )
      );
    }
    //buf.push( "</li>" );
  });
  // buf.push( "</ol></div><br>" );
  buf.push( '</div><br>' );
  buf.push( page_footer() );
  r[1] = r[1].concat( buf );
  return r;
}


function page_delegations( page_name, name, verb, filter ){
// The private page of a persona's delegations
  var persona = ( name && Persona.find( name ) ) || Session.current.visitor;
  if( !persona )return [ _, "Persona not found: " + name ];

  filter = Session.current.set_filter( filter || (verb = "Search" && "all" ) );

  // Header
  var r = [
    page_style(),
    [ page_header(
      _,
      link_to_twitter_user( persona.label ),
      link_to_page( "propositions" )
      + " " + link_to_page( persona.label, "persona", "public" )
      + " " + link_to_page( persona.label, "visitor", "votes" )
    ) ]
  ];
  var buf = [];

  buf.push( '<h1>' + persona.label + '</h1><br><br>' );

  // Query to filter for tags
  buf.push( filter_label( filter, "propositions" ) );
  buf.push( [
    '\n<form name="proposition" url="/">',
    '<input type="hidden" name="input" maxlength="140" value="page delegations ' + persona.label + '"/>',
    '<input type="search" placeholder="all" name="input3" value="',
      Session.current.has_filter() ? Session.current.filter + " #" : "",
    '"/>',
    ' <input type="submit" name="input2" value="Search"/>',
    '</form><br>\n'
  ].join( "" ) );

  // Delegations
  var delegations = persona.delegations();
  buf.push( "<div><h2>Delegations</h2>" );
  delegations.forEach( function( entity ){
    if( entity.expired() )return;
    buf.push( '<br><br>'
      + link_to_page( "persona", entity.agent.label )
      + ( entity.is_inactive() ? " <dfn>(inactive)</dfn> " :  " " )
      + link_to_page( "propositions", entity.filter_string() )
      + "<br><dfn>(" + entity.privacy() + ")</dfn>"
      + ", for " + duration_label( entity.expire() - vote.now() )
    + delegate_menu( entity )
    )
  });

  // Footer
  buf.push( "</div><br>" );
  buf.push( page_footer() );
  r[1] = r[1].concat( buf );
  return r;
}


function page_groups( page_name, name ){
  var r = [ page_style(), null ];
  var persona = Persona.find( name );
  if( !persona ){
    r[1] = "Persona not found: " + name;
    return r;
  }
  r[1] = pretty( persona.value() );
  return r;
}


function filter_label( filter, page ){
  var buf = [];
  if( filter ){
    buf.push( "<div>" );
    filter.split( " " ).forEach( function( tag ){
      buf.push( link_to_page( page || "propositions", tag ) + " " );
    });
    buf.push( '</div>' );
  }
  return buf.join( "" );
}


function page_propositions( page_name, filter ){
// This is the main page of the application, either a list of tags or
// propositions, filtered.

  var tag_page = page_name === "tags";

  filter = Session.current.set_filter( filter );

  // Header
  var r = [
    page_style(),
    [ page_header(
      _,
      Session.current.has_filter()
      ? link_to_twitter_tags( Session.current.filter )
      : link_to_twitter_tags(
        "#vote #kudocracy"
      ),
      link_to_page( tag_page ? "propositions" : "tags" )
      + " " + link_to_page( "votes" )
    ) ]
  ];
  var buf = [];

  buf.push( tag_page ? "<br><h3>Tags</h3>" : "<br><h3>Propositions</h3>" );
  if( Session.current.has_filter() ){
    buf.push( ' tagged <h1>' + Session.current.filter + '</h1><br><br>' );
  }

  // Twitter tweet button, to tweet about the filter
  if( Session.current.has_filter() ){
    buf.push( '<a href="https://twitter.com/intent/tweet?button_hashtag=kudocracy'
      + '&hashtags=vote,'
      + Session.current.filter_tags_label()
      + '&text=new%20democracy" '
      + 'class="twitter-hashtag-button" '
      + 'data-related="Kudocracy,vote">Tweet #kudocracy</a>'
    );
  }

  // Query to search for tags or create a proposition
  buf.push( [
    '\n<form name="proposition" url="/">',
    '<input type="hidden" name="input" maxlength="140" value="change_proposition"/>',
    '<input type="search" placeholder="all" name="input3" value="',
      Session.current.has_filter() ? Session.current.filter + " #" : "",
    '"/>',
    ' <input type="submit" name="input2" value="Search"/>'
    + ( Session.current.visitor
      && Session.current.has_filter()
      && Session.current.filter_tags.length
      ? ' <input type="submit" name="input2" value="Delegate"/>' : "" )
    + ( Session.current.visitor
      ? ' <input type="submit" name="input2" value="Propose"/>' : "" ),
    '</form>\n'
  ].join( "" ) );

  // Display list of matching propositions or tags
  var propositions = Topic.all;
  var list = [];
  var attr;
  var entity;
  var visitor_tag = null;;
  if( Session.current.visitor ){
    visitor_tag = "#" + Session.current.visitor.label.substring( 1 );
  }
  for( attr in propositions ){
    entity = propositions[ attr ];
    if( !entity || entity.expired() )continue;
    if( entity.is_tag() ){
      if( !tag_page )continue;
    }else{
      if( tag_page )continue;
    }
    if( Session.current.has_filter() ){
      if( !entity.is_tagged( Session.current.filter ) )continue;
    }
    // Filter out propositions without votes unless current user created it
    if( !entity.result.total()
    && ( !visitor_tag || !entity.is_tagged( visitor_tag ) ) // ToDo: remove #jhr mention
    && ( !visitor_tag || visitor_tag !== "#jhr" )  // Enable clean up during alpha phase
    )continue;
    list.push( entity );
  }
  list = list.sort( function( a, b ){
    // The last consulted proposition is hot
    if( a === Session.current.proposition )return -1;
    if( b === Session.current.proposition )return 1;
    // Other proposition's heat rule
    return b.heat() - a.heat()
  });
  list.forEach( function( proposition ){
    var text = proposition.label;
    if( tag_page ){
      text += " is a good tag";
    }
    buf.push(
      '<br><h3>' + emoji( proposition.result.orientation() )
      + link_to_page( "proposition", proposition.label, text )
      + '</h3>'
    );
    //if( proposition.result.orientation() ){
    //  buf.push( ' <em>' + emojied( proposition.result.orientation() ) + '</em>' );
    //}
    buf.push( '<br>' );
    proposition.tags_string().split( " " ).forEach( function( tag ){
      if( !tag )return;
      buf.push( link_to_page( page_name, tag ) + " " );
    });
    //buf.push( '<small>' + link_to_twitter_tags( proposition.tags_string() + '</small><br>' ) );
    buf.push( '<br>' + proposition_summary( proposition.result ) + '<br>' );

    if( tag_page ){
      buf.push( "" + proposition.propositions().length + " "
        + link_to_page( "propositions", proposition.label, "propositions" ) + "<br>"
      )
    }

    if( Session.current.visitor ){
      var vote_entity = Vote.find( Session.current.visitor.name + "." + proposition.name );
      if( vote_entity ){
        buf.push( 'you: '
          + vote_entity.orientation()
          + "<dfn>(" + vote_entity.privacy() + ")</dfn>"
          + ( vote_entity.is_direct()
            ? ""
            :  "<dfn>(via " + link_to_page( "persona", vote_entity.delegation().agent.label ) + ")</dfn>" )
          + ", for " + duration_label( vote_entity.expire() - vote.now() )
        );
        buf.push( vote_menu( vote_entity ) );
      }else{
        buf.push( vote_menu( Session.current.visitor, proposition ) );
      }
      buf.push( '<br>' );
    }
  });

  buf.push(  "<br>" + page_footer() );
  r[1] = r[1].concat( buf );
  return r;
}


function page_votes( page_name, filter ){
// This is the votes page of the application, filtered.

  filter = Session.current.set_filter( filter );

  // Header
  var r = [
    page_style(),
    [ page_header(
      _,
      Session.current.has_filter()
      ? link_to_twitter_tags( Session.current.filter )
      : link_to_twitter_tags(
        "#vote #kudocracy"
      ),
      link_to_page( "propositions" )
    ) ]
  ];
  var buf = [];

  buf.push( "<br><h3>Votes</h3>" );
  if( Session.current.has_filter() ){
    buf.push( ' tagged <h1>' + Session.current.filter + '</h1><br><br>' );
  }

  // Twitter tweet button, to tweet about the filter
  if( Session.current.has_filter() ){
    buf.push( '<a href="https://twitter.com/intent/tweet?button_hashtag=kudocracy'
      + '&hashtags=vote,'
      + Session.current.filter_tags_label()
      + '&text=new%20democracy" '
      + 'class="twitter-hashtag-button" '
      + 'data-related="Kudocracy,vote">Tweet #kudocracy</a>'
    );
  }

  // Query to search for votes
  buf.push( [
    '\n<form name="proposition" url="/">',
    '<input type="hidden" name="input" maxlength="140" value="change_proposition"/>',
    '<input type="search" placeholder="all" name="input3" value="',
      Session.current.has_filter() ? Session.current.filter + " #" : "",
    '"/>',
    ' <input type="submit" name="input2" value="Search"/>'
    + ( Session.current.visitor
      && Session.current.has_filter()
      && Session.current.filter_tags.length
      ? ' <input type="submit" name="input2" value="Delegate"/>' : "" )
    + ( Session.current.visitor
      ? ' <input type="submit" name="input2" value="Propose"/>' : "" ),
    '</form>\n'
  ].join( "" ) );

  // Display list of matching votes
  var votes = Vote.log;
  var list = [];
  var vote_value;
  var entity;
  var visitor_tag = null;;
  if( Session.current.visitor ){
    visitor_tag = "#" + Session.current.visitor.label.substring( 1 );
  }
  var ii = votes.length;
  while( ii-- ){
    vote_value = votes[ ii ];
    entity = vote_value.entity;
    if( !entity
    || entity.expired()
    || entity.proposition.expired()
    || entity.persona.expired()
    )continue;
    if( Session.current.has_filter() ){
      if( !entity.proposition.is_tagged( Session.current.filter ) )continue;
    }
    // Filter out propositions without votes unless current user created it
    if( !entity.proposition.result.total()
    && ( !visitor_tag || !entity.proposition.is_tagged( visitor_tag ) ) // ToDo: remove #jhr mention
    && ( !visitor_tag || visitor_tag !== "#jhr" )  // Enable clean up during alpha phase
    )continue;
    if( vote_value.delegation          === Vote.direct
    && vote_value.privacy              === Vote.public
    && vote_value.orientation          !== Vote.neutral
    && vote_value.entity.privacy()     === Vote.public
    && vote_value.entity.orientation() !== Vote.neutral
    ){
      buf.push( "<br>" );
      buf.push(
        '<em>' + emojied( vote_value.orientation ) + "</em> "
        + link_to_page( "persona", vote_value.persona_label )
        + " <small><dfn>" + time_label( vote_value.snaptime ) + "</dfn></small>"
      );
      if( vote_value.comment_text ){
        buf.push( ' ' + format_comment( vote_value.comment_text ) );
      }
      // buf.push( "</li>" );
    }
  }

  buf.push(  "<br>" + page_footer() );
  r[1] = r[1].concat( buf );
  return r;
}


function page_login( page_name ){

  // Header
  var r = [
    page_style(),
    [ page_header(
      _,
      link_to_twitter_tags(
        "#login #kudocracy"
      ),
      _ ) ]
  ];
  var buf = [];

  // Query for name
  buf.push( [
    '\n<form name="login" url="/">',
    '<label>Your twitter @name</label> ',
    '<input type="hidden" name="input" maxlength="30" value="login"/>',
    '<input type="text" name="input2"/>',
    ' <input type="submit" value="Login"/>',
    '</form>\n'
  ].join( "" ) );
  buf.push( "<br>" + page_footer() );
  r[1] = r[1].concat( buf );
  return r;

}


function emoji( name, spacer ){
  var tmp = emoji.table[ name ];
  if( !tmp )return "";
  if( !spacer )return tmp;
  return tmp + spacer;
}
emoji.table = {
  agree:    "&#xe00e;",    // Thumb up
  disagree: "&#xe421;",    // Thumb down
  protest:  "&#xe012;"     // raised hand
}

function emojied( text ){
  return text ? emoji( text ) + text : "";
}


function proposition_summary( result, div ){
  var buf = [];
  var orientation = result.orientation();
  if( !orientation ){ orientation = "";  }
  if( div ){
    buf.push( '<div><h2>Summary' + ' <em>' + emojied( orientation ) + '</em></h2><br>' );
  }else{
    buf.push( "<em>" + orientation + "</em>. " );
  }
  buf.push( 'agree ' + result.agree() + " " );
  buf.push( 'against ' + result.against() + " " );
  buf.push( 'blank ' + result.blank() + ' ' );
  buf.push( '<br><dfn>protest ' + result.protest() + '</dfn> ' );
  buf.push( '<dfn>total ' + result.total() + ' ' );
  buf.push( '(direct ' + result.direct() + ' ' );
  buf.push( 'indirect ' + (result.total() - result.direct()) + ')</dfn> ' );
  buf.push( '<dfn>change ' + result.count() + ' ' );
  buf.push( time_label( result.time_touched ) + '</dfn>' );
  return buf.join( "" );
}

function i18n( msg ){
  if( msg === "il y a " )return "";
  return msg;
}

// section: include.js
function $include( file, prepand, postpand ){
// Like C's #include to some extend. See also $include_json().
// The big difference with require() is that whatever is declared using
// "var" is visible, whereas with require() local variables are defined in
// some different scope.
// The big difference with #include is that #include can be used anywhere
// whereas $include() can be used only as a statement.
// Please use $include_json() to include an expression.
// file is searched like require() does (if require.resolve() exists).
// File's content is not cached, I trust the OS for doing some caching better
// than myself. As a result, it works great with self modifying code...
// Another big difference is the fact that $include() will fail silently if
// the file cannot be read.
  var data
  var fs      = require( 'fs')
  var ffile   = ""
  var rethrow = false
  try{
    ffile = require.resolve ? require.resolve( file) : file
  }catch( err ){}
  // Silent ignore if file not found
  if( !ffile ){
    trace( "$include: no " + file)
    return
  }
  try{
    data = fs.readFileSync( ffile).toString()
    prepand  && (data = prepand + data)
    postpand && (data = data    + postpand)
    $include.result = undefined
    // trace( "$include() eval of:" + data)
    try{
      eval( data) // I wish I could get better error reporting
    }catch( err ){
      rethrow = true
      throw err
    }
    return $include.result
  }catch( err ){
    trace( "$include: " + file)
    if( true || rethrow ) throw err
  }
}

function $include_json( file ){
// Like C's #include when #include is used on the right side of an assignment
  return $include( file, ";($include.result = (", "));")
}
// section: end include.js

// section: end sectionize.js


// -------------------
// section: globals.js

// Some global constants
var SW = {
  // Needed at startup
  version:  "0.15",
  name:     "Kudocracy",	// Name of website
  debug:    true,		// Debug mode means lots of traces
  test:     false,		// Test mode
  dir:      "",		        // Local to cwd, where files are, must exist
  port:     1234,		// 80 default, something else if behind a proxy
  domain:   "",			// To build permalinks, empty => no virtual hosting
  static:   "",			// To serve static files, optionnal, ToDo: ?
  protocol: "http://",		// Idem, https requires a reverse proxy
  fbid:     "",                 // Facebook app ID
  twid:     "",			// Twitter app ID
  likey:    "",			// LinkedIn API key
  dbkey:    "",			// Dropbox key
  dbsecret: "",			// Dropbox secret
  shkey:    "",			// Shareaholic key
  scalable: false,		// ToDo: a multi-core/multi-host version
  style:    "",			// CSS string (or lesscss if "less" is found)

  // Patterns for valid page names, please change with great care only

  // ~= CamelCase, @#_[ are like uppercase, . - [ are like lowercase
  wikiwordCamelCasePattern:
    "[@#A-Z_\\[][a-z0-9_.\\[-]{1,62}[@#A-Z_\\[\\]]",
  // 3Code style
  wikiword3CodePattern:
    "3\w\w-\w\w\w-\w\w\w",
  // 4Codes
  wikiword4CodePattern:
    "4\w\w\w-\w\w\w\w-\w\w\w\w-\w\w\w\w",
  // Twitter hash tag
  wikiwordHashTagPattern:
    "#[A-Za-z][a-z_0-9]{2,30}",
  // Twitter name
  wikiwordTwitterPattern:
    "@[A-Za-z][A-Za-z_0-9]{2,30}",
  // email address, very liberal but fast
  wikiwordEmailPattern:
    "[a-z][a-z_0-9.-]{1,62}@[a-z0-9.-]{5,62}",
  // Free links, anything long enough but without / & infamous <> HTML tags
  // ToDo: I also filter out .", = and ' but I should not, but that would break
  wikiwordFreeLinkPattern:
    "[A-Za-z_]*\\[[^.='\"/<>\\]]{3,62}\\]",
  // Suffix, can follow any of the previous pattern
  wikiwordSuffixPattern:
    "(([\.][@#A-Z_a-z0-9-\\[\\]])|([@#A-Z_a-z0-9\\[\\]-]*))*",
  // Prefix, cannot precede a wikiword
  wikiwordPrefixPattern:
    "([^=@#A-Za-z0-9_~\?&\)\/\\\">.:-]|^)",
  // ToDo: Postfix anti pattern, cannot succede a wikiword, non capturing
  wikiwordPostfixAntiPattern: "",

  // Valid chars in 3Codes, easy to read, easy to spell
  // 23 chars => 23^8 possibilities, ~= 80 000 000 000, 80 billions
  // 4codes: 23^15 ~= a billion of billions, enough
  // Don't change that. If you change it, all exiting "public" key get confused
  valid3: "acefghjkprstuvxyz234678",	// avoid confusion (ie O vs 0...)

  // Pattern for dates, ISO format, except I allow lowercase t & z
  datePattern: "20..-..-..[tT]..:..:..\....[zZ]",

  // Delays:
  thereDelay:        30 * 1000,	// Help detect current visitors
  recentDelay:  30 * 60 * 1000,	// Recent vs less recent
  awayDelay:    10 * 60 * 1000,	// Help logout old guests
  logoutDelay: 2 * 3600 * 1000,	// Help logout inactive members
  saveDelay:         30 * 1000,	// Save context delay
  resetDelay: 12 * 3600 * 1000,	// Inactive wikis are unloaded
  hotDelay:  45 * 84600 * 1000,	// Short term memory extend

  // Hooks
  hookSetOption: null, // f( wiki, key, str_val, base) => null or {ok:x,val:y}
  hookStart:     null, // Called right before .listen()

  the: "end" // of the missing comma
}

// Compute the maximum numeric value of a 3Code (or 4Code)
// These are approximates because it does not fit in a javascript 53 bits
// integer
;(function compute_max_3Code(){
  var len = SW.valid3 * len
  // 8 chars for 3 codes, 15 for 4codes
  var nch = 8
  var max = 1
  while( nch-- ){ max = max * len }
  SW.max3code = max
  // 8 + 7 is 15
  nch = 7
  while( nch-- ){ max = max * len }
  SW.max4code = max
})()

// String pattern for all valid Wikiwords
SW.wikiwordPattern = "("
  + "("
  +       SW.wikiwordCamelCasePattern
  + "|" + SW.wikiword3CodePattern
  + "|" + SW.wikiword4CodePattern
  + "|" + SW.wikiwordHashTagPattern
  + "|" + SW.wikiwordTwitterPattern
  + "|" + SW.wikiwordEmailPattern
  + "|" + SW.wikiwordFreeLinkPattern
  + ")"
  // All previous followed by optionnal non space stuff, but not . ending
  + SW.wikiwordSuffixPattern
+ ")"

// String pattern for all ids
SW.wikiwordIdPattern = ""
  + "("
  +       SW.wikiwordTwitterPattern
  + "|" + SW.wikiwordEmailPattern
  + ")"

// From string patterns, let's build RegExps

// Pattern to isolate wiki words out of stuff
SW.wikiwords = new RegExp(
    SW.wikiwordPrefixPattern
  + SW.wikiwordPattern
  + SW.wikiwordPostfixAntiPattern
  , "gm"
)

// Pattern to check if a str is a wikiword
SW.wikiword
  = new RegExp( "^" + SW.wikiwordPattern              + "$")
// Pattern to check if a str in an id
SW.wikiwordId
  = new RegExp( "^" + SW.wikiwordIdPattern            + "$")
// Pattern for each type of wikiword
SW.wikiwordCamelCase
  = new RegExp( "^" + SW.wikiwordCamelCasePattern     + "$")
SW.wikiword3Code
  = new RegExp( "^" + SW.wikiword3CodePattern         + "$")
SW.wikiword4Code
  = new RegExp( "^" + SW.wikiword4CodePattern         + "$")
SW.wikiwordHashTag
  = new RegExp( "^" + SW.wikiwordHashTagPattern       + "$")
SW.wikiwordTwitter
  = new RegExp( "^" + SW.wikiwordTwitterPattern       + "$")
SW.wikiwordEmail
  = new RegExp( "^" + SW.wikiwordEmailPattern         + "$")
SW.wikiwordFreeLink
  = new RegExp( "^" + SW.wikiwordFreeLinkPattern      + "$")

// Some tests
if( true ){
  var De = true;
  // Smoke test
  if( !SW.wikiword.test( "WikiWord") ){
    De&&bug( "Pattern:", SW.wikiwordPattern)
    De&&mand( false, "Failed WikiWord smoke test")
  }
  // Some more tests, because things gets tricky some times
  var test_wikiwords = function (){
    function test( a, neg ){
      if( !De )return
      !neg && mand(  SW.wikiword.test( a), "false negative " + a)
      neg  && mand( !SW.wikiword.test( a), "false positive " + a)
      var match = SW.wikiwords.exec( " " + a + " ")
      if( !match ){
        mand( neg, "bad match " + a)
      }else{
        mand( match[1] == " ", "bad prefix for " + a)
        match = match[2]
        !neg && mand( match == a, "false negative match: " + a + ": " + match)
        neg  && mand( match != a, "false positive match: " + a + ": " + match)
        match = SW.wikiwords.exec( "~" + a + " ")
        if( match ){
          mand( neg, "bad ~match " + a)
        }
      }
    }
    function ok( a ){ test( a)       }
    function ko( a ){ test( a, true) }
    ok( "WikiWord")
    ok( "WiWi[jhr]")
    ok( "W_W_2")
    ok( "@jhr")
    ok( "@Jhr")
    ko( "@jhr.")
    ok( "@jhr@again")
    ko( "j-h.robert@")
    ko( "jhR@")
    ok( "#topic")
    ok( "#Topic")
    ok( "#long-topic5")
    ko( "Word")
    ko( "word")
    ko( " gar&badge ")
    ok( "UserMe@myaddress_com")
    ko( "aWiki")
    ko( "aWikiWord")
    ok( "_word_")
    ko( "_two words_")
    ok( "[free link]")
    ok( "User[free]")
    ok( "[free]Guest")
    ko( "[free/link]")
    ko( "linkedIn")
    ko( "shrtIn")
    ko( "badLinkIn")
    ok( "info@simpliwiki.com")
  }
  test_wikiwords()
}

// Each wiki has configuration options.
// Some of these can be overridden by wiki specific AboutWiki pages
// and also at session's level (or even at page level sometimes).
SW.config =
// section: config.json, import, optional, keep
// If file config.json exists, it's content is included, ToDo
{
  lang:           "en",	// Default language
  title:          "",	// User label of wiki, cool for 3xx-xxx-xxx ones
  cols: 50,		// IETF RFCs style is 72
  rows: 40,		// IETF RFCs style is 58
  twoPanes:       false,// Use right side to display previous page
  cssStyle:       "",	// CSS page or url, it patches default inlined CSS
  canScript:      true,	// To please Richard Stallman, say false
  open:           true,	// If true everybody can stamp
  premium:        false,// True to get lower Ys back
  noCache:        false,// True to always refetch fresh data
  backupWrites:   SW.debug,	// Log page changes in SW.dir/Backup
  mentorUser:     "",	// default mentor
  mentorCode:     "",	// hard coded default mentor's login code
  mentors:        "",	// Users that become mentor when they log in
  adminIps:       "",	// Mentors from these addresses are admins
  debugCode:      "",	// Remote debugging
  fbLike:         true,	// If true, Like button on some pages
  meeboBar:       "",   // Meebo bar name, "" if none, ToDo: retest
}
// section: end config.json

// Local hooks makes it possible to change (ie hack) things on a local install
// This is where one want to define secret constants, ids, etc...
$include( "hooks.js")
if( SW.name != "SimpliJs" ){
  trace( "Congratulations, SimpliJs is now " + SW.name)
  if( SW.dir ){
    trace( "wiki's directory: " + SW.dir)
  }else{
    trace( "wiki is expected to be in current directory")
    trace( "See the doc about 'hooks', SW.dir in 'hooks.js'")
  }
  if( SW.port == "1234" ){
    trace( "default 1234 port")
    trace( "see the doc about 'hooks', SW.port in 'hooks.js'")
  }
}else{
  trace( "Humm... you could customize the application's name")
  trace( "See the doc about 'hooks', SW.name in 'hooks.js'")
}

// Let's compute "derived" constants

SW.idCodePrefix = "code" + "id"

// Global variables
var Sw = {
  interwikiMap: {},	// For interwiki links, actually defined below
  sessionId: 0,         // For debugging
  currentSession: null, // Idem
  requestId: 0,
  timeNow: 0,
  dateNow: 0,
  cachedDateTooltips: {},
  inspectedObject: null
}

// section: end globals.js

/* ---------------------------------------------------------------------------
 *  Extracted from SimpliWiki
 */

var Wiki = {};

Wiki.redize = function( str ){
  if( !str )return ""
  return "<em>" + str.substr( 0, 1) + "</em>" + str.substr( 1)
}

Wiki.htmlizeMap = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;"
}

Wiki.htmlize = function( txt ){
// Per HTML syntax standard, &, < and > must be encoded in most cases, <script>
// CDATA and maybe <textarea> are the exceptions.
  // Protect pre-encoded i18n stuff, unless "HTML" in text tells differently
  if( txt.indexOf( "HTML") < 0 ){
    txt = txt.replace( /&([a-z]{2,7};)/, "\r$1")
  }
  var map = Wiki.htmlizeMap
  txt = txt.replace( /[&<>]/g, function( ch ){ return map[ch] })
  // Restore pre-encoded i18n stuff
  txt = txt.replace( /\r([a-z]{2,7};)/, "&$1")
  return txt
}

Wiki.dehtmlizeMap = {
  "&amp;": "&",
  "&lt;":  "<",
  "&gt;":  ">"
}

Wiki.dehtmlize = function( txt ){
  var map = Wiki.dehtmlizeMap
  return txt.replace( /(&.*;)/g, function( ch ){ return map[ch] })
}

Wiki.htmlizeAttrMap = {
  "&": "&amp;",
  '"': "&quot;",
  "'": "&#39;"
}

Wiki.htmlizeAttr = function( txt ){
// HTML syntax dictactes that attribute cannot contain " and, that's a bit
// suprizing ' and &... they must be encoded.
// Google Chrome specially does not like ' in attributes... it freeezes in
// some cases.
  var map = Wiki.htmlizeAttrMap
  return txt.replace( /[&"']/g, function( ch ){ return map[ch] })
}

Wiki.dehtmlizeAttrMap = {
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'"
}

Wiki.dehtmlizeAttr = function( txt ){
// HTML syntax dictactes that attribute cannot contain " and, that's a bit
// suprizing ' and &... they must be encoded.
// Google Chrome specially does not like ' in attributes... it freeezes in
// some cases.
  var map = Wiki.dehtmlizeAttrMap
  return txt.replace( /(&.*;)/g, function( ch ){ return map[ch] })
}

Wiki.wikify = function( text ){
  // Soft urls, very soft, xyz.abc style
  // The pattern is tricky, took me hours to debug it
  // http://gskinner.com/RegExr/ may help
  var surl =
  /([\s>]|^)([^\s:=@#"([)\]>][a-z0-9.-]+\.[a-z]{2,4}[^\sA-Za-z0-9_!.;,<"]*[^\s:,<>"']*[^.@#\s:,<>'"]*)/g
  /*
   *  (([\s>]|^)             -- space or end of previous link or nothing
   *  [^\s:=@#"([)\]>]       -- anything but one of these
   *  [\w.-]+                -- words, maybe . or - separated/terminated
   *  \.[a-z]{2,4}           -- .com or .org or .xxx
   *  [^\sA-Za-z0-9_!.;,<"]* -- ? maybe
   *  [^\s:,<>"']*           -- not some separator, optional
   *  [^.@#\s:,<>'"]*        -- not . or @ or # terminated -- ToDo: broken
   *
   *  ToDo: must not match jh.robert@
   *  but should match simpliwiki.com/jh.robert@
   */
    text = text.replace( surl, function( m, p, u ){
      // u = u.replace( /&amp;/g, "&")
      // exclude some bad matches
      if( /[#.]$/.test( u) )return m
      if( u.indexOf( "..") >= 0 )return m
      return p
      + '<a href="' + Wiki.htmlizeAttr( "http://" + u) + '">'
      + u
      + '</a>'
    })

  // url are htmlized into links
  // The pattern is tricky, change with great care only
  var url = /([^>"\w]|^)([a-ik-z]\w{2,}:[^\s'",!<>)]{2,}[^.\s"',<>)]*)/g
    text = text
    .replace( url, function( m, p, u ){
      // exclude some matches
      //if( /[.]$/.test( u) )return m
      // Fix issue with terminating dot
      var dot = ""
      if( ".".ends( u) ){
        u = u.substr( 0, u.length - 1)
        dot = "."
      }
      u = u.replace( /&amp;/g, "&")
      return p + '<a href="' +  Wiki.htmlizeAttr( u) + '">' + u  + '</a>' + dot
    })

    text = text
    .replace( wiki_names, '$1<a class="wiki" href="' + href + '$2">$2</a>')

  // Fix some rare issue with nested links, remove them
  text = text.replace( /(<a [^>\n]+?)<a [^\n]+?>([^<\n]+?)<\/a>/g, '$1$2')
}

// ---------------------------------------------------------------------------

function format_comment( text ){
// SimpliWiki style formating
  return Wiki.htmlizeAttr( text );
}

function duration_label( duration ){
// Returns a sensible text info about a duration
  // Slight increase to provide a better user feedback
  //duration += 5000;
  var delta = duration / 1000;
  var day_delta = Math.floor( delta / 86400);
  if( isNaN( day_delta) )return "";
  if( day_delta < 0 ) return i18n( "in the future" );
  return (day_delta == 0
      && ( delta < 5
        && i18n( "just now")
        || delta < 60
        && i18n( "il y a ") + Math.floor( delta )
        + i18n( " seconds")
        || delta < 120
        && i18n( "1 minute")
        || delta < 3600
        && i18n( "il y a ") + Math.floor( delta / 60 )
        + i18n( " minutes")
        || delta < 7200
        && i18n( "about an hour")
        || delta < 86400
        && i18n( "il y a ") + Math.floor( delta / 3600 )
        + i18n( " hours")
        )
      || day_delta == 1
      && i18n( "a day")
      || day_delta < 7
      && i18n( "il y a ") + day_delta
      + i18n( " days")
      || day_delta < 31
      && i18n( "il y a ") + Math.ceil( day_delta / 7 )
      + i18n( " weeks")
      || day_delta >= 31
      && i18n( "il y a ") + Math.ceil( day_delta / 30.5 )
      + i18n( " months")
      ).replace( /^ /, ""); // Fix double space issue with "il y a "
}


function time_label( time, with_gmt ){
// Returns a sensible text info about time elapsed.
  //with_gmt || (with_gmt = this.isMentor)
  var delta = ((vote.now() + 10 - time) / 1000); // + 10 to avoid 0/xxx
  var day_delta = Math.floor( delta / 86400);
  if( isNaN( day_delta) )return "";
  if( day_delta < 0 ) return i18n( "in the future" );
  var gmt = !with_gmt ? "" : ((new Date( time)).toGMTString() + ", ");
  return gmt
    + (day_delta == 0
      && ( delta < 5
        && i18n( "just now")
        || delta < 60
        && i18n( "il y a ") + Math.floor( delta )
        + i18n( " seconds ago")
        || delta < 120
        && i18n( "1 minute ago")
        || delta < 3600
        && i18n( "il y a ") + Math.floor( delta / 60 )
        + i18n( " minutes ago")
        || delta < 7200
        && i18n( "about an hour ago")
        || delta < 86400
        && i18n( "il y a ") + Math.floor( delta / 3600 )
        + i18n( " hours ago")
        )
      || day_delta == 1
      && i18n( "yesterday")
      || day_delta < 7
      && i18n( "il y a ") + day_delta
      + i18n( " days ago")
      || day_delta < 31
      && i18n( "il y a ") + Math.ceil( day_delta / 7 )
      + i18n( " weeks ago")
      || day_delta >= 31
      && i18n( "il y a ") + Math.ceil( day_delta / 30.5 )
      + i18n( " months ago")
      ).replace( /^ /, ""); // Fix double space issue with "il y a "
}


function proposition_graphics(){
// Runs client side
  console.log( "Google pie" );
  google.load('visualization', '1.0', {'packages':['corechart']});
  google.setOnLoadCallback(drawChart);
  function drawChart(){

    var data;
    var options;

    // Create the data table.
    data = new google.visualization.DataTable();
    data.addColumn('string', 'Orientation');
    data.addColumn('number', 'Slices');
    data.addRows([
      ['agree',    graph_pie.agree],
      ['disagree', graph_pie.disagree],
      ['protest',  graph_pie.protest],
      ['blank',    graph_pie.blank]
    ]);

    // Set chart options
    options = { 'title':'Orientations', 'width':400, 'height':300 };

    // Instantiate and draw our chart, passing in some options.
    var chart = new google.visualization.PieChart( document.getElementById( 'orientation_chart_div' ) );
    chart.draw( data, options );

    data = new google.visualization.DataTable();
    data.addColumn( 'datetime', 'date' );
    data.addColumn( 'number' ) // , 'balance' );
    for( var ii = 0 ; ii < graph_serie.length ; ii++ ){
      graph_serie[ ii ][ 0 ] = new Date( graph_serie[ ii ][ 0 ] );
    }
    data.addRows( graph_serie );
    chart = new google.visualization.LineChart( document.getElementById( 'balance_chart_div' ) );
    options.title = "History";
    options.explorer = {};
    options.hAxis = { format: 'dd/MM HH:mm' };
    chart.draw( data, options );
  }
}


function page_proposition( page_name, name ){
// Focus on one proposition

  var proposition = Topic.find( name );
  if( !proposition )return [ _, "Proposition not found: " + name ];
  Session.current.proposition = proposition;
  var result = proposition.result;

  var is_tag = proposition.is_tag();
  var tag_label;
  var label;
  if( is_tag ){
    tag_label = proposition.label;
    label = tag_label.substring( 1 );
  }else{
    label = proposition.label;
    tag_label = "#" + label;
  }

  // Graph preparation
  var graph_pie = {
    agree: result.agree(),
    disagree: result.disagree(),
    protest: result.protest(),
    blank: result.blank()
  };
  var graph_serie = [ [ proposition.timestamp, 0 ] ];
  var balance = 0;

  // Make body
  var buf = [];

  buf.push( '<h1>' + (is_tag ? "Tag " : "" )
  + emoji( proposition.result.orientation() ) + proposition.label + '</h1><br><br>' );

  // Twitter tweet button, if proposition and no visitor (else use vote_menu())
  if( !is_tag && !Session.current.visitor ){
    buf.push( '<a href="https://twitter.com/intent/tweet?button_hashtag='
      + label
      + '&hashtags=kudocracy,vote,'
      + proposition.tags_string().replace( / /g, "," ).replace( /#/g, "")
      + '&text=new%20democracy" '
      + 'class="twitter-hashtag-button" '
      + 'data-related="Kudocracy,vote">Tweet ' + label + '</a>'
    );
  }

  // Summary
  buf.push( '<br><br>' + proposition_summary( result, "div" ) + '<br>' );

  if( is_tag ){
    buf.push( "<br>" + proposition.propositions().length + " "
      + link_to_page( "propositions", label, "propositions" ) + "<br>"
    )
  }

  // List of tags, with link to propositions
  var tmp = proposition.filter_string();
  buf.push( filter_label( tmp, "propositions" ) );

  // Source, since, age, last change...
  if( tmp = proposition.source() ){
    if( tmp.indexOf( "://" ) !== -1 ){
      tmp = '<a href="' + tmp + '">' + tmp + '</a>';
    }
    buf.push( "<br>source " + tmp );
  }
  buf.push( "<br>since " + time_label( proposition.timestamp ) );
  //buf.push( "<br>age " + duration_label( proposition.age() ) );
  buf.push( "<br>last change " + time_label( proposition.time_touched ) );

  // Last vote
  var votes_log = proposition.votes_log() || [];
  if( votes_log.length ){
    var last_vote_value = votes_log[ votes_log.length -1 ];
    buf.push( '<br>last vote ' + time_label( last_vote_value.snaptime ) );
    if( last_vote_value.entity.privacy() === "public" ){
      buf.push( ' <em>' + emojied( last_vote_value.entity.orientation() ) + '</em>' );
      buf.push( ' ' + link_to_page( "persona", last_vote_value.persona_label ) );
      if( last_vote_value.delegation !== Vote.direct ){
        buf.push( ' <dfn>(via '
          + link_to_page( last_vote_value.delegation.agent.label, "persona" )
          + ')</dfn>'
        );
      }
    }
  }

  // End in...
  buf.push( "<br>end in " + duration_label( proposition.expire() - vote.now() ) );

  // Vote menu
  if( Session.current.visitor ){
    var vote_entity = Vote.find( Session.current.visitor.name + "." + proposition.name );
    if( vote_entity ){
      buf.push( '<br><br>you: '
        + '<em>' + emojied( vote_entity.orientation() ) + "</em> "
        + "<dfn>(" + vote_entity.privacy() + ")</dfn>"
        + ( vote_entity.is_direct()
          ? ""
          :  "<dfn>(via " + link_to_page( "persona", vote_entity.delegation().agent.label ) + ")</dfn>" )
        + ", for " + duration_label( vote_entity.expire() - vote.now() )
      );
      buf.push( vote_menu( vote_entity, true /* with comment */ ) );
    }else{
      buf.push( vote_menu( Session.current.visitor, proposition ) );
    }
    buf.push( "<br>" );
  }

  // Graph, pie
  buf.push( '<div id="orientation_chart_div"></div>' );
  buf.push( '<div id="balance_chart_div"></div>' );

  // Votes
  var votes = proposition.votes_log() || [];
  buf.push( "<br><div><h2>Votes</h2><br>" );
  //buf.push( "<ol>" );
  votes.forEach( function( vote_value ){
    var was = null;
    if( vote_value.entity.updates.length > 1 ){
      was = vote_value.entity.updates[ vote_value.entity.updates.length - 1 ];
    }
    if( was ){ was = was.orientation; }
    if( was === "agree" ){
      balance--;
    }else if( was === "disagree" || was === "protest" ){
      balance++;
    }
    var now = vote_value.orientation;
    if( now === "agree" ){
      balance++;
    }else if( now === "disagree" || now === "protest" ){
      balance--;
    }
    graph_serie.push( [
      vote_value.snaptime,
      balance
    ] );
    if( vote_value.delegation          === Vote.direct
    && vote_value.privacy              === Vote.public
    && vote_value.orientation          !== Vote.neutral
    && !vote_value.entity.expired()
    && vote_value.entity.privacy()     === Vote.public
    && vote_value.entity.orientation() !== Vote.neutral
    && !vote.value.entity.persona.expired()
    ){
      buf.push( "<br>" );
      buf.push(
        '<em>' + emojied( vote_value.orientation ) + "</em> "
        + link_to_page( "persona", vote_value.persona_label )
        + " <small><dfn>" + time_label( vote_value.snaptime ) + "</dfn></small>"
      );
      if( vote_value.comment_text ){
        buf.push( ' ' + format_comment( vote_value.comment_text ) );
      }
      // buf.push( "</li>" );
    }
  });
  buf.push( "</div><br>" );

  // Footer
  buf.push( page_footer() );

  // Header
  var r = [
    page_style()
    + '<script type="text/javascript" src="https://www.google.com/jsapi"></script>'
    + '<script type="text/javascript">'
    //+ '\nvar proposition = ' + proposition.json_value()
    + '\nvar graph_pie = ' + JSON.stringify( graph_pie )
    + '\nvar graph_serie = ' + JSON.stringify( graph_serie )
    + '\n' + proposition_graphics + '; proposition_graphics();'
    + '</script>',
    [ page_header(
      _,
      link_to_twitter_filter( tag_label ),
      link_to_page( "propositions" )
    ) ]
  ];
  r[1] = r[1].concat( buf );
  return r;
}

/*
 *  The REPL Read Eval Print Loop commands of this Test/Debug UI
 */

var http_repl_commands = {};

function print_entities( list ){
  // Chronological order
  var sorted_list = list.sort( function( a, b ){
    var time_a = a.time_touched || a.timestamp;
    var time_b = b.time_touched || b.timestamp;
    var order = a - b;
    return order ? order : a.id - b.id;
  });
  sorted_list.forEach( function( entity ){
    printnl( "&" + entity.id + " " + entity
    + " " + pretty( entity.value() ) );
  });
}

var last_http_repl_id = null;

vote.extend( http_repl_commands, {

  cls: function(){ cls(); },
  noop: function(){},

  help: function(){
    var tmp = [
      "<h2>Help, syntax</h2>command parameter1 p2 p3...",
      "In parameters, &nnn is entity with specified id",
      "  & alone is last specified entity",
      "  +key:val adds entry in a hash object",
      "  +something adds entry in an array",
      "  [] and {} are empty tables/objects",
      "  , (comma) asks for a new table/object",
      "  true, false, _, null work as expected",
      "!xxx cmd p1 p2 p3 -- register as macro",
      "!xxx -- run previously registered macro",
      "! -- repeat previous macro",
      "<h2>Examples</h2>",
      link_to_command( "page visitor @jhr" ),
      "tagging & [] , +#tagX +#tagY  -- tagging with two lists",
      "delegation &40 +#tagX &23 +inactive:true",
      "<h2>Commands</h2>",
      link_to_command( "cls" ) + " -- clear screen",
      link_to_command( "page" ) + " -- list available pages",
      "page name p1 p2 ... -- move to said page",
      link_to_command( "noop" ) + " -- no operation, but show traces",
      link_to_command( "version" ) + " -- display version",
      link_to_command( "debug" ) + " -- switch to debug mode",
      link_to_command( "ndebug" ) + " -- switch to no debug mode",
      link_to_command( "dump" ) + " -- dump all entities",
      "dump type -- dump entities of specified type",
      link_to_command( "dump &" ) + "id -- dump specified entity",
      link_to_command( "value &" ) + "id -- display value of entity",
      link_to_command( "debugger &" ) + "id -- inspect entity in native debugger",
      link_to_command( "log &" ) + "id -- dump history about entity",
      link_to_command( "effects &" ) + "id -- dump effects of involed change",
      "login -- create user if needed and set current",
      "change_vote &id privacy orientation -- change existing vote",
      "change_proposition text #tag text #tag... -- change proposition",
      "delegate &id privacy duration -- change delegation"
    ];
    for( var v in replized_verbs ){
      tmp.push( v + " " + replized_verbs_help[ v ] );
    }
    print( tmp.join( "\n" ) );
  },

  page: page,

  debug: function(){ de = true; vote.debug_mode( true ); },
  ndebug: function(){ de = false; vote.debug_mode( false ); },

  dump: function( entity ){
    if( arguments.length ){
      if( entity.is_entity ){
        vote.dump_entity( entity, 2 );
      }else{
        var type = " " + entity.toLowerCase();
        var names = " change expiration persona source topic tagging tweet"
        + " vote result transition delegation membership visitor action ";
        var idx = names.indexOf( type );
        if( idx === -1  ){
          printnl( "Valid types:" + names );
        }else{
          var sep = names.substring( idx + 1 ).indexOf( " " );
          var found = names.substring( idx + 1, idx + sep + 1 );
          found = found[ 0 ].toUpperCase() + found.substring( 1 );
          printnl( "dump " + found );
          var entities = vote[ found ].all;
          var list = [];
          for( var item in entities ){
            list.push( entities[ item ] );
          }
          if( !list.length ){
            vote.AllEntities.forEach( function( item ){
              if( item && item.type === found ){
                list.push( item );
              }
            })
          }
          print_entities( list );
        }
      }
    }else{
      vote.dump_entities();
    }
  },

  log: function( entity ){
    if( entity.effect ){
      entity = entity.effect;
    }else if( entity.to ){
      entity = entity.to;
    }
    var all = vote.AllEntities;
    var list = [];
    all.forEach( function( e ){
      if( e === entity
      || (e && e.to === entity)
      || (e && e.effect === entity)
      ){
        list.push( e );
      }
    } );
    print( "Log " + entity );
    print_entities( list );
  },

  effects: function( entity ){
    var change = entity.change || entity;
    var list = [ change ];
    var cur = change.to;
    while( cur ){
      list.push( cur );
      cur = cur.next_effect;
    }
    print( "Effects " + entity );
    print_entities( list );
  },

  value: function( entity ){
    printnl( entity ? pretty( entity.value(), 3 ) : "no entity" );
  },

  change_vote: function( vote_entity, privacy, orientation, duration, comment ){

    // ToDo: move this into some page_xxx()
    redirect_back();

    // Figure out parameters, maybe from pending http query
    var proposition = null;
    var query = PendingResponse.query;

    // Find vote
    var vote_id = query.vote_id;
    if( !vote_entity ){
      if( !vote_id ){
        printnl( "Vote not found" );
        return;
      };
      vote_entity = Vote.find( vote_id );
    }

    // Figure out parameters, maybe from pending http query
    var proposition = null;
    var query = PendingResponse.query;

    // Parse privacy
    privacy = privacy || query.privacy;
    if( Array.isArray( privacy ) ){
      privacy = privacy[0];
    }
    if( !privacy
    ||   privacy === "idem"
    ||   privacy === "privacy"
    ||   privacy === ( vote_entity && vote_entity.privacy() )
    || " public secret private ".indexOf( " " + privacy + " " ) === -1
    ){
      privacy = _;
    }

    // Parse orientation
    orientation = orientation || query.orientation;
    if( Array.isArray( orientation ) ){
      orientation = orientation[0];
    }
    if( !orientation
    ||   orientation === "idem"
    ||   orientation === "orientation"
    ||   orientation === ( vote_entity && vote_entity.orientation() )
    || " agree disagree protest blank neutral ".indexOf( " " + orientation + " " ) === -1
    ){
      orientation = _;
    }

    // Parse duration
    duration = duration || query.duration;
    if( Array.isArray( duration ) ){
      duration = duration[0];
    }
    if( !duration
    ||   duration === "idem"
    ||   duration === "duration"
    ){
      duration = _;
    }else if( typeof duration === "string" ){
      duration = ({
        "one year":  vote.ONE_YEAR,
        "one month": vote.ONE_MONTH,
        "one week":  vote.ONE_WEEK,
        "24 hours":  vote.ONE_DAY,
        "one hour":  vote.ONE_HOUR
      })[ duration ]
    }
    if( !duration ){ duration = _; }

    // Parse comment
    comment = comment || query.comment;
    if( Array.isArray( comment ) ){
      comment = comment[0];
    }
    if( !comment
    ||   comment === "idem"
    ||   comment === "comment"
    ||   comment === ( vote_entity && vote_entity.comment() && vote_entity.comment().text )
    ){
      comment = _;
    }

    // Something changed?
    if( !privacy && !orientation && !duration &!comment ){
      printnl( "No change" );
      return;
    }

    // Either a brand new vote
    if( !vote_entity ){
      var idx_dot = vote_id.indexOf( "." )
      var persona = Persona.find( vote_id.substring( 0, idx_dot ) );
      if( !persona || persona.type !== "Persona" ){
        printnl( "Persona not found" );
        return;
      }
      proposition = Topic.find( vote_id.substring( idx_dot + 1 ) );
      if( proposition && proposition.type !== "Topic" ){
        printnl( "Proposition not found" );
        return;
      }
      Session.current.proposition = proposition;
      Ephemeral.inject( "Vote", {
        persona:     persona,
        proposition: proposition,
        privacy:     ( privacy || _ ),
        orientation: ( orientation || _ ),
        duration:    duration
      });
      printnl( "New vote of " + persona + " on " + proposition );
      //redirect( "proposition%20" + proposition.label );

    // Or a change to an existing vote
    }else{
      if( privacy || duration || orientation ){
        // Adjust duration to make a renew
        if( duration ){
          duration += vote_entity.age();
        }
        Ephemeral.inject( "Vote", {
          id_key:      vote_entity.id,
          privacy:     ( privacy || _ ),
          orientation: ( orientation || _ ),
          duration:    duration
        });
        printnl( "Changed vote " + pretty( vote_entity ) );
      }
      if( comment ){
        Ephemeral.inject( "Comment", {
          vote: vote_entity,
          text: comment
        });
        printnl( "Comment changed " + pretty( vote_entity ) );
      }
    }
    return;
  },

  change_delegation: function( delegation_entity, privacy, duration ){
    // ToDo: move this into some page_xxx()
    redirect_back();
    var query = PendingResponse.query;

    // Parse privacy
    privacy = privacy || query.privacy;
    if( privacy === "idem"
    ||  privacy === "privacy"
    ){
      privacy = null;
    }
    if( privacy
    && " public secret private ".indexOf( " " + privacy + " " ) === -1
    ){
      privacy = null;
    }
    if( !privacy ){ privacy = _; }

    // Parse duration
    duration = duration || query.duration;
    if( duration === "idem"
    || duration === "duration"
    ){
      duration = null;
    }
    if( duration ){
      if( typeof duration === "string" ){
        duration = ({
          "one year":  vote.ONE_YEAR,
          "one month": vote.ONE_MONTH,
          "one week":  vote.ONE_WEEK,
          "24 hours":  vote.ONE_DAY,
          "one hour":  vote.ONE_HOUR
        })[ duration ]
      }
    }
    if( !duration ){ duration = _; }

    // Something changed?
    if( !privacy && !duration ){
      printnl( "No change" );
      return;
    }

    // Adjust duration to make a renew
    if( duration ){
      duration += delegation_entity.age();
    }
    Ephemeral.inject( "Delegation", {
      id_key:      delegation_entity.id,
      privacy:     privacy,
      duration:    duration
    });
    printnl( "Changed delegation " + pretty( delegation_entity ) );

    return;
  },

  login: function( name ){
    name = name.trim().replace( /[^A-Za-z0-9_]/g, "" );
    if( name[0] !== "@" ){ name = "@" + name };
    if( name.length < 4 )return redirect( "login" );
    var lower_name = name.toLowerCase();
    // Create persona if first visit, respect user provided case
    if( !( Session.current.visitor = Persona.find( lower_name ) ) ){
      Ephemeral.inject( "Persona", { label: name } );
      Session.current.visitor = Persona.find( lower_name );
    }
    Session.current.filter = "";
    if( Session.current.previous_page[0] === "proposition" ){
      Session.current.current_page = Session.current.previous_page;
      redirect_back();
    }else if( Session.current.previous_page[0] === "propositions" ){
      Session.current.current_page = Session.current.previous_page;
      redirect_back();
    }else{
      redirect( "visitor" );
    }
  },


  change_proposition: function(){
    redirect_back();
    // Sanitize, extract tags, turn whole text into valid potential tag itself
    var text = Array.prototype.slice.call( arguments ).join( " " );

    // Could be a search, a delegate or a propose coming from page_propositions
    if( text.toLowerCase().indexOf( "propose " ) === 0 ){
      text = text.substring( "propose ".length );

    // Search
    }else if( text.toLowerCase().indexOf( "search" ) === 0 ){
      text = text.substring( "search".length );
      Session.current.set_filter( text || "all" );
      return;

    // Delegate
    }else if( text.toLowerCase().indexOf( "delegate" ) === 0 ){
      text = text.substring( "delegate".length );
      if( !Session.current.visitor ){
        return;
      }
      if( !Session.current.has_filter() ){
        return;
      }
      var agent_name = text
      .replace( /#[A-Za-z][_0-9A-Za-z]*/g, "" )
      .replace( /[^A-Za-z0-9_]/g, "" );
      if( !agent_name ){
        return;
      }
      var agent = Persona.find( "@" + agent_name );
      if( !agent ){
        return;
      }
      text = text.replace( agent_name, "" ).trim();
      if( text.length ){
        Session.current.set_filter( text );
      }
      if( !Session.current.filter_tags.length ){
        return;
      }
      Ephemeral.inject( "Delegation", {
        persona: Session.current.visitor,
        agent:   agent,
        tags:    Session.current.filter_tags
      });
    }

    // Propose

    // Collect list of tags, inject user's name as first tag
    var tags = [ "#"
      + ( Session.current.visitor && Session.current.visitor.label || "@anonymous" )
      .substring( 1 )
    ];
    text = text.replace( /#[A-Za-z][_0-9A-Za-z]*/g, function( tag ){
      // if( tag === "tag")return "";
      tags.push( tag );
      return ""
    } );

    // If not tags at all but some space, assume list of tags
    if( tags.length === 1 && text.indexOf( " " ) !== -1 ){
      text = text.replace( /[A-Za-z][_0-9A-Za-z]*/g, function( tag ){
        // if( tag === "tag")return "";
        tags.push( tag );
        return ""
      } );
    }

    // Tags were removed, process invalid characters
    text
    .replace( /  /g, " " ).trim()  // extra spaces
    .replace( /[^A-Za-z0-9_]/g, "_" ) // _ where non alphanum
    .replace( /__/g, "_" ) // remove extra _
    .replace( /^_/, "" )
    .replace( /_$/, "" );

    // if nothing remains, use first tag to name the proposition
    if( text.length < 2 ){
      if( ( text = tags[0] ).length < 2 ){
        printnl( "Not a valid proposition name" );
        return;
      }
      // Remove first # unless coming from the tags page
      if( !Session.current.current_page[0] === "tags" ){
        text = text.substring( 1 );
      }
    }

    var changes = [];
    var tag_entities = [];
    tags.forEach( function( tag ){
      if( tag.length < 3 )return;
      var entity = Topic.find( tag );
      if( entity ){
        tag_entities.push( entity );
      }else{
        // Filter out reserved tags
        if( Topic.reserved( tag ) )return;
        changes.push( function(){
          Ephemeral.inject( "Topic", { label: tag } );
        });
        changes.push( function(){
          tag_entities.push( Topic.find( tag ) );
        })
      }
    });

    // Creation of topic or update with addition of tags
    var proposition = Topic.find( text );
    if( !proposition ){
      changes.push( function(){
        Ephemeral.inject( "Topic", { label: text, tags: tag_entities } );
      } );
    }else{
      changes.push( function(){
        Ephemeral.inject( "Tagging", { proposition: proposition, tags: tag_entities } );
      });
    }

    // Process change. ToDo: async
    Ephemeral.inject( changes );

    // Update filter to match topic
    Session.current.proposition = proposition || Topic.find( text );
    var new_filter = [];
    tag_entities.forEach( function( tag_entity, index ){
      // Skip user name
      if( index === 0 )return;
      new_filter.push( tag_entity.label );
    });
    Session.current.set_filter( new_filter.join( " " ) );
  },

  debugger: function( e, e2, e3, e4 ){
    var p  = pretty( e , 2 );
    var p2 = pretty( e2, 2 );
    var p3 = pretty( e3, 2 );
    var p4 = pretty( e4, 2 );
    var v  = value( e , 100 );
    var v2 = value( e2, 100 );
    var v3 = value( e3, 100 );
    var v4 = value( e4, 100 );
    debugger;
  },

  version: function(){ printnl( "Kudocracy Version: " + vote.version ); }
} );

var http_repl_macros = {};
var last_http_repl_macro = "help";
var http_repl_history = [];

function start_http_repl(){
  var port = process.env.PORT || "8080";
  http.createServer( HttpQueue.put.bind( HttpQueue ) ).listen( port );
  l8.task( function(){ this
    .step( function(){ trace( "Web test UI is running on port " + port ); })
    .repeat( function(){ this
      .step( function(){ input( "" ); } )
      .step( function( r ){
        printnl( link_to_command( r ) );
        var input = r;
        // Handle !macros
        if( input[0] === "!" ){
          var idx_space = input.indexOf( " " );
          // !macro -- run it
          if( idx_space === -1 ){
            if( input === "!" ){
              input = last_http_repl_macro;
            }else{
              input = http_repl_macros[ input ];
            }
            if( !input ){ input = "help"; }
            last_http_repl_macro = input;
          }else{
            http_repl_macros[ input.substring( 0, idx_space - 1 ) ]
            = input.substring( idx_space + 1 );
            input = input.substring( idx_space + 1 );
          }
        }
        try{
          // Parse command line, space delimits tokens
          var tokens = input.split( " " );
          // First token is command name
          var cmd = tokens[0];
          // Other tokens describe the arguments
          var args = tokens.slice( 1 );
          var args2 = [];
          var obj = null;
          args.forEach( function( v, idx ){
            var front = v[0];
            var need_push = false;
            // +something means something is added to an array or an object
            if( front === "+" ){
              need_push = true;
              v = v.substring( 1 );
            }else{
              obj = null;
            }
            var sep = v.indexOf( ":" );
            var key = ( sep === -1 ) && v.substring( 0, sep - 1 );
            var val = ( sep === -1 ) && v.substring( sep + 1 );
            if( val === "true"  ){ val = true; }
            if( val === "false" ){ val = false; }
            if( val === "_"     ){ val = _; }
            if( val === "null"  ){ val = null; }
            // &something is the id of an entity, & alone is last id
            if( front === "&" ){
              var id;
              if( v.length === 1 ){
                id = last_http_repl_id;
              }else{
                id = v.substring( 1 );
                if( parseInt( id ) ){
                  id = parseInt( id );
                }
                if( id < 10000 ){
                  id += 10000;
                }
                last_http_repl_id = id;
              }
              v = vote.AllEntities[ id ];
            }
            // Handle +
            if( need_push ){
              // If neither [] nor {} so far, start it
              if( !obj ){
                // start with { n: v } when +something:something is found
                if( key ){
                  obj = {};
                  obj[ key ] = val;
                  v = obj;
                // start with [ v ] if no : was found
                }else{
                  v = obj = [ v ];
                }
              // If previous [] or {}
              }else{
                if( !key ){
                  obj.push( v )
                }else{
                  obj[ key ] = val;
                }
                v = null;
              }
            }
            // If [] or {} then add to that new object from now on
            if( v === "[]" ){
              v = obj = [];
            }else if( v === "{}" ){
              v = obj = {};
            }else if( v === "," ){
              v = obj = null;
            }
            if( v ){ args2.push( v ) }
          });
          var code = http_repl_commands[ cmd ];
          if( code ){
            code.apply( cmd, args2 );
            http_repl_history.unshift( r );
          }else{
            printnl( "Enter 'help'" );
          }
        }catch( err ){
          printnl( "Error " + err );
          trace( "Http REPL error: ", err, err.stack );
        }
      });
    })
  });
}


function main(){

  trace( "Welcome to l8/test/vote.js -- Liquid demo...cracy" );

  //Ephemeral.force_bootstrap = true;
  vote.debug_mode( de = true );
  Ephemeral.start( bootstrap, function( err ){
    if( err ){
      trace( "Cannot proceed", err, err.stack );
      //process.exit( 1 );
      return;
    }
    // Let's provide a frontend...
    trace( "READY!" );
    start_http_repl();
  } );
}

// Hack to get sync traces && http REPL outputs
if( true || de ){
  var fs = require('fs');
  var old = process.stdout.write;

  process.stdout.write = function (d) {
    de && fs.appendFileSync( "./trace.out", d);
    print( d );
    return old.apply(this, arguments);
  }
}

l8.begin.step( main ).end;
//l8.countdown( 200 );
{"t":"Version","p":{"label":"1","id":10000,"ts":1401374801375},"last_effect":null}
{"t":"Persona","p":{"label":"@kudocracy","id":10001,"ts":1401374801375}}
{"t":"Persona","p":{"label":"@jhr","id":10001,"ts":1401374801375}}
{"t":"Persona","p":{"label":"@john","id":10001,"ts":1401374801375}}
{"t":"Persona","p":{"label":"@luke","id":10001,"ts":1401374801375}}
{"t":"Persona","p":{"label":"@marc","id":10001,"ts":1401374801375}}
{"t":"Persona","p":{"label":"@peter","id":10001,"ts":1401374801375}}
{"t":"Persona","p":{"label":"@n_hulot","id":10001,"ts":1401374801375}}
{"t":"Persona","p":{"label":"Hulot_friends","role":"group","id":10001,"ts":1401374801375}}
{"t":"Membership","p":{"$member":"@jhr","$group":"hulot_friends","id":10001,"ts":1401374801375}}
{"t":"Membership","p":{"$member":"@jhr","$group":"hulot_friends","inactive":true,"id":10002,"ts":1401374801375}}
{"t":"Membership","p":{"$member":"@jhr","$group":"hulot_friends","id":10003,"ts":1401374801375}}
{"t":"Topic","p":{"label":"#kudocracy","id":10004,"ts":1401374801375}}
{"t":"Topic","p":{"label":"#president","id":10005,"ts":1401374801375}}
{"t":"Topic","p":{"label":"kudocracy","source":"bootstrap","tags":[],"id":10006,"ts":1401374801375}}
{"t":"Topic","p":{"label":"hollande_president","source":"bootstrap","tags":[{"$":"#president"}],"id":10007,"ts":1401374801375}}
{"t":"Topic","p":{"label":"hulot_president","source":"bootstrap","tags":[{"$":"#president"}],"id":10008,"ts":1401374801375}}
{"t":"Delegation","p":{"$persona":"@jhr","tags":[{"$":"#president"}],"$agent":"@n_hulot","id":10009,"ts":1401374801375}}
{"t":"Vote","p":{"$persona":"@peter","$proposition":"hulot_president","orientation":"disagree","id":10010,"ts":1401374801375}}
{"t":"Vote","p":{"$persona":"@peter","$proposition":"hulot_president","orientation":"agree","id":10011,"ts":1401374801375}}
{"t":"Vote","p":{"$persona":"@peter","$proposition":"hulot_president","orientation":"blank","id":10012,"ts":1401374801375}}
{"t":"Vote","p":{"$persona":"@peter","$proposition":"hulot_president","orientation":"protest","id":10013,"ts":1401374801375}}
{"t":"Vote","p":{"$persona":"@peter","$proposition":"hulot_president","orientation":"neutral","id":10014,"ts":1401374801375}}
{"t":"Vote","p":{"$persona":"@n_hulot","$proposition":"hulot_president","orientation":"agree","id":10015,"ts":1401374801375}}
{"t":"Vote","p":{"$persona":"@n_hulot","$proposition":"hulot_president","orientation":"neutral","id":10016,"ts":1401374801375}}
{"t":"Vote","p":{"$persona":"@n_hulot","$proposition":"hulot_president","orientation":"agree","id":10017,"ts":1401374801375}}
{"t":"Vote","p":{"$persona":"@jhr","$proposition":"hulot_president","orientation":"disagree","id":10018,"ts":1401374801375}}
{"t":"Vote","p":{"$persona":"@n_hulot","$proposition":"hulot_president","orientation":"blank","id":10019,"ts":1401374801375}}
{"t":"Vote","p":{"$persona":"@jhr","$proposition":"hulot_president","orientation":"neutral","id":10020,"ts":1401374801375}}
{"t":"Tagging","p":{"$proposition":"hulot_president","detags":["#president"],"tags":[],"id":10020,"ts":1401374801375}}
{"t":"Tagging","p":{"$proposition":"hulot_president","detags":[],"tags":["#president"],"id":10021,"ts":1401374801375}}
{"t":"Vote","p":{"$persona":"@n_hulot","$proposition":"hulot_president","orientation":"agree","id":10022,"ts":1401374801375}}
{"t":"Vote","p":{"$persona":"@peter","$proposition":"hulot_president","orientation":"neutral","id":10023,"ts":1401374801375}}
{"t":"Vote","p":{"$persona":"@n_hulot","$proposition":"hulot_president","orientation":"disagree","id":10023,"ts":1401374801375}}
{"t":"Vote","p":{"$persona":"@peter","$proposition":"hulot_president","orientation":"agree","id":10024,"ts":1401374801375}}
{"t":"Version","p":{"label":"1","id":10043,"ts":1401379239109},"last_effect":null}
{"t":"Delegation","p":{"$persona":"@jhr","$agent":"@n_hulot","tags":[{"$":"#president"}],"id":10044,"ts":1401379239109}}
{"t":"Topic","p":{"label":"#jhr","id":10044,"ts":1401379239109}}
{"t":"Topic","p":{"label":"n_hulot","tags":[{"$":"#president"},{"$":"#jhr"}],"id":10045,"ts":1401379239109}}
{"t":"Topic","p":{"label":"#bar","id":10046,"ts":1401379362740}}
{"t":"Topic","p":{"label":"Cyrnea_is_the_best","tags":[{"$":"#jhr"},{"$":"#bar"}],"id":10047,"ts":1401379362740}}
{"t":"Topic","p":{"label":"#best","id":10048,"ts":1401379402156}}
{"t":"Topic","p":{"label":"Rex_is_the_best","tags":[{"$":"#jhr"},{"$":"#bar"},{"$":"#best"}],"id":10049,"ts":1401379402156}}
{"t":"Tagging","p":{"$proposition":"cyrnea_is_the_best","tags":[{"$":"#jhr"},{"$":"#best"},{"$":"#bar"}],"id":10050,"ts":1401379423268}}
{"t":"Topic","p":{"label":"#cool","id":10051,"ts":1401379432387}}
{"t":"Topic","p":{"label":"chloe_is_the_best","tags":[{"$":"#jhr"},{"$":"#best"},{"$":"#cool"}],"id":10052,"ts":1401379432387}}
{"t":"Topic","p":{"label":"JanekIsTheBest","tags":[{"$":"#jhr"},{"$":"#best"},{"$":"#cool"}],"id":10053,"ts":1401379442883}}
{"t":"Version","p":{"label":"1","id":10081,"ts":1401379795695},"last_effect":null}
{"t":"Delegation","p":{"$persona":"@jhr","$agent":"@n_hulot","tags":[{"$":"#best"}],"id":10082,"ts":1401379795695}}
{"t":"Topic","p":{"label":"__n_hulot","tags":[{"$":"#jhr"},{"$":"#best"}],"id":10082,"ts":1401379795695}}
{"t":"Delegation","p":{"$persona":"@jhr","$agent":"@n_hulot","tags":[{"$":"#best"}],"id":10083,"ts":1401379855406}}
{"t":"Tagging","p":{"$proposition":"__n_hulot","tags":[{"$":"#jhr"},{"$":"#best"}],"id":10083,"ts":1401379855406}}
{"t":"Version","p":{"label":"1","id":10112,"ts":1401381930712},"last_effect":null}
{"t":"Delegation","p":{"$persona":"@jhr","$agent":"@n_hulot","tags":[{"$":"#president"}],"id":10113,"ts":1401381930712}}
{"t":"Tagging","p":{"$proposition":"n_hulot","tags":[{"$":"#jhr"},{"$":"#president"}],"id":10114,"ts":1401381930712}}
{"t":"Version","p":{"label":"1","id":10144,"ts":1401382603313},"last_effect":null}
{"t":"Delegation","p":{"$persona":"@jhr","$agent":"@n_hulot","tags":[{"$":"#president"}],"id":10145,"ts":1401382603313}}
{"t":"Tagging","p":{"$proposition":"#jhr","tags":[{"$":"#jhr"},{"$":"#president"}],"id":10145,"ts":1401382603313}}
{"t":"Version","p":{"label":"1","id":10175,"ts":1401382949878},"last_effect":null}
{"t":"Delegation","p":{"$persona":"@jhr","$agent":"@n_hulot","tags":[{"$":"#president"}],"id":10176,"ts":1401382949878}}
{"t":"Tagging","p":{"$proposition":"#jhr","tags":[{"$":"#jhr"},{"$":"#president"}],"id":10176,"ts":1401382949878}}
{"t":"Delegation","p":{"$persona":"@jhr","$agent":"@n_hulot","tags":[{"$":"#president"}],"id":10177,"ts":1401383074143}}
{"t":"Tagging","p":{"$proposition":"#jhr","tags":[{"$":"#jhr"},{"$":"#president"}],"id":10177,"ts":1401383074143}}
{"t":"Version","p":{"label":"1","id":10207,"ts":1401387063570},"last_effect":null}
{"t":"Vote","p":{"$persona":"@jhr","$proposition":"kudocracy","orientation":"agree","id":10208,"ts":1401387063570}}
{"t":"Vote","p":{"$persona":"@jhr","$proposition":"hollande_president","orientation":"disagree","id":10209,"ts":1401387078870}}
{"t":"Vote","p":{"$persona":"@jhr","$proposition":"n_hulot","orientation":"agree","id":10210,"ts":1401387085538}}
{"t":"Vote","p":{"$persona":"@jhr","$proposition":"cyrnea_is_the_best","orientation":"agree","id":10211,"ts":1401387092817}}
{"t":"Vote","p":{"$persona":"@jhr","$proposition":"chloe_is_the_best","orientation":"agree","id":10212,"ts":1401387102490}}
{"t":"Vote","p":{"$persona":"@jhr","$proposition":"janekisthebest","orientation":"agree","id":10213,"ts":1401387105761}}
{"t":"Vote","p":{"$persona":"@jhr","$proposition":"rex_is_the_best","orientation":"disagree","id":10214,"ts":1401387122816}}
{"t":"Vote","p":{"$persona":"@jhr","$proposition":"__n_hulot","orientation":"protest","id":10215,"ts":1401387166780}}
{"t":"Version","p":{"label":"1","id":10253,"ts":1401405268132},"last_effect":null}
{"t":"Vote","p":{"$persona":"@jhr","$proposition":"n_hulot","orientation":"blank","id":10254,"ts":1401405268132}}
{"t":"Version","p":{"label":"1","id":10293,"ts":1401411062335},"last_effect":null}
{"t":"Persona","p":{"label":"@jvincent","id":10294,"ts":1401411062335}}
{"t":"Vote","p":{"$persona":"@jvincent","$proposition":"n_hulot","orientation":"agree","id":10294,"ts":1401411095372}}
{"t":"Vote","p":{"$persona":"@jvincent","$proposition":"hulot_president","orientation":"blank","id":10294,"ts":1401411103419}}
{"t":"Vote","p":{"$persona":"@jvincent","$proposition":"kudocracy","orientation":"agree","id":10295,"ts":1401411107092}}
{"t":"Vote","p":{"$persona":"@jvincent","$proposition":"hollande_president","orientation":"disagree","id":10295,"ts":1401411110542}}
{"t":"Vote","p":{"$persona":"@jvincent","$proposition":"cyrnea_is_the_best","orientation":"blank","id":10295,"ts":1401411114467}}
{"t":"Vote","p":{"$persona":"@jvincent","$proposition":"chloe_is_the_best","orientation":"blank","id":10296,"ts":1401411120484}}
{"t":"Vote","p":{"$persona":"@jvincent","$proposition":"janekisthebest","orientation":"blank","id":10297,"ts":1401411125715}}
{"t":"Vote","p":{"$persona":"@jvincent","$proposition":"chloe_is_the_best","orientation":"blank","id":10298,"ts":1401411134723}}
{"t":"Vote","p":{"$persona":"@jvincent","$proposition":"__n_hulot","orientation":"protest","id":10298,"ts":1401411142555}}
{"t":"Vote","p":{"$persona":"@jvincent","$proposition":"hulot_president","orientation":"agree","id":10298,"ts":1401411429697}}
{"t":"Version","p":{"label":"1","id":10339,"ts":1401445419406},"last_effect":null}
{"t":"Version","p":{"label":"1","id":10380,"ts":1401445763016},"last_effect":null}
{"t":"Version","p":{"label":"1","id":10421,"ts":1401445974198},"last_effect":null}
{"t":"Version","p":{"label":"1","id":10462,"ts":1401446041782},"last_effect":null}
{"t":"Version","p":{"label":"1","id":10503,"ts":1401446163566},"last_effect":null}
{"t":"Version","p":{"label":"1","id":10544,"ts":1401446231253},"last_effect":null}
{"t":"Version","p":{"label":"1","id":10585,"ts":1401446542874},"last_effect":null}
{"t":"Version","p":{"label":"1","id":10626,"ts":1401446653895},"last_effect":null}
{"t":"Delegation","p":{"id_key":"@jhr.@n_hulot.#president","privacy":"secret","id":10627,"ts":1401446653895}}
{"t":"Delegation","p":{"id_key":"@jhr.@n_hulot.#president","privacy":"public","id":10627,"ts":1401446677960}}
{"t":"Version","p":{"label":"1","id":10668,"ts":1401468184689},"last_effect":null}
{"t":"Persona","p":{"label":"@LucasRobert","id":10669,"ts":1401468184689}}
{"t":"Version","p":{"label":"1","id":10710,"ts":1401483941159},"last_effect":null}
{"t":"Vote","p":{"$persona":"@jhr","$proposition":"cyrnea_is_the_best","id":10711,"ts":1401483941159}}
{"t":"Version","p":{"label":"1","id":10752,"ts":1401484891757},"last_effect":null}
{"t":"Comment","p":{"$vote":"@jhr.cyrnea_is_the_best","text":"C'est le bar le plus sympa de Corté !","id":10753,"ts":1401484891757}}
{"t":"Version","p":{"label":"1","id":10794,"ts":1401498556365},"last_effect":null}
{"t":"Vote","p":{"$persona":"@jhr","$proposition":"#jhr","orientation":"agree","id":10795,"ts":1401498556365}}
{"t":"Vote","p":{"id_key":"@jhr.#jhr","orientation":"disagree","id":10796,"ts":1401498585145}}
{"t":"Version","p":{"label":"1","id":10839,"ts":1401499305901},"last_effect":null}
{"t":"Vote","p":{"$persona":"@jhr","$proposition":"#best","orientation":"agree","id":10840,"ts":1401499305901}}
{"t":"Vote","p":{"$persona":"@jhr","$proposition":"#president","orientation":"agree","id":10841,"ts":1401499333421}}
{"t":"Vote","p":{"$persona":"@jhr","$proposition":"#bar","orientation":"agree","id":10842,"ts":1401499381189}}
{"t":"Vote","p":{"$persona":"@jhr","$proposition":"#cool","orientation":"agree","id":10843,"ts":1401499388941}}
{"t":"Vote","p":{"$persona":"@jhr","$proposition":"#kudocracy","orientation":"agree","id":10844,"ts":1401499393741}}
{"t":"Vote","p":{"id_key":"@jhr.#jhr","orientation":"agree","id":10845,"ts":1401499452072}}
{"t":"Comment","p":{"$vote":"@jhr.#jhr","text":"It's me!","id":10846,"ts":1401499452072}}
{"t":"Vote","p":{"id_key":"@jhr.#kudocracy","orientation":"blank","id":10847,"ts":1401499531479}}
{"t":"Comment","p":{"$vote":"@jhr.#kudocracy","text":"It's me!","id":10848,"ts":1401499531479}}
{"t":"Vote","p":{"id_key":"@jhr.#kudocracy","orientation":"agree","id":10849,"ts":1401499635839}}
{"t":"Comment","p":{"$vote":"@jhr.#kudocracy","text":" ","id":10850,"ts":1401499722520}}

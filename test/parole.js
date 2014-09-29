// test/parole.js
//   Run it on jsFiddle: http://jsfiddle.net/jhrobert/F52a9/
// 13/04/24 by JHR
// 14/01/04 by JHR

// This code can run locally or inside jsfiddle.net
var html = typeof document !== "undefined";

// In jsfiddle, whisper.js is included by the HTML page & defines Parole
var P = html ? Parole : require("l8/lib/whisper.js");


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

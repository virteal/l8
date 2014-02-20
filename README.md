l8 0.2.10
=========

[![Build Status](https://travis-ci.org/JeanHuguesRobert/l8.png)](https://travis-ci.org/JeanHuguesRobert/l8)

l8 is a pthread/erlang inspired multi-tasker for javascript. It schedules javascript tasks using promises and distributed actors. Such tasks can run browser side and server side.

This is a work in progress that is not ready for production yet.
See [![Build Status](https://c9.io/site/wp-content/themes/cloud9/img/logo_cloud9_small.png)](https://c9.io/jhr/l8)

[npm](https://npmjs.org/package/l8)
```
npm install l8
cd node_modules/l8; npm test
```

Introduction
============

It is well known that JavaScript is mono-threaded. The closest concept to multi-threading is the ECMA 6 proposal for generator functions, a special purpose type of co-routines. Platform specific extensions exists (fiber, NodeJX task, ...) as well as transpilers. These solutions have drawbacks known for years and there is no clear path of evolution on sight.

Until recently JavaScript applications were simple and synchronisation issues could be dealt with in some adhoc manner reasonnably. This is less and less the case. As a result a new class of problems appears. Starting with the infamous "Callback Hell" problem.

Fortunately, two low level mechanisms emerged in recent years. l8 builds on top of these mechanisms to provide the higher level mechanisms available using other languages. These two mechanisms are the nodejs introduced standard signature for callbacks, f( err, ...result ), and the Promise object recently endorsed by ECMA 6 and already available as a shim.


l8 Boxon
========

Boxon (lib/boxon.js) is a tiny 200 LOC helper that removes some of the mess with callbacks and promises. It provides an indirect callback object that makes it possible to delay the installation of the actual callback if so desired. That object is also a "thenable" and can be conveniently turned into a Promise by most existing promise librairies including the ECMA 6 one.

"Boxons as better callbacks" use case
-------------------------------------
```
var read = Boxon(); fs.readFile( "read.txt", "utf8", read );
// ... somewhere else, in some distant future maybe ...
read( function( err, data ){ ... } );
```

"promise outcome retrieval, nodejs style"
-----------------------------------------
```
var read = Boxon.cast( read_promise );
read( function( err, data ){ ... } );
```

"outcome as data" use case
--------------------------
```
var read = Boxon( ... );
... somewhere else, after outcome was delivered ..
try{
  var content = read();
  ...
}catch( err ){
  // oops, some read error
}
```

Please find more documentation in [the wiki](../../wiki/AboutBoxons)


l8 Water
========
Water (lib/water.js) is a reactive programming independant subset of l8 related to computed values automatically refreshed when changes occur on the values they depend on. This is like cells in a spreadsheet.

Example
-------
```
var a = Water(), b = Water(), c = Water();
c( function(){ return a(Water) && b(Water) && a() + b(); }
var track = Water( function( v ){ console.log( "c: " + v ); } );
c( track );
a( 2 );
b( 5 ); // => outputs 7 on console
a( 1 ); // => outputs 6
```

l8 Water manages recursive dependencies, asynchronous refresh, lazy values and interop with boxons and promises.

Please find more documentation in [the wiki](../../wiki/AboutWater)


l8 Paroles
==========

Parole (lib/whisper.js) is another independant subset of l8 tailored to provide some of the most convenient features of l8 using the node.js callback convention.

Paroles, among other things, are a solution to the promises vs callbacks tension. If you want a node.js callback style function to fulfill a promise, simply use a parole where the function requires a callback, ie paroles are callbacks in promise disguise.

"Paroles as promise fulfiller callbacks" use case
-------------------------------------------------

```
var read = Parole(); fs.readFile( "test.txt", "utf8", read );
read.then(
  function( content ){ console.log( "content: " + content; },
  function( error   ){ console.log( "error: "   + error;   }
);
```

"Paroles as callbacks" use case
-------------------------------

```
var timeout = Parole(); setTimeout( timeout, 1000 );
timeout.on( function(){ console.log( "timeout !" ); }
```

"Paroles as pub/sub" use case
-----------------------------

```
var publish = Parole();
publish.subscribe( function( msg ){ console.log( "sub1 receives " + msg ); }
publish.subscribe( function( msg ){ console.log( "sub2 receives " + msg ); }
publish( "Hello world!" );
```

"Multiple steps promises" use case
----------------------------------

```
var cf = Parole( function(){
  fs.readFile( "config.txt", "utf8", this );
}).will( function( err, content ){
  if( err ) return this( null, err );
  fs.readFile( content, "utf8", this.partial( content ) );
}).will( function( content1, err, content2 ){
  this.resolve( err ? "default" : content1 + content2 );
});
cf.then( function( content ){ console.log( "config: " + content; } );
```

"Paroles as pipes" use case
---------------------------

```
function transform1( input, callback ){ callback( "*" + input + "*" ); }
function transform2( input, callback ){ callback( "!" + input + "!" ); }

var pipe1 = Parole.from().will( function( input ){
  transform1( input, this );
}).pipe();

var pipe2 = Parole.from().will( function( input ){
  transform2( input, this );
}).pipe();

pipe1.pipe( pipe2 ).pipe( function( output ){
  console.log( output );
});
p1( "Hello" )( "World" );
// => !*Hello*!   !*World*!
```

Please find more documentation in [the wiki](../../wiki/AboutParoles)


l8 Tasks
========

A Task is an activity that a "normal" javascript function cannot do because... javascript functions cannot block! Where functions provide results, tasks provide promises instead. To become tasks that can block, functions are broken into steps that the l8 scheduler executes.

```
// Simpliest multi-user html game ever, best solution in log2 N guesses
l8.task ->
  @repeat ->
    round = random = 0
    @step -> input "Enter a decent number to start a new game"
    @step ( r ) ->
      @continue if ( r = parseInt( r, 10 ) ) < 10
      random = Math.floor Math.random() * r
      round  = 0
    @repeat ->
      @step -> input "Guess a number"
      @step ( r ) ->
        round++
        r = parseInt( r, 10 )
        if r > random then printnl "#{r} is too big"
        if r < random then printnl "#{r} is too small"
        if r is random
          cls()
          printnl "Win in #{round} rounds! Try again"
          @break
# extracted from test/input.coffee
```

l8 is a comprehensive library to help those who want to embrace the javascript style of asynchronous programming but feel that the classic thread/blocking-function model is also very readable.

l8 schedules the execution of multiple "tasks". A task is made of "steps", much like a function is made of statements. Execution goes from "step" to "step", steps are closures. If one cannot walk a step immediately, one does block, waiting for something before resuming. Steps can nest, like blocks of statements.

Hence l8 tasks are kind of user level non preemptive threads. They are neither native threads, nor worker threads, nor fibers nor the result of some CPS transformation. Just a bunch of cooperating closures. However, if you are familiar with threads or fibers, l8 tasks should seem natural to you.

l8 tasks are also "promises". Once a task is completed, it's promise is either fulfilled or rejected depending on the task success or failure.

The main flow control structures are the sequential execution of steps, the execution and join of forked steps on parallel paths, error propagation similar to exception handling and synchronisation using the usual suspects (semaphores, mutexes, reentrant locks, message queues, ports, signals, generators...).

Beware that the "thread" model of computation is not without shortcomings. Race conditions and deadlocks are difficult to avoid when using the shared state paradigm. What is sometimes a necessary evil to gain maximal performance out of multiple cores cpus is not an option within a javascript process that is by design single threaded. This is why l8 favors a different approach based on message passing and distributed actors.


Roadmap (feb 2014)
==================

Boxons - mostly complete with good test converage.

Water - current work on progress.

Paroles - mostly done, needs more tests.

Tasks - mostly done, needs more tests.

Node.js adaptor - it's about transforming all node.js API functions that use callbacks into l8 tasks to make it easier to use the node.js API in a blocking manner. See the test/node.js working example.

Actors - local & proxied. half done, needs more tests.

Browser adaptor - this works somehow. It's about running code on the browser using the exact same API as the one when running on a server, including the full node.js API. It is mainly a demo application for the actor code and no further development is envisionned at this stage.

ECMA 6 Promise - partial, need more tests and doc.

ECMA 6 Generators - using "yield" to break a function in steps is a nice option. Study phase. Interop with co() seems ok.

Cluster - run actors in multiple processes to get more speed on multi-core CPUs. Not done.

The goal is to have a modern toolkit to build code that runs in browsers and servers, distributed using the actor model for inter process communications.


l8 API at a glance
==================

```
  l8
     -- step/task creation. "body" can create additional steps/subtasks
    .step(     body )   -- queue a step on the path to task completion
    .task(     body )   -- queue a step that waits on a blocking subtask
    .fork(     body )   -- queue a step that starts a forked task, forks "join"
    .repeat(   body )   -- queue a step that repeats a blocking subtask
    .spawn(    body )   -- like fork() but next step does not wait for subtask
    .generate( body )   -- queue a step that spawn a task that yields results

    -- step walking
    .proceed( block )   -- walk a step on its path, at most once per step
    .walk               -- idem but params of block become results of step
    .flow               -- idem but first param is filtered out unless thrown
    .continue           -- stop executing current task, reschedule it instead
    .break              -- "break" for "repeat" steps
    .return( [val] )    -- like "return" in normal flow, skip all queued steps
    .raise( error )     -- raise an exception in task, skip all queued steps

    -- task completion monitoring, for task users
    .then( ... )        -- Promise/A protocol, tasks are promises
    .callback( cb )   -  - Node.js style callback. Also .callback( promise, cb)
    .join()             -- pause task until all subtasks are done

    -- task completion handling, for task implementers
    .defer(    body )   -- push a block to execute when task is almost done
    .progress( block )  -- block to run when a subtask is done or step walked
    .success(  block )  -- block to run when task is done without error
    .failure(  block )  -- block to run when task is done but with error
    .final(    block )  -- block to run when task is all done (after .defer())

    -- task "local" variables, subtasks inherit them, a binding store them
    .var( name, val )   -- define a new variable in current task's binding
    .get( name )        -- get value of task local variable
    .set( name, val )   -- set value of task local variable
    .binding( name )    -- return binding where task local variable is stored

    -- task state related
    .state              -- return state of task, I->[Run|Pause]*->Success/Fail
    .pause              -- block task at step, waiting until task is resumed
    .paused             -- return true if task was paused
    .resume             -- resume execution of task paused at some step
    .running            -- true if task not done nor paused
    .cancel             -- cancel task & its sub tasks, brutal
    .canceled           -- true if task failed because it was canceled
    .stop               -- gentle cancel
    .stopping           -- true after a gentle cancel, until task is done
    .stopped            -- true if done task was gently canceled (gracefull)
    .done               -- true if task done, else either running or paused
    .succeed            -- true if task done without error
    .fail               -- true if task done but with an error
    .error              -- last raised error (ie last exception)
    .result             -- result of last successful step
    .timeout( milli )   -- cancel task if it is not done on time
    .sleep(   milli )   -- block on step for a while, then move to next step
    .wait( promise )    -- block task until some lock opens, promise agnostic

    -- misc, task hierarchy
    .current            -- return current task
    .parent             -- return parent task
    .tasks              -- return immediate pending sub tasks
    .top                -- return top task of sub task (child of l8 root task)

    -- scoping (value of "this" related)
    .begin              -- create a new task
    .end                -- start that new task
    .Task( function )   -- the .begin/.end guarded version of a function

  All these methods, if invoked against the global l8 object, will usually get
  forwarded to the "current task", the task that is currently executing. That
  task is often the returned value of such methods, when it makes sense. When
  the body of a task is executing, "this" references the current task.

  -- synchronization

  To synchronize the access to resources, l8 provide a few well known basic
  solutions implemented using promises and invoked using task.wait( resource ).

  .semaphore( [n] )     -- create a new semaphore, also a promise provider
  .mutex( [entered] )   -- ... a new mutex, also a ...
  .lock( [nentered] )   -- ... lock (reentrant mutex), ...
  .queue( [bound] )     -- ... message queue, ...
  .port()               -- like a message queue but without any buffering
  .signal()             -- signal, ..., like a promise that fires many times
  .timeout( delay )     -- create a promise fulfilled within a delay
  .call( fn )           -- like a callback but returns a promise when signaled
  .parole( [fn] )       -- create a Parole
  .boxon( ... )         -- create a Boxon
  .generate( block )    -- starts a next()/yield() consumer/producer generator
  .Generator( block )   -- build a Generator Constructor.

  Semaphores, Mutexes and Locks provide:

    .promise            -- provide a promise fullfilled when rsrc is acquired
    .release()          -- make resource available
    .signal()           -- alias for release()
    .close()            -- reject pending promises
    .task               -- resource owner task, when applicable (mutex & lock)

  Message queues are useful to synchronize a consumer and a producer:

    .in                 -- a "can get()" promise,
    .promise            -- alias for .in
    .out                -- a "can put()" promise
    .get()              -- pause current task until queue is not empty, get msg
    .try_get()          -- get msg when one is available, don't block
    .put( msg )         -- pause current task until queue is not full, put msg
    .try_put( msg )     -- put msg in queue unless queue is full
    .signal( msg )      -- alias for try_put()
    .capacity           -- total capacity (bound)
    .length             -- used capacity
    .full               -- when capacity is totally used
    .empty              -- when length is 0

  Timeouts are convenient to measure time and detect excessive delays.

    .promise            -- provide a promise fullfilled withing the delay
    .signal()           -- fire the timeout now
    .started            -- time when the timeout was started
    .signaled           -- time when the timeout was signaled, or null
    .duration           -- how long it took (took so far if unsignaled timeout)

  Signals are usefull to send a signal to multiple tasks when some condition is
  met:

    .promise            -- a promise fulfilled when signal is next signaled
    .signal( value )    -- signal signal, resolve all pending promises

  Calls are functions that will be called when signaled. They are similar to
  regular callbacks. The main difference is that in addition to .apply() and
  .call(), Calls also provide a .signal() method, like all the other l8 objects
  that are usefull for synchronisation purposes. Another difference is the fact
  that Calls are asynchronous, their result is a promise.

    .promise            -- provide the promise of the call.
    .call( ... )        -- invoke the call with parameters
    .apply( a )         -- idem but parameters are specified using an array
    .signal( ... )      -- alias for .apply()

  Generators let a producer and a consumer collaborate in a next()/yield() way:

    .get                -- a "can next()" promise, alias for .promise
    .put                -- a "can yield()" promise
    .next( [msg] )      -- pause task until producer yields, get/send a msg
    .yield( msg )       -- pause task until consumer calls .next(), get/send
    .try_next( [msg] )  -- if .get promise is ready, get yield msg
    .try_yield( msg )   -- if .put promise is ready, get next msg
    .signal( msg )      -- alias for try_yield()
    .close()            -- break paused tasks (using .break())
    .closed             -- true once generator is closed

  When a producer task is created using a Generator Constructor, that task can
  use l8.yield() while the parent task can use l8.next() ; the associated
  generator will automatically get closed when either the producer or the
  consumer task terminates.

  Many actions are possible when you have a hand of promises, l8 provides some
  of them:

  .selector( promises )  -- fires when any promise does
  .any( promises )       -- alias for .selector()
  .or( promises )        -- fires when a promise with a non falsy result fires
  .aggregator( promises) -- collect results, fires when all promises did
  .all( promises )       -- alias for .aggregator()
  .and( promises )       -- fires with "false" early or with collected results

  Note: in addition to promises, the array can contain immediate values and
  functions returning either an immediate value, a function to evaluate or a
  promise. The result of a promise can be a Function that will be evaluated and
  will replace the initial promise.

  Other librairies provides additional usefull Promise related services. See
  lueebird, Q.js, When.js, Promise.io, etc.

  -- Actors runs in places called "stages"
  They are remotely accessible using proxies.

  User:
    .actor( name, pattern ) -- start an actor or return an actor generator
    .actor( name )          -- look for an existing actor, local or remote
    .actor( name, http )    -- access to a remote actor
    .actor( name, stage )   -- access to browser side remote actors
      .tell( ... )          -- send a message to the actor
      .ask( ... )           -- send a message and expect an answer

  Implementer:
    .receive( pattern )     -- define actor reaction to received messages
    .ego                    -- actor the current task is running
    .ego.stage              -- stage the actor received current message from
    .stage( name, [url] )   -- a place with actors in it
    .stage( "local", srv )  -- define http server for local stage

  -- Misc

    .debug( [on])       -- get/set debug mode
    .trace( p1, ... )   -- output trace
    .logger( f() )      -- command how function used to output traces is found
    .assert( cndtion )  -- bomb when condition is not met
    .de                 -- my de&&bug() darling
    .bug( ... )         -- alias for .trace()
    .mand( condition )  -- my de&&mand() darling, alias for .assert()

```

Please find more documentation in [the wiki](../../wiki/FrontPage)

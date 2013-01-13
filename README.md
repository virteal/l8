l8 0.1.31
=========

l8 is a task scheduler for javascript.

A task is any activity that a "normal" non-blocking javascript function cannot
do because... javascript functions cannot block! Where functions provide
results, tasks provide promises instead. To become tasks that can block,
functions are broken into steps that the l8 scheduler executes.

```
l8.task ->
  @repeat ->
    round = random = 0
    @step -> input "Enter a decent number to start a new game"
    @step (r) ->
      @continue if (r = parseInt( r)) < 10
      random = Math.floor Math.random() * r
      round  = 0
    @repeat ->
      @step -> input "Guess a number"
      @step (r) ->
        round++
        r = parseInt( r)
        if r > random then printnl "#{r} is too big"
        if r < random then printnl "#{r} is too small"
        if r is random
          cls()
          printnl "Win in #{round} rounds! Try again"
          @break
# extracted from test/input.coffee
```

What is it?
===========

This is a library to help those who want to embrace the Promise/A style of
asynchronous programming but feel that the classic thread/blocking-function
model is also very readable.

l8 schedules the execution of multiple "tasks". A task is made of "steps", much
like a function is made of statements. Steps are walked on multiple "paths".
Such tasks and paths (sub-tasks) can nest, like blocks of statements.

Execution goes from "step" to "step", steps are closures. If one cannot walk a
step immediately, one does block, waiting for something before resuming.

l8 tasks are kind of user level non preemptive threads. They are neither
native threads, nor worker threads, nor fibers nor the result of some CPS
transformation. Just a bunch of cooperating closures. However, if you are
familiar with threads, l8 tasks should seem natural to you.

l8 tasks are also "promises". Once a task is completed, it's promise is either
fullfilled or rejected depending on the task success or failure.

The main flow control structures are the sequential execution of steps, the
execution and join of forked steps on parallel paths, steps that loop until
they exit, steps that wait for something, error propagation similar to
exception handling and synchronisation using the usual suspects (semaphores,
mutexes, reentrant locks, message queues, ports, signals, generators...).

When compared to callbacks, steps add some overhead due to the fact that
what to do next is computed (based on pre-queued steps) instead of being
specified by the callback itself. The overhead is small (see test_11 in the
test suite) considering the extra features provided (ie. nesting, cancelation,
tasks hierarchie, etc). When that overhead is useless, one can revert to the
classic callback style, ie. blocking and callback modes intermix well.

Steps vs Statements
===================

Javascript code is made of statements (and expressions). One key characteristic
of the language is the fact that all these statements are "non blocking". This
means that a statement cannot "block". It is executed with no delay, it cannot
"wait" for something to happen.

As a result there is only one "thread" of execution and any activity that
cannot complete immediately needs to register code to execute later when
some "event" occurs. This single thread runs a tight loop that consumes events
and run code registered to handle them. This is "the event loop".

```
  while( true ){
    event = get_next_event();
    dispatch( event);
  }
```

Code that is executed when an event happens is often named "callback". This is
because it is the "event loop" (though "dispatch()") that "calls back" that
code.

```
  function process_mouse_over(){
    obj.onmouseover = call_me_back;
    function call_me_back(){
      // called when mouse runs over that obj
    }
  }
```

That event_loop/callback style is simple and efficient. However, it has some
notorious drawbacks. Things can get fairly complex to handle when some activity
involves many sub-activities that must be run in some specific order.

Multiple solutions exist to care with such cases. The most basic one is to
start a new activity from within the callback that gets called when the
previous activity is completed.

```
  ajax_get_user( name, function user_found( user ){
    ajax_check_credential( user, function credential_checked( is_ok ){
      if( is_ok ){
        ajax_do_action( user, "delete", function delete_result( err ){
          if( err ) signal( err)
        }
      }
    }
  }
```
This code is not very readable because of the "nesting" of the different parts
that obscures it.

```
  ajax_get_user( name, user_found);
  function user_found( user ){
    ajax_check_credential( user, credential_checked);
  }
  function credential_checked( is_ok ){
    if( !is_ok )return
    ajax_do_action( user, "delete", delete_result)
  }
  function delete_result( err ){
    if( err ) signal( err)
  }
```
This slightly different style is barely more readable. What would be readable
is something like this:

```
  var user = ajax_get_user( name);
  if( !ajax_check_credential( user) ) return;
  if( err = ajax_do_action( user, "delete") ) signal( err);
```

However, this cannot exist in javascript because no function can "block". The
function "ajax_get_user()" cannot "block" until it receives an answer.

This is where l8 helps.

Steps
-----

Steps are to Tasks what statements are to functions: a way to describe what
they do.

```
  var user;
  l8
  .step( function(        ){ ajax_get_user( name)                  })
  .step( function( result ){ ajax_check_credential( user = result) })
  .step( function( result ){ if( !result ) l8.return();
                             ajax_do_action( user, "delete")       })
  .step( function( result ){ if( result ) signal( result)          })
```

This is less verbose with CoffeeScript:

```
  user = null
  @step     -> ajax_get_user name
  @step (r) -> ajax_check_credential (user = r)
  @step (r) -> if !r then @return() else
                ajax_do_action user, "delete"
  @step (r) -> if err = r then signal err
```

By "breaking" a function into multiple "steps", code become almost as readable
as it would be if statements in javascript could block, minus the "step" noise.

This example is a fairly simple one. Execution goes from step to step in a
sequential way. Sometimes the flow of control is much more sophisticated.
There can be multiple "threads" of control, with actions initiated concurrently
and various styles of collaboration between these actions.

Please note that the ajax_xxx() functions of the example are not regular
functions, they are "task constructors". When you invoke such a function, a new
task is created. See below.

If they were usual ajax_xxx( p1, p2, cb) style of functions, one would need to
use .walk or .proceed() as the callback in order to ask l8 to move to the next
step:

```
  var user = null, err
  this.step( function(   ){ ajax_get_user( name,               this.walk ) }
  this.step( function( r ){ ajax_check_credential( (user = r), this.walk ) }
  this.step( function( r ){ if( !r ) this->return()
                            ajax_do_action( user, "delete",    this.walk ) }
  this.step( function( r ){ if( err = r ) signal( err)
```

Tasks
-----

About the notion of "task". A Task is a l8 object that consolidates the result
of multiple threads of control (aka sub-tasks) that all participate in the
completion of a task.

Tasks are to steps what functions are to statements: a way to group them.

To perform a task, the simplest way is to invoke a "task constructor". It will
schedule the new task and return a Task object. Such an object is also a
"Promise". This means that it is fairly easy to get notified of the task's
completion, either it's success or it's failure.

```
  var new_task = do_something_task()
  new_task.then( on_success, on_failure)
  function on_success( result ){ ... }
  function on_failure( reason ){ ... }
```

A "task constructor" is to a "task" what a "function" is to a "function call":
both define (statically) what happens when they are invoked (dynamically).

Tasks queue steps that the l8 scheduler will execute much like functions queue
statements that the Javascript interpretor executes. With functions, statements
queueing is implicit. With tasks, it becomes explicit. As a result, defining
what a task does is of course sligthly less syntaxically easy.

```
  do_something_task = l8.Task( do_something_as_task );
  function do_something_as_task(){
    this
    .step( function(){ this.sleep( 1000) })
    .fork( function(){ do_some_other_task() })
    .fork( function(){ do_another_task() })
    .step( function(){ ... })
  }
```

This is the "procedural" style. A "declarative" style is also available where
what is usually a function can be a list of steps:

```
  do_something_task = l8.Task(
    function(){ this.sleep( 1000) },
    {fork: function(){ do_some_other_task() }},
    {fork: function(){ do_another_task()    }},
    [
      {step:    function(){...}},
      {failure: function(){...}}
    ],
    {repeat:[
      function(){ do_something },
      function(r){ if( !r ) this.break }
      {failure: function(){ ... }}
    ]}
    {success: function(){ ...  }},
    {final:   function(){ .... }}
  )
```

There is also a trans-compiler option that takes a funny looking function and
turns it into a task constructor. It's compact but you lose the ability to set
break-points in a debugger.

```
  do_something_task = l8.compile( do_something_as_task );
  function do_something_as_task(){
    step; this.sleep( 1000);
    fork; do_some_other_task_xx();
    fork; another_task_xx();
    step( a, b ); use_xx( a); use_xx( b);
    begin
      ...
      step; ...
      failure; ...
    end
    repeat; begin
      ...
      step; act_xx()
      step( r ); if( !r ) this.break
    end
    success( r ); done_xx( r);
    failure( e ); problem_xx( e);
    final( r, e); always_xx();
  }
```

Note that when do_something_task() is called, it does not do the actual work,
it only registers future steps. These steps, and steps later added to the task,
are executed later, in the appropriate order, until the task is fully done.
It is then, and only then, that the on_success/on_failure callbacks of the
task's promise will be called.

In a function, statements are executed in a purely sequentiel order. That
restriction does not apply with steps in a task. While the sequential order
is still the "normal", steps that run in parallel paths can also exist. Such
steps can be the result of "forks". When all forks are done, the forks "join"
and execution continues with the next normal step. When using a generator, the
steps of the producer and those of the consumer are executed alternatively when
.yield() and .next() are called to handle a new generated results.

Promises
--------

Promises are to tasks what result/exception are to a function: a way to provide
information about the outcome.

The "de facto" current standard for promises is part of the CommonJS effort:
http://wiki.commonjs.org/wiki/Promises/A

Such a "promise" is any object that provides a "then" method. That method does
two things: it registers callbacks to call when the promise is either, later or
now, fullfilled or rejected and it also returns a new promise that will be
fullfilled or rejected depending on the result of these callbacks; this makes
chaining easy.

Please note that "promises" in the Javascript world is not a mature feature.
The "de facto" CommonJS standard is challenged by another "de facto" strong
strong contender: jQuery. Their implementation of then() differs significantly
regarding chaining and exception handling. l8.wait() does not use these
features and consequently l8.wait() should work with most implementations,
including jQuery's one.

One can invoke .then() multiple times on the same promise. When that promise is
either fullfilled or rejected, all the registered callbacks are processed.

Some features of l8 that involve promises require a promise factory. l8 can use
the factories of Q.js, When.js, Angular.js, etc. The factory must return a new
object that supports .resolve(), .reject() and a .promise() that returns an
object that supports a Promise/A compliant .then().

Generators
----------

Generators are subtasks that provide a result in multiple pieces instead of in
just one piece as regular tasks do. Such a task is a "producer" of results,
some other task, often the one that spawn the generator, is the "consumer" of
these results.

Consumers usually consume the next result that some subtask yields until the
generator reaches an end and is closed, either by the producer or the consumer.

l8.Generator( block) builds a "Generator Constructor" much like l8.Task( block)
does with "Task Constructor". When the constructor is invoked, a generator task
is spawn. That task uses .yield() to produce results. On the consumer side, the
task uses .next([opt]) to get that result and optionaly provide a hint about
future results.

```
  var fibonacci = L4.Generator( function(){
    var i = 0, j = 1;
    this.repeat( function(){
      this.yield( i);
      var tmp = i;
      i  = j;
      j += tmp;
    })
  })

  var gen = fibonacci()
  var count_down = 10
  this.repeat( function(){
    this.step( function(){
      if( !count_down-- ) this.break
      gen.next()
    }).step( function( r ){
      trace( count_down, "fibo", r)
    })
  })
```


API
===

```
  l8
     -- step/task creation. "body" can create additional steps/subtasks
    .step(   body )     -- queue a step on the path to task's completion
    .task(   body )     -- queue a step that waits on a blocking subtask
    .fork(   body )     -- queue a step that starts a forked task, forks "join"
    .repeat( body )     -- queue a step that repeats a blocking subtask
    .spawn(  body )     -- like fork() but next step does not wait for subtask
    .generator( body )  -- queue a step that spwans a task that yields results

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

    -- misc, hierarchy
    .l8                 -- return global L8 object, also root task
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
  task is often the returned value of such methods, when it makes sense.

  To synchronize the access to resources, l8 provide a few well known basic
  solutions implemented using promises and invoked using task.wait( resource):

  .semaphore( [n] )     -- create a new semaphore, also a promise provider
  .mutex( [entered] )   -- ... a new mutex, also a ...
  .lock( [nentered] )   -- ... lock (reentrant mutex), ...
  .queue( [bound] )     -- message queue, ...
  .port()               -- like a message queue but without any buffering
  .signal()             -- signal, ..., like a promise that fires many times
  .timeout( delay )     -- a promise fulfilled after a delay
  .generator()          -- a next()/yield() consumer/producer resource
  .Generator( block )   -- build a Generator Constructor.

  Semaphores, mutexes and locks provide:

    .promise            -- provide a promise fullfilled when rsrc is acquired
    .release()          -- make resource available
    .close()            -- reject pending promises
    .task               -- resource owner task, when applicable (mutex & lock)

  Message queues are useful to synchronize a consumer and a producer:

    .in                 -- a "can get()" promise, alias for .promise
    .out                -- a "can put()" promise
    .get()              -- pause current task until queue is not empty, get msg
    .tryGet()           -- get msg when one is available, don't block
    .put( msg )         -- pause current task until queue is not full, put msg
    .tryPut( msg )      -- put msg in queue unless queue is full
    .capacity           -- total capacity (bound)
    .length             -- used capacity
    .full               -- when capacity is totally used
    .empty              -- when length is 0

  Signals are usefull to send a signal to multiple tasks when some condition is
  met:

    .promise            -- a promise fullfilled when signal is next signaled
    .signal( value )    -- signal signal, resolve all pending promises

  Generators let a producer and a consumer collaborate in a next()/yield() way:

    .get                -- a "can next()" promise, alias for .promise
    .put                -- a "can yield()" promise
    .next( [msg] )      -- pause task until producer yields, get/send a msg
    .yield( msg )       -- pause task until consumer calls .next(), get/send
    .tryNext( [msg] )   -- if .get promise is ready, get yield's msg
    .tryYield( msg )    -- if .put promise is ready, get next's msg
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

  Additional librairies provides other usefull services. See Q.js, When.js,
  Promise.io, etc

  Misc:
    .debug( [on])       -- get/set debug mode
    .trace( p1, ... )   -- output trace
    .de                 -- my de&&bug darling

```

Simple example, explained
=========================

Two steps. Hypothetical synchronous version if functions could block:

```
  function fetch( a ){
    meth1( a)
    return meth2( a)
  }
```

Idem but actual javascript using callback style:

```
  function fetch( a, cb ){
    meth1( a, function( error, result ){
      if( error ) return cb( error);
      meth2( a, function( error, result ){
        cb( error, result);
      }
    }
  }
```

Idem but using l8, extra long version:

```
  function fetch_this_and_that( a, callback ){
  return l8.begin
    .step( function(){
      meth1( a, this.next ) })
    .step( function( err, result ){
      if( err ) throw err else meth2( a, this.next }) })
    .step( function( err, result ){
      if( err ) throw err else return result })
    .final( function( err, result ){ callback( err, result) })
  .end}
```

CoffeeScript, much shorter, also thanks to Task() functor:

```
  fetch = l8.Task (a,cb) ->
    @step        -> meth1 a, @walk
    @step  (e,r) -> if e then throw e else meth2 a, @walk
    @step  (e,r) -> if e then throw e else r
    @final (e,r) -> cb e, r
```

Idem but returning a promise instead of using a callback:

```
  fetch = l8.Task (a) ->
    @step       -> meth1 a, @walk
    @step (e,r) -> if e then throw e else meth2 a, @walk
    @step (e,r) -> if e then throw e else r
```

Idem but assuming meth1 and meth2 make tasks returning promises too:

```
  fetch = l8.Task (a) ->
    @step -> meth1 a
    @step -> meth2 a
```

Back to Javascript:

```
  fetch = l8.Task( function( a ){
    this.step( function(){ meth1( a) })
    this.step( function(){ meth2( a) })
  })
```

Using the "trans-compiler":

```
  fetch = l8.compile( function( a ){
    step; meth1( a);
    step; meth2( a);
  })
```

The conclusion is that using tasks, steps and promises, the code's structure is
similar to the hypothetical javascript blocking function.

Other examples
--------------

Multiple steps, run sequentially:

```
  fetch_all_seq = l8.Task (urls) ->
    results = []
    for url in urls then do (url) ->
      @step -> scrap url, @proceed -> result.push {url, err, content}
    @success -> results
```

Multiple steps, each run in parallel:

```
  fetch_all = l8.Task (urls) ->
    results = []
    for url in urls then do (url) ->
      @fork ->
        scrap url, @proceed (err, content) -> results.push {url, err, content}
    @success -> results
```

Repeated steps, externally terminated, gently:

```
  spider = l8.Task (urls, queue) ->
    @repeat ->
      url = null
      @step -> url = queue.shift
      @step -> @delay 10000 if @parent.tasks.length > 10
      @step ->
        @break if @stopping
        scrap url, @walk
      @step (err,urls) ->
        return if err or @stopping
        for url in urls
          queue.unshift url unless url in queue

  spider_task = l8.spawn -> spider( "http://xxx.com")
  ...
  stop_spider = -> spider_task.stop
```

Small loop, on one step, using "continue":

```
  fire_all = l8.Task (targets) ->
    ii = 0
    @step ->
      return if ii > targets.length
      targets[ii++].fire()
      @continue
```

StratifiedJs example, see http://onilabs.com/stratifiedjs

```
var news;
waitfor {
  news = http.get("http://news.bbc.co.uk");
}
or {
  hold(1000);
  news = http.get("http://news.cnn.com");
}
or {
  hold(1000*60);
  throw "sorry, no news. timeout";
}
show(news);
```

The equivalent code with l8 is:

```

// JavaScript
var show_news = l8.Task( function(){
  var news = this
  .fork( function(){ http.get( "http://news.bbc.co.uk",
    this.proceed( function( item ){ news.return( item) }) )
  })
  .fork( function(){
    this.step( function(){ this.sleep( 1000) });
    this.step( function(){ http.get( "http://news.cnn.com",
      this.proceed( function( item ){ news.return( item) }) )
    })
  })
  .fork( function(){
    this.step( function(){ this.sleep( 1000 * 60) });
    this.step( function(){ throw "sorry, no news. timeout" })
  })
  .success( function( news ){ show( news) });
})

// CoffeeScript
show_news = l8.Task ->
  news = @current
  @fork ->
    @step -> http.get "http://news.bbc.co.uk"
    @step -> @news.return()
  @fork ->
    @step -> @sleep 1000
    @step -> http.get "http://news.cnn.com"
    @step -> @news.return()
  @fork ->
    @step -> @sleep 1000 * 60
    @step -> throw "sorry, no news. timeout"
  @success( news ) -> show news

// l8 trans-compiler
var show_new = l8.compile( function(){
  var news = this
  fork; begin
    step; http.get( "http://news.bbc.co.uk");
    step; news.return();
  end
  fork; begin
    step; this.sleep( 1000);
    step; http.get( "http://news.cnn.com");
    step; news.return();
  end
  fork; begin
    step; this.sleep( 1000 * 60);
    step; throw "sorry, no news. timeout";
  end
  success( news ); show( news);
})

```

Node.js google group "pipe" example, see
https://groups.google.com/forum/?fromgroups=#!topic/nodejs/5hv6uIBpDl8

```
function pipe( inStream, outStream, callback ){
  var loop = function( err ){
    if (err) callback( err);
    else inStream.read( function( err, data ){
      if (err) callback(err);
      else data != null ? outStream.write( data, loop) : callback();
    });
  }
  loop();
}

pipe = l8.Task( function ( inStream, outStream ){ this
  .repeat( function(){ this
    .step( function(){
      inStream.read() })
    .step( function( data ){
      if( !data) this.break;
      outStream.write( data);
    })
  })
})

pipe = l8.Task (in,out) ->
  @repeat ->
    @step -> in.read()
    @step (data) ->
      @break if !data
      out.write data

pipe = l8.compile( function( in, out ){
  repeat; begin
    step; in.read();
    step( data ); if( !data ) this.break;
    out.write( data);
  end
})
```

Note: for this example to work, node.js streams need to be "taskified". This
is left as an exercize.

The "recursive dir walk" nodejs challenge:

```
Var fs = require('fs');
var path = require('path');

var recurseDir = function(dir) {
  fs.readdirSync(dir).forEach(function(child) {
    if (child[0] != '.') {
      var childPath = path.join(dir, child);
      if (fs.statSync(childPath).isDirectory()) {
        recurseDir(childPath);
      } else {
        console.log(childPath);
      }
    }
  });
};
recurseDir(process.argv[2]);

// Async version:
var recurseDir = l8.Task( function( dir ){
  l8.step( function(   ){ fs.readdir( dir, this.flow) })
  l8.step( function( l ){ l.forEach( function( child ){
    if( child[0] != "." ){
      var childPath = path.join( dir, child);
      l8.step( function(   ){ fs.stat( childPath, this.flow) })
      l8.step( function( r ){
        if( r.isDirectory() ){
          recurseDir( childPath)
        }else{
          console.log(dchildPath)
        }
      })
    }
  }) })
})
```

Cooperating tasks examples:
===========================

Use promises:

A step can block waiting for a promise using L8.wait( promise). If waiting for
a promise is the only action of a step, then L8.step( promise) can be used as
a shortcut for L8.step( function(){ L8.wait( promise) }). Note however that the
two forms are not semantically identical because L8.step( promise) uses the
promise available when the new step is created/scheduled whereas in the second
form L8.wait() uses the promise available when the step is actually executed,
not when it is scheduled.

Access to a critical resource:

```
var mutex = L8.mutex()
  ...
  .step( mutex)   // or .step( function(){ this.wait( mutex) })
  .step( function(){
    l8.defer( function(){ mutex.release() })
    xxx
  })
  ...
```

Producer/consumer:

```
  TBD
```


Mixing statements and steps
---------------------------

Because "steps" and "statements" are not on the same level (steps for tasks,
statements for functions), the classical javascript control structures have
equivalent structures at the step level.

```
function xx(){
  ..1..
  try{
    ..2..
  catch( e ){
    ..3..
  finally {
    ..4..
  }
  ..5..
}
```
becomes:

```
xx_task = l8.Task( function(){
  this.step( function(){
    ..1..
  }).step( function(){
    this.begin.step( function(){
      ..2..
    }).failure( function(e){
      ..3..
    }).final( function(){
      ..4..
    }).end
  }).step( function(){
    ..5..
  })
})

or

xx_task = l8.compile( function(){
  step; ..1..
  step; begin
    ..2...
    failure;
    ..3..
    final;
    ..4..
  end
  step; ..5..
})
```

```
while( condition ){
  ...
  if( extra )break
  ...
  if( other_extra )continue
  ...
}
```
becomes:

```
l8.repeat( function(){
  ...
  if( condition ) this.break
  ...
  if( extra ) this.break
  ...
  if( other_extra ) this.continue
  ...
}

or

xx = l8.compile( function(){
  repeat; begin
    ...
    if( condition ) this.break
    ...
    if( extra ) this.break
    ...
    if( other_extra ) this.continue
    ...
  end
})
```

```
for( init ; condition ; next ){
  ...
}
```

becomes:

```
  init
  this.repeat( function(){
    if( condition ) this.break
    ...
    next
  })
```

```
for( init ; condition ; next ){
  ...
  if( extra ) continue
  ...
})
```
becomes:

```
  init
  this.repeat( function(){
    if( condition ) this.break
    this.task( function(){
      ...
      this.step( function(){ if( extra ) this.return })
      ...
      this.step( function(){ next })
    })
  })

or

xx = l8.compile( function(){
  init; repeat; begin ; if( condition ) this.break ; begin
    ...
    if( extra ) this.return
    ...
  end; next; end
})
```

```
for( var key in object ){
  ...
}
```
becomes:

```
  var keys = object.keys(), key
  this.repeat( function(){
    if( !(key = keys.shift()) ) this.break
    ...
  })

or

xx = l8.compile( function(){
  var keys = object.keys(), key
  repeat; begin;
    if( !(key = keys.shift()) ) this.break
    ...
  end
})
```

.defer() versus .final()
========================

.final( block) provides a solution that mimics the finally clause of the "try"
javascript construct. The final block typically performs "clean up" work
associated with the task it is attached too.

```
  var file
  l8
  .step(  function(){ file = file_open( file_name) })
  .step(  function(){ xxxx work with that file })
  .final( function(){ file_close( file) })
```

There is only one final clause per task. That clause is attached to the task
when the .final() method is executed. When multiple clauses are needed, one
needs to create nested tasks. The final block is executed once the task is
done. As a result additional steps are attached to the "parent" task, not to
the current task (this may change in a future version).

```
  var file1
  var file2
  l8
  .step( function(){ file2 = file_open( file1_name) })
  .step( function(){ xxxx work with file1 xxx })
  .step( function(){
    if( some_thing ){ l8.begin
      .step(  function(){ file = file_open( file2_name) })
      .step(  function(){ xxx work with file2 xxx })
      .final( function(){ file_close( file2) })
    .end })
  .final( function(){ file_close( file1) })
```

.defer( block) is inspired by the Go language "defer" keyword. It is itself
a variation around the C++ notion of "destructors". There can be multiple
deferred blocks for a task. Because deferred steps are executed just before the
task reach its end, they can register additional steps to handle async
activities. As a result, the task is not fully done until all the defered work
is done too. Deferred blocks are executed in a LIFO order, ie the last deferred
step is run first.

```
  var resourceA
  var resourceB
  l8
  .step( function(){ acquireResource( xxx) })
  .step( function( r ){
    ressourceA = r
    l8.defer( function(){ releaseResource( resourceA) })
  })
  .step( function(){ xxx work with resourceA xxx })
  .step( function(){ acquireResource( yyy) })
  .step( function( r ){
    resourceB = r
    l8.defer( function(){ releaseResource( resourceB) })
  })
  .step( function(){ xxx work with resourceB xxx })
```

Because multiple deferred blocks are possible, .defer() is more modular. For
example, it makes it possible to implement the "Resource Acquisition is
Initialization" pattern.
See http://en.wikipedia.org/wiki/Resource_Acquisition_Is_Initialization

```
  var with_file = l8.Task( function( file_name ){
    var file
    l8
    .step(){ function(){ file_open( file_name) })
    .step( r ){
      file = r
      l8.parent.defer( function(){ file_close( file) })
    }
  })

  Usage:

  var file
  l8
  .step( function(){ with_file( file_name) })
  .step( function( r ){ xxx work with file r xxx })
  xxx don't worry about closing that file xxx
```

The general "rule of thumb" is to use .final() for quick & simple stuff and
use .defer() for more elaborated async stuff.

Task "local" variables
======================

Tasks can define variables much like functions can. There are some differences.
Contary to function local variables, task local variables are "fluid", as per
Scheme jargon, ie they are dynamically scoped (whereas javascript variables use
lexical scoping). See also http://en.wikipedia.org/wiki/Thread_local_storage

A nice property of task local variables is the fact that a variable defined by
a parent task is accessible from a child subtask. As a result, task local
variables are "global" to a subset of all tasks, based on the task hierarchy.

When a subtask needs to override an inherited variables, it uses ".var()" to
set a new value that it's own subtasks will share. When a subtask, on the
contrary, wants to share an inherited variables, it uses ".set()" to set a new
value that it's parent task can query using ".get()".

Please note that tasks can also use regular lexically scoped variables, as long
as such a variable is part of a function's closure. This is the most convenient
and fast use case. When more global variables are required, l8 fluid variables
are handy.

```
var trace = function(){
  l8.trace( l8.get( "message") + " from " + l8.binding( "message").task)
}
var subtask = function(){
  l8.label = "sub"
  l8.step( function(){ trace()                       })
  l8.step( function(){ l8.var( "message", "deeper")  })
  l8.step( function(){ l8.delay( 10)                 })
  l8.step( function(){ trace()                       })
}

l8.task( function(){
  l8.label = "main"
  l8.var( "message", "top")
  l8.spawn( subtask )
  l8.step( function(){ l8.var( "message", "deeper")  })
  l8.step( function(){ trace()                       })
})

displays: top from Task/x[main], top from Task/x[main], deeper from Task/x[sub]
```





L8 Design
---------

The key idea is to break a javascript function into "steps" and then walk thru
these steps much like the javascript interpreter runs thru the statements
of a function. This is quite verbose however. But not so much when using
CoffeeScript. This is why, after considering the idea years ago, I waited
until now to implement it. That my cousin Jean Vincent would consider breaking
a function into steps as something close enough to threading was another strong
motivator.

To break functions into steps, I use a DSL (domain specific language) API.
Once the AST (abstact syntax tree) is built, I interpret it.

Executable nodes in the AST are called "steps". They are the smallest non
interruptible executable entities. Each Step belongs to a task. Task can
involve sub tasks that cooperate across multiple paths.

This becomes really interesting when the AST gets dynamically modified! This
happens when a step decides that it requires additional sub steps to complete.

On a path, execution goes from step to step. When a step involves sub-steps,
the step is blocked until the sub-steps complete, unless sub-steps are created
in a forked parallel path.

Example:

```
MainTask
  Task.1 - a task with a single path with a loop subpath
    MainPath
      Step
      Step
      RepeatPath
        Step
        Step
      Step
  Task.2 - a task with two paths (two forked subtasks)
    MainPath
      ForkedPath
        Step
        Step
      ForkedPath
        Step
      Step
```

Adding steps
------------

Execution goes "step by step" until task completion. Steps to execute are
queued. To queue  a new step to execute after the currently executing step, use
.step(). Such steps are run once the current step is completed, FIFO order.

To insert a new step on a new parallel task/path, use .fork(). Such steps block
the current step until they are completed. When multiple such forked steps are
inserted, the next non forked step will execute when all the forked steps are
done. The result of such multiple steps is accumulated into an array that can be
the parameter of the next non forked step. This is a "join". When only one
forked step is inserted, this is similar to calling a function, ie the next
step receives the result of the task that ran the forked step. There is a
shortcut for that special frequent case, please use .task().

To insert steps that won't block the current step, use spawn() instead. Such
steps are also run in a new task but the current step is not blocked until
the new task is complete. If the parent task terminates before the spawn tasks
are completed, the spawn tasks are re-attached to the parent task of the task
that created them, ie. spawn tasks are "inherited" by the parent of their
creator (Unix processes are similar).

Note that is it possible to cancel tasks and/or their subtasks. That cancel
action can be either "gentle" (using .stop() & .stopping) or "brutal" using
.cancel(). a_task.return( x) also cancel a task (and it's subtasks) but
provides the result of that task (whereas .cancel() makes the task fail).

Blocking
--------

Steps are useful to describe flows that depends on other flows. As a result
a step often describes sub-steps and/or sub pathes/tasks. These steps then
"block" waiting for the sub items to complete.

For simple steps, that only depend on the completion of a simple asynchronous
function, .walk or .proceed() provides the callback to register with that
function. When the callback is called, flow walks from the current step to the
next one.

Note: in the frequent case where the callback only needs to store the result
of the asychronous operation and move forward to the next step, please use
"walk" instead of proceed( function( x ){ this.result = x }).

However, if the action's result dictates that some new "nested" steps are
required, one adds new steps from within the callback itself. Often, this style
of programming is not adviced because it basically resolves back to the
infamous "callback hell" that l8 attemps to avoid. A better solution is to
let the next step handle that.

Do:
```
  @step           -> fetch                      @walk
  @step( result ) -> if result then more_fetch  @walk
  @step( result ) -> if result then fetch_again @walk
  @step( result ) -> if result then use result  @walk
  @step           -> done()
```

Don't:
```
  @step -> fetch @proceed (result) ->
    if result
      more_fetch @proceed (result) ->
        if result
          fetch_again @proceed (result) ->
            if result then use result @walk
  @step -> done()
```

Or, even better, use task constructors instead of functions with callbacks:
```
  @step      -> fetch()
  @step( r ) -> more_fetch()  if r
  @step( r ) -> fetch_again() if r
  @step( r ) -> use r         if r
```

Extensions
----------

The l8 API defines a concept of Task/Path/Step entities that works nicely in
the async/callback dominated world of Javascript and yet manage to provide some
useful tools (hopefully) to address the infamous "callback hell" issue.

However these tools are very basic.

One way to improve on that situation is to use one of the multiple existing
"promise" handling libraries, such as Q, when and rsvp. See also
http://howtonode.org/promises and https://gist.github.com/3889970

What is also needed are more sophisticated yet simpler to use solutions. There
are many styles of coding regarding the orchestration of complex interactions
between fragments on code. We are no longer restricted to the signal/kill
mechanism from the 70s in Unix!

In addition to the classics (semaphores, mutexes, message queues, conditional
variables, signals, monitors, events...) newer mechanisms are experimented or
rediscovered. Things like channels in Go, actors in Erlang, reactive system in
Angular, these things are interesting to explore.

I believe l8 may help do that. For sure the granularity is not the same as in
native implementations. Instead of dealing with statements or even machine
code level instructions, l8 deals with much bigger "steps". However, regarding
synchronisation, this difference of scale does not imply a difference of
nature. As a consequence, solutions that work at the machine level may prove
also productive at the "step" higher level.

Hence, proposals for extensions are welcome.

Enjoy.

   Jean Hugues Robert, aka @jhr, october/november 2012.

PS: all this stuff is to relieve me from my "node anxiety".
See http://news.ycombinator.com/item?id=2371152


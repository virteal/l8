l8 0.1.22
=========

L8 is a task/promise scheduler for javascript. L8 sounds like "leight",
something between "late" and "light".

A task is any activity that a "normal" non-blocking javascript function cannot
do because... javascript's functions cannot block! Where functions provide
results, tasks provide promises instead. To become tasks that can block,
functions are broken into steps that the l8 scheduler executes.

What is it?
===========

This is a library to help those who want to embrace the Promise/A style of
asynchronous programming but feel that the classic thread/blocking-function
model is also very readable.

l8 schedules the execution of multiple "tasks". A task is made of "steps", much
like a function is made of statements. Steps are walked on multiple "paths".
Such tasks and paths (sub-tasks) can nest, like blocks of statements.

Execution goes from "step" to "step", steps are closures. If one cannot walk a
step immediatly, one does block, waiting for something before resuming.

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
mutexes, reentrant locks, message queues, ports, signals, generators...)

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

This is where L8 helps.

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
  @step      -> ajax_get_user name
  @step( r ) -> ajax_check_credential (user = r)
  @step( r ) -> if !r then @return() else
                ajax_do_action user, "delete"
  @step( r ) -> if err = r then signal err
```

By "breaking" a function into multiple "steps", code become almost as readable
as it would be if statements in javascript could block, minus the "step" noise.

This example is a fairly simple one. Execution goes from step to step in a
sequential way. Sometimes the flow of control can be much more sophisticated.
There can be multiple "threads" of control, with actions initiated concurrently
and various styles of collaboration between these actions.

Please note that the ajax_xxx() functions of the example are not regular
functions, they are "task constructor". When you invoke such a function, a new
task is created.

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

About the notion of "task". A Task is a L8 object that consolidates the result
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
statements that the Javascript interpretor execute. With functions, statements
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
turns it into a task constructor. It's compact but you loose the ability to
set break-points in a debugger.

```
  do_something_task = l8.compile( do_something_as_task );
  function do_something_as_task(){
    step; this.sleep( 1000);
    fork; do_some_other_task();
    fork; another_task();
    step( a, b ); use( a); use( b);
    begin
      ...
      step; ...
      failure; ...
    end
    repeat; begin
      ...
      step; act()
      step( r ); if( !r ) this.break
    end
    success; done();
    failure; problem();
    final;   always();
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
steps are the result of "forks". When all forks are done, the forks "join" and
execution continues with the next normal step.

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
The "de facto" CommonJS standard is beeing challenged by another "de facto"
strong contender: jQuery. Their implementation of then() differs significantly
regarding chaining and exception handling. l8.wait() does not use these
features and consequently .wait() should work with most implementations,
including jQuery's one.

One can invoke .then() multiple times on the same promise. When that promise is
either fullfilled or rejected, all the registered callbacks are processed.

Some features of L8 that involve promises require a promise factory. L8 can use
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

L8.Generator( block) builds a "Generator Constructor" much like L8.Task( block)
does with "Task Constructor". When the constructor is invoked a generator task
is spawn. That task uses L8.yield() to produce results. On the consumer side,
the task uses L8.next([opt]) to get that results and optionaly provide a hint
about future results.

API
===

```
  l8
     -- step/task creation. "body" can create additional steps/subtasks
    .step(   body )     -- queue a step on the path to task's completion
    .task(   body )     -- queue a step that waits on a blocking sub-task
    .fork(   body )     -- queue a new forked sub-task, forked tasks join
    .repeat( body )     -- queue a step that repeats a blocking sub-task
    .spawn(  body )     -- like fork() but next step does not wait for subtask
    .generator( body )  -- queue a step that spwan a paused subtask

    -- step walking
    .proceed( block )   -- walk a step on its path, at most once per step
    .walk               -- idem but params of block become results of step
    .continue           -- stop executing current task, reschedule it instead
    .break              -- "break" for loop steps
    .return( [val] )    -- like "return" in normal flow, skip all queued steps
    .raise( error )     -- raise an error in task, skip all queued steps
    .throw( error )     -- alias for raise()

    -- task completion monitoring, for task users
    .then( ... )        -- Promise/A protocol, tasks are promises
    .node( callback )   -- Node.js style callback

    -- task completion handling, for task implementers
    .progress( block )  -- block to run when a subtask is done or step walked
    .success( block )   -- block to run when task is done without error
    .failure( block )   -- block to run when task is done but with error
    .catch( block )     -- alias for failure()
    .final( block )     -- block to run when task is all done
    .finally( block )   -- alias for final()

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
    .error              -- last raised error (ie last thrown exception)
    .result             -- result of last executed step
    .timeout( milli )   -- cancel task if it is not done in time
    .sleep( milli )     -- block on step for a while, then move to next step
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

  All these methods, if invoked against the global L8 object, will usually get
  forwarded to the "current task", the task that is currently executing. That
  task is often the returned value of such methods, when it makes sense.

  To synchronize the access to resources, L8 provide a few well known basic
  solutions implemented using promises and invoked using task.wait( resource):

  .semaphore( [n] )     -- create a new semaphore, also a promise provider
  .mutex( [entered] )   -- ... a new mutex, also a ...
  .lock( [nentered] )   -- ... lock (reentrant mutex), ...
  .queue( [bound] )     -- message queue, ...
  .port()               -- like a message queue but without any buffering
  .signal()             -- signal, ..., like a promise that fires many times
  .timeout( delay )     -- a promise fulfilled after a delay
  .generator()          -- a next()/yield() consumer/producer resource
  .Generator( blck )    -- build a Generator Constructor.

  Semaphores, mutexes and locks provide

    .promise            -- provide a promise fullfilled when rsrc is acquired
    .release()          -- make resource available
    .close()            -- reject pending promises
    .task               -- resource owner task, when applicable (mutex & lock)

  Message queues are useful to synchronize a consumer and a producer:

    .in                 -- a "can get()" promise, alias for .promise
    .out                -- a "can put()" promise
    .get()              -- pause current task until queue is not empty, get msg
    .put( [msg] )       -- pause current task until queue is not full, put msg
    .capacity           -- total capacity (bound)
    .length             -- used capacity
    .full               -- when capacity is totally used
    .empty              -- when length is 0

  Signals are usefull to send a signal to multiple tasks when some condition is
  met:

    .promise            -- a promise fullfilled when signal is next signaled
    .signal( value )    -- signal signal, resolve all pending promises

  Generators let a producer and a consumer collaborate in a next()/yield() way:

    .in                 -- a "can next()" promise, alias for .promise
    .out                -- a "can yield()" promise
    .next( [msg] )      -- pause task until producer yields, send it a msg
    .yield( msg )       -- pause task until consumer calls .next(), send a msg
    .close()            -- break paused tasks (using .break())
    .closed             -- true once generator is closed

  When a producer task is created using a Generator Constructor, that task can
  use L8.yield() while the parent task can use L8.next() ; the associated
  generator will automatically get closed when either the producer or the
  consuler terminates.

  Many things are possible when you have a hand of promises:

  .selector( promises )  -- fires when any promise does
  .aggregator( promises) -- collect results, fires when all promises did


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
    @step        -> meth1 a, @walk
    @step  (e,r) -> if e then throw e else meth2 a, @walk
    @step  (e,r) -> if e then throw e else r
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

The conclusion is that using tasks, steps and promises, the code is very
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

This translates to:

```
show_news = l8.Task ->
  news = null
  @fork -> http.get "http://news.bbc.co.uk",
      @proceed (err,item) -> @return news = item
  @fork ->
    @step -> @sleep 1000
    @step -> http.get "http://news.cnn.com",
       @proceed (err, item ) -> @return news = item
  @fork ->
    @step -> @sleep 1000 * 60
    @step -> throw "sorry, no news. timeout"
  @success -> show news

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
    step; in.read()
    step( data ); if( !data ) this.break
    out.write( data)
  end
})
```

Note: for this example to work, node.js streams need to be "taskified". This
is left as an exercize.

Cooperating tasks examples:
===========================

Access to a critical resource:

```
  TBD
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
    this.step( function(){ this.begin.step( function(){
      ...
      if( extra ) this.return
      ...
    }).end }).step( function(){
      next
    })
  })

or

xx = l8.compile( function(){
  init; repeat ; begin ; if( condition ) this.break ; begin
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
  var keys, key
  this.step( function(){
    keys = object.keys
  }).repeat( function(){
    key = keys.shift()
    ...
  })

or

xx = l8.compile( function(){
  var keys, key
  step; keys = object.keys; repeat; begin; key = keys.shift()
    ...
  end
})
```

Design
------

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
happens when a step decides that is requires additional sub steps to complete.

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
  Task.2 - a task with two paths (two sub tasks)
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
done. The result of such multiple steps is the result of the last executed step
prior to execution of the non forked step. This is a "join". When only one
forked step is inserted, this is similar to calling a function, ie the next
step receives the result of the task that ran the forked step. There is a
shortcut for that special frequent case, please use .task().

To insert steps that won't block the current step, use spawn() instead. Such
steps are also run in a new task but the current step is not blocked until
the new task is complete. However, task won't reach completion until all spawn
subtasks complete.

Note that is it possible to cancel tasks and/or their subtasks. That cancel
action can be either "gentle" (using .stop() & .stopping) or "brutal" using
.cancel().

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


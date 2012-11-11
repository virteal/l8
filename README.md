l8 0.1.7
========

L8 is light task manager for javascript/coffeescript/livescript...
A task is any activity that a "normal" non-blocking javascript function cannot
do because... javascript's functions cannot block!

What is it?
===========

It schedules the execution of multiple "tasks". A task is made of "steps", much
like a function is made of statements. Steps are walked on multiple "paths".
Such tasks and paths (sub-tasks) can nest, like blocks of statements.

Execution goes from "step" to "step", steps are closures. If one cannot walk a
step immediatly, one can block, waiting for something before resuming.

The main flow control structures are the sequential execution of steps,
the execution of forked steps on parallel paths, steps that loop until they
exit, steps that wait for something and error propagation similar to exception
handling.

l8 tasks are kind of user level non preemptive threads. They are neither
native threads, nor worker threads, nor fibers nor the result of some CPS
transformation. Just a bunch of cooperating closures. However, if you are
familiar with threads, l8 tasks should seem natural to you.

Steps vs Statements
===================

Javascript code is made of statements (and expressions). One key characteristic
of the language is the fact that all these statements are "non blocking". This
means that a statement cannot "block". It is executed with no delay, it cannot
"wait" for something to happen.

As a result there is only one "thread" of execution and any activity that
cannot complete immediately needs to register code to execute later when
some "event" occurs. This single thread runs a tight loop that consumes events
and run code registered to handle them. This is "the event loop"

```
  while( true ){
    event = get_next_event();
    dispatch( event);
  }
```

Code that is executed when an event happens is often named "callback". This is
because it is the "event loop" (though "dispatch()") that "calls" that code.

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
that obscure it.

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
  user = ajax_get_user( name)
  if( !ajax_check_credential( user) )return
  if( err = ajax_do_action( user, "delete") ){ signal( err) }
```

However, this cannot exist in javascript because no function can "block". The
function "ajax_get_user()" cannot "block" until it receives an answer.

This is where L8 helps.

```
  l8
  .step( function(){ ajax_get_user( name,                     l8.next) })
  .step( function(){ ajax_check_credential( user = l8.result, l8.next) })
  .step( function(){ if( !l8.result ) l8._return();
                     ajax_do_action( user, "delete",          l8.next) })
  .step( function(){ if( l8.result ) signal( l8.result)                })
```

This is less verbose with CoffeeScript:

```
  @step -> ajax_get_user name,                     @next
  @step -> ajax_check_credential (user = @result), @next
  @step -> if !@result then @return()              ;\
           ajax_do_action user, "delete",          @next
  @step -> if err = @result then signal err
```

By "breaking" a function into multiple "steps", code become almost as readable
as it would be if statements in javascript could block, minus the step/next
noise.

This example is a fairly simple one. Execution goes from step to step in a
sequential way. Sometimes the flow of control can be much more sophisticated.
There can be multiple "threads" of control, with actions initiated concurrently
and various styles of collaboration between these actions.

Hence the notion of "task". A Task is a L8 object that consolidates the result
of multiple threads of control (aka sub-tasks) that all participate in the
completion of a task.

API
---

```
  l8
     -- step/task creation
    .step( block )      -- queue a new step on the path to task's completion
    .fork( block )      -- queue a first step on a new parallel sub-task
    .spawn( blk [, p] ) -- like fork() but next step does not wait for subtask
    -- step walking
    .walk( block )      -- walk a step on its path, at most once per step
    .next               -- alias for walk( null) -- ie no block parameter
    .repeat( block )    -- queue a new blocking loop step
    .redo               -- stop executing current step, reschedule it instead
    ._continue          -- like "continue", for blocking loop steps
    ._break             -- "break" for blocking loops and forked steps
    ._return( [val] )   -- like "return" in normal flow
    .raise( error )     -- raise an error in task
    .throw( error )     -- alias for raise()
    -- task completion monitoring
    .then( ... )        -- Promise/A protocol, tasks are promises
    .progress( block )  -- block to run when some task is done or step walked
    .success( block )   -- block to run when task is done without error
    .failure( block )   -- block to run when task is done but with error
    .catch( block )     -- alias for failure()
    .final( block )     -- block to run when task is all done
    .finally( block )   -- alias for final()
    -- task's state related
    .state              -- return state of task, I->[R|P]*->S/F
    .pause              -- block task at step, waiting until task is resumed
    .paused             -- return true if task was paused
    .resume             -- resume execution of task paused at some step
    .yield( value )     -- like "pause" but provides a value and returns one
    .run( value )       -- like "resume" but provides a value and returns one
    .running            -- true if task not done nor paused
    .cancel             -- cancel task & its sub tasks, brutal
    .canceled           -- true if task was canceled
    .stop               -- gentle cancel
    .stopping           -- true after a gentle cancel, until task is done
    .stopped            -- true if done task was gently canceled (gracefull)
    .done               -- true if task done, else it either waits or runs
    .succeed            -- true if task done without error
    .fail               -- true if task done but with an error
    .error              -- return last raised error (ie last thrown exception)
    .result             -- return result of last executed step
    .timeout( milli )   -- cancel task if not done in time
    .sleep( milli )     -- block on step for a while, then move to next step
    .wait( lock )       -- block task until some lock opens
    -- misc
    .l8                 -- return global L8 object, also root task
    .task               -- return current task
    .current            -- alias for .task
    .parent             -- return parent task
    .tasks              -- return immediate sub tasks
    .top                -- return top task of sub task (child of l8 root task)
    -- scoping (value of "this" related)
    .begin              -- enter new L8 scope
    .end                -- leave scope or loop
    .Task( function )   -- return the .begin/.end guarded version of a function

  All these methods, if invoked against the global L8 object, will usually get
  forwarded to the "current task", the task that is currently executing. That
  task is often the returned value of such methods, when it makes sense.

  l8.promise()          -- create a new promise, Promise/A compliant
    .resolve( results ) -- fullfill promise
    .reject( reason )   -- fail promise
    .progress( infos )  -- signal progress
    .then( ok, ko, ev ) -- register callbacks, return new promise
```

TBD: semaphores, mutexes, locks, message queues, signals, etc...

Examples
--------

Two steps:

```
  function fetch_this_and_that( a, b, callback ){
    var result = {}
    // Hypothetical synchronous version
    // if( !(result = fetch_a()).err ){
    //   result = fetch( b)
    // }
    // callback( result.err, result.content)
  l8.begin
    .step( function(){
      fetch( a,
        this.walk( function( err, content ){
          return {err:err,content:content }
        })
      )
    })
    .step( function( result ){
      if( result.err ) this.raise( result.err)
      fetch( b,
        this.walk( function( err, content ){
          return {err:err,content:content }
        })
      )
    })
    .final( function( err, result ){
      callback( err || result.err, result.content) }
    )
  .end}
```

CoffeeScript, much shorter, also thanks to scope() functor:

```
  fetch_this_and_that = l8.Task (a,b,cb) ->
    @step        -> fetch a, @walk (err,content) -> {err,content}
    @step  (r)   -> @raise r.err if r.err ;\
                    fetch b, @walk (err,content) -> {err,content}
    @final (e,r) -> cb (e or r.err), r.content
```

Multiple steps, run sequentially

```
  fetch_all_seq = l8.Task (urls, callback) ->
    results = []
    for url in urls do (url) ->
      @step -> fetch url, @walk -> result.push {url, err, content}
    @final -> callback results
```

Multiple steps, each run in parallel

```
  fetch_all = l8.Task (urls, callback) ->
    results = []
    for url in urls do (url) ->
      @fork ->
        fetch url, @walk (err, content) -> results.push {url, err, content}
    @final -> callback results
```

Repeated steps, externally terminated, gently

```
  spider = l8.Task (urls, queue) ->
    @repeat ->
      url = null
      @step -> url = queue.shift
      @step -> @delay 10000 if @parent.tasks.length > 10
      @step ->
        @break if @stopping
        fetch url, @walk (err,urls) ->
          return if err or @stopping
          for url in urls
            queue.unshift url unless url in queue

  spider_task = l8.spawn -> spider( "http://xxx.com")
  ...
  stop_spider = -> spider_task.stop
```

Small loop, on one step, using "redo":

```
  fire_all = l8.Task (targets, callback) ->
    ii = 0
    @step ->
      return if ii > targets.length
      targets[ii++].fire()
      @redo
    @step    -> callback()
    @failure -> callback( @error)
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
```
show_news = l8.Task ->
  news = null
  @fork -> http.get "http://news.bbc.co.uk",
      @walk (err,item) -> @return news = item
  @fork ->
    @step -> @sleep 1000
    @step -> http.get "http://news.cnn.com",
       @walk (err, item ) -> @return news = item
  @fork ->
    @step -> @sleep 1000 * 60
    @step -> throw "sorry, no news. timeout"
  @success -> show news

```

Nodejs google group "pipe" example, see
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

function pipe( inStream, outStream, callback ){
l8.begin
  .repeat( function(){ l8
    .step( function(){ inStream.read( l8.next) })
    .step( function( err, data ){
      if( err )  throw err;
      if( !data) l8.break;
      outStream.write( data, l8.next);
    })
    .step( function( err ){ if( err ) throw err; })
  })
  .success( function(){      callback()     })
  .failure( function( err ){ callback( err) })
.end}

pipe = l8.Task (in,out,cb) ->
  @repeat ->
    @step -> in.read @next
    @step (err, data) ->
      throw err if err
      @break if !data
      out.write data, @next
    @step (err) -> throw err if err
  @success -> cb()
  @failure -> cb @error
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
in a forked parallel path (sub-task).

Note: a "path" is, at the step level, what is usually called a "thread" (or a
fiber") in languages that support this notion at the statement/expression
level.

Example:

```
MainTask
  Task.1 - a task with a single path with a loop
    MainPath
      Step
      Step
      RepeatStep
        Step
        Step
      Step
  Task.2 - a task with two paths (two sub tasks)
    MainPath
      Step
      Step
    ForkedPath
      Step
```

Adding steps
------------

Execution goes "step by step" until task completion. Steps to execute are
queued. When a new step is created, it is usually added at the end of the queue
for the currenty executing task. Sometimes however, one wants to queue new
steps right after the currently executing step. This is typically the case
when a step needs to schedule work for multiple items. Such "steps" are either
sequential steps or steps to walk on parallel sub-pathes. It also happens when
a step discovers that it requires additional sub-steps to complete.

To queue  a new step to execute after the currently executing step, use step().
Such steps are run once the current step is completed, FIFO order.

To insert a new step on a new parallel task/path, use fork(). Such steps block
the current step until they are completed. When multiple such forked steps are
inserted, the next non forked step will execute when all the forked steps are
done. The result of such multiple steps is the result of the last executed step
prior to execution of the non forked step. This is a "join". When only one
forked step is inserted, this is similar to calling a function, ie the next
step receives the result of the task that ran the forked step.

To insert steps that won't block the current step, use spawn() instead. Such
steps are also run in a new task but the current step is not blocked until
the new task is complete.

Blocking
--------

Steps are useful to describe flows that depends on other flows. As a result
a step often describes sub-steps and/or sub pathes/tasks. These steps then
"block" waiting for the sub items to complete.

For simple steps, that only depends on the completion of a simple asynchronous
action, walk() provides the callback to register with that action. When the
callback is called, flows walks from the current step to the next.

Note: in the frequent case where the callback only needs to store the result
of the asychronous operation and move forward to the next step, please use
"next" instead of walk( function( x ){ this.result = x }).

However, if the action's result dictates that some new "nested" steps are
required, one adds new steps from within the callback itself. Often, this style
of programming is not adviced because it basically resolves back to the
infamous "callback hell" that l8 attemps to avoid. A better solution is to
let the next step handle that.

Do:
```
  @step -> fetch                       @next
  @step -> if @result then more_fetch  @next
  @step -> if @result then fetch_again @next
  @step -> if @result then use @result
  @step -> done()
```

Don't:
```
  @step -> fetch @walk (result) ->
    if result
      more_fetch @walk (result) ->
        if result
          fetch_again @walk (result) ->
            if result then use result
  @step -> done()
```

Extensions
----------

The l8 API defines a concept of Task/Path/Step entities that works nicely in
the async/callback dominated world of Javascript and yet manage to provide some
useful tools (hopefully) to address the infamous "callback hell" issue.

However these tool are very basic. Pause/Resume are building blocks only.

What is also needed is more sophisticated yet simpler to use solutions. There
are many style of coding regarding the orchestration of complex interactions
between fragments on code. Were are no longer restricted to the signal/kill
mechanism from the 70s in Unix!

In addition to the classics (semaphores, mutexes, message queues, conditional
variables, signals, events...) newer mechanisms are experimented or
rediscovered. Things like channels in Go, actors in Erlang, reactive system in
Angular, these things are interesting to explore.

I believe l8 may help do that. For sure the granularity is not the same as in
native implementations. Instead of dealing with statements or even machine
code level instructions, l8 deals with much bigger "steps". However, regarding
synchronisation, this difference of scale does not imply a difference of
nature. As a consequence, solutions that work at the machine level may prove
also productive at the "step" higher level. l8 makes it possible to use these
solutions in Javascript, today (well... in a few months, if things go well).

Proposals for extensions are welcome.

Enjoy.

   Jean Hugues Robert, aka @jhr, october/november 2012.

PS: all this stuff is to relieve my "node anxiety".
See http://news.ycombinator.com/item?id=2371152




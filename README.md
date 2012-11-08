l8 0.1.2
========

A light task manager for javascript/coffeescript/livescript...

"Let's walk these steps on multiple paths to do our tasks"

What is it?
===========

It schedules the execution of multiple "tasks". A task is made of "steps", much
like a function is made of statements. Steps are walked on multiple "paths".
Such tasks and paths (sub-tasks) can nest, much like blocks of statements.

Execution goes from "step" to "step" by way of "walk". If one cannot walk a
step immediatly, one can block, waiting for something before resuming.

The main flow control structures are the sequential execution of steps,
the execution of forked steps on parallel paths, steps that loop until they
exit, steps that wait for something and error propagation similar to exception
handling.

l8 tasks are kind of user level non preemptive threads. They are neither
native threads, nor worker threads, nor fibers nor the result of some CPS
transformation. Just a bunch of cooperating closures.

Steps vs Statements
===================

Javascript code is made of statements (and expressions). One key characteristic
of the language is the fact that all these statements are "non blocking". This
means that no statement can "block". They are executed with no delay, they
cannot "wait" for something to happen.

As a result there is only one "thread" of execution and any activity that
cannot complete immediately needs to register code to execute later when
some "event" occurs. This single thread runs a tight loop that consumes events
and run code registered to handle them. This is "the event loop"

```
  while( true ){
    event = get_event();
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
  user = ajax_get_user( name)
  if( !ajax_check_credential( user) )return
  if( err = ajax_do_action( user, "delete") ){
    signal( err)
  }
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
with various style of collaboration between these actions.

Hence the notion of "task". A Task is a L8 object that consolidates the result
of multiple threads of control (aka sub-tasks) that all participate in the
completion of a task.

API
---

```
  l8.begin              -- enter new L8 scope
    .step( block )      -- queue a new step on the path to task's completion
    .fork( block )      -- queue a new step on a new parallel path
    .call( block )      -- like fork() but waits until other path completes
    .walk( block )      -- walk a step on its path, at most once per step
    .next               -- alias for walk() -- ie no block parameter
    .loop               -- enter a non blocking loop, made of iterative steps
    .each               -- enter next iteration step in a non blocking loop
    .repeat( block )    -- queue a blocking loop step
    ._continue          -- like "continue", for blocking loops
    ._break             -- "break" for blocking loops and forked steps
    ._return( [val] )   -- like "return" in normal flow
    .raise( error )     -- raise an error in task
    .spawn( blk [, q] ) -- start a new sub task, maybe paused
    .then( ... )        -- Promise/A protocol, tasks are promises
    .success( block )   -- block to run when task is done without error
    .error( block )     -- block to run when task is done but with error
    .progress( block )  -- block to run when some task is done or step walked
    .final( block )     -- block to run when task is all done
    .l8                 -- return global L8 object
    .task               -- return current task
    .parent             -- return parent task
    .tasks              -- return sub tasks
    .top                -- return top task of sub task
    .state              -- return state of task, I->[Q|R]*->C/E/D
    .pause              -- queue step, waiting until task is resumed
    .waiting            -- true if task waiting while running (ie is queued)
    .resume             -- resume execution of a task waiting at some step
    .yield( value )     -- like "pause" but provides a value and returns one
    .run( value )       -- like "resume" but provides a value and returns one
    .running            -- true if task not done nor waiting
    .cancel             -- cancel task & its sub tasks, brutal
    .canceled           -- true if task was canceled
    .stop               -- gentle cancel
    .stopping           -- true after a gentle cancel, until task is done
    .stopped            -- true if task was gently canceled (gracefull)
    .done               -- true if task done, else it either waits or runs
    .succeed            -- true if task done without error
    .fail               -- true if task done but with an error
    .err                -- return last raised error
    .result             -- "return" value of task, see _return and yield()
    .timeout( milli )   -- cancel task if not done in time
    .sleep( milli )     -- block for a while, then reschedule task
    .wait( lock )       -- queue step until some lock opens, then retry
    .end                -- leave scope or loop
    .scope( function )  -- return the L8 scope guarded version of a function

  These methods, if invoked against the global L8 object, will get forwarded
  to the current task.
```

TBD: semaphores, mutexes, locks, message queues, signals, etc...

Examples
--------

Two steps.

```
  function fetch_this_and_that( a, b, callback ){
    var result_a = null
    var result_b = {content:null}
    // Hypothetical synchronous version
    // result_a = fetch( a)
    // if( !result_a.err ){
    //   result_b = fetch( b)
    // }
    // callback( result_a.err || result_b.err, result_b.content)
  l8.begin
    .step( function(){
      fetch(
        a,
        this.walk( function( err, content ){
          result_a = { err: err, content: content }
        })
      )
    })
    .step( function(){
      if( result_a.err ) this.raise( result_a.err)
      fetch(
        b,
        this.walk( function( err, content ){
          result_b = { err: err, content: content }
        })
      )
    })
    .final( function(){ callback( this.err, result_b.content) })
  .end}
```

CoffeeScript, much shorter, also thanks to scope() functor

```
  fetch_this_and_that = l8.scope (a,b,cb) ->
    r_a = r_b = {content:null}
    @step  -> fetch a, @walk (err,content) -> r_a = {err,content}
    @step  -> @raise r_a.err if r_a.err ;\
              fetch b, @walk (err,content) -> r_b = {err,content}
    @final -> cb @err, r_b.content
```

Multiple steps, dynamically created, each run in parallel

```
  fetch_all = l8.scope (urls, callback) ->
    results = []
    @step ->
      @loop; for url in urls
        @each; do (url) ->
        fetch url, @walk (err, content) -> results.push {url, err, content}
    @final -> callback results
```

Multiple steps, dynamically created, run sequentially

```
  fetch_all_seq = l8.scope (urls, callback) ->
    results = []
    @step ->
      @loop; for url in urls
        do (url) ->
          @step -> fetch url, @walk -> result.push {url, err, content}
    @final -> callback results
```

Repeated step, externally terminated, gently

```
  spider = l8.scope (urls) ->
    queue = urls
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
show_news = l8.scope ->
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
interruptible executable entities. Each Step belongs to a Path. Task can
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

To insert a new step before the one next to the currently executing step, use
step(). Such steps are run once the current step is completed.

To insert a new step on a new parallel sub-path, use either loop()/each() and
then step() or just path(). Such steps block the current step until they are
completed. If multiple loops are nested, use end() to close a nesting level.

To insert multiple sub-steps, use begin/end around them. This is equivalent
to calling a sub-routine. Something that can also be done with call(), it will
add begin/end as well. Such steps are actually run in a new sub-task.

In all these cases, the current step won't be considered complete until all
these additionnal step are completed themselves.

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
required, one add new steps from within the callback itself. Often, this style
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

I believe l8 may help do that. Sure the granularity is not the same as in
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




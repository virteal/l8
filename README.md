l8 0.1.1
========

Light task manager for javascript/coffeescript/livescript...

"Let's walk these steps on multiple paths to do our tasks"

Schedule the execution of multiple "tasks". A task is made of "steps", much
like a function is made of statements. Steps are walked on multiple "paths".
Tasks and paths can nest, much like blocks of statements.

Execution goes from "step" to "step" by way of "walk". If one cannot walk a
step, one can wait for something and maybe retry later.

The main flow control structures are the sequential execution of steps,
the execution of forked steps on parallel paths, steps that loop until they
exit, steps that wait for something and error propagation similar to exception
handling.

l8 paths are kind of user level non preemptive threads. They are neither
native threads, nor worker threads, nor fibers nor the result of some CPS
transformation. Just a bunch of cooperating closures.

API
---

```
  l8.begin              -- enter new L8 scope
    .step( block )      -- queue a new step on the path to task's completion
    .fork( block )      -- queue a new step on a new parallel path
    .walk( block )      -- walk a step on its path, at most once per step
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

````
  function fetch_this_and_that( a, b, callback ){
    var result_a = null
    var result_b = {content:null}
    // Hypothetical synchrone version
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

Coffeescript, much shorter, also thanks to scope() functor

```
  fetch_this_and_that = l8.scope (a,b,cb) ->
    r_a = r_b = {content:null}
    @step  -> fetch a, @walk (err,content) -> r_a = {err,content}
    @step  -> @raise r_a.err if r_a.err ;\
              fetch b, @walk (err,content) -> r_b = {err,content}
    @final -> cb @err, r_b.content
```

Multiple steps, dynamically created, run in parallel

```
  function fetch_all( urls, callback ){
    var results = []
    l8.begin
      .step( function(){
        this.loop; for( var url in urls ){
          this.each; (function( url ){
            fetch( url, this.walk( function( err, content ){
              result.push({ url: url, err: err, content: content })
            }))
          })( url )
        }
      })
      .final( function(){ callback( results ) })
    .end
  }

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
  function fetch_all_seq( urls, callback ){
    var results = []
    l8.begin
      .step( function(){
        this.loop; for( var url in urls ){
          (function( url ){
            this.step( function(){
              fetch( url, this.walk( function( err, content ){
                result.push({ url: url, err: err, content: content })
              }))
            })
          })( url )
        }
      })
      .final( function(){ callback( results ) })
    .end
  }

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

This becomes really interesting when the AST gets dynamically modified!

Executable nodes in the AST are called "steps". They are the smallest non
interruptible executable entities. Each Step belongs to a Path. Task can
involve sub tasks that cooperate across multiple paths.

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
  Task.2 - a task with two paths
    MainPath
      Step
      Step
    ForkedPath
      Step
  Task.3 - a task with two simple sub tasks
    MainPath
      Step
        SubTask
          MainPath
            Step
        SubTask
          MainPath
            Step
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

Proposals for extensions are welcome. Let's get to paradize ;)

Enjoys.

   Jean Hugues Robert, aka @jhr, october 2012.




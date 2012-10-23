l8
==

Light task manager for javascript

Schedule the execution of multiple "tasks". A task is made of "steps", much
like a function is made of statements. Tasks can nest, much like blocks of
statements. The main flow control structures are the sequential execution of
steps, steps that loop until they exit, steps that wait for something and
error propagation similar to exception handling.

Execution goes from "step" to "step" by way of "walk". If one cannot walk a
step, one can wait for something and retry later.

  l8.begin              -- enter new scope
    .scope( function )  -- return the L8 scope guarded version of a function
    .step( block )      -- queue a new step
    .walk( block )      -- walk a step, at most once by step
    .loop               -- enter a non blocking loop, made of iterative steps
    .next               -- enter next iteration step in a non blocking loop
    .repeat( block )    -- enter a blocking loop
    .restart            -- like "continue", for blocking loops
    .exit               -- like "break", exit blocking loop or task
    .task               -- return current task
    .parent             -- return parent task
    .tasks              -- return sub tasks
    .top                -- return top task of sub task
    .state              -- return state of task, I->[Q|R]*->C/E/D
    .raise( error )     -- raise an error in task
    .spawn( block )     -- starts a new sub task
    .queue()            -- schedule a new sub task
    .cancel             -- cancel task & its sub tasks, brutal
    .stop               -- gentle cancel
    .timeout( milli )   -- cancel task if not done in time
    .delay( milli )     -- block for a while, then reschedule step
    .wait( lock )       -- queue step until some lock opens, then retry
    .resume             -- resume execution of a task waiting at some step
    .stopping           -- true after a gentle cancel, until task is done
    .failed             -- true if task done but with an error
    .succeed            -- true if task done without error
    .done               -- true if task done, else it either wait or runs
    .running            -- true if task not done
    .waiting            -- true if task waiting while running (ie is queued)
    .err                -- returns last raised error
    .canceled           -- true if task was canceled
    .stopped            -- true if task was gently canceled (gracefull)
    .l8                 -- return global L8 object
    .then( ... )        -- Promise/A protocol
    .error( block )     -- block to run when task is done but with error
    .progress( block )  -- block to run when some task is done
    .final( block )     -- block to run when task is all done
    .end                -- leave scope or loop, return current task

TBD: semaphores, locks, message queues, signals, etc...

Examples
--------

  function fetch_this_and_that( a, b, callback ){
    var result_a = null
    var result_b = null
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
    .final( function(){ callback( this.err, result_b) }) 
  .end}
  
  Coffeescript, shorter, also thanks to scope() functor
  fetch_this_and_that = l8.scope (a,b,cb) ->
    r_a = r_b = undefined 
    @step  -> fetch a, @walk (err,content) -> r_a = {err,content}
    @step  ->
      @raise r_a.err if r_a.err
      fetch b, @walk (err,content) -> r_b = {err,content}
    @final -> cb @err, r_b.content
     

  function fetch_all( urls, callback ){
    var results = []
    l8.begin
      .step( function(){
        this.loop; for( var url in urls ){
          this.next
          fetch( url, this.spawn( function( err, content ){
            result.push({ url: url, err: err, content: content })
          }))
        }
        this.end
      })
      .final( function(){ callback( results ) })
    .end
  }
  
  fetch_all = l8.scope (urls, callback) ->
    result = []
    @step ->
      @loop; for url in urls
        @next
        fetch url, @spawn (err, content) ->
          result.push {url, err, content}
      @end
    @final -> callback results    
        

  function fetch_all_seq( urls, callback ){
    var results = []
    l8.begin
      .step( function(){
        this.loop; for( var url in urls ){
          this.step( function(){
            fetch( url, this.walk( function( err, content ){
              result.push({ url: url, err: err, content: content })
            }))
          })
        }
        this.end
      })
      .final( function(){ callback( results ) })
    .end
  }
  
  fetch_all_seq = l8.scope (urls, callback ) ->
    results = []
    @step ->
      @loop; for url in urls
        @step -> fetch url, @walk -> result.push {url, err, content}
      @end
    @final -> callback results


  spider = l8.scope ( urls ) ->
    queue = urls
    @repeat ->
      @step -> url = queue.shift
      @step -> @wait 10000 if @parent.tasks.length > 10
      @step ->
        @exit if @stopping   
        fetch url, @walk (err,urls) ->
          return if err
          for url in urls
            queue.unshift url unless url in queue
   
  stop_spider -> spider.stop
  
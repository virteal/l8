// l8.js
//   Task manager
//   https://github.com/JeanHuguesRobert/l8
//
// 2012/10/24, JHR, create

var L8 = null
var l8 = null

var Util = require( "util")
Util.debug( "entering l8.js")

function trace(){
  var buf = ["L8"]
  for( var ii = 0 ; ii < arguments.length ; ii++){ buf.push( arguments[ii])}
  Util.puts( buf.join( ", "))
}

function Task( parent ){
  this.isRoot     = false
  this.parentTask = parent
  if( parent ){
    this.parentTask.subTasks.push( this)
  }
  this.subTasks    = []
  this.beginStack  = []
  this.firstStep   = null
  this.lastStep    = null
  this.currentStep = null
  this.wasCanceled = false
  this.isRunning   = true
  this.isDone      = false
  this.errorBlock  = null
  this.finalBlock  = null
}
Task.prototype = Task

L8 = l8 = new Task( null)
L8.isRoot = true
L8.stepQueue = []
L8.isScheduled = false

var CurrentStep = null

L8.scheduler = function scheduler(){
  if( !L8.isScheduled ){
    L8.isScheduled = true
    process.nextTick( tick)
    return L8
  }
  function tick(){
    L8.isScheduled = false
    var step
    while( step = L8.stepQueue.shift() ){
      step.scheduler()
    }
    L8.scheduler()
  }
}

L8.enqueueStep = function enqueue_step( step ){
  if( step.wasQueued )return
  L8.stepQueue.push( step)
  step.wasQueued = true
  step.isRunning = true
}

L8.scope = function scope( fn ){
  return function (){
    var task = CurrentStep ? CurrentStep.task : L8
    try{
      task = task.begin
        fn.apply( task)
      task.end
    }catch( e){
      task.end
      throw e
    }
    return task
  }
}

function Step( task, parent, previous, block ){
  this.task   = task
  this.parent = parent
  this.block  = block
  if( !previous ){
    this.previous  = null
    this.next      = null
    task.firstStep = task.lastStep = task.currentStep = this
  }else if( !previous.next ){
    this.previous  = previous
    this.previous.next = this
    this.next     = null
    task.lastStep = this
  }else{
    this.previous = previous
    this.next     = previous.next
    this.previous.next = this
  }
  this.wasQueued = false
  this.isRunning = false
}
Step.prototype = Step

CurrentStep = null // new Step( L8, null, null, null)

Task.__defineGetter__( "begin", function(){
  task = CurrentStep ? CurrentStep.task : L8
  if( task.done || task === L8 ){
    task = new Task( L8)
  }
  task.beginStack.push( CurrentStep)
  return task
})

Task.__defineGetter__( "end", function(){
  var task  = this
  var stack = task.beginStack
  var top   = stack[stack.length - 1]
  if( top != top ){
    // TODO: check balance
    throw "Unbalanced L8.end"
  }
  stack.pop()
  if( !stack.length ){
    if( task.firstStep ){
      L8.enqueueStep( task.firstStep)
    }
  }
  return this
})

Task.__defineGetter__( "done", function(){
  return this.isDone
})

Task.step = function step( block ){
  if( this.isRoot && CurrentStep && CurrentStep.task !== this ){
    return CurrentStep.task.step( block)
  }
  if( this.done ){
    throw "Can't add new step, task is done"
  }
  var parent = CurrentStep ? CurrentStep.parent : null
  var step = new Step( this, parent, this.lastStep, block)
  return this
}

Task.fork = function fork( block ){
  if( this.isRoot )return CurrentStep.task.fork( block)
  var task = new Task( this.task)
  var step = new Step( task, CurrentStep, null, block)
  return this
}

Task.walk = function walk( block ){
  var step = CurrentStep
  if( !step.isRunning ){
    throw "Can't walk, not running"
  }
  step.isRunning = false
  step.task.currentStep = step
  var that = this
  return function walk_cb(){
    var previous_step = CurrentStep
    CurrentStep = step
    try{
      if( block ){
        block.apply( step.task, arguments)
      }
      if( that.currentStep === step ){
        that.currentStep = null
        if( !step.isRunning ){
          step.isRunning = true
          step.scheduleNext()
        }
      }
    }catch( e ){
      throw e
    }finally{
      CurrentStep = previous_step
      L8.scheduler()
    }
  }
}

Step.scheduler = function step_scheduler(){
  if( !this.wasQueued )return
  this.wasQueued = false
  if( !this.isRunning )return
  var step = CurrentStep
  CurrentStep = this
  try{
    if( this.block ){
      this.block.apply( this.task)
    }
    this.scheduleNext()
  }catch( e ){
    throw e
  }finally{
    CurrentStep = step
    L8.scheduler()
  }
}

Step.scheduleNext = function schedule_next(){
  if( !this.isRunning )return
  this.isRunning = false
  var next_step = this.next
  if( next_step ){
    L8.enqueueStep( next_step)
  }else{
    var task = this.task
    // ToDo: sub task
    task.isDone = true
    if( task.finalBlock ){
      try{
        task.finalBlock()
      }catch( e ){
        throw e
      }
    }
  }
}

Task.final = function final( block ){
  this.finalBlock = block
  return this
}

Task.sleep = function sleep( delay ){
  var step = CurrentStep
  var task = step.task
  if( !step.isRunning ){
    throw "Can't sleep, not running"
  }
  task.currentStep = step
  step.isRunning = false
  setTimeout( function() {
    if( !task.currentStep === step )return
    step.isRunning = true
    step.scheduleNext()
  }, delay)
  return this
}

/*

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

    */

L8.startup = function(){

}

function tests(){
  function t(){
    var buf = ["test"]
    for( var ii = 0 ; ii < arguments.length ; ii++ ) buf.push( arguments[ii])
    trace.apply( this, buf)
  }
  t( "starts")

  var test_1 = function test1(){
    t( "test_1")
    l8.begin
      .step(  function(){ t( "start step 1") })
      .step(  function(){ t( "step") })
      .step(  function(){
        t( "sleep")
        this.sleep( 100)
        t( "sleeping")
      })
      .step(  function(){ t( "sleep done") })
      .final( function(){
        t( "final 1")
        test_2()
      })
    .end
  }

  var test_2 = L8.scope( function test2(){
    this
    .step(  function(){ t( "start step 2") })
    .step(  function(){ setTimeout( this.walk(), 0) })
    .step(  function(){ t( "sleep/timeout done") })
    .final( function(){
      t( "final 2")
      test_last()
    })
  })

  var test_last = function(){
    trace( "SUCCESS!!! all tests ok")
  }

  test_1()
  t( "starts scheduler")
  L8.scheduler()
}

trace( "starting L8")
var count_down = 5
setInterval(
  function(){
    trace( "tick " + --count_down)
    if( !count_down){
      trace( "exiting...")
      process.exit( 0)
    }
  },
  1000
)
tests()
trace( "done L8")

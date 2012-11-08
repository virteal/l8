// l8.js
//   Task manager
//   https://github.com/JeanHuguesRobert/l8
//
// 2012/10/24, JHR, create
// 2012/11/06, JHR,

var L8 = null
var l8 = null

var Util = require( "util")
Util.debug( "entering l8.js")

function trace(){
  var buf = ["L8"]
  for( var ii = 0 ; ii < arguments.length ; ii++){ buf.push( arguments[ii])}
  Util.puts( buf = buf.join( ", "))
  return buf
}

function Task( parent ){
  this.id         = ++TaskCount
  this.isRoot     = false
  this.parentTask = parent
  if( parent ){
    parent.subTasks[task.id] = this
    parent.subTaskCount++
  }
  this.subTasks        = {}
  this.subTaskCount    = 0
  this.queuedTasks     = {}
  this.queuedTaskCount = 0
  this.beginStack  = []
  this.stepCount   = 0
  this.firstStep   = null
  this.lastStep    = null
  this.currentStep = null
  this.pausedStep  = null
  this.stepResult  = undefined
  this.stepError   = undefined
  this.wasCanceled = false
  this.isRunning   = true
  this.isDone      = false
  this.errorBlock  = null
  this.finalBlock  = null
}
Task.prototype = Task

L8 = l8 = new Task( null)
L8.l8 = L8
L8.isRoot = true
L8.stepQueue = []
L8.isScheduled = false

var TaskCount   = 0
var CurrentStep = null
var NextStep    = null

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
      step.execute()
      step.scheduleNext()
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

Task.scope = function scope( fn ){
  return function (){
    var task = CurrentStep ? CurrentStep.task : L8
    try{
      task = task.begin
        fn.apply( task)
      task.end
    }catch( e ){
      task.end
      throw e
    }
    return task
  }
}

function Step( task, parent, previous, block ){
  this.task   = task
  this.parentStep = parent
  this.block  = block ? task.scope( block) : null
  if( !previous ){
    this.previous  = null
    this.next      = task.firstStep
    if( this.next ){ this.next.previous = this }
    task.firstStep = task.lastStep = task.currentStep = this
  }else if( !previous.next ){
    this.previous  = previous
    this.previous.next = this
    this.next     = null
    task.lastStep = this
  }else{
    this.previous = previous
    this.next     = previous.next
    previous.next.previous = this
    previous.next = this
  }
  this.wasQueued = false
  this.isRunning = false
  this.id        = ++task.stepCount
}
Step.prototype = Step

Task.toString = function task_to_string(){ return "Task " + this.id }

Task.__defineGetter__( "begin", function(){
  task = this.isRoot ? (CurrentStep ? CurrentStep.task : L8) : this
  if( task === L8 || task.done ){
    task = new Task( L8)
  }
  task.beginStack.push( task.currentStep)
  return task
})

Task.__defineGetter__( "end", function(){
  var task = this.isRoot ? CurrentStep.task : this
  var stack = task.beginStack
  var top   = stack[stack.length - 1]
  if( top != top ){
    // TODO: check balance
    throw "Unbalanced L8.end"
  }
  stack.pop()
  if( !stack.length ){
    if( task.firstStep ){
      if( !task.queuedTaskCount ){
        L8.enqueueStep( task.firstStep)
      }else{
        var dummy_step = new Step( task, task.firstStep.parentStep)
        task.pausedStep = task.firstStep
      }
      stack.push( task.firstStep)
    }
  }
  return task
})

Task.__defineGetter__( "done", function(){
  var task = this.isRoot ? CurrentStep.task : this
  return task.isDone
})

Task.__defineGetter__( "succeed", function(){
  var task = this.isRoot ? CurrentStep.task : this
  return task.isDone && !task.err
})

Task.__defineGetter__( "fail", function(){
  var task = this.isRoot ? CurrentStep.task : this
  return task.isDone && task.err
})

Task.__defineGetter__( "result", function(){
  return task.stepResult
})

Task.__defineSetter__( "result", function( val){
  var task = this.isRoot ? CurrentStep.task : this
  return task.stepResult = val
})

Task.__defineGetter__( "err", function(){
  var task = this.isRoot ? CurrentStep.task : this
  return task.stepError
})

Task.step = function step( block ){
  if( this.isRoot && CurrentStep && CurrentStep.task !== this ){
    return CurrentStep.task.step( block)
  }
  if( this.isDone ){
    throw "Can't add new step, task is done"
  }
  var parent_step = this.currentStep ? this.currentStep.parentStep : null
  if( NextStep && NextStep.task !== this ){
    throw "Cannot create step, not same task"
  }
  var insert_after = NextStep ? NextStep.previous : this.lastStep
  var step = new Step( this, parent_step, insert_after, block)
  return this
}

Task.fork = function fork( block ){
  var task = this.isRoot ? CurrentStep.task : this
  var new_task = new Task( task)
  var scoped_block = task.scope( block)
  var step = new Step( new_task, task.currentStep, null, scoped_block)
  L8.enqueueStep( step)
  task.queuedTasks[new_task.id] = new_task
  task.queuedTaskCount++
  return task
}

Task.subtaskDone = function subtask_done( subtask ){
  var task = this.isRoot ? (CurrentStep ? CurrentStep.task : L8) : this
  if( task.queuedTaskCount
  &&  task.queuedTasks[subtask.id]
  ){
    delete task.queuedTasks[subtask.id]
    if( --task.queuedTaskCount === 0 ){
      task.resume()
      // ToDo: error propagation
    }
  }
}

Task.pause = function pause(){
  var task = this.isRoot ? CurrentStep.task : this
  var step = task.currentStep
  if( !step.isRunning ){
      throw "Cannot pause, not running step"
  }
  task.pausedStep = step
  step.isRunning = false
  return task
}

Task.resume = function resume(){
  var task = this.isRoot ? CurrentStep.task : this
  var paused_step = task.pausedStep
  if( paused_step.isRunning ){
    throw "Cannot resume, running step"
  }
  task.pausedStep = null
  paused_step.isRunning = true
  paused_step.scheduleNext()
  return task
}


Task.walk = function walk( block ){
  var task = this.isRoot ? CurrentStep.task : this
  var step = task.currentStep
  if( !step.isRunning ){
    // ToDo: test/allow multiple walk()
    // throw "Can't walk, not running"
  }
  step.isRunning = false
  return function walk_cb(){
    if( task.currentStep !== step ){
      // ToDo: quid if multiple walk() fire?
      // throw "Cannot walk same step again"
    }
    var previous_step = CurrentStep
    CurrentStep = step
    if( arguments.length === 1 ){
      task.stepResult = arguments[0]
    }else{
      task.stepResult = arguments
    }
    try{
      // ToDo: block should run as if from next step ?
      // ToDo: block should run as a new step ?
      if( block ){
        task.stepResult = block.apply( task, arguments)
      }
      if( task.currentStep === step ){
        if( !step.isRunning ){
          step.isRunning = true
          step.scheduleNext()
        }
      }
    }catch( e ){
      task.raise( e)
    }finally{
      CurrentStep = previous_step
      L8.scheduler()
    }
  }
}

Task.__defineGetter__( "next", function(){
  return this.walk( null)
})

Step.toString = function(){ return this.task.toString() + "/" + this.id }

Step.execute = function step_execute(){
  if( !this.wasQueued )return
  this.wasQueued = false
  if( !this.isRunning )return
  var old_step = CurrentStep
  var old_next = NextStep
  CurrentStep  = this
  NextStep     = this.next
  var task     = this.task
  task.currentStep = this
  try{
    if( this.block ){
      task.stepResult = this.block.apply( task)
    }
  }catch( e ){
    // ToDo: _return exception handling
    task.stepError = e
  }finally{
    CurrentStep = old_step
    NextStep    = old_next
  }
}

Step.scheduleNext = function schedule_next(){
  if( !this.isRunning )return
  this.isRunning = false
  var task = this.task
  var next_step = this.next
  if( !task.stepError && next_step ){
    L8.enqueueStep( next_step)
    return
  }
  // When last step is done
  try{
    // ToDo: sub task
    task.isDone = true
    try{
      if( task.stepError ){
        if( task.errorBlock ){
          try{
            task.errorBlock()
          }catch( e ){
            throw e
          }
        }
      }else{
        if( task.successBlock ){
          try{
            task.successBlock()
          }catch( e ){
            throw e
          }
        }
      }
    }catch( e ){
      task.stepError = e
      throw e
    }finally{
      if( task.finalBlock ){
        try{
          task.finalBlock()
        }catch( e ){
          throw e
        }
      }
    }
  }catch( e ){
    task.stepError = e
    if( task.parentTask ){
      task.parentTask.raise( e)
    }
  }finally{
    if( task.parentTask ){
      task.parentTask.subtaskDone( task)
    }
  }
}

Task.final = function final( block ){
  var task = this.isRoot ? CurrentStep.task : this
  task.finalBlock = block
  return task
}

Task.error = function error( block ){
  var task = this.isRoot ? CurrentStep.task : this
  task.errorBlock = block
  return task
}

Task.success = function success( block ){
  var task = this.isRoot ? CurrentStep.task : this
  task.successBlock = block
  return task
}

Task.sleep = function sleep( delay ){
  var task = this.isRoot ? CurrentStep.task : this
  var step = task.currentStep
  if( !step.isRunning ){
    throw "Can't sleep, not running"
  }
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
  var test
  function t(){
    var buf = ["test" + (test ? " " + test : ""), "" + CurrentStep]
    for( var ii = 0 ; ii < arguments.length ; ii++ ) buf.push( arguments[ii])
    return trace.apply( this, buf)
  }
  t( "starts")

  var test_1 = function test1(){
    test = 1
    t( "go")
    l8.begin
      .step(  function(){ t( "start") })
      .step(  function(){ t( "step") })
      .step(  function(){
        t( "sleep")
        this.sleep( 100)
        t( "sleeping")
      })
      .step(  function(){ t( "sleep done") })
      .final( function(){
        t( "final")
        test_2()
      })
    .end
  }

  var test_2 = L8.scope( function test2(){
    test = 2
    this
    .step(  function(){ t( "start") })
    .step(  function(){ setTimeout( this.walk(), 0) })
    .step(  function(){ t( "sleep/timeout done") })
    .final( function(){
      t( "final")
      test_3()
    })
  })

  var test_3 = L8.scope( function test3(){
    test = 3
    this
    .step( function(){ t( "start") })
    .step( function(){
      t( "add step 1")
      this.step( function(){ t( "first step") })
      t( "add step 2")
      this.step( function(){ t( "second step") })
   })
   .step( function(){ t("third & final step") })
   .success( function(){ t("success") })
   .final( function(){
     t( "final")
     test_4()
   })
  })

  var test_4 = L8.scope( function test4(){
    test = 4
    this
    .step( function(){ t( "start") })
    .step( function(){
      t( "raise error")
      throw "step error"
   })
   .step(  function(){ t("final step") })
   .error( function(){ t("error", this.err)})
   .final( function(){
     t( "final")
     test_5()
   })
  })

  var test_5 = L8.scope( function test5(){
    test = 5
    this.label = t( "start")
    this
    .fork(   function(){ this.label = t( "fork 1")
      this
      .step( function(){ this.sleep( 10)  })
      .step( function(){ t( "end fork 1") })
    })
    .fork(   function(){ this.label = t( "fork 2")
      this
      .step( function(){ this.sleep( 5)   })
      .step( function(){ t( "end fork 2") })
    })
    .step(   function(){ t( "joined") })
    .final( function(){
      t( "final")
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
var count_down = 10
setInterval(
  function(){
    trace( "tick " + --count_down)
    if( !count_down ){
      trace( "exiting...")
      process.exit( 0)
    }
  },
  1000
)
tests()
trace( "L8 scheduler started")

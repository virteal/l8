// l8.js
//   Task manager
//   https://github.com/JeanHuguesRobert/l8
//
// 2012/10/24, JHR, create

var L8 = null
var l8 = null

var Util = null

try{
  Util = require( "util")
  Util.debug( "entering l8.js")
}catch( e ){}

function trace(){
  var buf = ["L8"]
  for( var ii = 0 ; ii < arguments.length ; ii++ ){ buf.push( arguments[ii]) }
  buf = buf.join( ", ")
  try{
    if( Util ){
      Util.puts( buf)
    }else{
      console.log( buf)
    }
  }catch( e ){
    // ToDo: host adapted tracing
  }
  return buf
}

function Task( parent ){
  this.id         = ++L8.taskCount
  this.isRoot     = !parent
  this.parentTask = parent
  if( parent ){
    parent.subTasks[task.id] = this
    parent.subTaskCount++
  }
  this.subTasks        = {}
  this.subTaskCount    = 0
  this.queuedTasks     = {}
  this.queuedTaskCount = 0
  this.beginStack      = []
  this.stepCount       = 0
  this.firstStep       = null
  this.lastStep        = null
  this.currentStep     = null
  this.nextStep        = null
  this.pausedStep      = null
  this.stepResult      = undefined
  this.stepError       = undefined
  this.wasCanceled     = false
  this.shouldStop      = false
  this.isDone          = false
  this.successBlock    = null
  this.failureBlock    = null
  this.progressBlock   = null
  this.finalBlock      = null
  this.allPromises     = null
}
Task.prototype = Task

function Step( task, parent, previous, block ){
  this.id         = ++task.stepCount
  this.task       = task
  this.parentStep = parent
  this.block      = block ? task.scope( block) : null
  // When inserting at head
  if( !previous ){
    this.previous  = null
    this.next      = task.firstStep
    if( this.next ){ this.next.previous = this }
    task.firstStep = task.lastStep = task.currentStep = this
  // When inserting at tail
  }else if( !previous.next ){
    this.previous  = previous
    this.previous.next = this
    this.next     = null
    task.lastStep = this
  // When inserting in the middle of the list
  }else{
    this.previous = previous
    this.next     = previous.next
    previous.next.previous = this
    previous.next = this
  }
  this.isBlocking = true
}
Step.prototype = Step

// Bootstrap root task, id 0
L8 = {taskCount:-1}
L8 = l8 = new Task()
L8.taskCount   = 0
L8.l8          = L8
L8.stepQueue   = []
L8.isScheduled = false

L8.cancelEvent   = {l8:"cancel"}
L8.redoEvent     = {l8:"redo"}
L8.breakEvent    = {l8:"break"}
L8.continueEvent = {l8:"continue"}
L8.returnEvent   = {l8:"return"}

var CurrentStep = new Step( L8)

L8.scheduler = function scheduler(){
// Inject the global scheduler in the global event loop.
// It executes queued steps and their next ones.
  function tick(){
    L8.isScheduled = false
    var step
    while( step = L8.stepQueue.shift() ){
      step.execute()
      step.scheduleNext()
    }
    L8.scheduler()
  }
  if( !L8.isScheduled ){
    L8.isScheduled = true
    // ToDo: better browser support, see nextTick in
    // https://github.com/kriskowal/q/blob/master/q.js
    try{
      process.nextTick( tick)
    }catch( e ){
      setTimeout( tick,  0)
    }
  }
}

L8.enqueueStep = function enqueue_step( step ){
  L8.stepQueue.push( step)
  step.isBlocking = false
}

Step.execute = function step_execute(){
  if( this.isBlocking )return
  var task         = this.task
  task.currentStep = this
  task.nextStep    = this.next
  CurrentStep      = this
  try{
    if( this.block ){
      if( this.block.length > 1 ){
        task.stepResult = this.block.apply( task, task.stepResult)
      }else{
        task.stepResult = this.block.apply( task, [task.stepResult])
      }
      task.progressing( task.stepResult)
    }
  }catch( e ){
    task.stepError = e
  }finally{
    task.nextStep = null
  }
}

Step.scheduleNext = function schedule_next(){
  if( this.isBlocking )return
  var task = this.task
  if( task.stepError ){
    if( task.stepError === L8.redoEvent ){
      L8.enqueueStep( this)
      return
    }
    if( task.stepError === L8.breakEvent ){
      task.stepError = undefined
    }
  }
  this.isBlocking = true
  var next_step = this.next
  if( !task.stepError && next_step ){
    L8.enqueueStep( next_step)
    return
  }
  // When all steps are done, wait for subtasks
  task.pausedStep = this
  var subtasks = task.subTasks
  var queue    = task.queuedTasks
  var subtask
  for( var subtask_id in subtasks ){
    subtask = subtasks[subtask_id]
    if( subtask.isDone || queue[subtask.id] )continue
    queue[subtask.id] = task
    return
  }
  for( subtask in queue )return
  // When nothing more, handle task termination
  task.pausedStep = null
  try{
    task.isDone = true
    if( task.stepError === L8.returnEvent ){
      task.stepError = undefined
    }
    task.progressing( task.stepResult)
    try{
      if( task.stepError ){
        if( task.failureBlock ){
          try{
            task.failureBlock( task.stepError)
          }catch( e ){
            throw e
          }
        }else{
          throw task.stepError
        }
      }else{
        if( task.successBlock ){
          try{
            task.successBlock( task.stepResult)
          }catch( e ){
            throw e
          }
        }
      }
    }catch( e ){
      task.stepError = e
      // ToDo: should throw or not?
      throw e
    }finally{
      if( task.finalBlock ){
        try{
          task.finalBlock( task.stepError, task.stepResult)
        }catch( e ){
          throw e
        }
      }
      if( task.allPromises ){
        var list = task.allPromises
        var len  = list.length
        var item
        var err  = task.stepError
        var rslt = task.stepResult
        var blk
        for( var ii = 0 ; ii < len ; ii++ ){
          item = list[ii]
          if( !item )continue
          if( err ){
            item.reject( err)
          }else{
            item.resolve( rslt)
          }
        }
      }
    }
  }catch( e ){
    task.stepError = e
    if( task.parentTask ){ task.parentTask.raise( e) }
  }finally{
    if( task.parentTask ){ task.parentTask.subtaskDone( task) }
  }
}

Task.scope = function scope( fn ){
  return function (){
    var task = CurrentStep.task
    try{
      task = task.begin
      fn.apply( task, arguments)
    }catch( e ){
      throw e
    }finally{
      task.end
    }
    return task
  }
}

Task.toString = function task_to_string(){ return "Task " + this.id }

Task.__defineGetter__( "current", function(){
  return this.isRoot ? CurrentStep.task : this
})

Task.__defineGetter__( "task", function(){
  return this.isRoot ? CurrentStep.task : this
})

Task.__defineGetter__( "begin", function(){
  task = CurrentStep.task
  // When "begin" means "create a new task"
  if( task === L8 || task.done ){ task = new Task( L8) }
  task.beginStack.push( task.currentStep)
  return task
})

Task.__defineGetter__( "end", function(){
  var task  = this.current
  var stack = task.beginStack
  var top   = stack[stack.length - 1]
  if( top != top ){
    // TODO: check balance
    throw new Error( "Unbalanced L8.end")
  }
  stack.pop()
  if( !stack.length ){
    if( task.firstStep ){
      // When first step can run immediately
      if( !task.queuedTaskCount ){
        L8.enqueueStep( task.firstStep)
      // When first step is after forks
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
  return this.current.isDone
})

Task.__defineGetter__( "succeed", function(){
  var task = this.current
  return task.isDone && !task.err
})

Task.__defineGetter__( "fail", function(){
  var task = this.current
  return task.isDone && task.err
})

Task.__defineGetter__( "result", function(){
  return this.current.stepResult
})

Task.__defineSetter__( "result", function( val){
  return this.current.stepResult = val
})

Task.__defineGetter__( "error", function(){
  return this.current.stepError
})

Task.__defineGetter__( "stop", function(){
  var task = this.current
  task.shouldStop = true
  return task
})

Task.__defineGetter__( "stopping", function(){
  var task = this.current
  return task.shouldStop && !task.isDone
})

Task.__defineGetter__( "stopped", function(){
  var task = this.current
  return task.shouldStop && task.isDone
})

Task.__defineGetter__( "canceled", function(){
  return this.current.wasCanceled
})

Task.step = function step( block ){
  var task = this.current
  if( task.isDone )throw new Error( "Can't add new step, l8 task is done")
  var parent_step = task.currentStep ? task.currentStep.parentStep : null
  var insert_after = task.nextStep ? task.nextStep.previous : task.lastStep
  var step = new Step( task, parent_step, insert_after, block)
  return this
}

Task.fork = function fork( block, starts_paused, detached ){
  var task = this.current
  var new_task = new Task( task)
  var scoped_block = task.scope( block)
  var step = new Step( new_task, task.currentStep, null, scoped_block)
  if( starts_paused ){
    new_task.pausedStep = step
  }else{
    L8.enqueueStep( step)
  }
  if( !detached ){
    task.queuedTasks[new_task.id] = new_task
    task.queuedTaskCount++
  }
  return task
}

Task.call = function task_call( block ){
  var task = this.current
  for( var subtask in task.queuedTasks ){
    throw new Error( "Cannot queue l8 calls, use fork()?")
  }
  return task.fork( block, false, false)
}

Task.spawn = function task_spawn( block, starts_paused ){
  return this.fork( block, starts_paused, true)
}

Task.subtaskDone = function subtask_done( subtask ){
  var task = this.current
  if( task.queuedTaskCount
  &&  task.queuedTasks[subtask.id]
  ){
    delete task.queuedTasks[subtask.id]
    if( --task.queuedTaskCount === 0 ){
      if( task.pausedStep ){ task.resume() }
      // ToDo: error propagation
    }
  }
}

Task.__defineGetter__( "tasks", function(){
  var buf = []
  var tasks = this.subTasks
  for( var k in tasks ){
    buf.push( tasks[k])
  }
  return buf
})

Task.__defineGetter__( "parent", function(){
  return this.current.parentTask
})

Task.__defineGetter__( "root", function(){
  var task = this.current
  if( !task.parentTask )return task
  while( true ){
    if( task.parentTask === L8 )return task
    task = task.parentTask
  }
})

Task.__defineGetter__( "paused", function(){
  var task = this.current
  return !!task.pausedStep
})

Task.pause = function pause( yields, yield_value ){
  var task = this.current
  var step = task.currentStep
  if( step.isBlocking ){
    throw new Error( "Cannot pause, already blocked l8 task")
  }
  task.pausedStep = step
  step.isBlocking = true
  if( yields ){
    task.stepResult = yield_value
  }
  return task
}

Task.yield = function task_yield( value ){
  return this.pause( true, value)
}

Task.resume = function resume( yields, yield_value ){
  var task = this.current
  var paused_step = task.pausedStep
  if( !paused_step ){
    throw new Error( "Cannot resume, not paused l8 task")
  }
  if( !paused_step.isBlocking ){
    throw new Error( "Cannot resume, running l8 step")
  }
  task.pausedStep = null
  if( yields ){
    task.stepResult = yield_value
  }
  paused_step.isBlocking = false
  paused_step.scheduleNext()
  return task
}

Task.run = function task_run( value ){
  return this.resume( true, value)
}

Task.raise = function raise( err ){
  var task = this.current
  if( task.isDone )return
  task.stepError = err
  if( task.pausedStep ){
    task.resume()
  }else{
    var step = task.currentStep
    if( step.isBlocking ){
      step.isBlocking = false
      step.scheduleNext()
    }else if( step === CurrentStep ){
      throw err
    }
  }
  return task
}

Task.throw = Task.raise

Task.cancel = function task_cancel(){
  var task    = this.current
  var done    = false
  var on_self = false
  while( !done ){
    done = true
    var tasks = task.tasks
    for( var subtask in tasks ){
      if( subtask.wasCanceled )continue
      if( subtask.currentStep === CurrentStep ){
        on_self = subtask
      }else{
        done = false
        subtask.cancel()
      }
    }
  }
  task.wasCanceled = true
  task.raise( L8.cancelEvent)
  return task
}

Task.progressing = function task_progressing( msg ){
  if( this.progressBlock ){
    try{
      this.progressBlock( msg, this)
    }catch( e ){
      // ToDo
    }
  }
  var list = this.allPromises
  if( !list )return
  var len  = list.length
  var item
  for( var ii = 0 ; ii < len ; ii++ ){
    item = list[ii]
    if( item.progressBlock ){
      try{
        var val = item.progressBlock( msg, this)
        // ToDo: propagate progress in promise chain
      }catch( e ){
        // ToDo
      }
    }
  }
}

Task._return = Task["return"] = function task_return( val ){
  var task = this.current
  if( task.isDone ){
    throw new Error( "Cannot _return, done l8 task")
  }
  task.stepResult = val
  task.raise( L8.returnEvent)
}
Task.__defineGetter__( "redo", function task_redo(){
  return this.raise( L8.redoEvent)
})

Task.__defineGetter__( "_break", function task__break(){
  return this.raise( L8.breakEvent)
})

Task.__defineGetter__( "break",  function task_break(){
  return this.raise( L8.breakEvent)
})

Task.__defineGetter__( "_continue", function task__continue(){
  return this.raise( L8.continueEvent)
})

Task.__defineGetter__( "continue", function task_continue(){
  return this.raise( L8.continueEvent)
})

Task.walk = function walk( block ){
  var task = this.current
  var step = task.currentStep
  if( step.isBlocking ){
    // ToDo: test/allow multiple walk()
    // throw "Can't walk, not running"
  }
  step.isBlocking = true
  return function walk_cb(){
    if( task.currentStep !== step ){
      // ToDo: quid if multiple walk() fire?
      // throw "Cannot walk same step again"
    }
    var previous_step = CurrentStep
    CurrentStep = step
    var result
    if( arguments.length === 1 ){
      result = arguments[0]
    }else{
      result = arguments
    }
    try{
      // ToDo: block should run as if from next step ?
      // ToDo: block should run as a new step ?
      if( block ){
        result = block.apply( task, arguments)
      }
      if( task.currentStep === step ){
        if( step.isBlocking ){
          task.stepResult = result
          step.isBlocking = false
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

Task.final = function final( block ){
  var task = this.current
  task.finalBlock = block
  return task
}

Task.finally = Task.final

Task.failure = function failure( block ){
  var task = this.current
  task.failureBlock = block
  return task
}

Task.catch = Task.failure

Task.success = function success( block ){
  var task = this.current
  task.successBlock = block
  return task
}

Task.then = function task_then( success, failure, progress ){
  if( this.isDone ){
    // ToDo: should allow this
    throw new Error( "Cannot provide promise on alreay done l8 task")
  }
  var promise = new Promise()
  if( !this.allPromises ){ this.allPromises = [] }
  this.allPromises.push( promise)
  return promise.then( success, failure, progress)
}

function Promise(){
// Promise/A compliant. See https://gist.github.com/3889970
  this.successBlock  = null
  this.failureBlock  = null
  this.progressBlock = null
  this.nextPromise   = null
  return this
}
Promise.prototype = Promise

Promise.then = function promise_then( success, failure, progress ){
  this.successBlock  = success
  this.failureBlock  = failure
  this.progressBlock = progress
  return this.nextPromise = new Promise()
}

Promise.resolve = function promise_resolve(){
  if( this.successBlock ){
    try{
      var val = this.successBlock.apply( this, arguments)
      if( this.nextPromise ){
        this.nextPromise.resolve( val)
      }
    }catch( e ){
      if( this.nextPromise ){
        this.nextPromise.reject( e)
      }
    }
  }else if( this.nextPromise ){
    this.resolve.apply( this.nextPromise, arguments)
  }
  return this
}

Promise.reject = function promise_reject(){
  if( this.failureBlock ){
    try{
      var val = failureBlock.apply( this, arguments)
      if( this.nextPromise ){
        this.nextPromise.resolve( val)
      }
    }catch( e ){
      if( this.nextPromise ){
        this.nextPromise.reject( e)
      }
    }
  }else if( this.nextPromise ){
    this.reject.apply( this.nextPromise, arguments)
  }
  return this
}

Promise.progress = function promise_progress(){
  if( this.progressBlock ){
    try{
      progressBlock.apply( this, arguments)
    }catch( e ){}
  }
  return this
}

Task.sleep = function sleep( delay ){
  var task = this.current
  var step = task.currentStep
  if( step.isBlocking ){
    throw new Error( "Can't sleep, already blocked l8 task")
  }
  step.isBlocking = true
  setTimeout( function() {
    if( !task.currentStep === step )return
    step.isBlocking = false
    step.scheduleNext()
  }, delay)
  return task
}

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
      .step(  function(){ t( "start")      })
      .step(  function(){ t( "step")       })
      .step(  function(){ t( "sleep")
                          this.sleep( 100)
                          t( "sleeping")   })
      .step(  function(){ t( "sleep done") })
      .final( function(){ t( "final")
                          test_2()         })
    .end
  }

  var test_2 = L8.scope( function test2(){
    test = 2; this
    .step(  function(){ t( "start")               })
    .step(  function(){ setTimeout( this.next, 0) })
    .step(  function(){ t( "sleep/timeout done")  })
    .final( function(){ t( "final")
                        test_3()                  })
  })

  var test_3 = L8.scope( function test3(){
    test = 3; this
    .step(    function(){ t( "start")             })
    .step(    function(){ t( "add step 1"); this
      .step(  function(){   t( "first step")  })
                          t( "add step 2"); this
      .step(  function(){   t( "second step") })  })
    .step(    function(){ t("third & final step") })
    .success( function(){ t("success")            })
    .final(   function(){ t( "final")
                          test_4()                })
  })

  var test_4 = L8.scope( function test4(){
    test = 4; this
    .step(    function(){ t( "start")                    })
    .step(    function(){ t( "raise error")
                          throw new Error( "step error") })
    .step(    function(){ t("!!! skipped step")          })
    .failure( function(){ t("error", this.error)         })
    .final(   function(){ t( "final")
                          test_5()                       })
  })

  var test_5 = L8.scope( function test5(){
    test = 5; this.label = t( "start"); this
    .fork(   function(){ this.label = t( "fork 1"); this
      .step( function(){ this.sleep( 10)  })
      .step( function(){ t( "end fork 1") })             })
    .fork(   function(){ this.label = t( "fork 2"); this
      .step( function(){ this.sleep( 5)   })
      .step( function(){ t( "end fork 2") })             })
    .step(   function(){ t( "joined")     })
    .final(  function(){ t( "final")
                         test_6()                        })
  })

  var test_6 = L8.scope( function test6(){
    function other1(){ l8.step( function(){ t( "in other1")})}
    function other2(){ l8.fork( function(){ t( "in other2")})}
    test = 6; this
    .step(  function(){ other1(); t( "other1() called")  })
    .step(  function(){ t( "other1", this.result); this
                        other2(); t( "other2() called")  })
    .step(  function(){ t( "other2", this.result)        })
    .final( function(){ t( "final result", this.result)
                        test_last()                      })
  })

  var test_last = function(){
    trace( "SUCCESS!!! all tests ok")
  }

  test_1()
  t( "starts scheduler")
  L8.scheduler()
  trace( "L8 scheduler started")
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

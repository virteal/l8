// l8.js
//   Task manager
//   https://github.com/JeanHuguesRobert/l8
//
// 2012/10/24, JHR, create
//
// (c) Jean Hugues Robert
// Licensed under the MIT license.

// Boilerplate for module loaders
(function( define ){ 'use strict';
define( function(){

/* ----------------------------------------------------------------------------
 *  Debug
 */

 // DEBUG mode defaults to "on" when nodejs. Please use l8.debug() to change it
 var DEBUG = (typeof window === 'undefined')

var NoOp = function(){}

var TraceStartTask = !DEBUG ? 0 : 0
// When debugging test cases, this tells when to start outputting traces

// In node.js, "util" module defines puts(), among others
var Util = null
try{
  Util = require( "util")
  DEBUG && Util.debug( "entering l8.js")
}catch( e ){}

var trace = function(){
// Print trace. Offer an easy breakpoint when output contains "DEBUG"
  var buf          = []
  var args         = ["l8"]
  var only_strings = true
  if( arguments.length === 1 && arguments[0] instanceof Array){
    args = args.concat( arguments[0])
  }else{
    args = args.concat( Array.prototype.slice.call( arguments, 0))
  }
  var item
  for( var ii = 0 ; ii < args.length ; ii++ ){
    item = args[ii] 
    if( item ){
      if( item.toLabel ){
        item = item.toLabel()
      }else if( typeof item === 'string' || !Util ){
        item = item
      }else{
        item = Util.inspect( item)
      }
      if( only_strings && typeof item !== "string" ){
        only_strings = false
      }
      if( item ){
        buf.push( item)
      }
    }
  }
  try{
    if( Util ){
      if( only_strings ){
        Util.puts( buf = buf.join( ", "))
      }else{
        Util.puts( buf = Util.inspect( buf))
      }
    }else{
      console.log( buf)
    }
    if( buf.indexOf( "DEBUG") >=  0 ){
      // please set breakpoint here to debug
      try{ debugger }catch( e ){}
    }
  }catch( e ){
    // ToDo: host adapted tracing
  }
  return buf
}

var assert = function( cond ){
  // ToDo: https://github.com/visionmedia/better-assert
  if( !cond ){
    trace.apply( this, arguments)
    trace( "DEBUG assert failure")
    throw new Error( "Assert failure")
  }
}

var de = DEBUG, bug = trace, mand = assert
// That's my de&&bug darling, also de&&mand()


/* ----------------------------------------------------------------------------
 *  Task & Step
 */

var NextTaskId = 0

function Task( parent, is_fork, is_spawn ){
// Tasks are like function call activation records, but with a spaghetti stack
// because more than one child task can be active at the same time.
// See also http://en.wikipedia.org/wiki/Spaghetti_stack
// Forked tasks's parent task collect the multiple results, one per fork.
// Spawn tasks don't block their parent and don't provide a result.
  this.nextFree = void null // Task allocator reuse objects
  task_init.call( this, parent, is_fork, is_spawn)
  return this
}
var ProtoTask = Task.prototype

var task_init =
ProtoTask.init = function( parent, is_fork, is_spawn ){
  this.id               = NextTaskId++ // unique id. .toString() uses it too
  if( DEBUG ){
    this.stepCount = 0  // Step ids generator
  }
  // Note: initing properties to undefined helps some JIT compilers
  this.firstStep        = void null
  this.isSingleStep     = false
  this.currentStep      = void null // What step the task is on, aka "IP"
  this.insertionStep    = void null // Where steps are usually added
  this.pausedStep       = void null // What step the task is paused on
  this.isFork           = !!is_fork
  this.wasSpawn         = !!is_spawn
  this.stepResult       = void null
  this.stepError        = void null
  this.isDone           = false     // False while task is pending
  this.subtasks         = void null // a set, keys are task.id
  this.subtasksCount    = void null // size of that set
  this.parentTask       = parent    // aka "caller"
  this.forkedTasks      = void null // Subtask(s) that block this task
  this.forkedTasksCount = void null // Number of such tasks
  this.forkResults      = void null // Array of these task's result
  this.forkResultsCount = void null // Number of entries in that array
  this.forkResultsIndex = void null // in parent's forkResults array
  this.data             = void null // bindings for task local variables
  this.optional         = {}        // Some JIT compilers prefer that
  /*
  this.optional.wasCanceled     = false    // "brutal cancel" flag
  this.optional.shouldStop      = false    // "gentle cancel" flag
  this.optional.deferredSteps   = null     // Go lang style "defer"
  this.optional.deferredResult  = null
  this.optional.deferredError   = null
  this.optional.successBlock    = null
  this.optional.failureBlock    = null
  this.optional.progressBlock   = null
  this.optional.finalBlock      = null
  this.optional.donePromise     = null
  this.optional.generator       = null
  */
  if( TraceStartTask && NextTaskId > TraceStartTask )trace( "DEBUG New", this)
  // Add new task to it's parent's list of pending subtasks
  // When a done task creates a subtask, the parent task inherit it
  // The root task is obviously never done, or else this would break
  while( parent.isDone ){ parent = parent.parentTask }
  // Parent remembers all pending subtasks, both forked & spawn ones
  if( !parent.subtasks ){
    de&&mand( !parent.subtasksCount, parent.subtasksCount)
    parent.subtasks      = {}
    parent.subtasksCount = 1
  }else{
    parent.subtasksCount++
  }
  parent.subtasks[this.id] = this
  // Forked tasks also block their parent and accumulate results
  if( !is_spawn ){
    if( !parent.forkedTasks ){
      // When only one member, direct link, efficient because frequent
      parent.forkedTasks      = this
      parent.forkedTasksCount = 1
    }else{
      de&&mand( is_fork || parent === l8 )
      parent.forkedTasksCount++
      // With two members, mutate into an array
      if( parent.forkedTasksCount === 2 ){
        parent.forkedTasks = [parent.forkedTasks,this]
      // More members, push them
      }else{
        parent.forkedTasks.push( this)
      }
    }
    // Allocate entry for forked tasks results, set to undefined for now
    if( is_fork ){
      if( !parent.forkResults ){
        parent.forkResults      = [void null]
        parent.forkResultsCount = 1
        this.forkResultsIndex   = 0 // this task's result in parent.forkResults
      }else{
        parent.forkResults[
          this.forkResultsIndex = parent.forkResultsCount++
        ] = void null
      }
    }
  }
  // Please see what happens in Task.subtaskDoneEvent(), ie "destructor"
  if( TraceStartTask && NextTaskId > TraceStartTask )trace( "New", this)
  return this
}

function Step( task, block, is_fork, is_repeat ){
// Tasks execute steps, some steps may create additional steps to execute.
// Forked steps run in parallel whereas regular steps are sequential. Steps
// that cannot execute immediatly can block and terminate later when some
// asynchronous event occurs. WHen a forked step is blocked, the other forked
// steps are still executed whereas when a regular step blocks, the next
// steps are blocked too.
  step_init.call( this, task, block, is_fork, is_repeat)
  return this
}
var ProtoStep = Step.prototype

var step_init =
ProtoStep.init = function( task, block, is_fork, is_repeat ){
  if( DEBUG ){
    this.id = ++task.stepCount
    this.wasQueued   = false
    this.wasExecuted = false
  }
  while( task.isDone ){
    task = task.parentTask
    // ToDo: maybe I could create a task "on the fly"?
    if( task === l8 )throw new Error( "Cannot add step to root l8 task")
  }
  this.task = task
  if( block ){
    // If step is a promise, step will block until that promise delivers
    if( !(block instanceof Function) ){
      block = function(){ task.interpret( block) }
    }
    this.block     = block
  }else{
    this.block     = NoOp
  }
  this.isFork      = is_fork
  this.isRepeat    = is_repeat
  this.wasSpawn    = false
  this.isBlocking  = false   // When task is paused on this step
  // enqueue/dequeue list management
  //this.previous    = null
  this.next        = null
  var previous = task.insertionStep
  task.insertionStep = this
  // When inserting at head
  if( !previous ){
    this.next      = task.firstStep
    //if( this.next ){ this.next.previous = this }
    task.firstStep = task.currentStep = this
  // When inserting at tail
  //}else if( !previous.next ){
    //this.previous      = previous
    //this.previous.next = this
  // When inserting in the middle of the list
  }else{
    //this.previous = previous
    this.next     = previous.next
    //previous.next.previous = this
    previous.next = this
  }
  if( TraceStartTask && NextTaskId > TraceStartTask ){
    trace(
      "New", this,
      this === task.firstStep ? "first" : ""
    )
  }
  return this
}

// Bootstrap root task, id 0
var l8 = new Task( {}/*dummy parent*/)
l8.parentTask = null
l8.data = {task:l8}
l8.proto = ProtoTask
l8.l8 = l8
var CurrentStep = new Step( l8, NoOp, false, true) // empty loop
CurrentStep.isBlocking = true
l8.currentStep = l8.pausedStep = CurrentStep
l8.timeNow = null
l8.dateNow = null

// Browser & nodejs way to schedule code execution in the event loop.
// Note: you can provide yours if you get an efficient one.
try{
  l8.nextTick = process.nextTick
  l8.nextTick( function(){})
}catch( e ){
  l8.nextTick = function next_tick( block ){ setTimeout( block, 0) }
  l8.nextTick( function(){})
}
var L8_NextTick = l8.nextTick

// Some special errors are used to build control structures
l8.cancelEvent   = "cancel"
l8.breakEvent    = "break"
l8.continueEvent = "continue"
l8.returnEvent   = "return"
l8.failureEvent  = "failure"
l8.closeEvent    = "close"

ProtoTask.debug = function( on ){
  if( arguments.length ){
    l8.de = de = DEBUG = on
  }
  return DEBUG
}
l8.debug( DEBUG)
ProtoTask.trace  = trace
ProtoTask.bug    = trace
ProtoTask.assert = assert
ProtoTask.mand   = assert

l8.client = !Util
l8.server = Util


/* ----------------------------------------------------------------------------
 *  Scheduler, aka "step walker"
 *  process.nextTick() or setTimeout() can do the job but I do some buffering
 *  and that runs faster.
 */

var NO_SCHEDULER = false // false && !DEBUG

var L8_Execute // ProtoStep.execute, see below

if( !NO_SCHEDULER ){

var L8_QueuedStep  = null
var L8_StepQueue   = []
var L8_IsScheduled = false

var L8_Tick = function tick(){
  // Update l8.timeNow & l8.dateNow, called often enough.
  // Fast and somehow usefull to correlate traces about the same event.
  // ToDo: Use V8/Mozilla Date.now() ?
  l8.timeNow = (l8.dateNow = new Date()).getTime()
  var step
  while( step = L8_QueuedStep ){
    L8_QueuedStep = L8_StepQueue.shift()
    //step.execute()
    L8_Execute( step)
  }
  L8_IsScheduled = false
  // When done, assume code runs from within the "root" task
  CurrentStep = l8.currentStep
}

var L8_Scheduler = function scheduler(){
// Inject the scheduler in the global event loop.
// It executes queued steps and their next ones.
  if( !L8_IsScheduled ){
    de&&mand( L8_QueuedStep)
    L8_IsScheduled = true
    L8_NextTick( L8_Tick)
  }
}

L8_EnqueueStep = function enqueue_step( step ){
// Schedule step to execute. Restart scheduler if it is not started.
  if( DEBUG ){
    assert( !step.wasQueued || step.isRepeat )
    step.wasQueued = true
  }
  // Store step, efficiently if only one exist, in an array if more is needed
  if( L8_QueuedStep ){
    L8_StepQueue.push( step)
  }else{
    L8_QueuedStep = step
  }
  de&&mand( !step.isBlocking )
  // Wake up scheduler if necessary, it will eventually execute this step
  if( !L8_IsScheduled ){
    L8_IsScheduled = true
    L8_NextTick( L8_Tick)
  }
  // Debug traces
  if( TraceStartTask && NextTaskId > TraceStartTask ){
    if( L8_QueuedStep ){
      L8_QueuedStep.trace( "queued step")
      var item
      for( var ii = 0 ; ii < L8_StepQueue.length ; ii++ ){
        item = L8_StepQueue[ii].trace( "queued step[" + ii + "]")
      }
    }
  }
}

// when NO_SCHEDULER
}else{

// The code above does the equivalent of this, but it does it faster.
var L8_EnqueueStep = function( step ){
  de&&mand( !step.task.isDone )
  L8_NextTick(
    // slower: execute.bind( step)
    function(){
      //execute.call( step)
      L8_Execute( step)
      // When done, assume code runs from within the "root" task
      CurrentStep = l8.currentStep
    }
  )
}
l8.__defineGetter__( "timeNow", function(){
  return (l8.dateNow = new Date()).getTime()
})

} // endif !NO_SCHEDULER

ProtoStep.trace = function step_trace(){
  var args = Array.prototype.slice.call( arguments, 0)
  var task = this.task
  trace( [this].concat( args).concat([
    task.isDone     ? "task done" : "",
    this === task.firstStep ? "first" : "",
    this.isRepeat   ? "repeat" : "",
    this.isFork     ? "fork"   : "",
    this.isBlocking ? "pause"  : ""
  ]))
}

ProtoStep.execute = L8_Execute = function step_execute( that ){
  if( TraceStartTask && NextTaskId > TraceStartTask ){
    this.trace( "DEBUG execute")
  }
  if( false && DEBUG ){
    assert( !that.wasExecuted || that.isRepeat )
    that.wasExecuted = true
  }
  var task = that.task
  if( DEBUG && task.isDone )throw new Error( "BUG, exec done l8 step: " + that)
  de&&mand( !task.parentTask || task.parentTask.subtasksCount > 0 )
  if( that.isBlocking ){
    de&&mand( task.pausedStep === that )
    return
  }
  task.currentStep = that
  CurrentStep      = that
  // Steps created by this step are queued after the insertionStep
  task.insertionStep = that
  var block = that.block
  var result
  // Consume previous fork results if any unless step is a fork itself
  var results = !that.isFork && task.forkResults
  if( results ){
    de&&mand( !task.forkedTasks )
    task.forkResults      = null
    task.forkResultsCount = 0
  }
  // Execute block, set "this" to the current task
  try{
    // If step(), don't provide any parameter
    if( !block.length ){
      result = block.call( task)
    // If step( r), provide forks results or last result as a single parameter
    }else if( block.length === 1 ){
      if( results ){
        result = block.call( task, results)
      }else{
        result = block.call( task, task.stepResult)
      }
    // If step( a, b, ...), use fork results or assume last result is an array
    }else{
      result = block.apply(
        task,
        (results && results.length > 1)
        ? results
        : task.stepResult
      )
    }
    de&&mand( !task.parentTask || task.parentTask.subtasksCount > 0 )
    // Update last result only when block returned something defined.
    // Result can be set asynchronously using proceed(), see below
    if( result !== void null ){
      task.stepResult = result
      // If result is a promise, block until promise is done
      //if( result.then ){
        //return that.wait( result)
      //}
    }
    if( DEBUG ){ task.progressing() }
  }catch( e ){
    // scheduleNext() will handle the error propagation
    task.stepError = e
    if( DEBUG ){
      that.trace( "task failure", e)
      if( TraceStartTask && NextTaskId > TraceStartTask ){
        that.trace( "DEBUG execute failed" + e)
      }
    }
  }
  // task.insertionStep = null
  that.scheduleNext()
}

ProtoStep.scheduleNext = function schedule_next(){
// Handle progression from step to step, error propagation, task termination
  var task = this.task
  if( task.isDone )throw new Error( "Bug, schedule a done l8 task: " + this)
  de&&mand( !task.parentTask || task.parentTask.subtasksCount > 0 )
  if( this.isBlocking ){
    de&&mand( task.pausedStep === this, task.pausedStep)
    return
  }
  var redo = this.isRepeat
  // Handle "continue" and "break" in loops
  if( redo && task.stepError ){
    if( task.stepError === l8.continueEvent ){
      task.stepError = void null
    }else if( task.stepError === l8.breakEvent ){
      redo = false
    }
  }
  // When no error, wait for subtasks if any, else move to next step or loop
  if( !task.stepError ){
    var next_step = redo ? this : this.next
    if( next_step ){
      if( !this.isFork || !next_step.isFork || redo ){
        // Regular steps wait for forked tasks, fork steps don't
        if( task.forkedTasks ){
          this.isBlocking = true
          task.pausedStep = this
          return
        }
      }
      if( redo ){
        if( task === l8 ){
          this.isBlocking = true
          task.pausedStep = this
          return
        }
      }
      if( NO_SCHEDULER ){
        L8_NextTick( function(){ L8_Execute( next_step) })
      }else{
        L8_EnqueueStep( next_step)
      }
      de&&mand( task.parentTask || task.parentTask.subtasksCount > 0 )
      return
    }else{
      if( task.forkedTasks ){
        this.isBlocking = true
        task.pausedStep = this
        return
      }
    }
  // When error, cancel all remaining subtasks
  }else{
    var subtasks = task.subtasks
    if( subtasks ){
      for( var subtask_id in subtasks ){
        subtasks[subtask_id].cancel()
      }
      de&&mand( !task.parentTask || task.parentTask.subtasksCount > 0 )
    }
    if( task.forkedTasks ){
      this.isBlocking = true
      task.pausedStep = this
      return
    }
  }
  // Handle deferred steps
  var steps = task.optional.deferredSteps
  if( task.optional.deferredSteps ){
    var step = steps.pop()
    if( step ){
      // Save task result before running first deferred step
      if( !task.optional.deferredResult ){
        task.optional.deferredResult = task.stepResult
        task.optional.deferredError  = task.stepError
      }
      // Schedule the deferred step
      //task.firstStep = null
      step = MakeStep( task, step[0]) // ToDo: handle args
      if( NO_SCHEDULER ){
        L8_NextTick( function(){ L8_Execute( step) })
      }else{
        L8_EnqueueStep( step)
      }
      return
    // Restore "pre-deferred" task result
    }else{
      task.stepResult = task.optional.deferredResult
      task.stepError  = task.optional.deferredError
    }
  }
  // When nothing more, handle task termination
  de&&mand( !task.forkedTasks )
  this.isBlocking = true
  task.pausedStep = null
  // ToDo: let success/failure block run asynch, then done, not before
  task.isDone     = true
  var exit_repeat = false
  var is_return   = false
  var block
  if( task.stepError === l8.returnEvent ){
    is_return = true
    task.stepError = void null
  }else if( task.stepError === l8.breakEvent ){
    task.stepError = void null
    exit_repeat    = true
  }
  task.progressing()
  var err = task.stepError
  de&&mand( !task.parentTask || task.parentTask.subtasksCount > 0 )
  if( err ){
    if( block = task.optional.failureBlock ){
      try{
        block.call( task, err)
        err = task.stepError = void null
      }catch( e ){
        task.stepError = e
      }
    }
  }else{
    if( block = task.optional.successBlock ){
      try{
        block.call( task, task.stepResult)
      }catch( e ){
        err = task.stepError = e
      }
    }
  }
  if( block = task.optional.finalBlock ){
    try{
      block.call( task, err, task.stepResult)
    }catch( e ){
      err = task.stepError = e
    }
  }
  var promise = task.optional.donePromise
  if( promise ){
    if( err ){
      promise.reject( err)
    }else{
      promise.resolve( task.stepResult)
    }
  }
  var parent = task.parentTask
  if( exit_repeat ){
    //if( parent ){
      if( parent.currentStep.isRepeat ){
        parent.currentStep.isRepeat = false
      }else{
        // task.parentTask.raise( l8.breakEvent)
        task.stepError = l8.breakEvent
      }
    //}
  }else if( is_return && !task.optional.wasCanceled ){
    task.optional.wasCanceled
    task.stepError = l8.returnEvent
  }
  //if( parent ){ // all tasks (but inactive root one) have a parent
    de&&mand( parent.subtasksCount > 0 )
    parent.subtaskDoneEvent( task)
  //}
  // Ask the Step allocator to reuse this now done task's steps
  if( !task.data ){
    // ToDo: I could free task when binding contains only references, not defs
    task.firstStep.free()
  }
}

ProtoTask.subtaskDoneEvent = function( subtask ){
// Private. Called by Step.scheduleNextStep() when a subtask is done
  if( DEBUG && TraceStartTask && NextTaskId > TraceStartTask ){
    trace( "DEBUG Done subtask", subtask)
  }
  // One less pending subtask
  de&&mand( !this.parentTask || this.parentTask.subtasksCount > 0 )
  de&&mand( !subtask.forkedTasks )
  de&&mand( this.subtasksCount > 0, this.subtasksCount)
  de&&mand( this.subtasks)
  de&&mand( this.subtasks[subtask.id] === subtask )
  delete this.subtasks[subtask.id]
  // Parent task inherits spawn subtasks, unix does the same with processes
  var list = subtask.subtasks
  if( list ){
    subtask.subtasks      = null
    subtask.subtasksCount = 0
    var item
    for( var ii in list ){
      item = list[ii]
      item.parentTask = this
      this.subtasks[item.id] = item
      this.subtasksCount++
    }
  }
  if( --this.subtasksCount === 0 ){
    this.subtasks = null
  }
  // When a fork is done, resume blocked parent and remember result
  if( !subtask.wasSpawn ){ // && this.parentTast ){
    // When a forked task fails, parent will cancel the other forks
    var err = subtask.stepError
    if( err ){
      this.stepError = err
      if( !this.parentTask ){
        trace( "Unhandled exception", subtask, err)
      }
    }else if( subtask.isFork ){
      // Accumulate forked results, stored at the appropriate index
      this.forkResults[subtask.forkResultsIndex] = subtask.stepResult
    }
    // When all forks succeed, resume blocked parent task
    // Ditto if one fork fails
    if( --this.forkedTasksCount <= 0 || err ){
      // Clear this.forkedTasks when it is empty, code elsewhere expect this
      if( !this.forkedTasksCount ){
        this.forkedTasks = null
      }
      // As a bonus, deblocking task's result is made available for next step
      if( !err ){ this.stepResult = subtask.stepResult }
      // Unless fork terminated early there should be blocked steps
      var paused_step = this.pausedStep
      if( paused_step && this !== l8 ){
        de&&mand( paused_step.task === this )
        paused_step.isBlocking = false
        this.pausedStep = null
        paused_step.scheduleNext()
      // But if task has no more steps, make task result using forked results
      }else if( subtask.isFork ){
        var list = this.forkedTasksResults
        var len  = list ? this.forkedTasksResults.length : 0
        // ToDo: I need a isTask flag to handle length 1 result lists
        if( list && len > 1 ){
          var buf  = []
          var item
          for( var ii = 0 ; ii < len ; ii++ ){
            item = list[ii]
            if( !item.stepError ){
              buf.push( item.stepResult)
            }else{
              buf.push( void null)
            }
          }
          this.stepResult = buf
        }
      }      
    }
    // Some task objects are reuseable. If a reference to the task was held
    // somewhere, using it is when the task is done is a bug
    // However, references to long lived spawn tasks are legit
    subtask.free()
  }
}

ProtoTask.step = function step( block, is_fork, is_repeat ){
// Add a step to execute later
  var task = this.current
  MakeStep( task, block, is_fork, is_repeat)
  return task
}

ProtoTask.proceed = function( block ){
// Pause current task and return a callback to be called to resume execution.
  var task = this.current
  var step = task.currentStep
  if( step.isBlocking ){
    // ToDo: test/allow multiple next()
    // throw new Error( "Can't walk, not running")
  }
  step.isBlocking = true
  task.pausedStep = step
  return function walk_cb(){
    if( task.currentStep !== step ){
      // ToDo: quid if multiple proceed() fire?
      throw new Error( "Cannot walk same step again")
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
          de&&mand( task.pausedStep === step )
          if( result ){
            task.stepResult = result
            // If result is a promise, wait for it
            if( result.then ){
              task.wait( result)
              return
            }
          }
          // resume task
          step.isBlocking = false
          task.pausedStep = null
          step.scheduleNext()
        }
      }
    }catch( e ){
      task.raise( e)
    }finally{
      CurrentStep = previous_step
      //L8_Scheduler()
    }
  }
}

ProtoTask.__defineGetter__( "walk", function(){
  return this.proceed( null)
})

ProtoTask.__defineGetter__( "flow", function(){
// NodeJs friendly "walk" that checks first result to detect errors and throw
// error when present, or else filters out first result to set result of step
// using rest.
  return function(){
    var err = arguments[0]
    if( err )throw err
    if( arguments.length === 2 )return arguments[1]
    return Array.splice.call( arguments, 1)
  }
})


/*
 *  Step allocator. Attempt to reuse some previous steps.
 */

var NextFreeStep = null

function MakeStep( task, block, is_fork, is_repeat ){
  var step = NextFreeStep
  if( step ){
    NextFreeStep = step.next
    return step_init.call( step, task, block, is_fork, is_repeat)
  }
  return new Step( task, block, is_fork, is_repeat)
}

ProtoStep.free = function(){
  if( NextFreeStep ){
    this.next = NextFreeStep
  }
  NextFreeStep = this
}

/*
 *  Task allocator. Attempt to reuse some previous task objects.
 */

var NextFreeTask = null

function MakeTask( parent, is_fork, is_spawn ){
  var task = NextFreeTask
  if( task ){
    NextFreeTask = task.nextFree
    return task_init.call( task, parent, is_fork, is_spawn)
  }
  return new Task( parent, is_fork, is_spawn)
}

ProtoTask.free = function(){
  this.nextFree = NextFreeTask
  NextFreeTask = this
}

/* ----------------------------------------------------------------------------
 *  API
 */

ProtoTask.toString = ProtoTask.toLabel = function task_to_string(){
  var label = this === l8 ? "" : this.label
  label = label ? "[" + label + "]" : ""
  return "Task/" + this.id + label
}

ProtoTask.__defineGetter__( "label", function(){
  return this.get( "label") || ""
})

ProtoTask.__defineSetter__( "label", function( label ){
  return this.var( "label", label)
})

ProtoTask.Task = function task_task( fn ){
// Build a "task constructor". When such a beast is called, it creates a task
  if( !(fn instanceof Function) ){
    var block
    if( !(fn instanceof Array) || arguments.length > 1 ){
      block = Array.prototype.slice.call( arguments, 0)
    }else{
      block = fn
    }
    fn = function(){ this.interpret( block) }
  }
  return function (){
    var parent_task = CurrentStep.task
    while( parent_task.isDone ){ parent_task = parent_task.parentTask }
    var args = arguments
    // Don't create a useless task if parent task is still a "single step" task
    if( parent_task.isSingleStep && !parent_task.firstStep.next ){
      MakeStep( parent_task, function(){ return fn.apply( task, args) })
      return parent_task
    }
    var task = MakeTask( parent_task)
    var next_step = MakeStep( task, function(){ return fn.apply( task, args) })
    if( NO_SCHEDULER ){
      L8_NextTick( function(){ L8_Execute( next_step) })
    }else{
      L8_EnqueueStep( next_step)
    }
    return task
  }
}

ProtoTask._task = function( block, forked, paused, detached, repeat ){
  var task = this.current
  var new_task
  // Don't create a useless task if parent task is still a "single step" task
  // ToDo: fix this
  if( task.isSingleStep && !task.firstStep.next ){
     new_task = task
  }else{
    new_task = MakeTask( task, forked, detached)
  }
  // Mark as reuseable, unless spawn
  new_task.wasSpawn     = detached
  new_task.isSingleStep = true
  if( paused ){
    // Pause task, need a new "first step" for that
    MakeStep( new_task)
    new_task.pausedStep = new_task.firstStep
    new_task.pausedStep.isBlocking = true
    MakeStep( new_task, block)
  }else{
    var next_step = MakeStep( new_task, block)
    if( NO_SCHEDULER ){
      L8_NextTick( function(){ L8_Execute( next_step) })
    }else{
      L8_EnqueueStep( next_step)
    }
  }
  return new_task
}

ProtoTask.task = function task_task( block, forked, paused, detached, repeat ){
// Add a step that will start a new task with some initial step to execute.
// Such tasks are initially "single step" task. If the single step calls a
// task constructor, that constructor will get optimized and will reuse the
// single step task instead of creating a new task.
  if( TraceStartTask && NextTaskId > TraceStartTask ){
    trace( this.current.currentStep , "invokes fork()",
      forked   ? "forked"   : "",
      paused   ? "paused"   : "",
      detached ? "detached" : "",
      repeat   ? "repeated" : ""
    )
  }
  var task = this.current
  if( task === l8 ){
    var task = MakeTask( l8)
    return task._task( block, forked, paused, detached, repeat)
  }
  return task.step( function(){
    if( TraceStartTask && TraceStartTask >= NextTaskId ){
      trace( task.currentStep , "executes scheduled fork",
        forked   ? "forked"   : "",
        paused   ? "paused"   : "",
        detached ? "detached" : "",
        repeat   ? "repeated" : ""
      )
    }
    return task._task( block, forked, paused, detached, repeat)
  }, forked, repeat)
}

ProtoTask.fork = function task_fork( block, starts_paused ){
// Add a step that will start a forked task with some initial step to execute
  return this.task( block, true, starts_paused)
}

ProtoTask._fork = function( block, starts_paused ){
  return this._task( block, true, starts_paused)
}

ProtoTask.spawn = function task_spawn( block, starts_paused ){
// Add a step that will start a detached task with some initial step to execute
  return this.task( block, true, starts_paused, true) // detached
}

ProtoTask._spawn = function( block, starts_paused ){
  return this._task( block, true, starts_paused, true) // detached
}

ProtoTask.repeat = function task_repeat( block ){
// Add a step that will repeately start a new task with a first step to execute
  return this.task( block, false, false, false, true) // repeated
}

ProtoTask.defer = function(){
  var task = this.current
  var args = arguments
  var steps = task.optional.deferredSteps
  if( steps ){
    step.push( args)
  }else{
    task.optional.deferredSteps = [args]
  }
}

ProtoTask.__defineGetter__( "current", function(){
  return this === l8 ? CurrentStep.task : this
})

ProtoTask.__defineGetter__( "begin", function(){
  return MakeTask( this.current)
})

ProtoTask.__defineGetter__( "end", function(){
  var task  = this
  var first = task.firstStep
  var is_new_step = false
  if( !first ){
    is_new_step
    first = MakeStep( task)
  }
  // When first step can run immediately
  if( !task.forkedTasks ){
    L8_EnqueueStep( first)
  // When first step is after forks
  }else{
    // Pause task to wait for forks, need a new "first step" for that
    if( !is_new_step ){
      var save = task.insertionStep
      // Insert at head of list of steps
      task.insertionStep = null
      MakeStep( task)
      task.insertionStep = save
    }
    task.pausedStep = task.firstStep
    task.pausedStep.isBlocking = true
  }
  // Return parent, makes chaining possible t.begin.step().step().end.step()
  return task.parentTask
})

ProtoTask.__defineGetter__( "done", function(){
  return this.current.isDone
})

ProtoTask.__defineGetter__( "succeed", function(){
  var task = this.current
  return task.isDone && !task.err
})

ProtoTask.__defineGetter__( "fail", function(){
  var task = this.current
  return task.isDone && task.err
})

ProtoTask.__defineGetter__( "result", function(){
  return this.current.stepResult
})

ProtoTask.__defineSetter__( "result", function( val){
  return this.current.stepResult = val
})

ProtoTask.__defineGetter__( "error", function(){
  return this.current.stepError
})

ProtoTask.__defineGetter__( "stop", function(){
  var task = this.current
  task.optional.shouldStop = true
  return task
})

ProtoTask.__defineGetter__( "stopping", function(){
  var task = this.current
  return task.optional.shouldStop && !task.isDone
})

ProtoTask.__defineGetter__( "stopped", function(){
  var task = this.current
  return task.optional.shouldStop && task.isDone
})

ProtoTask.__defineGetter__( "canceled", function(){
  return this.current.optional.wasCanceled
})

ProtoTask.interpret = function task_interpret( steps ){
// Add steps according to description.
  var task = this.current
  if( steps.then ){
    this.step( function(){ this.wait( steps) })
    return task
  }
  var block
  var len = steps.length
  for( var ii = 0 ; ii < len ; ii++ ){
    step = steps[ii]
    if( step instanceof Function ){
      this.step( step)
    }else if( step instanceof Array ){
      this.task( step)
    }else if( step.then ){
      (function( promise ){ this.step( function(){ this.wait( promise) }) })
      ( step)
    }else{
      var done = false
      if( block = step.step     ){ this.step(     block); done = true }
      if( block = step.task     ){ this.task(     block); done = true }
      if( block = step.repeat   ){ this.repeat(   block); done = true }
      if( block = step.fork     ){ this.fork(     block); done = true }
      if( block = step.progress ){ this.progress( block); done = true }
      if( block = step.success  ){ this.success(  block); done = true }
      if( block = step.failure  ){ this.failure(  block); done = true }
      if( block = step.final    ){ this.final(    block); done = true }
      if( block = step.defer    ){ this.defer(    block); done = true }
      if( !done ){
        // Immediate value
        (function( value ){ this.step( function(){ return value }) })( step)
      }
    }
  }
  return task
}

ProtoTask.__defineGetter__( "tasks", function(){
  var buf = []
  var tasks = this.subtasks
  if( tasks ){
    for( var k in tasks ){
      buf.push( tasks[k])
    }
  }
  return buf
})

ProtoTask.__defineGetter__( "parent", function(){
  return this.current.parentTask
})

ProtoTask.__defineGetter__( "root", function(){
  var task = this.current
  if( !task.parentTask )return task
  while( true ){
    if( task.parentTask === l8 )return task
    task = task.parentTask
  }
})

ProtoTask.__defineGetter__( "paused", function(){
  var task = this.current
  return !!task.pausedStep
})

ProtoTask.cancel = function task_cancel(){
  var task    = this.current
  if( task.isDone )return task
  var done    = false
  var on_self = false
  while( !done ){
    done = true
    var tasks = task.tasks
    for( var subtask in tasks ){
      subtask = tasks[subtask]
      if( subtask.optional.wasCanceled )continue
      if( subtask.currentStep === CurrentStep ){
        on_self = subtask
      }else{
        done = false
        subtask.cancel()
      }
    }
  }
  if( !on_self && task !== CurrentStep.task ){
    task.optional.wasCanceled = true
    task.raise( l8.cancelEvent)
  }
  return task
}

ProtoTask.progressing = function(){
  if( this.optional.progressBlock ){
    try{
      this.optional.progressBlock( this)
    }catch( e ){
      // ToDo
    }
  }
  if( this.optional.promise ){
    this.promise.progress()
  }
}

ProtoTask.return = function task_return( val ){
  var task = this.current
  if( task.isDone ){
    throw new Error( "Cannot return(), done l8 task")
  }
  if( arguments.length === 1 ){ task.stepResult = val }
  task.optional.wasCanceled = true
  task.raise( l8.returnEvent, false, task.stepResult)
}

ProtoTask.__defineGetter__( "continue", function task_continue(){
  return this.raise( l8.continueEvent)
})

ProtoTask.__defineGetter__( "break",  function task_break(){
  return this.raise( l8.breakEvent)
})

ProtoStep.toString = ProtoStep.toLabel
= function(){ return this.task.toString() + "/" + this.id }

ProtoTask.final = function( block ){
  var task = this.current
  task.optional.finalBlock = block
  return task
}

ProtoTask.failure = function( block ){
  var task = this.current
  task.optional.failureBlock = block
  return task
}

ProtoTask.success = function( block ){
  var task = this.current
  task.optional.successBlock = block
  return task
}

/* ----------------------------------------------------------------------------
 *  Trans-compiler
 */
 
// l8.compile() may need to be provided a well scoped "eval()" or else it's
// result function may lack access to the global variables referenced by the
// code to (re)compile. This should be necessary on nodejs only, not in browsers
l8.eval = null // l8.eval = function( txt ){ eval( txt) }

ProtoTask.compile = function task_compile( code, generator ){
// Expand some macros to make a "task constructor" or a "generator constructor".

  // Lexer

  code = code.toString()
  var close = code.lastIndexOf( "}")
  code = code.substr( 0, close) + code.substr( close + 1)
  code = "\n begin;\n" + code + "\n end;\n"
  var ii = 0
  var fragment
  var fragments = []
  code.replace(
    / (begin|end|step;|step\([^\)]*\);|task;|task\([^\)]*\);|fork;|fork\([^\)]*\);|repeat;|repeat\([^\)]*\);|progress;|progress\([^\)]*\);|success;|success\([^\)]*\);|failure;|failure\([^\)]*\);|final;|final\([^\)]*\);|defer;|defer\([^\)]*\);)/g,
    function( match, keyword, index ){
      fragment = code.substring( ii, index - 1)
      fragments.push( fragment)
      fragment = "~kw~" + keyword
      fragments.push( fragment)
      ii = index + match.length
    }
  )

  // Parser

  function is_empty( code ){
    return !code
    .replace( /;/g,  "")
    .replace( /\./g, "")
    .replace( /\s/g, "")
    .replace( /\r/g, "")
    .replace( /\n/g, "")
  }

  function parse( list, subtree, is_nested ){
    var obj
    var kw
    var params
    if( !list.length )return subtree
    var head = list.shift()
    // trace( head)
    if( head == "~kw~end" ){
      if( !is_nested ){
        throw new Error( "Unexpected 'end' in l8.compile()")
      }
      return subtree
    }
    if( head == "~kw~begin" ){
      var sub = parse( list, [], true)
      subtree.push( {begin: sub})
    }else if( head.indexOf( "~kw~") === 0 ){
      kw = head.substr( 4).replace( ";", "").replace( /\s/g, "")
      params = ""
      kw = kw.replace( /\(.*\)/, function( match ){
        params = match
        return ""
      })
      obj = {params:params}
      obj[kw] = list.shift()
      subtree.push( obj)
    }else{
      subtree.push( {code:head})
    }
    return parse( list, subtree, is_nested)
  }

  var tree = parse( fragments, [], false)
  var body = tree[1].begin
  var head = body[0].code.replace( /;\nfunction/, "function")
  delete body[0]

  // Code generator

  var pushed

  function f( params, code ){
    params = params || "()"
    return "function" + params + "{ "
    + code.replace( / +/g, " ").replace( /(\r|\n| )+$/, "")
    + " }"
  }

  function g( buf, kw, params, code ){
    if( is_empty( code) ){
      pushed = true
      return ""
    }
    //buf.push( "this." + kw + "( " + f( code) + ");\n")
    buf.push( kw + "( " + f( params, code) + ")")
    pushed = true
  }

  var previous = null

  function gen_block( head, buf, after ){
    if( !head )return
    var block
    if( block = head.begin ){
      var body_obj = []
      previous = null
      generate( block, body_obj)
      body_obj = body_obj.join( ".\n")
      if( after && (after.fork || after.repeat || after.spawn) ){
        buf.push( body_obj)
        pushed = true
        return
      }
      // "begin" after "step" is equivalent to "task"
      if( after && after.step ){
        buf.push( body_obj)
        pushed = true
        return
      }
      g( buf, "task", "()", body_obj)
    }
    else if( block = head.code     ){
      if( !is_empty( block) ){
        buf.push( block + "\nthis")
      }
      pushed = true
    }
    else if( block = head.step     ){ g( buf, "step",     head.params, block) }
    else if( block = head.task     ){ g( buf, "task",     head.params, block) }
    else if( block = head.fork     ){ g( buf, "fork",     head.params, block) }
    else if( block = head.spawn    ){ g( buf, "spawn",    head.params, block) }
    else if( block = head.repeat   ){ g( buf, "repeat",   head.params, block) }
    else if( block = head.progress ){ g( buf, "progress", head.params, block) }
    else if( block = head.success  ){ g( buf, "success",  head.params, block) }
    else if( block = head.failure  ){ g( buf, "failure",  head.params, block) }
    else if( block = head.final    ){ g( buf, "final",    head.params, block) }
    else if( block = head.defer    ){ g( buf, "defer",    head.params, block) }
  }

  function generate( tree, buf ){
    if( !tree.length ){
      gen_block( previous, buf)
      return
    }
    var head = tree.shift()
    if( !head )return generate( tree, buf)
    pushed = false
    if( head.begin && previous ){
      var content
      for( var kw in previous ){
        if( kw == "params" )continue
        content = previous[kw]
      }
      if( is_empty( content) ){
        content = []
        var tmp = previous
        gen_block( head, content, previous)
        previous = tmp
        for( kw in previous ){
          if( kw == "params" )continue
          // "step" + "begin" eqv "task"
          if( kw == "step" ){
            previous["step"] = null
            kw = "task"
          }
          previous[kw] = content.join( ".\n")
        }
        head = null
      }
    }
    if( previous ){
      gen_block( previous, buf)
      if( !pushed ){
        //g( buf, "step", previous.code)
        if( !is_empty( previous.code) ){
          buf.push( previous.code  + ";this")
        }
        pushed = true
      }
    }
    previous = head
    generate( tree, buf)
  }

  //trace( Util.inspect( fragments))
  var str  = []
  str.push( ";this")
  generate( body, str)
  // trace( Util.inspect( str))
  str = str.join( ".\n") 
  var fn
  // Compile code, with user provided "scoped eval" maybe
  if( l8.eval ){
    fn = l8.eval( "L8_compiled = " + head + str + "}") // WTF, xxx = is needed
    // l8.eval = null
  }else{
    // Remove 'function xx(p1,p2..){' declaration, but remember parameters
    var params
    head = head.replace(
      /function.*\((.*)\).*{/,
      function( match, p1 ){
        params = p1.replace( / /, "")
        return ""
      }
    )
    // Compile code, using "global scope", something that is platform dependant
    fn = new Function( params, head + str)
  }
  return !generator ? l8.Task( fn) : l8.Generator( fn)
}

l8.compileGenerator = function( code ){
  return l8.compile( code, true)
}

if( false && DEBUG ){
var do_something_as_task = function(){
    var ii = 0
    step; this.sleep( 1000);
    fork; do_some_other_task();
    fork; another_task();
    task; yet();
    step( a, b ); use( a); use( b);
    step; begin
      ii++
      step; ha()
    end
    fork; begin
      first()
      failure; bad()
    end
    fork; begin
      step; second()
      failure; very_bad()
    end
    begin
      step; ok()
      failure; ko()
    end
    repeat; begin
      step; act()
      step( r ); if( !r ) this.break
    end
    success; done();
    failure; problem();
    final;   always();
}
l8.compile( do_something_as_task)
} // DEBUG

/* ----------------------------------------------------------------------------
 *  Promise
 */

function Promise(){
// Promise/A compliant. See https://gist.github.com/3889970
  this.wasResolved  = false
  this.resolveValue = void null
  this.wasRejected  = false
  this.rejectReason = void null
  this.allHandlers  = null
  return this
}
var ProtoPromise = Promise.prototype

var P_defer = null // q.js or when.js 's defer(), or angular's $q's one

l8.setPromiseFactory = function( factory ){
  P_defer = factory
}

function MakePromise(){
  return P_defer ? P_defer() : new Promise()
}

ProtoTask.promise = function(){ return MakePromise() }

ProtoTask.then = function task_then( success, failure, progress ){
  var promise = this.optional.donePromise
  if( !promise ){
    promise = this.optional.donePromise = MakePromise()
  }
  return promise.then( success, failure, progress)
}

ProtoTask.callback = function l8_node( promise, cb ){
// Register a node style callback to handle a promise completion.
// Promise defaults to current thead when not specified.
  if( !cb ){
    de&&mand( promise instanceof Function )
    cb      = promise
    promise = this.current
  }
  return promise.then(
    function( ok){ cb( null, ok) },
    function( ko){ cb( ko)       }
  )
}

ProtoPromise.then = function promise_then( success, failure, progress ){
  var new_promise = MakePromise()
  if( !this.allHandlers ){
    this.allHandlers = []
  }
  this.allHandlers.push({
    successBlock:  success,
    failureBlock:  failure,
    progressBlock: progress,
    nextPromise:   new_promise
  })
  if( this.wasResolved ){
    this.resolve( this.resolveValue, true) // force
  }else if( this.wasRejected ){
    this.reject( this.rejectReason, true)  // force
  }
  return new_promise
}

ProtoPromise.handleResult =  function handle( handler, ok, value ){
  var block = ok ? handler.successBlock : handler.failureBlock
  var next  = handler.nextPromise
  if( block ){
    try{
      var val = block.call( this, value)
      if( val && val.then ){
        val.then(
          function( r ){ ProtoPromise.handleResult( handler, true,  r) },
          function( e ){ ProtoPromise.handleResult( handler, false, e) }
        )
        return
      }
      if( next ){
        next.resolve( val)
      }
    }catch( e ){
      if( next ){
        next.reject( e)
      }
    }
  }else if( next ){
    next.resolve.call( next, value)
  }
  handler.nextPromise = null
  handler.failureBlock = handler.successBlock = handler.progressBlock = null
}

ProtoPromise.resolve = function promise_resolve( value, force ){
  if( !force && (this.wasResolved || this.wasRejected) )return
  this.wasResolved  = true
  this.resolveValue = value
  if( !this.allHandlers )return
  function handle( handler, value ){
    L8_NextTick( function(){
      ProtoPromise.handleResult( handler, true, value)
    })
  }
  for( var ii = 0 ; ii < this.allHandlers.length ; ii++ ){
    handle( this.allHandlers[ii], value)
  }
  this.allHandlers = null
  return this
}

ProtoPromise.reject = function promise_reject( value, force ){
  if( !force && (this.wasResolved || this.wasRejected) )return
  this.wasRejected  = true
  this.rejectReason = value
  if( !this.allHandlers )return
  function handle( handler, value ){
    L8_NextTick( function(){
      ProtoPromise.handleResult( handler, false, value)
    })
  }
  for( var ii = 0 ; ii < this.allHandlers.length ; ii++ ){
    handle( this.allHandlers[ii], value)
  }
  this.allHandlers = null
  return this
}

ProtoPromise.progress = function promise_progress(){
  if( this.wasResolved || this.wasRejected )return
  // ToDo: implement this
  return this
}

/* ----------------------------------------------------------------------------
 *  Task "local" variables.
 *  Such a variable is stored in a "binding" that subtasks inherit.
 */

ProtoTask.var = function( attr, val ){
// Define a new variable.
// Note: please use global() to create variables in the root binding because
// l8.var() will actually create a variable in the current task when applied
// on the root l8 task.
// Note: when a task is done, it's bindings are erased. As a consequence, any
// pending spawn task gets inherited by the done task's parent task and cannot
// access the erased bindings they previously accessed, resulting in access
// attemtps returning typically "undefined" instead of the expected value. To
// avoid such a situation, when spawn tasks accessed shared variable from their
// parent, please make sure that the parent task does not terminate until all
// spawn task are done too. Use .join() for that purpose.
  if( attr === "task" )throw( "no 'task' variable, reserved")
  var task = this.current
  var data = task.data
  if( !data ){
    data = task.data = {task:task}
  }
  data[attr] = {value:val,task:task}
  return task
}

ProtoTask.global = function( attr, val ){
  if( arguments.length === 1 ){
    return this.data[attr] = {value:val,task:l8}
  }else{
    return this.data[attr]
  }
}

ProtoTask.set = function( attr, val ){
// Change the value of an existing task local variable or create a new
// variable as .var() would.
  if( attr === "task" )throw( "no 'task' l8 variable, reserved")
  var task   = this.current
  var data   = task.data
  if( !data ){
    task.data = {task:task}
  }
  var target = task
  var slot
  while( target ){
    if( (data = target.data)
    &&   data.hasOwnProperty( attr)
    ){
      slot = data[attr]
      slot.task.data[attr].value = val
      if( target != task ){
        task.data[attr] = {task:target}
      }
      return task
    }
    target = target.parentTask
  }
  return task.var( attr, val)
}

ProtoTask.get = function( attr ){
// Get the value of a task's variable. If the current task does not define
// that variable in it's own binding, follow binding chain in parent task.
  if( attr === "task" )throw( "no 'task' l8 variable, reserved")
  var task   = this.current
  var data   = task.data
  if( !data ){
    task.data = {task:task}
  }
  var target = task
  var slot
  while( target ){
    if( (data = target.data)
    &&   data.hasOwnProperty( attr)
    ){
      slot = data[attr]
      if( target !== task ){
        task.data[attr] = {task:target}
      }
      return slot.task.data[attr].value
    }
    target = target.parentTask
  }
  // "undefined" is returned when attribute does not exists  
}

ProtoTask.binding = function( attr ){
// Return the "binding" where a variable is stored (or would be stored).
// That binding is an object with a "task" property (the binding owner) and
// a property for each variable ever accessed by that task or it's subtasks.
// That property has a "value" property when that variable is stored directly
// inside that binding. Or else it has a "task" property that tells which task
// stores the variable's value.
  var task   = this.current
  var data
  var target = task
  while( target ){
    if( !(data = target.data) ){
      target = target.parentTask
      continue
    }
    if( !attr )return data
    if( data.hasOwnProperty( attr) ){
      if( target != task ){
        task.data[attr] = {task:target}
      }
      return data[attr].task.data
    }
    target = target.parentTask
  }
  return l8.data
}

/* ----------------------------------------------------------------------------
 *  Tasks synchronization
 */

ProtoTask.wait = function task_wait( promise ){
  var task = this.current
  var step = task.currentStep
  task.pause()
  promise.then(
    function( r ){
      if( !task.currentStep === step )return
      task.resume()
    },
    function( e ){
      if( !task.currentStep === step )return
      task.raise( e)
    }
  )
  return task
}

ProtoTask.join = function task_join(){
  var task = this.current
  var step = task.currentStep
  var j = function(){
    if( task.subtasksCount ){
      for( var subtask in task.subtasks ){
        subtask = task.subtasks[subtask]
        task.pause()
        subtask.then( j, j)
        return
      }
      return
    }
    if( task.pausedStep === step ){
      task.resume()
    }
  }
  j()
  return task
}

ProtoTask.pause = function pause(){
// Pause execution of task at current step. Task will resume and execute next
// step when resume() is called.
  var task = this.current
  var step = task.currentStep
  if( step.isBlocking ){
    throw new Error( "Cannot pause, already blocked l8 task")
  }
  step.isBlocking = true
  task.pausedStep = step
  return task
}

ProtoTask.resume = function task_resume(){
// Resume execution of paused task. Execution restarts at step next to the
// one where the task was paused.
  var task = this.current
  if( task.isDone ){
    throw new Error( "Cannot resume, done l8 task")
  }
  var paused_step = task.pausedStep
  if( !paused_step ){
    throw new Error( "Cannot resume, not paused l8 task")
  }
  if( !paused_step.isBlocking ){
    throw new Error( "Cannot resume, running l8 step")
  }
  de&&mand( paused_step.task === this )
  task.pausedStep = null
  paused_step.isBlocking = false
  paused_step.scheduleNext()
  return task
}

ProtoTask.raise = function task_raise( err, dont_throw, val ){
// Note: val parameter is needed when err is l8.returnEvent
  var task = this.current
  de&&mand( task !== l8 )
  if( task.isDone )return task
  err = task.stepError = err || task.stepError || l8.failureEvent
  if( err === l8.returnEvent ){
    task.stepResult = val
  }
  var step = task.currentStep
  if( step ){
    // If there exists subtasks, forward error to them
    var queue =  task.forkedTasks
    if( queue ){
      if( queue instanceof Array ){
        for( var subtask in queue ){
          queue[subtask].raise( err, dont_throw, val)
        }
      }else{
        queue.raise( err, dont_throw, val)
      }
      return
    }
    // error are forwarded to parent, unless catched, in scheduleNext()
    if( step.isBlocking ){
      step.isBlocking = false
      task.pauseStep  = null
      step.scheduleNext()
    }else if( step === CurrentStep ){
      if( !dont_throw )throw err
    }
  }else{
    de&&bug( "Unhandled exception", err, err.stack)
  }
  return task
}

ProtoTask.sleep = function task_sleep( delay ){
  var task = this.current
  var step = task.currentStep
  task.pause()
  setTimeout( function() {
    if( !task.currentStep === step )return
    task.resume()
  }, delay)
  return task
}

/* ----------------------------------------------------------------------------
 *  Semaphore
 */

function Semaphore( count ){
  this.count        = count
  this.promiseQueue = []
  this.closed       = false
  return this
}
var ProtoSemaphore = Semaphore.prototype

ProtoTask.semaphore = function( count ){
  return new Semaphore( count)
}

ProtoSemaphore.then = function( callback ){
  return this.promise.then( callback)
}

ProtoSemaphore.__defineGetter__( "promise", function(){
  var promise = MakePromise()
  if( this.closed ){
    promise.reject( l8.CloseEvent)
    return promise
  }
  if( this.count > 0 ){
    this.count--
    promise.resolve( this)
  }else{
    this.queue.push( promise)
  }
  return promise
})

ProtoSemaphore.release = function(){
  this.count++
  if( this.closed || this.count <= 0 )return
  var step = this.promiseQueue.shift()
  if( step ){
    this.count--
    step.resolve( this)
  }
  return this
}

ProtoSemaphore.close = function(){
  var list = this.promiseQueue
  this.promiseQueue = null
  var len = list.length
  for( var ii = 0 ; ii < len ; ii++ ){
    list[ii].reject( l8.CloseEvent)
  }
  return this
}

/* ----------------------------------------------------------------------------
 *  Mutex
 */

function Mutex( entered ){
  this.entered   = entered
  this.task      = null
  this.taskQueue = []
  this.closed    = false
}
var ProtoMutex = Mutex.prototype

ProtoTask.mutex = function task_mutex( entered ){
  return new Mutex( entered)
}

ProtoMutex.__defineGetter__( "promise", function(){
  var promise = MakePromise()
  var task = CurrentStep.task
  // when no need to queue...
  if( !this.entered || this.task === task ){
    // ... because same task cannot block itself
    if( this.entered ){
      promise.reject( new Error( "mutex already entered"))
    // ... because nobody's there
    }else{
      this.entered = true
      this.task    = task
      promise.resolve( this)
    }
  // when a new task wants to enter asap
  }else{
    this.queue.push( promise)
  }
  return promise
})

ProtoMutex.then = function( callback, errback ){
// Duck typing so that Task.wait() works
  return this.promise.then( callback, errback)
}

ProtoMutex.release = function(){
  if( !this.entered )return
  this.task = null
  var promise = this.promiseQueue.shift()
  if( promise ){
    promise.resolve( this)
  }else{
    this.entered = false
    this.task    = null
  }
}

ProtoMutex.close = function(){
  var list = this.promiseQueue
  this.promiseQueue = null
  var len = list.length
  for( var ii = 0 ; ii < len ; ii++ ){
    list[ii].reject( l8.CloseEvent)
  }
  return this
}

/* ----------------------------------------------------------------------------
 *  Lock
 */

function Lock( count ){
// aka "reentrant mutex"
  this.mutex  = new Mutex( count > 0 )
  this.count  = count || 0
  this.closed = false
}
var ProtoLock = Lock.prototype

ProtoTask.lock = function task_lock( count ){
  return new Lock( count)
}

ProtoLock.__defineGetter__( "promise", function(){
  var that    = this
  var promise = MakePromise()
  if( this.mutex.task === CurrentStep.task ){
    this.count++
    promise.resolve( that)
  }else{
    this.mutex.then( function(){
      this.count = 1
      promise.resolve( that)
    })
  }
  return promise
})

ProtoLock.then = function lock_then( callback, errback ){
  return this.promise.then( callback, errback)
}

ProtoLock.release = function(){
  if( this.count ){
    if( --this.count )return
  }
  this.mutex.release()
}

ProtoLock.__defineGetter__( "task", function(){
  return this.mutex.task
})

ProtoLock.close = function(){
  if( this.closed )return
  this.closed = true
  this.mutex.close()
  return this
}

/* ----------------------------------------------------------------------------
 *  Port. Producer/Consumer protocol with no buffering at all.
 */

function Port(){
  this.getPromise = null // "in"  promise, ready when ready to .get()
  this.putPromise = null // "out" promise, ready when ready to .put()
  this.value      = null
  this.closed     = false
}
var ProtoPort = Port.prototype

ProtoTask.port = function task_port(){
  return new Port()
}

ProtoPort.__defineGetter__( "promise", function(){
  return this.in
})

ProtoPort.then = function port_then( callback, errback ){
  return this.in.then( callback, errback)
}

ProtoPort.get = function port_get(){
  var that = this
  this.out.resolve()
  var task = this.current
  var step = task.currentStep
  task.pause()
  this.in.then( function( r ){
    if( !that.getPromise )return that.in
    that.getPromise = null
    that.value = r
    if( task.pausedStep === step ){
      task.resume()
      task.stepResult = r
    }
  })
  return this
}

ProtoPort.tryGet = function(){
// Like .get() but non blocking
  if( this.closed
  || !this.getPromise
  || this.getPromise.wasResolved
  )return [false]
  this.getPromise = null
  return [true, this.value]
}

ProtoPort.put = function port_put( msg ){
  var that = this
  this.in.resolve( msg)
  var task = this.current
  var step = task.currentStep
  task.pause()
  this.out.then( function(){
    if( !that.putPromise )return that.out
    that.putPromise = null
    if( task.pausedStep === step ){
      task.resume()
    }
  })
  return this
}

ProtoPort.tryPut = function( msg ){
// Like .put() but non blocking
  if( this.closed
  ||  !this.putPromise
  ||  !this.putPromise.wasResolved
  )return false
  this.putPromise = null
  this.value = msg
  return true
}

ProtoPort.__defineGetter__( "in", function(){
  return this.getPromise
  ? this.getPromise = MakePromise()
  : this.getPromise
})

ProtoPort.__defineGetter__( "out", function(){
  return this.putPromise
  ? this.putPromise = MakePromise()
  : this.putPromise
})

/* ----------------------------------------------------------------------------
 *  MessageQueue. Producer/Consumer protocol with buffering.
 */

function MessageQueue( capacity ){
  this.capacity   = capacity || 100000
  this.queue      = new Array() // ToDo: preallocate this.capacity
  this.length     = 0
  this.getPromise = null // "in"  promise, ready when ready to .get()
  this.putPromise = null // "out" promise, ready when ready to .put()
  this.closed     = false
}
var ProtoMessageQueue = MessageQueue.prototype

ProtoTask.queue = function task_queue( capacity ){
  return new MessageQueue( capacity)
}

ProtoMessageQueue.__defineGetter__( "promise", function(){
  return this.in
})

ProtoMessageQueue.then = function message_queue_then( callback, errback ){
  return this.in.then( callback, errback)
}

ProtoMessageQueue.put = function message_queue_put( msg ){
  var that = this
  var step = CurrentStep
  var task = step.task
  if( that.closed )return task.break
  if( arguments.length > 1 ){
    msg = arguments
  }
  if( this.full ){
    task.pause()
    this.out.then( function(){
      task.queue.push( msg)
      if( task.pausedStep === step ){
        task.resume()
        task.stepResult = msg
      }
      that.putPromise = null
      that.in.resolve()
      ++that.length
      if( !that.full ){
        that.out.resolve()
      }
    })
  }else{
    this.queue.push( msg)
    this.length++
    this.in.resolve()
  }
}

ProtoMessageQueue.tryPut = function message_queue_try_put( msg ){
  if( this.closed
  ||  this.full
  )return false
  this.queue.push( arguments.length > 1 ? arguments : msg)
  this.length++
  this.in.resolve()
  return true
}

ProtoMessageQueue.get = function message_queue_get(){
  var that = this
  var step = CurrentStep
  var task = step.task
  if( that.closed )return task.break
  var get = function(){
    de&&mand( that.getPromise )
    that.getPromise = null
    task.stepResult = that.queue.shift()
    that.length--
    if( !that.empty ){
      that.in.resolve()
    }
    return that
  }
  if( !this.empty )return get()
  var consume = function(){
    if( task.pausedStep !== step )return
    if( that.closed )return task.break
    if( that.empty ){
      that.in.then( consume)
      return
    }
    get()
    task.resume()
  }
  task.pause()
  this.in.then( consume)
  return that
}

ProtoMessageQueue.tryGet = function message_queue_try_get(){
  if( this.closed
  ||  this.empty
  )return [false]
  var msg = this.queue.shift()
  --this.length
  if( !this.empty ){
    this.in.resolve()
  }
  return [true, msg]
}

ProtoMessageQueue.__defineGetter__( "in", function(){
  var promise = this.getPromise
  if( promise )return promise
  this.getPromise = promise = MakePromise()
  if( !this.empty ){
    promise.resolve()
  }
  return promise
})

ProtoMessageQueue.__defineGetter__( "out", function(){
  var promise = this.putPromise
  if( promise )return promise
  this.putPromise = promise = MakePromise()
  if( !this.full ){
    promise.resolve()
  }
  return promise
})

ProtoMessageQueue.__defineGetter__( "empty", function(){
  return this.length === 0 || this.closed
})

ProtoMessageQueue.__defineGetter__( "full", function(){
  return this.length >= this.capacity && !this.closed
})

ProtoMessageQueue.close = function(){
  if( this.closed )return this
  this.closed = true
  if( this.getPromise ){
    this.getPromise.resolve()
  }
  if( this.putPromise ){
    this.putPromise.resolve()
  }
  return true
}

/* ----------------------------------------------------------------------------
 *  Generator. next()/yield() protocol
 */

function Generator(){
  this.task       = null // generator task, the one that yields
  this.getPromise = null // ready when ready to .next()
  this.getMessage  = null
  this.putPromise = null //  ready when ready to .yield()
  this.putMessage = null
  this.closed     = false
  return this
}

var ProtoGenerator = Generator.prototype

ProtoTask.generator = function task_generator(){
  return new Generator()
}

ProtoTask.Generator = function( block ){
// Return a "Generator Constructor", much like l8.Task() does but the returned
// value is a Generator Task, not just a regular Task. I.e. it can "yield".
  return function(){
    var args = arguments
    var parent = l8.current
    var gen = l8.generator()
    var task = MakeTask( parent, false, true) // detached (spawn)
    // ToDo: generator task object should be reuseable using task.free()
    L8_EnqueueStep( MakeStep( task, function(){
      block.apply( task, args)
    }))
    gen.task = task
    var closer = function(){
      if( task.optional.generator ){
        gen.close()
        task.optional.generator = null
      }
      if( parent.optional.generator ){
        gen.close()
        parent.optional.generator = null
      }
    }
    task.then(   closer, closer)
    parent.then( closer, closer)
    parent.optional.generator = task.optional.generator = gen
    return task
  }
}

ProtoTask.yield = function( val ){
  var task = l8.current
  var gen
  var gen_task = task
  while( gen_task ){
    gen = gen_task.optional.generator
    if( gen ){
      gen.yield( val)
      return task
    }
    gen_task = gen_task.parentTask
  }
  task.raise( new Error( "Cannot yield(), not a l8 generator"))
  return task
}

ProtoTask.next = function( val ){
  var task = l8.current
  var gen
  var gen_task = task
  while( gen_task ){
    gen = gen_task.optional.generator
    if( gen ){
      gen.next( val)
      return task
    }
    gen_task = gen_task.parentTask
  }
  task.raise( new Error( "Cannot generate(), not a l8 generator"))
  return task
}

ProtoGenerator.__defineGetter__( "promise", function(){
  return this.get
})

ProtoGenerator.then = function port_then( callback, errback ){
  return this.get.then( callback, errback)
}

ProtoGenerator.next = function( msg ){
  var that = this
  var task = l8.current
  var step = task.currentStep
  // Pause until producer yields
  task.pause()
  this.get.then( function( get_msg ){
    that.getPromise = null
    that.put.resolve( that.putMessage = msg )
    if( task.pausedStep === step ){
      if( that.closed ){
        // return task.break
        task.stepError = l8.breakEvent
      }else{
        task.stepResult = get_msg
      }
      task.resume()
    }
  })
  return this
}

ProtoGenerator.tryNext = function( msg ){
// Like .generate() but never blocks
  if( this.closed )return [false]
  if( !this.getPromise.wasResolved )return [false]
  this.getPromise = null
  this.put.resolve( this.putMessage = msg)
  return [true, this.getMessage]
}

ProtoGenerator.yield = function( msg ){
  var that = this
  this.task = task
  this.get.resolve( this.getMessage = msg)
  var task = l8.current
  var step = task.currentStep
  // Pause until consumer calls .next()
  task.pause()
  this.put.then( function( put_msg ){
    that.putPromise = null
    if( task.pausedStep === step ){
      if( that.closed ){
        // return task.break
        task.stepError = l8.breakEvent
      }else{
        task.stepResult = put_msg
      }
      task.resume()
    }
  })
  return this
}

ProtoGenerator.tryYield = function( msg ){
// Like .yield() but never blocks
  if( this.closed )return [false]
  if( !this.putPromise.wasResolved )return [false]
  this.putPromise = null
  this.get.resolve( this.getMessage = msg)
  return [true, this.putMessage]
}

ProtoGenerator.close = function generator_close(){
  if( this.closed )return this
  this.closed = true
  if( this.getPromise ){ this.getPromise.resolve() }
  if( this.putPromise ){ this.putPromise.resolve() }
  return this
}

ProtoGenerator.__defineGetter__( "get", function(){
  var promise = this.getPromise
  if( !promise ){
    promise = this.getPromise = MakePromise()
    if( this.closed ){
      promise.resolve()
    }
  }
  return promise
})

ProtoGenerator.__defineGetter__( "put", function(){
  var promise = this.putPromise
  if( !promise ){
    promise = this.putPromise = MakePromise()
    if( this.closed ){
      promise.resolve()
    }
  }
  return promise
})


/* ----------------------------------------------------------------------------
 *  Signal
 */

function Signal(){
  this.nextPromise = MakePromise()
  this.closed = false
}
var ProtoSignal = Signal.prototype

ProtoTask.signal = function task_signal( on ){
  return new Signal( on)
}

ProtoSignal.__defineGetter__( "promise", function(){
// Returns an unresolved promise that .signal() will resolve and .close() will
// reject.  Returns an already rejected promise if signal was closed.
  var promise = this.nextPromise
  if( this.closed )return promise
  return !promise.wasResolved ? promise : (this.nextPromise = MakePromise())
})

ProtoMessageQueue.then = function signal_then( callback, errback ){
  return this.promise.then( callback, errback)
}

ProtoSignal.signal = function signal_signal( value ){
// Resolve an unresolved promise that .promise will provide. Signals are not
// buffered, only the last one is kept.
  if( this.nextPromise.wasResolved && !this.closed ){
    this.nextPromise = MakePromise()
  }
  this.nextPromise.resolve( value )
}

ProtoSignal.close = function signal_close(){
  if( this.closed )return
  this.closed = true
  if( this.nextPromise.wasResolved ){
    this.nextPromise = MakePromise()
  }
  this.nextPromise.reject( l8.closeEvent)
}

/* ----------------------------------------------------------------------------
 *  Timeout
 */

function Timeout( delay ){
  var promise = this.timedPromise = MakePromise()
  setTimeout( function(){ promise.resolve() }, delay)
}
var ProtoTimeout = Timeout.prototype

ProtoTask.timeout = function( delay ){
  return new Timeout( delay)
}

ProtoTimeout.__defineGetter__( "promise", function(){
  return this.timedPromise
})

ProtoTimeout.then = function( callback, errback ){
  return this.timedPromise.then( callback, errback)
}


/* ----------------------------------------------------------------------------
 *  Selector
 */

function Selector( list, is_or ){
  this.allPromises = list
  this.firePromise = null
  this.result      = null
  this.isOr        = is_or // "Or" selectors ignore false results
}
var ProtoSelector = Selector.prototype

ProtoTask.selector = ProtoTask.any = function( ll ){
  var list = (arguments.length === 1 && (ll instanceof Array)) ? ll : arguments
  return new Selector( list)
}

ProtoTask.or = function( ll ){
  var list = (arguments.length === 1 && (ll instanceof Array)) ? ll : arguments
  return new Selector( list, true)
}

ProtoTask.select = function(){
  var selector = new Selector( arguments)
  return this.wait( selector)
}

ProtoSelector.__defineGetter__( "promise", function(){
  var promise = this.firePromise
  if( promise )return promise
  var that = this
  var list = this.allPromises
  this.firePromise = promise = MakePromise()
  var len = list.length
  if( !len ){
    promise.resolve( null)
    return promise
  }
  var count = 0
  function ok( r ){
    if( !that.result ){
      try{
        while( r instanceof Function ){
          r = r.call( l8)
        }
      }catch( e ){
        return ko( e)
      }
      if( r.then ){
        r.then( ok, ko)
      }else{
        count++
        if( r || !that.isOr || count === len ){
          that.result = that.isOr ? r : [null,r]
          promise.resolve( that.result)
        }
      }
    }
  }
  function ko( e ){
    count++
    if( !that.result ){
      that.result = [e,null]
      promise.resolve( that.result)
    }
  }
  var item
  var buf = []
  for( var ii = 0 ; ii < len ; ii++ ){
    item = list[ii]
    while( item instanceof Function ){
      item = item.call( l8)
    }
    if( item.then ){
      buf.push( item)
    }else{
      ok( item)
      return promise
    }
  }
  if( len = buf.length ){
    for( ii = 0 ; ii < len ; ii++ ){
      item = buf[ii]
      item.then( ok, ko)
    }
  }
  return promise
})

ProtoSelector.then = function( callback, errback ){
  return this.firePromise.then( callback, errback)
}

/* ----------------------------------------------------------------------------
 *  Aggregator
 */

function Aggregator( list, is_and ){
  this.allPromises = list
  this.results     = []
  this.result      = list.length
  this.firePromise = null
  this.isAnd       = is_and
}
var ProtoAggregator = Aggregator.prototype

ProtoTask.aggregator = ProtoTask.all = function( ll ){
  var list = (arguments.length === 1 && (ll instanceof Array)) ? ll : arguments
  return new Aggregator( list)
}

ProtoTask.and = function( ll ){
  var list = (arguments.length === 1 && (ll instanceof Array)) ? ll : arguments
  return new Aggregator( list, true)
}

ProtoAggregator.__defineGetter__( "promise", function(){
  var promise = this.firePromise
  if( promise )return promise
  var that = this
  var list = this.allPromises
  this.firePromise = promise = MakePromise( list.length === 0)
  var results = this.results
  var len = list.length
  if( !len ){
    promise.resolve( results)
    return promise
  }
  // ToDo: should respect order, need an index
  function ok( r ){
    try{
      while( r instanceof Function ){
        r = r.call( l8)
      }
    }catch( e ){
      return ko( e)
    }
    if( r.then ){
      r.then( ok, ko)
    }else{
      results.push( [null,r])
      if( that.result ){ that.result = r }
      if( results.length === list.length ){
        promise.resolve( that.isAnd ? that.result : results)
      }
    }
  }
  function ko( e ){
    results.push( [e,null])
    if( results.length === list.length ){
      promise.resolve( that.isAnd ? false : results)
    }
  }
  var item
  for( var ii = 0 ; ii < len ; ii++ ){
    item = list[ii]
    while( item instanceof Function ){
      item = item.call( l8)
    }
    if( item.then ){
      item.then( ok, ko)
    }else{
      ok( item)
    }
  }
  return promise
})

ProtoAggregator.then = function( callback, errback ){
  return this.promise.then( callback, errback)
}

/*
 *  Misc
 */

l8.countdown = function( n ){
  var count_down = n
  setInterval(
    function(){
      de&&bug( "tick " + --count_down)
      if( !count_down ){
        trace( "exiting...")
        process.exit( 0)
      }
    },
    1000
  )
}

/*
 *  End boilerplate for module loaders
 *  Copied from when.js, see https://github.com/cujojs/when/blob/master/when.js
 */
 
return l8
}) })(
  typeof define == 'function' && define.amd
  ? define
  : function( factory ){
    typeof exports === 'object'
	? (module.exports = factory())
	: (this.l8        = factory());
  }
);

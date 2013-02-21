// l8.js
//   a modern multi-tasker for javascript
//   https://github.com/JeanHuguesRobert/l8
//
// 2012/10/24, JHR, create
// 2013/02/03, JHR, browserify
//
// (c) Jean Hugues Robert
// Licensed under the MIT license.

"use strict";

// Boilerplate for module loaders. Basically: avoid polluting global space
(function( define ){ // 'use strict'; // ToDo: figure out why this gets undefined
define( function(){

/* ----------------------------------------------------------------------------
 *  Debug. The one painfull thing that we want to cure.
 */

// DEBUG mode currently defaults to "on". Please use l8.debug() to change it
var DEBUG = true

var NoOp = function noop(){}

var TraceStartTask = !DEBUG ? 0 : 0
// When debugging test cases, this tells when to start outputting traces.
// Ugly but usefull.

// In node.js, "util" module defines puts(), among others
var Util    = null
var Bugsnag = null
try{
  Util = require( "util")
  // Bugsnag = require( "bugsnag")
  // Bugsnag.register( "your-api-key-goes-here")
  // ToDo: https://bugsnag.com/docs/notifiers/node
  DEBUG && Util.debug( "entering l8.js")
}catch( e ){}

var slice = [].slice

var inspect = function(){
// Return a string representation of its parameter in a format that is
// usefull to log.
  var buf          = []
  // Output message will have a "l8" prefix so that you know who did it
  var args         = ["l8"]
  var only_strings = true
  // If single array argument, just add "l8" prefix
  if( arguments.length === 1 && arguments[0] instanceof Array){
    args = args.concat( arguments[0])
  // Or else make array using arguments, still with "l8" prefix
  }else{
    args = args.concat( slice.call( arguments, 0))
  }
  // For each item to display
  var item
  var stack
  for( var ii = 0 ; ii < args.length ; ii++ ){
    item = args[ii]
    // Unless empty, skipped
    if( item ){
      // When item is object with a nice .toLabel() method, keep it short
      if( item.toLabel ){
        item = item.toLabel()
      // When item is a string or something we cannot handle client side
      }else if( typeof item === 'string' || !Util ){
        item = item
      // When item is complex and Util.inspect() can help
      }else{
        stack = item.stack
        item  = Util.inspect( item)
      }
      // When we have only string, better concat them
      if( only_strings && typeof item !== "string" ){
        only_strings = false
      }
      if( item ){
        buf.push( item)
        if( stack ){
          if( Util ){
            buf.push( Util.inspect( stack))
          }else{
            buf.push( stack)
          }
          stack = null
        }
      }
    }
  }
  if( Util ){
    if( only_strings ){
      buf = buf.join( ", ")
    }else{
      buf = Util.inspect( buf)
    }
  }else{
    buf = buf.join( ", ")
  }
  return buf
}

// l8.logger( null ) restores the default logger for traces.
// This is the function that returns the default log() function that l8.trace()
// uses. That returned function must have the signature of console.log()
var DefaultGetLogger = function(){
  return (console && console.log) || (Util && Util.puts) || console.log
}

// User can redefine what logger l8.trace() uses, see l8.logger().
var GetLogger = DefaultGetLogger

var trace = function(){
// l8#trace()
// Print trace. Offer an easy breakpoint when output contains "DEBUG".
// Note: when using native console.log(), it's better to output objects
// instead of strings because modern debuggers understand objects and can
// display them intelligently.
// The function returns a string version of the message that was logged.
  GetLogger || (GetLogger = DefaultGetLogger)
  var l = GetLogger()
  var msg = inspect.apply( this, arguments)
  try{
    if( console && l === console.log ){
      console.log.apply( console, arguments)
    }else{
      l.call( l, msg)
    }
  }catch( e ){
    // ToDo: host adapted tracing
  }
  if( msg.indexOf( "DEBUG") >=  0 ){
    // please set breakpoint here to debug
    try{ debugger }catch( e ){}
  }
  return msg
}


var assert = function( cond ){
// l8#assert()
// Throw an error if condition is not satisfied.
  // ToDo: https://github.com/visionmedia/better-assert
  if( !cond ){
    trace.apply( this, arguments )
    trace( "DEBUG assert failure" )
    throw new Error( "Assert failure" )
  }
}

var de = DEBUG, bug = trace, mand = assert
// That's my de&&bug darling, also de&&mand()


/* ----------------------------------------------------------------------------
 *  Task & Step
 */

var NextTaskId = 0

function Task(){
// Tasks are like function call activation records, but with a spaghetti stack
// because more than one child task can be active at the same time.
// See also http://en.wikipedia.org/wiki/Spaghetti_stack
// Forked tasks's parent task collect the multiple results, one per fork.
// Spawn tasks don't block their parent and don't provide a result.
  // this.nextFree = void null // Task allocator reuse objects
  return this
}

var ProtoTask = Task.prototype

var task_init = function( task, parent, is_fork, is_spawn ){
  task.current          = task // root task l8 defines it differently
  task.id               = NextTaskId++ // unique id. .toString() uses it too
  if( DEBUG ){
    task.stepCount = 0  // Step ids generator
  }
  // Note: initializing properties to undefined helps some JIT compilers
  // any it is needed anyways because objects get reused by Task allocator
  task.firstStep        = void null
  task.isSingleStep     = false
  task.currentStep      = void null // What step the task is on, aka "IP"
  task.insertionStep    = void null // Where steps are usually added
  task.pausedStep       = void null // What step the task is paused on
  task.isFork           = !!is_fork
  task.wasSpawn         = !!is_spawn
  task.stepResult       = parent.stepResult
  task.stepError        = void null
  task.isDone           = false     // False while task is pending
  task.subtasks         = void null // a set, keys are task.id
  task.subtasksCount    = void null // size of that set
  task.parentTask       = parent    // aka "caller"
  task.forkedTasks      = void null // Subtask(s) that block this task
  task.forkedTasksCount = void null // Number of such tasks
  task.forkResults      = void null // Array of these task's result
  task.forkResultsCount = void null // Number of entries in that array
  task.forkResultsIndex = void null // in parent's forkResults array
  task.data             = void null // bindings for task local variables
  task.optional         = {}        // Some JIT compilers prefer that
  /*
  task.optional.wasCanceled     = false    // "brutal cancel" flag
  task.optional.shouldStop      = false    // "gentle cancel" flag
  task.optional.deferredSteps   = null     // Go lang style "defer"
  task.optional.deferredResult  = null
  task.optional.deferredError   = null
  task.optional.successBlock    = null
  task.optional.failureBlock    = null
  task.optional.finalBlock      = null
  task.optional.donePromise     = null
  task.optional.generator       = null
  */
  if( TraceStartTask && NextTaskId > TraceStartTask )trace( "DEBUG New", task)
  // Add new task to it's parent's list of pending subtasks
  de&&mand( !parent.isDone )
  // Parent remembers all pending subtasks, both forked & spawn ones
  // ToDo: find a way to optimize this for the frequent case where there is
  // only one sub task.
  if( !parent.subtasks ){
    de&&mand( !parent.subtasksCount, parent.subtasksCount)
    parent.subtasks      = {}
    parent.subtasksCount = 1
  }else{
    parent.subtasksCount++
  }
  parent.subtasks[task.id] = task
  // not spawn sub tasks also block their parent
  if( !is_spawn ){
    if( !parent.forkedTasks ){
      // When only one member, direct link, efficient because frequent
      parent.forkedTasks      = task
      parent.forkedTasksCount = 1
    }else{
      de&&mand( is_fork || parent === l8 )
      parent.forkedTasksCount++
      // With two members, mutate into an array
      if( parent.forkedTasksCount === 2 ){
        parent.forkedTasks = [parent.forkedTasks,task]
      // More members, push them
      }else{
        parent.forkedTasks.push( task)
      }
    }
    // Allocate entry for forked tasks results, set to undefined for now
    if( is_fork ){
      if( !parent.forkResults ){
        parent.forkResults      = [void null]
        parent.forkResultsCount = 1
        task.forkResultsIndex   = 0 // this task's result in parent.forkResults
      }else{
        parent.forkResults[
          task.forkResultsIndex = parent.forkResultsCount++
        ] = void null
      }
    }
  }
  // Please see what happens in Task.subtaskDoneEvent(), ie "destructor"
  if( TraceStartTask && NextTaskId > TraceStartTask )trace( "New", task)
}

function Step(){
// Tasks execute steps, some steps may queue additional steps to execute.
// Forked steps run in parallel whereas regular steps are sequential. Steps
// that cannot execute immediatly can block and terminate later when some
// asynchronous event occurs. When a forked step is blocked, the other forked
// steps are still executed whereas when a regular step blocks, the next
// steps are blocked too.
  return this
}

var ProtoStep = Step.prototype

// Step allocator. Attempt to reuse some previous steps

var NextFreeStep = null

function MakeStep( task, block, is_fork, is_repeat ){
  var step = NextFreeStep
  if( step ){
    NextFreeStep = step.next
  }else{
    step = new Step()
  }
  step_init( step, task, block, is_fork, is_repeat )
  return step
}

ProtoStep.free = function(){
//_ When possible, I reuse step objects to avoid building new ones. This is a
// speed optimization.
  this.next = NextFreeStep
  NextFreeStep = this
}

var step_init = function( step, task, block, is_fork, is_repeat ){
  if( DEBUG ){
    step.id = ++task.stepCount
    step.wasQueued   = false
    step.wasExecuted = false
  }
  de&&mand( !task.isDone )
  step.task = task
  if( block ){
    // If step is a promise, step will block until that promise delivers
    if( !(block instanceof Function) ){
      block = function(){ task.interpret( block ) }
    }
    step.block     = block
  }else{
    step.block     = NoOp
  }
  step.isFork      = is_fork
  step.isRepeat    = is_repeat
  step.wasSpawn    = false
  step.isBlocking  = false   // When task is paused on this step
  // enqueue/dequeue list management
  var previous = task.insertionStep
  task.insertionStep = step
  // When inserting at head of queue
  if( !previous ){
    step.next      = task.firstStep
    task.firstStep = task.currentStep = step
  // When inserting after the head of the queue
  }else{
    step.next     = previous.next
    previous.next = step
  }
  if( TraceStartTask && NextTaskId > TraceStartTask ){
    trace(
      "New", step,
      step === task.firstStep ? "first" : ""
    )
  }
}

// Bootstrap root task, id 0
var l8 = MakeTask( {}/*dummy parent*/ )
l8.parentTask = null
l8.data = {task:l8}

// l8.proto makes it easy for module to export a new mmm method by adding it
// to the prototype of all the task objects. As a result this.mmm() will be
// directly accessible in the code body of all tasks, ie where "this" is bound
// to the current task.
l8.proto = ProtoTask

// this.l8 is the root task in all code where "this" is bound to the current
// task.
l8.proto.l8 = l8

//_ this defines the body to the root task, an infinite blocked empty loop
var CurrentStep = MakeStep( l8, NoOp, false, true /* empty loop */ ) 
CurrentStep.isBlocking = true
l8.currentStep = l8.pausedStep = CurrentStep

// l8.now provides a fast access to the time in millisec. That value is
// sample whenever the l8 scheduler wakes up. As a result, it can be
// usefull to correlate sub events that pertain to the same evant that
// woke up the scheduler.
l8.now = null

// l8.dateNow is the Date object sampled when l8.now was last sampled.
l8.dateNow = null

// Browser & nodejs way to schedule code execution in the event loop.
// Note: you can provide yours if you get an efficient one.
try{
  l8.tick = process.nextTick
  l8.tick( function(){})
  l8.module = module
}catch( e ){
  l8.tick = function next_tick( block ){ setTimeout( block, 0) }
  l8.tick( function(){})
  l8.module = this
}

// l8.tick( fn ) is a low level function that schedules the execution of a
// function by the javascript event loop. It is the equivalent to setTimeout()
// with a 0 delay.
var L8_Tick = ProtoTask.tick = l8.tick

// Some special errors are used to build control structures.
// l8.cancelEvent is the value of the parameter for the l8.failure() specified
// function when the failure is due to a cancellation.
l8.cancelEvent   = ["cancel"]
l8.breakEvent    = ["break"]
l8.continueEvent = ["continue"]
l8.returnEvent   = ["return"]
l8.failureEvent  = ["failure"]
l8.closeEvent    = ["close"]

// l8.debug() returns true of false depending on the debug flag setting.
// l8.debug( v ) sets that flag to true or false.
ProtoTask.debug = function( on ){
  if( arguments.length ){
    de = DEBUG = !!on
  }
  return DEBUG
}

//_ init debug based on global DEBUG flag.
// ToDo: design a way to enable/disable this flag from the command line
// or from some ENV variable.
l8.debug( DEBUG )

ProtoTask.trace   = trace

// l8.bug() is an alias for l8.trace() that enables the de&&bug() pattern.
ProtoTask.bug     = trace

// l8.assert( cond ) raises an error when cond is satisfied.
ProtoTask.assert  = assert

// l8.mand( cond ) is an alias for l8.trace() that enable the de&&mand()
// pattern for asserts that can be disabled with very little overhead left.
ProtoTask.mand    = assert

// l8.inspect( obj ) returns a string representation for the specified object
// that can be useful to output traces.
ProtoTask.inspect = inspect

ProtoTask.logger  = function( get_logger ){
// Change the way l8.trace() outputs messages.
//
// Usage:
//   var save = l8.logger()
//    l8.logger( function(){ return function(){
//      console.log.apply( console, arguments )
//    })
//
// Parameter "get_logger" is a function returning a logger, ie a
// function called to log messages, like console.log(). l8.trace() will use it.
// To restore it to its default value, use l8.logger( null ).
// To read the current value, use l8.logger()
// Usage: l8.logger( function(){ return console.log } }
// Note: because "get_logger" is a function that returns the logger function,
// ie because of this added level of indirection, user can fine tune logging
// using information available in the context of the application when the
// logger function is necessary, versus the information available when the
// logger is installed.
  var previous = GetLogger
  arguments.length && (GetLogger = get_logger || DefaultGetLogger )
  return previous
}

// True when running inside a browser. Opposite to l8.server
l8.client = !Util

// True when running inside node.js. Opposite to l8.client
l8.server = Util

l8.clientize = function(){
// Override l8.client/l8.server auto-detection. Act as if client.
  l8.client = true;
  l8.server = false;
}

l8.serverize = function(){
// Override l8.client/l8.server auto-detection. Act as if server.
  if( !Util )throw new Error( "Cannot l8.serverize(), not a server")
  l8.server = true
  l8.client = false
}

l8._getDebugFlag = function(){ return de }

// l8.de&&bug( ... ), where "de" changes according to l8.debug()
l8.__defineGetter__( "de", l8._getDebugFlag )


/* ----------------------------------------------------------------------------
 *  Scheduler, aka "step walker"
 *  process.nextTick() or setTimeout() can do the job but I do some buffering
 *  and that runs faster.
 */

var L8_Execute //_ ProtoStep.execute, see below

var L8_QueuedStep  = null
var L8_StepQueue   = []
var L8_IsScheduled = false

var L8_Tock = function(){
  // Update l8.now & l8.dateNow, called often enough.
  // Fast and somehow usefull to correlate traces about the same event.
  // ToDo: Use V8/Mozilla Date.now() ?
  l8.now = (l8.dateNow = new Date()).getTime()
  var step
  while( step = L8_QueuedStep ){
    L8_QueuedStep = L8_StepQueue.shift()
    //step.execute()
    L8_Execute( step )
  }
  L8_IsScheduled = false
  // When done, assume code runs from within the "root" task
  CurrentStep = l8.currentStep
}

var L8_Scheduler = function(){
// Inject the scheduler in the global event loop.
// It executes queued steps and their next ones.
  if( !L8_IsScheduled ){
    de&&mand( L8_QueuedStep )
    L8_IsScheduled = true
    L8_Tick( L8_Tock )
  }
}

var L8_EnqueueStep = function( step ){
// Schedule step to execute. Restart scheduler if it is not started.
  if( DEBUG ){
    assert( !step.wasQueued || step.isRepeat )
    step.wasQueued = true
  }
  // Store step, efficiently if only one exist, in an array if more is needed
  if( L8_QueuedStep ){
    L8_StepQueue.push( step )
  }else{
    L8_QueuedStep = step
  }
  de&&mand( !step.isBlocking )
  // Wake up scheduler if necessary, it will eventually execute this step
  if( !L8_IsScheduled ){
    L8_IsScheduled = true
    L8_Tick( L8_Tock )
  }
  // Debug traces
  if( TraceStartTask && NextTaskId > TraceStartTask ){
    if( L8_QueuedStep ){
      L8_QueuedStep.trace( "queued step" )
      var item
      for( var ii = 0 ; ii < L8_StepQueue.length ; ii++ ){
        item = L8_StepQueue[ii].trace( "queued step[" + ii + "]" )
      }
    }
  }
}

ProtoStep.trace = function step_trace(){
//_ displays a trace about a step. Useful to debug l8 itself.
  var args = slice.call( arguments, 0)
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
//_ to execute a step is mainly about executing the associated block, using
// the current task result as input and changing that result if a new one is
// provided by the block.
  if( TraceStartTask && NextTaskId > TraceStartTask ){
    that.trace( "DEBUG execute")
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
  // Previous result cannot be a promise because promises pause the task
  de&&mand( !task.stepResult || !task.stepResult.then || task.stepResult.parentTask )
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
      // If result is a promise, block until promise is done, unless rslt is a
      // task (waiting for a task must be explicit)
      if( result.then && !result.parentTask ){
        return task.wait( result)
      }
    }
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
//_ this private method is called after a step is executed, it determines
// what to do next.
// Handles progression from step to step, error propagation, task termination
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
    // Previous step result cannot be a promise because promises pause the task
    de&&mand( !task.stepResult || !task.stepResult.then || task.stepResult.parentTask )
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
      L8_EnqueueStep( next_step )
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
      L8_EnqueueStep( step)
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
//_ Private. Called by Step.scheduleNextStep() when a subtask is done
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
  // When a sub task is done, resume blocked parent and remember result
  if( !subtask.wasSpawn ){ // && this.parentTast ){
    // When sub task failed, parent will cancel the other forks
    var err = subtask.stepError
    if( err ){
      this.stepError = err
      if( !this.parentTask ){
        trace( "Unhandled exception", subtask, err)
      }
    // When 
    }else if( subtask.isFork ){
      // Accumulate forked results, stored at the appropriate index
      this.forkResults[subtask.forkResultsIndex] = subtask.stepResult
    }
    // When all sub tasks succeed, resume blocked parent task
    // Ditto if sub task failed
    if( --this.forkedTasksCount <= 0 || err ){
      // Clear this.forkedTasks when it is empty, code elsewhere expect this
      if( !this.forkedTasksCount ){
        this.forkedTasks = null
      }
      // As a bonus, deblocking task's result is made available for next step
      if( !err ){ this.stepResult = subtask.stepResult }
      // Unless fork terminated early there should be a blocked step
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
// Queue a step in the task's step queue.
//
// Usage:
//   l8.task( function(){
//     l8.step( function(){
//       console.log( "first step" );
//       return ["hello", "world"];
//     }).step( function( h, w ){
//       console.log( h, w )
//     })
//   })
//
// The output, ie result, of a step is the input, ie parameters, of the next
// one. Steps can block, using l8.pause() && l8.resume().
//
// When the output of a step is a promise, the step is blocked until the
// promise is resolved. The promise's value becomes the new value for the
// output of the step.
// 
// l8.task(), l8.fork() and l8.repeat() queue "special" steps in the current
// task.
//
// The new step is inserted in the task step queue. It is inserted after the
// current step for that task. If multiple steps are inserted, they are
// inserted in FIFO order, ie the last inserted step will be executed last.
//
// Note: l8.step(...) inserts a step in the "current" task, not the l8 task.
// The l8 task is the root task, it is the ultimate "parent" task of all tasks.
// The returned value of the .step() function is the actual task whose queue
// was augmented.

// Attempts to queue a step in a "done" task will be redirected to a not
// yet done parent task (this may change).
  var task = this.current
  // Add step to some parent task if current task is done
  while( task.isDone ){
    task = task.parentTask
    // ToDo: maybe I could create a task "on the fly"?
    if( task === l8 )throw new Error( "Cannot add step to root l8 task")
  }
  MakeStep( task, block, is_fork, is_repeat)
  return task
}

ProtoTask.proceed = function( block ){
// l8.proceed( fn ) is used to pause/resume a task when dealing with async
// functions. The fn function is called with the parameters provided by the
// async function. The returned value of that fn function, unless undefined,
// provide the output for the step, an output that will be input for the next
// step. See also l8.walk and l8.flow that are simpler to use in most cases.
// Usage:
//  l8.step( function(){ fs.readFile( "xx", "utf8",
//    l8.proceed( function( err, content ){ return [err,content]; })
// Pauses current task and returns a callback to be called to resume execution.
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
    var result = arguments
    try{
      // ToDo: block should run as if from next step ?
      // ToDo: block should run as a new step ?
      if( block ){
        result = block.apply( task, result )
      }
      // Only resume the task if it is still block on the same step.
      // If, for example, task was cancelled, the current step changed.
      if( task.currentStep === step ){
        if( step.isBlocking ){
          de&&mand( task.pausedStep === step )
          if( typeof result !== "undefined" ){
            task.stepResult = result
            // If result is a promise, wait for it
            if( result && result.then ){
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
      // ToDo: ignore error if task moved to some other step?
      task.raise( e)
    }finally{
      CurrentStep = previous_step
      //L8_Scheduler()
    }
  }
}

ProtoTask.__defineGetter__( "walk", function(){
// l8.walk is used to pause/resume the current task when an async call is done.
// It provides a callback that will use its parameter to set the output of
// the step, an output that will become the input of the next step.
  return this.proceed( null )
})

ProtoTask.__defineGetter__( "flow", function(){
// l8.flow is similar to l8.walk but it detects errors. ie it is a node.js
// friendly "walk" that checks first result to detect errors and throw
// error when present, or else filters out first result to set result of step
// using rest.
  return this.proceed( function( err ){
    if( err )throw err
    if( arguments.length === 2 )return arguments[1]
    return slice.call( arguments, 1)
  })
})


/*
 *  Task allocator. Attempt to reuse some previous task objects.
 */

var NextFreeTask = null

function MakeTask( parent, is_fork, is_spawn ){
  var task = NextFreeTask
  if( task ){
    NextFreeTask = task.nextFree
  }else{
    task = new Task()
  }
  task_init( task, parent, is_fork, is_spawn )
  return task
}

ProtoTask.free = function(){
//_ When possible I reuse Task object to avoid building new ones. This is a
// speed optimization.
  this.nextFree = NextFreeTask
  NextFreeTask = this
}

/* ----------------------------------------------------------------------------
 *  API
 */

ProtoTask.toString = ProtoTask.toLabel = function task_to_string(){
// Task object have a .toString() and .toLabel() methods that provide a
// value that can be useful to output trace messages when debugging.
// See also l8.label to get/set the user label associated to a task.
  var label = this === l8 ? "" : this.label
  label = label ? "[" + label + "]" : ""
  return "Task/" + this.id + label
}

ProtoTask.__defineGetter__( "label", function(){
// l8.label return the value of the "label" task local variable. That value
// can be useful to output traces.
  return this.get( "label") || ""
})

ProtoTask.__defineSetter__( "label", function( label ){
// l8.label = "xxx" sets the "label" thread local variable. That variable can
// be useful in trace messages.
  return this.var( "label", label)
})

ProtoTask.Task = function task_task( fn ){
// l8#Task()
// Build a "task constructor". 
//
// Usage:
//   var do_it = l8.Task( function( p1, p2, ... ){...} }
//   do_it( "Just", "the maximum" )
//
// A task constructor is, at the step level, the equivalent of a "function" at
// the javascript statement level. I.e. calling a task constructor and calling
// a function are similar actions.
//
// When a task constructor is called, it creates a task with the supplied 
// parameters and returns a promise that will be resolved or rejected depending
// on the task outcome. The task that calls the task constructor waits for that
// promise to be fulfilled.
  if( !(fn instanceof Function) ){
    var block
    if( !(fn instanceof Array) || arguments.length > 1 ){
      block = slice.call( arguments, 0)
    }else{
      block = fn
    }
    fn = function(){ this.interpret( block) }
  }
  return function (){
    var parent_task = CurrentStep.task
    // If the current task, is done, attach new task to some other parent task
    while( parent_task.isDone ){ parent_task = parent_task.parentTask }
    var args = arguments
    // Don't create a useless task if parent task is still a "single step" task
    if( parent_task.isSingleStep && !parent_task.firstStep.next ){
      MakeStep( parent_task, function(){ return fn.apply( task, args) })
      return parent_task
    }
    var task = MakeTask( parent_task)
    var next_step = MakeStep( task, function(){ return fn.apply( task, args) })
    L8_EnqueueStep( next_step)
    return task
  }
}

ProtoTask._task = function( block, forked, paused, detached, repeat ){
//_ Private method called to create a new task.
  var task = this.current
  var new_task
  // Don't create a useless task if parent task is still a "single step" task
  // ToDo: fix this
  if( task.isSingleStep && !task.firstStep.next ){
     new_task = task
  }else{
    new_task = MakeTask( task, forked, detached )
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
    var next_step = MakeStep( new_task, block )
    L8_EnqueueStep( next_step )
  }
  return new_task
}

ProtoTask.task = function task_task( block, forked, paused, detached, repeat ){
// l8#task()
// Queue a step that calls a task.
//
// Usage:
//   l8.task( function(){
//     fs.readFile( "xx.txt", "utf8", l8.flow );
//     this.step( function( c ){ return c.toLowerCase() }
//   }).then( function( r ){ console.log( "lower cased xx.txt: ", r ) })
//
// a_task.task() adds a step that will start a new task with some initial step
// to execute. The step is blocked until the sub task is done.
//
// If there is no current task, ie if the current task is the l8 root task,
// the new task is created immediatly and it is the return value of the
// function. If there is a current task, the returned value is that task 
// object. The new task object is created just before the task starts executing
// it's first step.
//
// Usage: 
//   var new_task = null
//   l8.task( function(){
//     task = this;
//     ...
//   })
//
// See also l8.fork() and l8.spawn().
  // New tasks are initially "single step" task. If the single step calls a
  // task constructor, that constructor will get optimized and will reuse the
  // single step task instead of creating a new task, for speed reasons.
  if( TraceStartTask && NextTaskId > TraceStartTask ){
    trace( this.current.currentStep , "invokes fork()",
      forked   ? "forked"   : "",
      paused   ? "paused"   : "",
      detached ? "detached" : "",
      repeat   ? "repeated" : ""
    )
  }
  var task = this.current
  // Don't add a step if current task is root task, create new task now
  if( task === l8 ){
    var task = MakeTask( l8 )
    return task._task( block, forked, paused, detached, repeat )
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
// l8#fork()
// Queue a step that starts a forked task. forks "join".
//
// l8.fork() is similar to l8.task() but makes it possible to run multiple
// sub tasks in parallel. The result of each forked task is accumulated into an
// array, respecting the forked tasks creation order. That array becomes the
// input of the next step.
//
// Usage:
//   l8.fork( function(      ){  return "a";
//   }).fork( function(      ){  return "b";
//   }).step( function( a, b ){  return a + b;
//   }).then( function( ab   ){  console.log( ab ); })
//
// See also l8.spawn().
  return this.task( block, true, starts_paused )
}

ProtoTask._fork = function( block, starts_paused ){
//_ Private. Like l8.fork() but creates new task now.
  return this._task( block, true, starts_paused)
}

ProtoTask.spawn = function task_spawn( block, starts_paused ){
// l8#spawn()
// Add a step that will start a "detached" task.
// Contrary to tasks created using l8.task() and l8.fork() (or using a task
// constructor), "detached" tasks don't block their parent task.
//
// See also l8.task()
  return this.task( block, true, starts_paused, true) // detached
}

ProtoTask._spawn = function( block, starts_paused ){
//_ Private. Like l8.spawn() but creates the new task now.
  return this._task( block, true, starts_paused, true) // detached
}

ProtoTask.repeat = function task_repeat( block ){
// l8.repeat( fn )
// Add a step that will repeately execute the specified function. Please use
// l8.break to exit that loop.
  return this.task( block, false, false, false, true) // repeated
}

ProtoTask.defer = function(){
// l8.defer( fn ) pushes a function to execute when the current task is about
// to terminate. These functions are executed in LIFO order. See documentation
// about the difference between .defer() and .final()
  var task = this.current
  var args = arguments
  var steps = task.optional.deferredSteps
  if( steps ){
    step.push( args)
  }else{
    task.optional.deferredSteps = [args]
  }
}

//ProtoTask.__defineGetter__( "current", function(){
//  return this
//})

l8.__defineGetter__( "current", function(){
// As a convention, methods applied on the global root task l8 are forwared to
// the "current task". For normal task, .current is simply an attribute whose
// value never changes and is a reference to the object itself, ie obj.current
// == obj
  return CurrentStep.task
} )

ProtoTask.__defineGetter__( "begin", function(){
// l8.begin creates a sub task. The task is not scheduled until .end is
// mentionned. Nested tasks are possible. .begin is useful to handle errors
// like javascript does with try/catch.
// Usage: l8.begin.step(...).step(...).end
  return MakeTask( this.current)
})

ProtoTask.__defineGetter__( "end", function(){
// .end schedule a sub task defined using .begin.
// Returns parent to make chaining possible: t.begin.step().step().end.step()
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
// l8.done
// task.done is true when the task is done, ie terminated.
  return this.current.isDone
})

ProtoTask.__defineGetter__( "succeed", function(){
// l8.succeed
// task.succeed is true when the task is done and did not fail.
  var task = this.current
  return task.isDone && !task.err
})

ProtoTask.__defineGetter__( "fail", function(){
// l8.fail
// task.fail is true when a task is done but failed, due to some error.
  var task = this.current
  return task.isDone && task.err
})

ProtoTask.__defineGetter__( "result", function(){
// l8.result
// task.result is the result of a task. If the task is not finished, it is
// the last result produced by a step in that task.
  return this.current.stepResult
})

ProtoTask.__defineSetter__( "result", function( val){
// l8.result = val assigns a new result to the task. If some step remains to
// be executed, that result will be the input for the step.
  return this.current.stepResult = val
})

ProtoTask.__defineGetter__( "error", function(){
// l8.error
// task.error is the last error for the task. Null if none.
  return this.current.stepError
})

ProtoTask.stop = function(){
// l8.stop() set a flag for the task, asking it to stop gently.
// See also l8.cancel() for a more brutal way to stop a task.
  var task = this.current
  task.optional.shouldStop = true
  return task
}

ProtoTask.__defineGetter__( "stopping", function(){
// l8.stopping
// task.stopping is true if task is not terminated but was asked to terminate
// because task.stop() was called.
  var task = this.current
  return task.optional.shouldStop && !task.isDone
})

ProtoTask.__defineGetter__( "stopped", function(){
// l8.stopped
// task.stopped is true if a task is done and was asked to terminate using
// task.stop
  var task = this.current
  return task.optional.shouldStop && task.isDone
})

ProtoTask.__defineGetter__( "canceled", function(){
// task.canceled is true if task.cancel() was called.
  return this.current.optional.wasCanceled
})

ProtoTask.interpret = function task_interpret( steps ){
//_ Add steps according to description.
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
// l8.tasks
// task.tasks returns an array with one item for each direct sub task of the
// specified task.
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
// l8.parent
// task.parent is the parent task to the specified task.
  return this.current.parentTask
})

ProtoTask.__defineGetter__( "parents", function(){
// l8.parents
// task.parents is an array of tasks starting from the specified task and
// ending with the top root task, with all the intermediary tasks in between.
  var tasks = []
  var task  = this.current
  while( true ){
    tasks.push( task )
    if( task === l8 )return tasks
    task = task.parentTask
  }
})

ProtoTask.__defineGetter__( "root", function(){
// l8.root
// task.root is, among task.parents, the task just below the topmost l8 task.
  var task = this.current
  if( !task.parentTask )return task
  while( true ){
    if( task.parentTask === l8 )return task
    task = task.parentTask
  }
})

ProtoTask.__defineGetter__( "paused", function(){
// l8.paused
// task.paused is true if the specified task is paused. See l8.pause() &
// l8.resume()
  var task = this.current
  return !!task.pausedStep
})

ProtoTask.cancel = function(){
// task.cancel() terminates the specified task and its sub tasks. When a task
// get canceled, a l8.cancelEvent exception is raised. That error can be
// captured with l8.failure() and l8.final().
// After a task.cancel(), task.canceled is true.
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

ProtoTask.return = function task_return( val ){
// l8.return( [val] )
// task.return() terminates the specified task. Sub tasks are left untouched.
// In the task, execution jumps to the deferred clause and .final() clause.
  var task = this.current
  if( task.isDone ){
    throw new Error( "Cannot return(), done l8 task")
  }
  if( arguments.length === 1 ){ task.stepResult = val }
  task.optional.wasCanceled = true
  task.raise( l8.returnEvent, false, task.stepResult)
}

ProtoTask.__defineGetter__( "continue", function task_continue(){
// ToDo: l8.continue( [val] )
// l8.continue
// task.continue raises a l8.continueEvent in the task. That exception is
// propagated to the parent tasks, up to a task where l8.repeat() is active.
// That loop is then reentered.  
  return this.raise( l8.continueEvent)
})

ProtoTask.__defineGetter__( "break",  function(){
// ToDo: l8.break( [val] )
// l8.break
// task.break raises a l8.breakEvent in the specified task. That exception is
// propagated to the parent tasks, up to a task where l8.repeat() is active.
// That loop is then terminated.
  return this.raise( l8.breakEvent)
})

ProtoStep.toString = function(){ return this.task.toString() + "/" + this.id }
ProtoStep.toLabel  = ProtoStep.toString

ProtoTask.final = function( block ){
// l8.final( fn )
// task.final() specifies a function to be called when the task terminates. The
// function receives two paremeters. The first one is l8.error, the last error,
// the second one is l8.result, the last result.
  var task = this.current
  task.optional.finalBlock = block
  return task
}

ProtoTask.failure = function( block ){
// l8.failure( fn )
// task.failure() specifies a function to be called when the task terminates.
// The function receives a paremeter, l8.error, the last error.
// The function is called only if the task is failing. It is called before
// the function specified using l8.final()
  var task = this.current
  task.optional.failureBlock = block
  return task
}

ProtoTask.success = function( block ){
// l8.success( fn )
// task.success() specifies a function to be called when the task terminates.
// The function receives a paremeter, l8.result, the last result.
// The function is called only if the task is a success. It is called before
// the function specified using l8.final()
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
// l8.compiler( fn )
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
    / (begin|end|step;|step\([^\)]*\);|task;|task\([^\)]*\);|fork;|fork\([^\)]*\);|repeat;|repeat\([^\)]*\);|success;|success\([^\)]*\);|failure;|failure\([^\)]*\);|final;|final\([^\)]*\);|defer;|defer\([^\)]*\);)/g,
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
    fn = l8.eval( "this.L8_compiled = " + head + str + "}") // WTF, xxx = is needed
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
// l8.compileGenerator( fn )
// This method compiles a generator constructor using the source of the
// specified "fn" function
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

l8.promise = function(){ return MakePromise() }

ProtoTask.__defineGetter__( "promise", function(){
  var promise = this.optional.donePromise
  if( !promise ){
    promise = this.optional.donePromise = MakePromise()
  }
  return promise
})

ProtoTask.then = function task_then( success, failure, progress ){
  return this.current.promise.then( success, failure, progress)
}

l8.callback = function( promise, cb ){
// Register a node style callback to handle a promise completion.
// Promise defaults to current thead when not specified.
  if( !cb ){
    if( !promise ){
      var task = l8.current
      promise = task.promise
      promise.then(
        function( ok ){ task.return( ok ) },
        function( ko ){ task.cancel( ko ) } // ToDo: raise ?
      )
      return promise.callback
    }
    de&&mand( promise instanceof Function )
    cb      = promise
    promise = this.current
  }
  return promise.then(
    function( ok){ cb( null, ok) },
    function( ko){ cb( ko)       }
  )
}

ProtoTask.__defineGetter__( "callback ", function(){
  return this.current.promise.callback
})

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

ProtoPromise.__defineGetter__( "callback", function(){
// Return a new function f such that a f( err, rslt) call will resolve or
// reject the promise.
  var that = this
  return function( err, rslt ){ err ? that.reject( err) : that.resolve( rslt) }
})

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
  if( !value ){
    value = value // ToDo de&&bug( "DEBUG null resolve")
  }
  if( !this.allHandlers )return
  var that = this
  function handle( handler, value ){
    L8_Tick( function(){
      that.handleResult( handler, true, value)
    })
  }
  for( var ii = 0 ; ii < this.allHandlers.length ; ii++ ){
    handle( this.allHandlers[ii], value)
  }
  this.allHandlers = null
  return this
}

ProtoPromise.signal = ProtoPromise.resolve

ProtoPromise.reject = function promise_reject( value, force ){
  if( !force && (this.wasResolved || this.wasRejected) )return
  this.wasRejected  = true
  this.rejectReason = value
  if( !this.allHandlers )return
  function handle( handler, value ){
    L8_Tick( function(){
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
// Create a "task local" variable.
// Note: please use l8.global() to create variables in the root binding because
// l8.var() will actually create a variable in the current task when applied
// on the root l8 task.
// Note: when a task is done, it's bindings are erased. As a consequence, any
// pending spawn task gets inherited by the done task's parent task and cannot
// access the erased bindings they previously accessed, resulting in access
// attemtps returning typically "undefined" instead of the expected value. To
// avoid such a situation, when spawn tasks accessed shared variable from their
// parent, please make sure that the parent task does not terminate until all
// spawn task are done too. Use parent_task.join() for that purpose.
//
// See also l8.get() and l8.set()
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
// Create a global "task local variable" that all tasks share.
// See also l8.var()
  if( arguments.length === 1 ){
    return this.data[attr] = {value:val,task:l8}
  }else{
    return this.data[attr]
  }
}

ProtoTask.set = function( attr, val ){
// Assign new value to a task local variable.
// Change the value of an existing task local variable or create a new
// variable as l8.var() would do.
// See also l8.get()
  if( attr === "task" )throw new Error( "no 'task' l8 variable, reserved")
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
// See also l8.set()
  if( attr === "task" )throw new Error( "no 'task' l8 variable, reserved" )
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
// Return the "binding" where a variable is stored.
// That binding is an object with a "task" property (the binding owner) and
// a property for each variable ever accessed by that task or it's sub tasks.
// That property has a "value" property when that variable is stored directly
// inside that binding. Or else it has a "task" property that tells which task
// actually stores the variable's value.
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
  var on_err = function( e ){
    if( !task.currentStep === step )return
    task.raise( e)
  }
  var wait_loop = function( r ){
    if( !task.currentStep === step )return
    if( r && r.then ){
      // my promises can't be fulfilled with a promise but others may
      r.then( wait_loop, on_err)
      return
    }
    task.stepResult = r
    task.resume()
  }
  promise.then( wait_loop, on_err)
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
  // Result cannot be a promise because promises pause the task
  de&&mand( !task.stepResult || !task.stepResult.then || task.stepResult.parentTask )
  task.pausedStep = null
  paused_step.isBlocking = false
  paused_step.scheduleNext()
  return task
}

ProtoTask.signal = function( value ){
  var task = this.resume()
  if( arguments.length ){
    task.stepResult = value
  }
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

ProtoSemaphore.signal = ProtoSemaphore.release

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

ProtoMutex.signal = ProtoMutex.release

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

ProtoLock.signal = ProtoLock.release

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
      task.stepResult = r
      task.resume()
    }
  })
  return this
}

ProtoPort.try_get = function(){
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
      step.stepResult = that
      task.resume()
    }
  })
  return this
}

ProtoPort.try_put = function( msg ){
// Like .put() but non blocking
  if( this.closed
  ||  !this.putPromise
  ||  !this.putPromise.wasResolved
  )return false
  this.putPromise = null
  this.value = msg
  return true
}

ProtoPort.signal = ProtoPort.try_put

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
        task.stepResult = msg
        task.resume()
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

ProtoMessageQueue.try_put = function( msg ){
  if( this.closed
  ||  this.full
  )return false
  this.queue.push( arguments.length > 1 ? arguments : msg)
  this.length++
  this.in.resolve()
  return true
}

ProtoMessageQueue.signal = ProtoMessageQueue.try_put

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

ProtoMessageQueue.try_get = function(){
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

ProtoTask.generate = function(){
  return new Generator()
}

ProtoTask.Generator = function( block ){
// Return a "Generator Constructor", much like l8.Task() does but the returned
// value is a Generator Task, not just a regular Task. I.e. it can "yield".
  return function(){
    var args = arguments
    var parent = l8.current
    var gen = l8.generate()
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

ProtoGenerator.try_next = function( msg ){
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

ProtoGenerator.try_yield = function( msg ){
// Like .yield() but never blocks
  if( this.closed )return [false]
  if( !this.putPromise.wasResolved )return [false]
  this.putPromise = null
  this.get.resolve( this.getMessage = msg)
  return [true, this.putMessage]
}

ProtoGenerator.signal = ProtoGenerator.try_yield

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
  var that = this
  this.id = setTimeout( function(){ that.signal() }, delay )
  this.timeStarted  = l8.now
  this.timeSignaled = null
  return this
}
var ProtoTimeout = Timeout.prototype

ProtoTask.timeout = function( delay ){
  return new Timeout( delay )
}

ProtoTimeout.__defineGetter__( "promise", function(){
  return this.timedPromise
})

ProtoTimeout.then = function( callback, errback ){
  return this.timedPromise.then( callback, errback)
}

ProtoTimeout.signal = function( value ){
  if( this.id ){
    clearTimeout( this.id )
    this.id = null
    this.timeSignaled = l8.now
  }
  this.timedPromise.resolve( value )
}

ProtoTimeout.__defineGetter__( "duration", function(){
  return this.timeSignaled
  ? this.timeSignaled - this.timeStarted
  : l8.now            - this.timeStarted
})

ProtoTimeout.__defineGetter__( "signaled", function(){
  return this.timeSignaled
})

ProtoTimeout.__defineGetter__( "started", function(){
  return this.timeStarted
})


/* ----------------------------------------------------------------------------
 *  Calls
 */

function Call( cb ){
  this.promise = null
  this.cb      = cb 
}
var ProtoCall = Call.prototype

ProtoCall.call = function(){
  var that = this
  if( this.promise ){
    try{
      this.promise.resolve( that.cb.apply( that, arguments ) )
    }catch( e ){
      this.promise.reject( e )
    }
  }else{
    l8.tick( function(){
      that.cb.apply( that, arguments )
    })
  }
}

ProtoCall.apply = function( args ){
  if( !arguments.length ){
    args = []
  }else if( typeof args !== "array" ){
    args = [ args ]
  }
  return this.call.apply( this, args )
}

ProtoCall.signal = ProtoCall.apply

ProtoCall.__defineGetter__( "promise", function(){
  if( this.promise ) return this.promise
  return this.promise = l8.promise()
})

ProtoCall.then = function( ok, ko ){
  return this.promise.then( ok, ko )
}

ProtoTask.call = function( cb ){
  return new Call( cb )
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

l8.countdown = function( n, silent ){
// Exit process with error status 1 after a while.
// Display a stressfull message every second until that.
  var count_down = n
  var i = setInterval(
    function(){
      !silent && de&&bug( "tick " + --count_down)
      if( !count_down ){
        trace( "exiting, with error status...")
        clearInterval( i )
        // Note: process.exit() is not defined on the client side
        process.exit( 1 )
      }
    },
    1000
  )
}

/*
 *  End boilerplate for module loaders
 *  Copied from when.js, see https://github.com/cujojs/when/blob/master/when.js
 *  Go figure what it means...
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

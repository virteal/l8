// l8.js
//   Task/promise manager
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

TraceStartTask = 18
// When debugging test cases, this tells when to start outputting traces

function trace(){
// Print trace. Offer an easy breakpoint when output contains "DEBUG"
  var buf = ["L8"]
  for( var ii = 0 ; ii < arguments.length ; ii++ ){
    if( arguments[ii] ){ buf.push( arguments[ii]) }
  }
  buf = buf.join( ", ")
  try{
    if( Util ){
      Util.puts( buf)
    }else{
      console.log( buf)
    }
    if( buf.indexOf( "DEBUG") >=  0 ){
      // please set breakpoint here to debug
      false && breakpoint()
    }
  }catch( e ){
    // ToDo: host adapted tracing
  }
  return buf
}

function Task( parent ){
  this.id              = ++L8.taskCount
  this.isRoot          = !parent
  this.parentTask      = parent
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
  this.local           = {}
  if( parent ){
    this.local = parent.local
    parent.subTasks[this.id] = this
    parent.subTaskCount++
  }
  if( TraceStartTask && L8.taskCount >= TraceStartTask )trace( "New", this)
}
Task.prototype = Task

function Step( task, parent, previous, block ){
  this.id          = ++task.stepCount
  this.isForked    = false
  this.isRepeated  = false
  this.task        = task
  this.parentStep  = parent
  this.block       = block
  this.isBlocking  = true
  this.previous    = null
  this.next        = null
  // When inserting at head
  if( !previous ){
    this.next      = task.firstStep
    if( this.next ){ this.next.previous = this }
    task.firstStep = task.lastStep = task.currentStep = this
  // When inserting at tail
  }else if( !previous.next ){
    this.previous      = previous
    this.previous.next = this
    task.lastStep      = this
  // When inserting in the middle of the list
  }else{
    this.previous = previous
    this.next     = previous.next
    previous.next.previous = this
    previous.next = this
  }
  if( TraceStartTask && L8.taskCount >= TraceStartTask ){
    trace(
      "New", this,
      this === task.firstStep ? "first" : "",
      this === task.lastStep  ? "last"  : ""
    )
  }
}
Step.prototype = Step

// Bootstrap root task, id 0
L8 = {taskCount:-1}
L8 = l8 = new Task()
L8.l8          = L8
L8.taskCount   = 0
L8.queuedStep  = null
L8.stepQueue   = []
L8.isScheduled = false
var CurrentStep = new Step( L8)

// Browser & nodejs compatible way to schedule code exectution in event loop.
// Note: you can provide yours if you get an efficient one.
try{
  L8.nextTick = process.nextTick
  L8.nextTick( function(){})
}catch( e ){
  L8.nextTick = function next_tick( block ){ setTimeout( block, 0) }
  L8.nextTick( function(){})
}

// Some special errors are used to build control structures
L8.cancelEvent   = {l8:"cancel"}
L8.breakEvent    = {l8:"break"}
L8.continueEvent = {l8:"continue"}
L8.returnEvent   = {l8:"return"}

L8.scheduler = function scheduler(){
// Inject the global scheduler in the global event loop.
// It executes queued steps and their next ones.
  function tick(){
    L8.isScheduled = false
    var step
    while( step = L8.dequeueStep() ){
      step.execute()
      step.scheduleNext()
    }
    // When done, assume code runs from within the "root" task
    CurrentStep = L8.currentStep
  }
  if( !L8.isScheduled ){
    L8.nextTick( tick)
    L8.isScheduled = true
  }
}

L8.enqueueStep = function enqueue_step( step ){
// Schedule step to execute. Restart scheduler if it is not started.
  // Assert style check that step is not queued twice
  if( false ){
    if( step.wasQueued ){
      throw trace( "requeue bug: " + step)
    }
    step.wasQueued = true
  }
  // Store step, efficiently if only one exist, in an array if more is needed
  if( L8.stepQueue ){
    L8.stepQueue.push( step)
  }else{
    if( L8.queuedStep ){
      L8.stepQueue = [L8.queuedStep, step]
      L8.queuedStep = null
    }else{
      L8.queuedStep = step
    }
  }
  step.isBlocking = false
  // Wake up scheduler if necessary, it will eventually execute this step
  L8.scheduler()
  // Debug traces
  if( TraceStartTask && L8.taskCount >= TraceStartTask ){
    if( L8.queuedStep ){
      L8.queuedStep.trace( "queued step")
    }else{
      var item
      for( var ii = 0 ; ii < L8.stepQueue.length ; ii++ ){
        item = L8.stepQueue[ii].trace( "queued step[" + ii + "]")
      }
    }
  }
}

L8.dequeueStep = function dequeue_step(){
// Consume first step from step queue.
  // Step is stored in an array only when more than one step is queued
  var queue = L8.stepQueue
  var step
  if( queue ){
    step = queue.shift()
    if( queue.length === 0 ){
      L8.stepQueue = null
    }
  }else{
    if( step = L8.queuedStep ){
      L8.queuedStep = null
    }
  }
  return step
}

Step.trace = function step_trace( msg ){
  var task = this.task
  trace(
    msg,
    this,
    task.isDone     ? "task done" : "",
    this === task.firstStep ? "first" : "",
    this === task.lastStep  ? "last"  : "",
    this.isRepeated ? "repeat" : "",
    this.isForked   ? "fork"   : "",
    this.isBlocking ? "pause"  : ""
  )
}

Step.execute = function step_execute(){
  var task         = this.task
  if( TraceStartTask && L8.taskCount >= TraceStartTask ){
    this.trace( "DEBUG execute")
  }
  if( task.isDone )throw new Error( "BUG, execute a done l8 step: " + this)
  if( this.isBlocking )return
  task.currentStep = this
  CurrentStep      = this
  // Steps created by this step will be queued before the current "next step"
  task.nextStep    = this.next
  var block = this.block
  var result
  try{
    // Execute block if provided, set "this" to the current task
    if( block ){
      // If step( a, b, ...), assume last result is an array
      if( block.length > 1 ){
        result = block.apply( task, task.stepResult)
      // If step( r), provide last result as a single parameter
      }else if( block.length ){
        result = block.apply( task, [task.stepResult])
      // If step(), don't provide any parameter
      }else{
        result = block.apply( task)
      }
      // Update last result only when block returned something defined.
      // Result is set asynchronously using walk(), see below
      if( result !== undefined ){
        task.stepResult = result
      }
      task.progressing()
    }
  }catch( e ){
    // scheduleNext() will handle the error propagation
    task.stepError = e
  }finally{
    task.nextStep = null
  }
}

Step.scheduleNext = function schedule_next(){
// Handle progression from step to step, error propagation, task termination
  var task = this.task
  if( task.isDone )throw new Error( "Bug, schedule a done l8 task: " + this)
  if( this.isBlocking )return
  var redo = this.isRepeated
  // Handle "continue" and "break" in loops
  if( redo && task.stepError ){
    if( task.stepError === L8.continueEvent ){
      task.stepError = undefined
    }else if( task.stepError === L8.breakEvent ){
      redo = false
    }
  }
  var queue = task.queuedTasks
  var subtasks
  var subtask_id
  var subtask
  // When no error, wait for subtask if any, else move to next step or loop
  if( !task.stepError ){
    var next_step = redo ? this : this.next
    if( next_step ){
      if( !this.isForked || !next_step.isForked || redo ){
        // Regular steps wait for subtasks, fork steps don't
        for( subtask in queue ){
          this.isBlocking = true
          task.pausedStep = this
          return
        }
      }
      // If loop, don't block the global event loop
      if( redo ){
        L8.nextTick( function(){ L8.enqueueStep( next_step) })
      }else{
        L8.enqueueStep( next_step)
      }
      return
    }
    // When all steps are done, wait for spawn subtasks
    this.isBlocking = true
    task.pausedStep = this
    for( subtask in queue )return
    subtasks = task.subTasks
    for( subtask_id in subtasks ){
      subtask = subtasks[subtask_id]
      if( subtask.isDone || queue[subtask.id] )continue
      queue[subtask.id] = task
      return
    }
  // When error, cancel all remaining subtasks, both queued and spawn ones
  }else{
    var all_tasks = []
    for( subtask_id in queue ){
      all_tasks.push( queue[subtask_id])
    }
    subtasks = task.subTasks
    for( subtask_id in subtasks ){
      all_tasks.push( subtasks[subtask_id])
    }
    for( subtask in all_tasks ){
      //subtask = all_tasks[subtask_id]
      if( !subtask.isDone ){
        subtask.cancel()
      }
    }
    // ToDo: how can canceled tasks schedule some more steps?
  }
  // When nothing more, handle task termination
  this.isBlocking = true
  task.pausedStep = null
  // ToDo: let success/failure block run asynch, then done, not before
  task.isDone     = true
  var exit_repeat = false
  var block
  try{
    if( task.stepError === L8.returnEvent ){
      task.stepError = undefined
    }else if( task.stepError === L8.breakEvent ){
      task.stepError = undefined
      exit_repeat    = true
    }
    task.progressing()
    try{
      if( task.stepError ){
        if( block = task.failureBlock ){
          task.failureBlock = null
          try{
            block.call( task, task.stepError)
          }catch( e ){
            throw e
          }
        }else{
          throw task.stepError
        }
      }else{
        if( block = task.successBlock ){
          task.successBlock = null
          try{
            block.call( task, task.stepResult)
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
      if( block = task.finalBlock ){
        try{
          block.call( task, task.stepError, task.stepResult)
        }catch( e ){
          throw e
        }
      }
      if( task.allPromises ){
        var err  = task.stepError
        var rslt = task.stepResult
        var list = task.allPromises
        var len  = list.length
        var item
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
    try{
      if( exit_repeat && task.parentTask ){
        if( task.parentTask.currentStep.isRepeated ){
          task.parentTask.currentStep.isRepeated = false
        }else{
          task.stepError = L8.breakEvent
          task.parentTask.raise( L8.breakEvent)
        }
      }
    }finally{
      if( task.parentTask ){ task.parentTask.subtaskDone( task) }
    }
  }
}

Task.Task = function task_task( fn ){
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
    var parent_task = CurrentStep.task.isDone ? L8 : CurrentStep.task
    var task = new Task( parent_task)
    var args = arguments
    new Step( task, CurrentStep, null, function(){ fn.apply( task, args) })
    L8.enqueueStep( task.firstStep)
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
  var parent_task = CurrentStep.task.isDone ? L8 : CurrentStep.task
  return new Task( parent_task)
})

Task.__defineGetter__( "end", function(){
  var task  = this.current
  if( !task.firstStep ){
    new Step( task, CurrentStep, null, null)
  }
  // When first step can run immediately
  if( !task.queuedTaskCount ){
    L8.enqueueStep( task.firstStep)
  // When first step is after forks
  }else{
    // Pause task to wait for forks, need a new "first step" for that
    new Step( task, task.firstStep.parentStep, null, null)
    task.pausedStep = task.firstStep
  }
  // Return parent, makes chaining possible t.begin.step().step().end.step()
  return task.parentTask
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

Task.step = function step( block, is_forked, is_repeated ){
// Add a step to execute later
  var task = this.current
  if( task.isDone )throw new Error( "Can't add new step, l8 task is done")
  var parent_step  = task.currentStep ? task.currentStep.parentStep : null
  var insert_after = task.nextStep    ? task.nextStep.previous : task.lastStep
  if( !(block instanceof Function) ){
    block = function(){ task.interpret( block) }
  }
  var step = new Step( task, parent_step, insert_after, block)
  if( is_forked   ){ step.isForked   = true }
  if( is_repeated ){ step.isRepeated = true }
  return task
}

Task.task = function task_task( block, forked, paused, detached, repeated ){
// Add a step that will start a new task with some initial step to execute
  if( TraceStartTask && L8.taskCount >= TraceStartTask ){
    trace( this.current.currentStep , "invokes fork()",
      forked   ? "forked"   : "",
      paused   ? "paused"   : "",
      detached ? "detached" : "",
      repeated ? "repeated" : ""
    )
  }
  return this.step( function(){
    var task = this.current
    if( TraceStartTask && L8.taskCount >= TraceStartTask ){
      trace( task.currentStep , "executes scheduled fork",
        forked   ? "forked"   : "",
        paused   ? "paused"   : "",
        detached ? "detached" : "",
        repeated ? "repeated" : ""
      )
    }
    var new_task = new Task( task)
    var step = new Step( new_task, task.currentStep, null, block)
    if( paused ){
      // Pause task, need a new "first step" for that
      new Step( new_task, task.currentStep, null, null)
      new_task.pausedStep = new_task.firstStep
      new_task.pausedStep = step
    }else{
      L8.enqueueStep( step)
    }
    if( !detached ){
      task.queuedTasks[new_task.id] = new_task
      task.queuedTaskCount++
    }
  }, forked, repeated)
}

Task.fork = function task_fork( block ){
// Add a step that will start a forked task with some initial step to execute
  return this.task( block, true)
}

Task.spawn = function task_spawn( block, starts_paused ){
// Add a step that will start a detached task with some initial step to execute
  return this.task( block, true, starts_paused, true) // detached
}

Task.repeat = function task_repeat( block ){
// Add a step that will repeately start a new task with a first step to execute
  return this.task( block, false, false, false, true) // repeated
}

Task.interpret = function task_interpret( steps ){
// Add steps according to description.
  var task = this.current
  var block
  for( step in steps ){
    if( step instanceof Function ){
      this.step( step)
    }else if( step instanceof Array ){
      this.task( step)
    }else{
      if( block = step.step     ){ this.step(     block) }
      if( block = step.begin    ){ this.task(     block) }
      if( block = step.task     ){ this.task(     block) }
      if( block = step.fork     ){ this.fork(     block) }
      if( block = step.repeat   ){ this.repeat(   block) }
      if( block = step.progress ){ this.progress( block) }
      if( block = step.success  ){ this.success(  block) }
      if( block = step.failure  ){ this.failure(  block) }
      if( block = step.final    ){ this.final(    block) }
    }
  }
  return task
}

Task.compile = function task_compile( code ){
// Expand some macros to make a "task constructor".
  // Lexer
  code = code.toString()
  var close = code.lastIndexOf( "}")
  code = code.substr( 0, close) + code.substr( close + 1)
  code = "\n begin;\n" + code + "\n end;\n"
  var ii = 0
  var fragment
  var fragments = []
  code.replace(
    / (begin|end|step;|step\([^\)]*\);|task;|fork;|repeat;|progress;|success;|failure;|final;)/g,
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
        throw new Error( "Unexpected 'end' in L8.compile()")
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
  var head = body[0].code
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
  }
  function generate( tree, buf ){
    if( !tree.length ){
      gen_block( previous, buf)
      return
    }
    var head = tree.shift()
    if( !head )return generate( tree, buf)
    var block
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
  str.push( head + ";this")
  generate( body, str)
  trace( Util.inspect( str))
  str = str.join( ".\n") + "}"
  return L8.Task( eval( str))
}

function do_something_as_task(){
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
trace( L8.compile( do_something_as_task))

Task.subtaskDone = function subtask_done( subtask ){
  var task = this //.current
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
  if( yields ){ task.stepResult = yield_value }
  return task
}

Task.yield = function task_yield( value ){
  return this.pause( true, value)
}

Task.resume = function task_resume( yields, yield_value ){
  var task = this.current
  var paused_step = task.pausedStep
  if( !paused_step ){
    throw new Error( "Cannot resume, not paused l8 task")
  }
  if( !paused_step.isBlocking ){
    throw new Error( "Cannot resume, running l8 step")
  }
  task.pausedStep = null
  if( yields ){ task.stepResult = yield_value }
  paused_step.isBlocking = false
  paused_step.scheduleNext()
  return task
}

Task.run = function task_run( value ){
  return this.resume( true, value)
}

Task.raise = function task_raise( err ){
  var task = this.current
  if( task.isDone )return
  task.stepError = err
  if( task.pausedStep ){
    task.resume()
  }else{
    var step = task.currentStep
    if( step ){
      if( step.isBlocking ){
        step.isBlocking = false
        step.scheduleNext()
      }else if( step === CurrentStep ){
        throw err
      }
    }else{
      trace( "Unhandled exception", e, e.stack)
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
  if( !on_self && task !== CurrentStep.task ){
    task.wasCanceled = true
    task.raise( L8.cancelEvent)
  }
  return task
}

Task.progressing = function task_progressing(){
  if( this.progressBlock ){
    try{
      this.progressBlock( this)
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
        var val = item.progressBlock( this)
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
Task.__defineGetter__( "continue", function task_continue(){
  return this.raise( L8.continueEvent)
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
    // throw new Error( "Can't walk, not running")
  }
  step.isBlocking = true
  return function walk_cb(){
    if( task.currentStep !== step ){
      // ToDo: quid if multiple walk() fire?
      // throw new Error( "Cannot walk same step again")
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
  L8.nextTick( function(){
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
  })
  return this
}

Promise.reject = function promise_reject(){
  L8.nextTick( function(){
    if( this.failureBlock ){
      try{
        var val = this.failureBlock.apply( this, arguments)
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
  })
  return this
}

Promise.progress = function promise_progress(){
  if( this.progressBlock ){
    try{
      this.progressBlock.apply( this, arguments)
    }catch( e ){}
  }
  return this
}

Task.promise = function task_promise(){
  return new Promise()
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
    L8.scheduler()
  }, delay)
  return task
}

L8.startup = function(){

}

function tests(){

  var test

  var traces = []
  function t(){
    if( traces.length > 200 ){
      trace( "!!! Too many traces, infinite loop? exiting...")
      process.exit( 1)
    }
    var buf = ["test" + (test ? " " + test : ""), "" + CurrentStep]
    for( var ii = 0 ; ii < arguments.length ; ii++ ) buf.push( arguments[ii])
    buf = trace.apply( this, buf)
    traces.push( buf)
    return buf
  }
  function check(){
    var ii = 0
    var msg
    var tt = 0
    var tmsg
    while( ii < arguments.length ){
      msg = arguments[ii++]
      while( true ){
        tmsg = traces[tt]
        if( tmsg && tmsg.indexOf( msg) >= 0 )break
        if( ++tt >= traces.length ){
          var msg = "FAILED test " + test + ", missing trace: " + msg
          trace( msg)
          for( var jj = 0 ; jj < ii ; jj++ ){
            trace( arguments[jj])
          }
          traces = []
          throw new Error( msg)
        }
      }
    }
    trace( "Test " + test, "PASSED")
    traces = []
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
        check( "start",
               "step",
               "sleep",
               "sleeping",
               "sleep done",
               "final"
        )
        test_2()
      })
    .end
  }

  var test_2 = L8.Task( function test2(){
    test = 2; this
    .step(  function(){ t( "start")               })
    .step(  function(){ setTimeout( this.next, 0) })
    .step(  function(){ t( "sleep/timeout done")  })
    .final( function(){ t( "final")
      check( "start",
             "sleep/timeout done",
             "final"
      )
      test_3()
    })
  })

  var test_3 = L8.Task( function test3(){
    test = 3; this
    .step(    function(){ t( "start")             })
    .step(    function(){ t( "add step 1"); this
      .step(  function(){   t( "first step")  })
                          t( "add step 2"); this
      .step(  function(){   t( "second step") })  })
    .step(    function(){ t("third & final step") })
    .success( function(){ t("success")            })
    .final(   function(){ t( "final")
      check( "start",
             "success",
             "final"
      )
      test_4()
    })
  })

  var test_4 = L8.Task( function test4(){
    test = 4; this
    .step(    function(){ t( "start")                    })
    .step(    function(){ t( "raise error")
                          throw new Error( "step error") })
    .step(    function(){ t("!!! skipped step")          })
    .failure( function(){ t("error raised", this.error)  })
    .final(   function(){ t( "final")
      check( "start",
             "error raised",
             "final"
      )
      test_5()
    })
  })

  var test_5 = L8.Task( function test5(){
    test = 5; this.label = t( "start"); this
    .fork(    function(){ this.label = t( "fork 1"); this
      .step(  function(){ this.sleep( 10)       })
      .step(  function(){ t( "end fork 1")      })        })
    .fork(    function(){ this.label = t( "fork 2"); this
      .step(  function(){ this.sleep( 5)        })
      .step(  function(){ t( "end fork 2")      })        })
    .step(    function(){ t( "joined")          })
    .fork(    function(){ this.label = t( "fork 3"); this
      .step(  function(){ this.sleep( 1)        })
      .final( function(){ t( "final of fork 3") })        })
    .fork(    function(){ this.label = t( "fork 4"); this
      .final( function(){ t( "final of fork 4") })        })
    .step(    function(){ t( "joined again") })
    .final(   function(){ t( "final")
      check( "start",
             "fork 1",
             "fork 2",
             "end fork 2",
             "end fork 1",
             "joined",
             "fork 3",
             "fork 4",
             "final of fork 4",
             "final of fork 3",
             "joined again",
             "final"
      )
      test_6()
    })
  })

  var test_6 = L8.Task( function test6(){
    function other1(){ l8.step( function(){ t( "in other1")} )}
    function other2(){ l8.fork( function(){ t( "in other2")} )}
    test = 6; this
    .step(  function(){ other1(); t( "other1() called")        })
    .step(  function(){ t( "other1 result", this.result); this
                        other2(); t( "other2() called")        })
    .step(  function(){ t( "other2 result", this.result)       })
    .final( function(){ t( "final result", this.result)
      check( "other1() called",
             "in other1",
             "other1 result",
             "other2() called",
             "in other2",
             "other2 result",
             "final result"
      )
      test_7()
    })
  })

  var test_7 = L8.Task( function test7(){
    test = 7
    var ii; this
    .step(   function(){ t( "simple, times", ii = 3)     })
    .repeat( function(){ t( "repeat simple step", ii)
                         if( --ii === 0 ){
                           t( "break simple repeat")
                           this.break
                         }                               })
    .step(   function(){ t( "simple repeat done")        })
    .step(   function(){ t( "sleep, times", ii = 2)      })
    .repeat( function(){ this
      .step( function(){   t( "repeat sleep", ii)
                           this.sleep( 1)                })
      .step( function(){   t( "done sleep", ii)          })
      .step( function(){   if( --ii === 0 ){
                             t( "break sleep repeat")
                             this.break
                           }                          }) })
    .step(   function(){ t( "done ")                     })
    .failure( function( e ){ t( "unexpected failure", e)
                             throw e                      })
    .final(  function(){ t( "final result", this.result)
      check( "simple, times",
             "repeat simple",
             "break simple repeat",
             "simple repeat done",
             "sleep, times",
             "done sleep",
             "break sleep repeat",
             "done",
             "final result"
      )
      test_last()
    })
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


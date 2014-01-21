// whisper.js
//   Paroles are promises with steps, in callback disguise.
//
// (C) 2013-14, Jean Hugues Robert -- github.com/JeanHuguesRobert -- @jhr
// MIT License
//
// Please look for test suite in test/parole.js
// Please exec promises-aplus-tests test/promise.js to run promise test suite

"use strict";

// A Parole is a callback (hence a Function)... on steroid.
// There is some trickery involved because Function class cannot be inherited
(function(){
  
  // Create a Parole Function object, a callable
  function MakeParole(){
    // Create a new function, it just calls itself.fill() when it is called
    var p = function(){ return fill.apply( p, arguments ) };
    // Some trickery to inject methods into that new object, see below
    _set_proto( p );
    return p;
  }

  // Create a "will" step Parole Function object, linked to some previous one.
  // Such paroles are callable objects too.
  function MakeStepParole( tail ){
    var p = function(){ return fill.apply( p, arguments ) };
    _set_proto( p );
    // Steps are part of a chain (at the end of it initially)
    tail._next = p;
    p._previous = tail;
    return p;
  }

  // The global static methods, initially empty
  var P = {};

  // The Parole object instance members, default values (all null)
  var I = {
    values:         null,  // Filled by a Parole function when it is called
    value:          null,  // Promise's value, eventually
    error:          null,  // True if promise was rejected
    _next:          null,  // Chain of Parole objects are doubly linked
    _previous:      null,
    _start:         null,  // Head of that chain
    _end:           null,  // Last "step" in the chain, next come promises
    _listener:      null,  // Function called when parole is filled
    _step:          null,  // Function called when parole is filled
    _fork:          null,  // Either forked steps or multipe .then() clauses
    _ok:            null,  // Promise resolved callback
    _ko:            null,  // Promise rejected callback
    _ecma_promise:  null,  // When using an ECMA Promise compatible factory
    _ecma_resolve:  null,  // Resolver for that ECMA promise
    _ecma_reject:   null,  // Rejector for that ECMA promise
    _scheduled:     false, // These callbacks are executed async by event loop
    _queue:         null,  // Pipes queue access to paroles
    _fifo:          null,  // That queue is a FIFO
    _gen_queue_in:  null,  // Generator's input step
    _gen_queue_out: null,  // Generator's exit step
    _in:            null,  // Generator consumer's current step
  };
  function Instance(){}
  Instance.prototype = I;

  // Without __proto__ the API runs slower but still works
  var has_proto = (function(){ return !!{}.__proto__; })(); // V8 style

  // One of setTimeout, process.nextTick or setImmediate, typically
  // See also https://github.com/NobleJS/setImmediate
  var tick = null;

  P.scheduler = scheduler;
  function scheduler( t ){
    if( t === "sync" ){
      tick = null;
      return;
    }
    tick = t
    || ( typeof setImmediate !== "undefined" && setImmediate     )
    || ( typeof process      !== "undefined" && process.nextTick )
    || setTimeout;
    return this;
  }

  // May use some external ECMA compatible Promise implementation
  var EcmaPromiseFactory = null;
  P.factory = function( f ){ EcmaPromiseFactory = f; };

  // Optimization tricks, avoiding some method lookups at runtime
  function noop(){}
  var call  = Function.call;
  var apply = Function.apply;
  var array_slice = [].slice;
  function array(  a    ){ return array_slice.call( a );    }
  function slice(  a, n ){ return array_slice.call( a, n ); }
  function slice1( a    ){ return array_slice.call( a, 1 ); }
  function slice2( a    ){ return array_slice.call( a, 2 ); }

  // Native Function.bind() is apparently way too slow
  var bind = function( f, that ){
    var args = array_slice.call( arguments, 2 );
    return function() {
      return arguments.length
      ? f.apply( that, args.concat( array_slice.call( arguments ) ) )
      : f.apply( that, args );
    };
  };
  var bind0 = function( f, that ){
    return function(){
      return arguments.length ? f.apply( that, arguments ) : f.call( that );
    };
  };

  // Attach instance methods, using either __proto__ or copying the methods
  // When no __proto__, the function is redefined, see at the end of this file
  var _set_proto = function( obj ){ obj.__proto__ = I; };

  // One can convert a Promise into a string. Works better once resolved...
  // This is usefull when debugging using trace messages
  I.toString = function(){
    var tail = _tail( this );
    var values = tail.values;
    // If not resolved, resolve to undefined, forever
    if( !values ){
      resolve.call( tail );
      values = tail.values;
    }
    var value = tail.values[ 0 ] || tail.values[ 1 ];
    return value ? value.toString() : "";
  };

  // Parole detector, duck typing
  function isParole( x ){
    return x
    && typeof x.then    === "function"
    && typeof x.upgrade === "function"
    && x !== parole;
  }

  // l8 pipe protocol, a work in progress (may 2013), x.push() & x.pipe)()
  // ToDo: maybe add flow control (back pressure?)
  function isPipe( x ){
    if( !x    )return false;
    var pin  = typeof x.push === "function";
    if( !pin  )return false;
    var pout = typeof x.pipe === "function";
    if( !pout )return false;
    return true;
  }

  // l8 generator protocol, a work in progress (may 2013)
  // x.next() and x.send()
  // ToDo: implement this better
  function isGenerator( x ){
    if( !x )return false;
    if( typeof x.next !== "function" )return false;
    if( typeof x.send !== "function" )return false;
    return true;
  }
  
  // Boxon protocol, a work in progress (january 2014)
  // x.boxon()
  function isBoxon( x ){
    return x && typeof x.boxon === "function";
  }

  function fastTry( f ){
    try{
      f();
      return true;
    }catch( e ){
      // ToDo: avoid silent ignore
    }
  }
  
  // Avoid using tick() too much thanks to some buffering
  var SchedulerQueue = [];
  
  P.schedule = schedule;
  function schedule( f, t, a ){
    // "sync" mode
    if( !tick && !SchedulerQueue.length )return f.apply( t, a );
    // normal mode, fifo queue
    SchedulerQueue.push( f, t, a );
    // That's enough if loop is already active, ie some items in queue already
    if( SchedulerQueue.length > 3 )return;
    // When first item is queued, schedule loop that runs scheduled calls
    tick( function(){
      var ii = 0;
      // The loop, it processes queued calls, until none remains
      while( !fastTry( function(){
        var f;
        while( f = SchedulerQueue[ ii++ ] ){
          // Use previously queued f, t, a 
          f.apply( SchedulerQueue[ ii++ ], SchedulerQueue[ ii++ ] );
        }
      })){}
      SchedulerQueue = [];
    });
  }

  // Exported Parole creator/constructor. See Doc
  P.parole = parole;
  function parole(){
    if( !arguments.length )return MakeParole();
    return when.apply( null, arguments );
  }
  
  // Also export a .defer() that most benchmarks uses
  P.defer = function(){
    var p = MakeParole;
    p.promise = this;
    return p;
  };
  
  var EcmaLikePromise;
  if( typeof Promise !== "undefined" ){
    EcmaLikePromise = Promise;
  }else{
    EcmaLikePromise = function( f ){
      f( bind( resolve, this ), bind( reject, this ));
    };
    EcmaLikePromise.prototype = I;
  }
  P.Promise = EcmaLikePromise;
  
  // Interoperability with other promise implementations
  P.whisper = function whisper( a, b ){
    var p;
    // Q style deferred/promise
    if( a && a.promise && typeof a.promise.then === "function" 
    && arguments.length === 1
    ){
      p = MakeParole();
      a.promise.then( bind( resolve, p ), bind( reject, p ) );
    // Else, if thenable, callback fulfillment is ORed with it
    }else if( a && a.then === "function"
    && arguments.length === 1 
    ){
      if( isParole( a ) )return a;
      p = MakeParole();
      a.then( bind( resolve, p ), bind( reject, p) );
    // Else, if boxon, callback fulfillment is ORed with it
    }else if( a && a.boxon === "function"
    && arguments.length === 1 
    ){
      p = MakeParole();
      a.boxon( p );
    // ECMA style promise, ie whisper( resolve, reject )
    }else if( a && typeof a === "function"
    &&        b && typeof b === "function"
    && arguments.length === 2
    ){
      p = MakeParole();
      p.then( a, b );
    // Else, assume a new Parole Function is needed
    }else{
      p = MakeParole.apply( parole, arguments );
    }
    return p;
  };
  
  // See also boxon.js for a standalone version of this
  P.boxon = function( f ){
    
    var box = function(){
      if( box._result ){
        if( box._result[0] )throw box._result[0];
        if( box._result.length <= 2 )return box._result[1];
        return Array.slice.call( box._result, 1 );
      }
      box._result = arguments;
      box.then( box._ok, box._ko, true );
      return box.boxon( box._on );
    };
    
    if( typeof f === "function " && arguments.length === 1 ){
      box._on = f;
      box._result = null;
    }else{
      box._on = null;
      box._result = arguments.length && arguments;
    }
    box._ko = box._ok = null;
    
    box.boxon = function( f ){
      this._on = f;
      if( f && this._result ){ f.apply( this, this._result ); }
      return this;
    };
    
    box.then = function( ok, ko, force ){
      if( !force && (this._ok || this._ko) )throw new Error( "busy boxon" );
      if( !this._result ){
        this._ok = ok;
        this._ko = ko;
        return "BOXONS_DONT_CHAIN";
      }
      if( !this._result[0] ){
        ok && schedule( bind( ok, null, this._result[1] ) );
      }else{
        ko && schedule( bind( ko, null, this._result[0] ) );
      }
      return "BOXONS_DONT_CHAIN";
    };
    
    return box;
  };

  I.partial = partial;
  function partial(){
    var fn = this;
    var args = arguments;
    // New function is bound with provided arguments
    var new_f = function(){
      if( arguments.length ){
        fill.apply( fn, array( args ).concat( array( arguments ) ) );
      }else{
        fill.apply( fn, args );
      }
    };
    // Result is a Promise/A, not a full-blown Parole, that costs much less
    new_f.then = then;
    new_f["catch"] = failure;
    return new_f;
  }

  I.method = method;
  function method( m, target, args ){
    // Add Parole callback to parameters and then invoke the method
    try{
      if( args ){
        m.apply( target, args.push( this ) );
      }else{
        m.call( target, this );
      }
    }catch( err ){
      this.reject( err );
    }
    return this;
  }

  P.method = function(){
    // Static version creates a promise
    var p = MakeParole();
    return method.apply( p, arguments );
  };
  
  I.delay = delay;
  function delay( duration, value ){
    // Instance version, ie some_p.delay( duration, value )
    var p = MakeParole();
    var error;
    var values;
    var delayed;
    function done(){
      // When called by then()
      if( isParole( this ) ){
        error  = this.error;
        values = this.values;
        // Too soon?
        if( !delayed )return;
      // When called by setTimeout()
      }else{
        delayed = true;
      }
      if( error ){
        reject.apply( p, values );
      }else if( values ){
        fill.apply( p, values );
      }
    }
    setTimeout( done, duration );
    this.then( done, done );
    return p;
  }

  P.delay = function( duration, value ){
    // Static version schedules the delayed resolution of a new parole
    var p = MakeParole();
    setTimeout( function(){ resolve( p, value ); }, duration );
    return p;
  };
  
  // ToDo: untested
  P.cast = cast;
  function cast( parole ){
    if( !isParole( parole ) ){ return when( parole ); }
    return parole;
  }

  function _on( target, listener ){
    var done = target._listener;
    if( ( target._listener = listener ) && target.values && !done ){
      _emit( target );
    }
    return target;
  }

  I.on = on;
  function on( listener ){
    var tail = _tail( this );
    _on( tail, listener );
    return _head( this );
  }
  
  I.boxon = on;

  function _emit( target ){
    var values = target.values;
    target.values = null;
    try{
      target._listener.apply( target, values );
    }catch( e ){
      console.log( "Parole listener error: " + e, e.stack );
    }
    return target;
  }

  I.will = will;
  function will( code ){
    if( !code )return _head( this );
    var tail = _tail( this );
    tail._step = code;
    var old_next = tail._next;
    var next = MakeStepParole( tail );
    // If there were some promises after the tail...
    if( old_next ){
      next._next = old_next;
      old_next._previous = next;
    }
    // Push the tail listener forward too
    if( tail._listener ){
      next._listener = tail._listener;
      tail._listener = null;
    }
    // Execute now?
    if( !tail._previous || tail.values ){
      var args;
      if( tail.values ){
        if( arguments.length > 1 ){
          args = slice1( arguments ).concat( array( tail.values ) );
        }else{
          args = tail.values;
        }
      }else{
        if( arguments.length > 1 ){ args = slice1( arguments ); }
      }
      fill.apply( tail, args );
    }
    return _head( this );
  }

  I.wills = wills;
  function wills( code ){
    if( !code )return _head( this );
    return this.will( function(){
      var last = arguments[ arguments.length - 1 ];
      var args = array_slice.call( arguments, 0, -1 );
      if( !last || !last.length ) return code.apply( this, args );
      return code.apply( this, args.concat( last ) );
    });
  }

  I.may = may;
  function may( code ){
    if( !code )return _head( this );
    return this.will( function( err ){
      if( err )return this( err );
      code.apply( this, slice1( arguments ) );
    });
  }

  I.mays = mays;
  function mays( code ){
    if( !code )return _head( this );
    return this.wills( function( err ){
      if( err )return this( err );
      code.apply( this, slice1( arguments ) );
    });
  }

  P.from = I.from = from;
  function from( step ){
    var head;
    // P.from() or p.from()
    if( !arguments.length ){
      // Static P.from()
      if( !isParole( this ) ){
        head = MakeParole();
        // Sentinel
        head._previous = P;
        return head;
      // p.from(), no arguments
      }else{
        head = _head( this );
      }
      // If applied on first step, set sentinel
      if( !head._previous ){ head._previous = P; }
      return head;
    }
    // p.from( pipe ) => pipe.pipe( ... )
    if( arguments.length === 1 && isPipe( step ) ){
      step.pipe( this );
      return this;
    }
    // p.from( ... ) feeds the chain
    head = _head( this );
    fill.apply( head, arguments );
    return head;
  }

  I.pipe = pipe;
  function pipe( dest ){
    var pusher;
    if( isParole( dest ) ){
      pusher = _queued( dest );
    }else if( isPipe( dest ) ){
      pusher = bind0( dest.push, dest );
    }else{
      pusher = dest;
    }
    var queue = _queued( this );
    if( pusher ){ _on( _tail( queue ), pusher ); }
    return dest || queue;
  }

  I.push = push;
  function push(){
    var queue = _queued( this );
    fill.apply( queue, arguments )
  }

  function _queued( target ){
    var chain = _head( target );
    var queue = chain._queue;
    if( queue )return queue;
    queue = from();
    queue._fifo = [];
    queue._chain = chain;
    chain._queue = _tail( chain )._queue = queue._queue = queue;
    _on( _tail( chain ), function(){
      // Consume next input, if any
      if( !this._queue._fifo.length )return;
      this._queue._fifo.shift();
      if( !this._queue._fifo.length ){ this._queue._fifo = []; }
      var next = this._queue._next;
      if( next ){ fill.apply( next, arguments ); }
      if( !this._queue._fifo.length  )return;
      var args = this._queue._fifo[ 0 ];
      // Push forward non void outputs
      if( args.length ){ jump.apply( this._queue._chain, args ); }
    })._queue = queue;
    queue.will( function(){
      // Enqueue new input
      this._queue._fifo.push( arguments );
      // Start queue consumer if necessary
      if( this._queue._fifo.length === 1 ){
        jump.apply( this._queue._chain, arguments );
      }
    })._next._queue = queue;
    return queue;
  }

  // Find the start of a chain
  function _head( target ){
    // No previous (or p.from() fake previous)
    if( !target._previous || target._previous === P )return target;
    // Cached?
    var start = target._start;
    if( start )return start;
    // Move backward
    start = target;
    var step = start;
    var found = step._step;
    while( step && (!found || step._step) ){
      start = step;
      if( !found && step._step ){ found = true; }
      step = step._previous;
    }
    return target._start = start;
  }

  I.entry = function(){ return _head( this ); };

  // Find the end of a chain
  function _tail( target ){
    if( !target._step )return target;
    if( !target._next )return target;
    // Manage cache
    var step = target._end;
    if( step )return target._end = _tail( step );
    step = target._next;
    while( step._step ){ step = step._next; }
    return target._end = step;
  }

  I.jump = jump;
  function jump( step ){
    var start;
    var args;
    if( typeof step === "function" && typeof step._step === "function" ){
      start = step;
      if( arguments.length > 1 ){
        args = slice1( arguments );
      }else{
        args = start.values;
      }
    }else{
      start = _head( this );
      if( arguments.length ){
        args = array( arguments );
      }else{
        args = null;
      }
    }
    schedule( fill, start, args );
    return this;
  }

  I.conclude = conclude;
  function conclude(){
    var tail = _tail( this );
    fill.apply( tail, arguments );
    return tail;
  }

  P.define = define;
  function define( f ){
    return function(){
      // Install steps, provide arguments
      var gen = MakeParole().from();
      f.apply( gen, arguments );
      // Install potential callback
      var o;
      if( arguments.length
      && typeof (o = arguments[ arguments.length - 1 ]) === "function"
      ){
        _tail( gen )._listener = o;
      }
      // Execute steps, provide arguments again
      fill.apply( gen, arguments );
      return gen;
    };
  }

  function _gen_next(){
    var gen = _head( this );
    var queue = gen._gen_queue_out;
    var next  = queue.shift();
    if( next ){
      next.apply( gen, arguments );
    }
    queue = gen._gen_queue_in;
    next = queue.shift();
    if( !next )return;
    fill.apply( gen._in, next );
  }

  P.generator = generator;
  function generator( f ){
    return function(){
      // Install steps
      var gen = MakeParole().from();
      if( !arguments.length ){
        f.call( gen );
      }else{
        f.apply( gen, arguments );
      }
      // Serialize production
      gen._gen_queue_in  = [];
      gen._gen_queue_out = [];
      _tail( gen )._listener = _gen_next;
      // Remember current step: start of chain
      gen._in = gen;
      return function(){
        // Install result observer
        var o;
        var args;
        if( arguments.length
        && typeof (o = arguments[ arguments.length - 1 ]) === "function"
        ){
          args = array_slice.call( arguments, 0, -1 );
        }else{
          o = null;
          args = arguments;
        }
        gen._gen_queue_out.push( o );
        // (re)start steps execution
        if( gen._gen_queue_out.length === 1 ){
          //gen._gen_queue_in.push( null );
          fill.apply( gen._in, args );
        }else{
          gen._gen_queue_in.push( args );
        }
      };
    };
  }

  I.yielder = I["yield"] = yielder;
  function yielder(){
    // Remember current step
    _head( this )._in = this;
    // Produce result
    var out = _tail( this );
    out.values = arguments;
    _emit( out );
    return this;
  }

  P.when = I.when = when;
  function when( stuff ){
    // On existing or new Parole, p.when() or P.when() case
    var p = this;
    if( !isParole( p ) ){ p = MakeParole(); }
    // .when( p1, p2, p3... ) case
    if( arguments.length > 1 ){
      p.each( arguments, function( r ){ return r.error ? r : r.value; } );
    // .when( other_promise ) case
    }else if( stuff && typeof stuff.then === "function" ){
      stuff.then(
        function(){ resolve.apply( p, arguments ); },
        function(){ reject.apply(  p, arguments ); }
      );
    // .when( boxon ) case
    }else if( stuff && typeof stuff.boxon === "function" ){
      stuff.boxon( p );
    // P.when( value ) case
    }else{
      p.fill( null, stuff );
    }
    return p;
  }

  // Promise/A's
  I.then = I.success = then;
  function then( ok, ko ){
    // Get the last node of the parole chain or a previous promise
    var tail = _tail( this );
    // Use ECMA compatible version if some was provided
    if( EcmaPromiseFactory ){
      if( tail._ecma_promise )return tail._ecma_promise.then( ok, ko );
      tail._ecma_promise = new EcmaPromiseFactory( function( ok, ko ){
        tail._ecma_resolve = ok;
        tail._ecma_reject  = ko;
      });
      // If promise is already fulfilled, signal callback
      if( tail.values ){ _progress( tail ); }
      return tail._ecma_promise;
    }
    // If that tail node is a promise, it has a next promise linked to it
    var next = tail._next;
    // If this is the first promise ever attached to the parole chain
    if( !next && !tail._fork ){
      // Let's avoid creating a new object, attach promise to the tail itself
      if( ok && typeof ok === "function" ){ tail._ok = ok; }
      if( ko && typeof ko === "function" ){ tail._ko = ko; }
      // Link to a fresh instance, it enables chaining
      next = new Instance();
      tail._next = next;
      next._previous = tail;
      // If promise is already fulfilled, signal callback
      if( tail.values ){ _progress( tail ); }
      return next;
    // If there is one or more promises already attached
    }else{
      // chain tail node is either already a promise or before an existing fork
      var branch = new Instance();
      // If parole/promise was fulfilled, fulfill the new one, done
      if( tail.values ){
        fill.apply( branch, tail.values );
        return branch.then( ok, ko );
      }
      // If there are multiple promises already, add the new one
      if( tail._fork ){
        tail._fork.push( branch );
      // If this is the second promise, create a list to hold them all
      }else{
        //  Move the first promise into a new instance
        var first = new Instance();
        if( tail._ok ){ first._ok = tail._ok; }
        if( tail._ko ){ first._ko = tail._ko; }
        if( next ){ // ToDo: can assert( next !== null )?
          first._next = next;
          next._previous = first;
          tail._next = null;
        }
        // Change the old slot into a fork
        tail._ok = tail._ko = null;
        tail._fork = [ first, branch ];
      }
      return branch.then( ok, ko );
    }
  }
  
  // ECMA 6's .catch()
  I.failure = I["catch"] = failure;
  function failure( fn ){
    return this.then( null, fn );
  }

  // ToDo: add this to Parole's API?
  I.final = final;
  function final( fn ){
    var p = MakeParole();
    function forward( p, ok ){
      // Either p.resolve(...) or p.reject(...)
      apply.call( ok ? resolve : reject, p, slice2( arguments ) );
    }
    function safe( p, ok, err ){
      var rslt;
      try{ rslt = fn(); }catch( e ){}
      // When callback returns a promise
      if( rslt && typeof rslt.then === "function" ){
        // When it is fulfilled, also fulfill the new parole
        var ff = bind( forward, this, p, ok );
        rslt.then( ff, ff );
      // Else, ignore result
      }else{
        forward.apply( this, arguments );
      }
      if( ok )return p;
      throw err;
    }
    // ToDo: return this? return p?
    return this.then( bind( safe, p, true ), bind( safe, p, false ) );
  }

  function _fork_step(){
    var fork = this._previous;
    var values = fork.values = arguments;
    var forks = fork._fork;
    // Forward values to each branch
    var ii = 0, branch;
    while( branch = forks[ ii++ ] ){
      fill.apply( branch, values );
    }
    _join( fork );
  }

  function _join( fork ){
    var next = fork._next;
    var forks = fork._fork;
    var list = [];
    var count = 0;
    var ii = 0;
    var len = forks.length;
    while( ii < len ){
      var branch = forks[ ii ];
      if( !branch._step ){
        // fork().on() style steps are skipped
        count++;
      }else{
        branch = _tail( branch );
        // Listen for outcome
        _on(
          branch,
          bind( function( ii, value ){
            if( arguments.length > 2 ){
              value = slice2( arguments );
            }
            // Preserve fork order in result array, keep first value only
            list[ ii ] = value;
            // When last outcome is available
            if( ++count === len ){
              // Provide all outcomes to next step
              // ToDo: remove fork().on() empty slots from list
              fill.call( next, parole.next = next._next, list );
            }
          }, branch, ii )
        );
      }
      ii++;
    }
  }

  I.fork = fork;
  function fork( code ){
    var branch = MakeParole();
    var tail = _tail( this );
    var forked;
    if( tail._previous && tail._previous._fork ){
      forked = tail._previous;
    }else if( !tail._next ){
      forked = tail;
      forked._fork = [];
      MakeStepParole( forked );
      forked._step = _fork_step;
    }else{
      // Move the "tail" promise into a new one
      forked = tail;
      var main = MakeParole();
      main.values    = forked.values;
      main._fork     = forked._fork;
      main._listener = forked._listener;
      main._ok       = forked._ok;
      main._ko       = forked._ko;
      main._next     = forked._next;
      main._previous = forked;
      forked._next   = main;
      forked.will( _fork_step );
      forked._fork = [ ];
    }
    forked._fork.push( branch );
    branch._previous = forked;
    if( forked.values ){ fill.apply( branch, forked.values ); }
    if( !code )return branch;
    will.apply( branch, arguments );
    return forked._next;
  }

  I.subscribe = subscribe;
  function subscribe( subscriber ){
    return _on( this.fork(), subscriber );
  }

  I.upgrade = upgrade;
  function upgrade( v, delay ){
    if( arguments.length > 1 ){
      var that = this;
      var args = arguments;
      setTimeout( function(){ resolve.apply( that, args ); }, delay );
    }
    return this.then( null, function(){ return v; } );
  }

  P.timeout = I.timeout = timeout;
  function timeout( delay, msg ){
    var p = this;
    if( !isParole( p ) ){ p = MakeParole(); }
    function timeout(){
      var err = new Error( msg );
      err.name = "ParoleTimeout";
      p.reject( err );
    }
    if( !msg ){ msg =  "Timed out after " + delay + " ms"; };
    var id = setTimeout( timeout, delay );
    function clr(){ clearTimeout( id ); }
    p.then( clr, clr );
    return p;
  }

  P.resolve = I.resolve = resolve;
  function resolve( v ){
    var p = this;
    if( !isParole( p ) ){ p = MakeParole(); }
    if( v && typeof v.then === "function" ){
      v.then(
        bind0( resolve, p ),
        bind0( reject,  p )
      );
      return p;
    }
    if( arguments.length <= 1 ){
      p.fill( null, v );
    }else{
      fill.apply(
        p,
        [ null ].concat( array( arguments ) )
      );
    }
    return p;
  }

  P.reject = I.reject = reject;
  function reject( r ){
    var p = this;
    if( !isParole( p ) ){ p = MakeParole(); }
    if( false && r && typeof r.then === "function" ){
      r.then(
        bind0( resolve, p ),
        bind0( reject, p )
      );
      return p;
    }
    if( arguments.length <= 1 ){
      p.fill( reason( r ) );
    }else{
      fill.apply( p, [ reason( r ) ].concat( slice1( arguments ) ) );
    }
    return p;
  }

  I.fill = fill;
  function fill( p ){
    if( this._listener ){
      this.values = arguments;
      _emit( this );
    }
    if( this._step ){
      // ToDo: wait for promises or not?
      if( false && p && typeof p.then === "function" &&  arguments.length === 1 ){
        p.then(
          bind0( resolve, this ),
          bind0( reject,  this )
        );
        return;
      }else{
        try{
          this._step.apply( parole.next = this._next, arguments );
        }catch( err ){
          this._next.reject( err );
        }
      }
      return this;
    }
    if( !this.values ){
      this.values = arguments;
      var fork = this._fork;
      if( fork ){
        var ii = 0, f; while( f = fork[ ii++ ] ){
          fill.apply( f, arguments );
        }
        this._fork = [];
        return;
      }
      _progress( this );
    }
    if( arguments.length ) return this;
    if( this.error ) throw this.value;
    return this.value;
  }

  P.reason = reason;
  function reason( e ){ return e || { paroleReason: e } }

  function _progress( target ){
    if( ( !target._next && !target._ok )
    || target._scheduled
    ) return;
    if( !(target.error = target.values[ 0 ] ) ){
      target.value = target.values.length > 2
      ? slice1( target.values )
      : target.values[ 1 ];
    }else{
      if( typeof target.error === "object" && "paroleReason" in target.error ){
        target.value = target.error.paroleReason;
      }else{
        target.value = target.error;
      }
    }
    target._scheduled = true;
    schedule( _resolver, target );
  }

  function _resolver(){
    if( this._ecma_promise ){
      (this.error ? this._ecma_promise_reject : this._ecma_promise_resolve)(
        this.value
      );
      return;
    }
    var next;
    var fn = this.error ? this._ko : this._ok;
    if( !fn ){
      if( next = this._next ){ fill.apply( next, this.values ); }
      return;
    }
    try{
      var rslt = fn.call( this, this.value );
      if( !( next = this._next ) ) return;
      if( !rslt || typeof rslt.then !== "function" ){
        next.fill( null, rslt );
        return;
      }
      rslt.then(
        function( ok ){ next.fill( null, ok ); },
        function( ko ){ next.reject( ko ); }
      );
    }catch( err ){
      next = this._next;
      if( next ){ next.reject( err ); }
    }
  }

  P.each = I.each = each;
  function each( handler, objects ){
    var p = this;
    if( !isParole( p ) ){ p = MakeParole(); }
    if( typeof handler !== "function" ){
      if( !objects ){
        objects = handler;
        handler = null;
      }else{
        var tmp = handler;
        handler = objects;
        objects = tmp;
      }
    }
    if( !objects || !objects.length ){
      if( handler === or || handler === and ){
        objects = [ MakeParole().fill( null, false ) ];
      }else if( !objects ){
        objects = [];
      }
    }
    if( !handler ){ handler = collect; }
    p.promises = array( objects );
    p.list    = [];
    p.array   = [];
    p.results = [];
    var done = false;
    function f( p, promise, ii, ok, value ){
      if( done )return;
      var chunk = {
        parole:   p,
        promises: p.promises,
        promise: this,
        index:   ii,
        rank:    p.list.length,
        error:   !ok,
        value:   value,
        list:    p.list,
        array:   p.array,
        values:  p.results
      };
      p.list.push( chunk );
      p.array[ ii ] = chunk;
      var rslt;
      try{
        rslt = handler.call( chunk, chunk );
        if( typeof rslt !== "undefined" ){
          if( rslt === chunk ){
            done = true;
            if( rslt.error ){
              p.reject( rslt.value );
            }else{
              p.fill( null, rslt.value );
            }
            return;
          }
          if( rslt === p.list
          ||  rslt === p.array
          ||  rslt === p.results
          ){
            done = true;
            p.fill( null, rslt );
            return;
          }
          p.results.push( rslt );
        }
        if( p.list.length === p.promises.length ){
          done = true;
          p.fill( null, p.results );
          return;
        }
      }catch( err ){
        done = true;
        p.reject( err );
      }
    }
    var a_p;
    var ii = 0, len = p.promises.length; while( ii < len ){
      a_p = p.promises[ ii ];
      if( a_p && typeof a_p.then === "function" ){
        a_p.then(
          bind( f, null, p, a_p, ii, true  ),
          bind( f, null, p, a_p, ii, false )
        );
      }else{
        f( p, null, ii, true, a_p );
      }
      ii++;
    }
    return p;
  }

  P.select = I.select = select;
  function select(){
    if( !this || !this.promises ){
      return (this || P).each( select, arguments );
    }
    return this;
  }

  P.collect = I.collect = collect;
  function collect(){
    if( !this || !this.promises ){
      return (this || P).each( collect, arguments );
    }
    if( this.error )return this;
    this.values.push( this.value );
  }

  P.join = I.join = join;
  function join(){
    if( !this || !this.promises ){
      return (this || P).each( join, arguments );
    }
    return this.promise;
  }

  P.and = I.and = and;
  function and(){
    if( !this || !this.promises ){
      return (this || P).each( and, arguments );
    }
    if( this.error  ) return this;
    if( !this.value ) return this;
    if( this.list.length === this.promises.length )return this;
  }

  P.or = I.or = or; 
  function or(){
    if( !this || !this.promises ){
      return (this || P).each( or, arguments );
    }
    if( this.error  ) return this;
    if( this.value )return this;
    if( this.list.length === this.promises.length )return this;
  }

  P.not = I.not = not;
  function not(){
    if( !this || !this.promises ){
      return (this || P).each( not, arguments );
    }
    if( this.error  ) return this;
    if( this.value ){
      this.value = false;
      return this;
    }
    if( this.list.length === this.promises.length ){
      this.value = true;
      return this;
    }
  }

  P.nand = I.nand = nand;
  function nand(){
    if( !this || !this.promises ){
      return (this || P).each( nand, arguments );
    }
    if( this.error  ) return this;
    if( !this.value ){
      this.value = true;
      return this;
    }
    if( this.list.length === this.promises.length ){
      this.value = false;
      return this;
    }
  }

  P.all = all;
  function all( array ){
    return this.each( collect, array );
  }
  
  P.race = race;
  function race( array ){
    return this.each( select, array );
  }

  // Attach static methods to the exported parole() function
  if( has_proto ){
    (function(){
      P.__proto__ = Function.prototype;
      parole.__proto__ = P;
    })(); // V8 style (avoid using __proto__ to avoid de-optimizations)
  }else{
    // Copy when browser does not support __proto__ (IE doesn't support it)
    for( var fn in P ){
      if( P.hasOwnProperty( fn ) ){
        parole[ fn ] = P[ fn ];
      }
    }
  }
  // With Internet Explorer instance methods are mixed in rather than inherited
  parole.proto = I; // export prototypal Parole instance, see lib/parole.js
  if( has_proto ){
    // This is fast, it inserts the methods in the prototype chain
    // _set_proto( x ) then does x.__proto__ = I in MakeParole()
    (function(){ I.__proto__ = Function.prototype; } )(); // v8 style optimize
  }else{
    // Compile a _set_proto() to mixin methods, fastest solution so far
    var src = "{\n"
    src += "var i = Parole.proto;\n"
    for( var fn in I ){
      if( typeof I[ fn ] === "function" ){
        src += "obj." + fn + " = i." + fn + ";\n";
      }
    }
    src += "\n}";
    console.log( "_set_proto compiled to: " + src );
    _set_proto = Function( "obj", src )
  }
  /* Could use __noSuchMethod__ on firefox, but it's 5 times slower
     Chances are that Harmony's proxies will be slow too...
  function _set_proto_methods( obj ){
    obj.__noSuchMethod__
    = function( id ){ return this[ id ].apply( this, slice1( arguments ) ) };
  }
  try{
    ({ __noSuchMethod__: noop }).test();
    _set_proto = set_proto_methods;
  }catch( e ){}
  */

  // Install default scheduler
  scheduler();

  // Export global Parole, platform dependent
  if( typeof module !== "undefined" && "exports" in module ){
    module.exports = parole;
  }
  if( typeof global !== "undefined" ){
    global.Parole = parole;
  }
  if( typeof window !== "undefined" ){
    window.Parole = parole;
  }

})();

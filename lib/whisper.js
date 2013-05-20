// whisper.js
//   Paroles are promises with steps, in callback disguise.
//   jQuery and Q compatible.
// (C) april 2013, Jean Hugues Robert -- github.com/JeanHuguesRobert
// MIT License

"use strict";

var Parole = (function(){

   // The Parole prototype object
   var P = {};

  // Without __proto__ the API is either slower
  // ToDo: or changes Function's proto?
  var has_proto = false; // !!{}.__proto__;

  // One of setTimeout, process.nextTick or setImmediate, typically
  var tick = null;

  // Avoid using it too much thanks to some buffering
  var scheduler_queue  = [];

  // Q's
  var onerror = null;

  // Optimization tricks
  function noop(){}
  var u     = noop();
  var call  = Function.call;
  var apply = Function.apply;
  var bind  = Function.bind;
  var array_slice = [].slice;
  function array(  a    ){ return array_slice.call( a );    }
  function slice(  a, n ){ return array_slice.call( a, n ); }
  function slice1( a    ){ return array_slice.call( a, 1 ); }
  function slice2( a    ){ return array_slice.call( a, 2 ); }

  P.toString = function(){
    if( this._Q )return "[object Parole]";
    return this().toString();
  };

  function isParole( x ){
    return typeof x === "function"
    && typeof x.parole === "function"
    && x !== parole;
  }

  // l8 pipe protocol, a work in progress (may 2013)
  // ToDo: add flow control

  function isPipe( x ){
    if( !x )return false;
    var pin  = typeof x.push === "function";
    if( !pin )return false;
    var pout = typeof x.pipe === "function";
    if( !pout )return false;
    return true;
  }

  // l8 generator protocol, a work in progress (may 2013)
  function isGenerator( x ){
    if( !x )return false;
    if( typeof x.next !== "function" )return false;
    if( typeof x.send !== "function" )return false;
    return true;
  }

  // When browser does not support __proto__
  var _set_proto = function _set_proto( obj ){
    if( has_proto ){
      obj.__proto__ = P;
      return;
    }
    // Copy inherited methods, slow
    for( var property in P ){
      if( !proto.hasOwnProperty( property ) )continue;
      obj[ property ] = P[ property ];
    }
  }

  P.parole = parole; function parole( stuff ){
    //function f(){ _fulfill.apply( this.cb, arguments ); }
    //var obj = { cb: null };
    //var callback = f.bind( obj );
    //obj.cb = callback;
    // var callback = new Parole();
    var p;
    p = function(){ return fill.apply( p, arguments ) };
    if( !has_proto ){
      _set_proto( p );
    }else{
      p.__proto__ = P;
    }
    if( isParole( this ) ){
      var tail = this._tail();
      tail._next = p;
      p._previous = tail;
    }
    return !arguments.length ? p : p.when( stuff );
  }

  P.method = method; function method( method, target, args ){
    var p = isParole( this ) ? this : parole();
    try{ method.apply( target, (args && array( args ).push( p )) || [ p ] ); }
    catch( err ){ p.reject( err ); }
    return p;
  }

  // Also Q's
  P.delay = delay; function delay( duration, value ){
    var p = parole();
    if( !isParole( this ) ){
      setTimeout( function(){ resolve( p, value ); }, duration );
      return p;
    }
    var error;
    var values;
    var delayed;
    function done(){
      if( isParole( this ) ){
        error = this.error;
        values = this.values;
        if( !delayed )return;
      }else{
        delayed = true;
      }
      if( error ){
        reject.apply( p, values );
      }else if( values ){
        resolve.apply( p, values );
      }
    }
    setTimeout( done, duration );
    this.then( done, done );
    return p;
  }

  // Q's
  P.fbind = fbind; function fbind(){
    function scheduler( p ){
      if( !isParole( p ) ){ p = parole(); }
      function delayed_f( f ){
        try{ this.resolve( f() ); }
        catch( err ){ this.reject( err ); }
      }
      schedule( bind.apply( delayed_f, [ p ].concat( array( arguments ) ) ) );
      return p;
    }
    return bind.apply( scheduler, [ u, this ].concat( array( arguments ) )
    );
  }

  // Q's
  P.fapply = fapply; function fapply(){
    var args = arguments;
    return this.then( function( f ){ return f.apply( u, args ); } );
  }

  // Q's
  P.fcall = fcall; function fcall(){ return this.fapply( arguments ); }

  P.curry = curry; function curry(){
    var fn = this;
    var args = arguments;
    var new_f = function(){
      if( arguments.length ){
        fill.apply( fn, array( args ).concat( array( arguments ) ) );
      }else{
        fill.apply( fn, args );
      }
    };
    // new_f.__proto__ = P;
    return new_f;
  }

  P.Q = Q; function Q( stuff ){
    if( stuff && typeof stuff.then === "function" ){
      if( stuff._Q )return stuff;
    }
    var p = parole( stuff );
    p._Q = true;
    return p;
  }

  // Q's and When's
  P.defer = defer; function defer(){
    var p = parole.apply( this, arguments );
    p._Q = true;
    // ToDo: ?faster bind on demand using __defineGetter__()
    p.resolve          = function( v ){ p.fill( void 0, v ); };
    p.reject           = function( r ){ p.fill(  v ); };
    p.notify           = function(){ fill.apply( p, arguments ); };
    p.makeNodeResolver = function(){ makeNodeResolver.apply( p, arguments );};
    return p.promise = p;
  }

  // Q's
  P.fin = fin; function fin( fn ){
    var p = parole();
    function forward( p, ok ){
      apply.call( ok ? resolve : reject, p, slice2( arguments ) );
    }
    function safe( p, ok, err ){
      var rslt;
      try{ rslt = fn(); }catch( e ){}
      if( rslt && typeof rslt.then === "function" ){
        var ff = forward.bind( this, p, ok );
        rslt.then( ff, ff );
      }else{
        forward.apply( this, arguments );
      }
      if( ok )return p;
      throw err;
    }
    return this.then( safe.bind( p, true ), safe.bind( p, false ) );
  }

  // jQuery's
  P.Deferred = Deferred; function Deferred(){
    var p = parole();
    p._jQuery = true;
    return p;
  }

  P.legacy = legacy; function legacy( promise ){
    if( !promise ){ promise = this; }
    if( !isParole( promise ) ){ return parole( promise ); }
    if( !promise._jQuery && !promise._Q )return promise;
    var p = promise.then();
    if( promise._jQuery  ){
      p._jQuery = false;
    }else if( promise._Q ){
      p._Q = false;
    }
    return p;
  }

  // Q's
  P.promise = promise; function promise( target ){
    var promise = parole();
    //for( var method in [ "then", "done", "fail", "always", "progress" ] ){
    //  target[ method ] = P[ method ].bind( promise );
    //}
    // That's Q main difference I think, the methods are bound (hence... slow)
    target.resolve  = resolve.bind(  promise );
    target.reject   = reject.bind(   promise );
    target.then     = then.bind(     promise );
    target.done     = done.bind(     promise );
    target.fail     = fail.bind(     promise );
    target.always   = always.bind(   promise );
    target.progress = progress.bind( promise );
    return promise;
  }

  // jQuery's
  P.state = state; function state(){
    return this._tail().values
    ? (this.values[ 0 ] ? "rejected" : "resolved" )
    : "pending";
  }

  P._attach = _attach; function _attach( args, method, fn ){
    var cb;
    var ii = 0, len = args.length; while( ii < len ){
      cb = args[ ii++ ];
      if( cb.length ){
        P[ method ].apply( this, cb );
      }else{
        this.fork().on( fn.bind( this, cb ) );
      }
    }
  }

  // jQuery's and Q's
  P.done = done; function done( ok, ko, prgrss ){
    function t( err ){
      if( onerror ){
        onerror( err );
      }else{
        tick( function(){ throw err; } );
      }
    }
    function safe( ok ){
      var rslt;
      try{ rslt = ok && ok.apply( this, arguments ); }
      catch( err ){ t( err ); }
      if( rslt && typeof rslt.then === "function" ){
        var p = parole();
        return p.then( null, function( err ){ t( err ); } );
      }
      return rslt;
    }
    if( !this._jQuery ){
      return this.then( safe.bind( this, ok ), safe.bind( this, ko ), prgrss );
    }
    return this._attach( arguments, "done", function( cb, err ){
      if( err )return;
      cb.apply( this, slice2( arguments ) );
    } );
  }

  // jQuery's and Q's
  P.fail = fail; function fail( fn ){
    if( !this._jQuery )return this.then( null, fn );
    return this._attach( arguments, "fail", function( cb, err ){
      if( !err )return;
      cb.apply( this, slice1( arguments ) );
    } );
  }

  // jQuery's
  P.always = always; function always( fn ){
    if( !this._jQuery )return this.then( fn, fn );
    return this._attach( arguments, "always", function( cb, err ){
      cb.apply( this, slice( arguments, err ? 1 : 2 ) );
    } );Rent
  }

  // jQuery's and Q's
  P.progress = progress; function progress( fn ){
    if( !this._jQuery )return this.then( null, null, fn );
    return this._attach( arguments, "progress", function( cb ){
      cb.apply( this, slice1( arguments ) );
    } );
  }

  P.on = on; function on( listener ){
    var done = this._listener;
    if( ( this._listener = listener ) && this.values && !done ){
      this._emit();
    }
    return this;
  }

  P.schedule = schedule; function schedule( f, t, a ){
    if( !tick && !scheduler_queue.length )return f.apply( t, a );
    scheduler_queue.push( arguments );
    if( scheduler_queue.length > 1 )return;
    tick( function(){
      var f;
      var ii = 0; while( true ){
        try{
          while( ii < scheduler_queue.length ){
            f = scheduler_queue[ ii++ ]
            f[ 0 ].apply( f[ 1 ], f[ 2 ] );
          }
        }catch( e ){
          //console.log( "Parole, schedule error: " + e, e.stack );
        }
        if( ii === scheduler_queue.length ){
          scheduler_queue = [];
          return;
        }
      }
    });
  }

  P._emit = _emit; function _emit(){
    var values = this.values;
    this.values = null;
    try{
      this._listener.apply( this, values );
    }catch( e ){
      console.log( "Parole listener error: " + e, e.stack );
    }
    return this;
  }

  P.will = will; function will( code ){
    if( !code )return this;
    this._step = code;
    var next = this.parole();
    if( !this._previous || this.values ){
      var args;
      if( this.values ){
        if( arguments.length > 1 ){
          args = slice1( arguments ).concat( array( this.values ) );
        }else{
          args = this.values;
        }
      }else{
        if( arguments.length > 1 ){ args = slice1( arguments ); }
      }
      fill.apply( this, args );
    }
    return next;
  }

  P.wills = wills; function wills( code ){
    return this.will( function(){
      var last = arguments[ arguments.length - 1 ];
      var args = array_slice.call( arguments, 0, -1 );
      if( !last || !last.length ) return code.apply( this, args );
      return code.apply( this, args.concat( last ) );
    });
  }

  P.from = from; function from( step ){
    if( !arguments.length ){
      if( !isParole( this ) ){
        var p = parole();
        p._previous = P;
        return p;
      }
      if( !this._previous ){ this._previous = P; }
      return this;
    }
    if( arguments.length === 1 && isPipe( step ) ){
      step.pipe( this );
      return this;
    }
    var start= this._head();
    fill.apply( start, arguments );
    return this;
  }

  P.to = to; function to( dest ){
    if( dest ){
      if( isPipe( dest ) ){
        dest = dest.push.bind( dest );
      }else if( isParole( dest ) ){
        dest = dest._queued();
      }
    }
    var queue = this._queued();
    queue.on( dest );
    return dest || queue;
  }

  P.push = push; function push(){
    if( !arguments.length )return;
    var queue = this._queued();
    fill.apply( queue, arguments )
  }

  P._queued = _queued; function _queued(){
    var chain = this._head();
    var queue = chain._queue;
    if( queue )return queue;
    queue = from();
    queue._fifo = [];
    queue._chain = chain;
    chain._queue = chain._tail()._queue = queue._queue = queue;
    chain._tail().on( function(){
      if( !this._queue._fifo.length )return;
      this._queue._fifo.shift();
      if( !this._queue._fifo.length ){ this._queue._fifo = []; }
      var next = this._queue._next;
      if( next ){ fill.apply( next, arguments ); }
      if( !this._queue._fifo.length  )return;
      jump.apply( this._queue._chain, this._queue._fifo[ 0 ] );
    })._queue = queue;
    queue.will( function(){
      this._queue._fifo.push( arguments );
      if( this._queue._fifo.length === 1 ){
        jump.apply( this._queue._chain, arguments );
      }
    })._queue = queue;
    return queue;
  }

  P._head = _head; function _head(){
    if( !this._previous || this._previous === P )return this;
    var start = this._start;
    if( start )return start;
    start = this;
    var step = start;
    var found = step._step;
    while( step && (!found || step._step) ){
      start = step;
      if( !found && step._step ){ found = true; }
      step = step._previous;
    }
    return this._start = start;
  }

  P._tail = _tail; function _tail(){
    if( !this._step )return this;
    if( !this._next )return this;
    var step = this._end;
    if( step )return this._end = step._tail();
    // ToDo: follow .on() forks's next
    step = this._next;
    while( step._step ){ step = step._next; }
    return this._end = step;
  }

  P.jump = jump; function jump( step ){
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
      start = this._head();
      if( arguments.length ){
        args = array( arguments );
      }else{
        args = null;
      }
    }
    schedule( fill, start, args );
    return this;
  }

  P.conclude = conclude; function conclude(){
    fill.apply( this._tail(), arguments );
    return this;
  }

  P.define = define; function define( f ){
    return function(){
      // Install steps
      var gen = parole().from();
      f.apply( gen );
      // Look for observer
      var o;
      if( !arguments.length
      || typeof (o = arguments[ arguments.length - 1 ]) !== "function"
      ){
        gen._tail().listener = null;
        // Execute steps
        fill.apply( gen, arguments );
        return;
      }
      // Install result observer
      gen._tail()._listener = o;
      // Execute steps
      fill.apply( gen, array_slice.call( arguments, 0, -1 ) );
    };
  }

  P._gen_next = _gen_next; function _gen_next(){
    var gen = this._head()
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

  P.generator = generator; function generator( f ){
    return function(){
      // Install steps
      var gen = parole().from();
      if( !arguments.length ){
        f.call( gen );
      }else{
        f.apply( gen, arguments );
      }
      // Serialize production
      gen._gen_queue_in  = [];
      gen._gen_queue_out = [];
      gen._tail()._listener = _gen_next;
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

  P.yielder = yielder; function yielder(){
    // Remember current step
    this._head()._in = this;
    // Produce result
    var out = this._tail();
    out.values = arguments;
    out._emit();
  }

  P.when = when; function when( stuff ){
    // On existing or new Parole, p.when() or P.when() case
    var p = this;
    if( !isParole( p ) ){ p = parole(); }
    // .when( p1, p2, p3... ) case
    if( arguments.length > 1 ){
      p.each( arguments, function( r ){ return r.error ? r : r.value; } );
    // .when( other_promise ) case
    }else if( stuff && typeof stuff.then === "function" ){
      stuff.then(
        function(){ resolve.apply( p, arguments ); },
        function(){ reject.apply(  p, arguments ); }
      );
    // P.when( value ) case
    }else{
      p.fill( null, stuff );
    }
    return p;
  }

  // Promise/A's
  P.then = then; function then( ok, ko, progress ){
    var tail = this._tail();
    var next = tail._next;
    if( next || tail._fork ){
      var branch = parole();
      if( this._jQuery ){ branch._jQuery = true; }
      if( tail.values ){
        fill.apply( branch, tail.values );
        return branch.then( ok, ko );
      }
      if( tail._fork ){
        tail._fork.push( branch );
      }else{
        // Move the "tail" promise into a new one
        var main = parole();
        main._ok = tail._ok;
        main._ko = tail._ko;
        if( this._jQuery ){ main._jQuery = true; }
        if( next ){
          main._next = next;
          next._previous = main;
          tail._next = null;
        }
        tail._fork = [ main, branch ];
      }
      return branch.then( ok, ko, progress );
    }
    if( ok && typeof ok === "function" ){ tail._ok = ok; }
    if( ko && typeof ko === "function" ){ tail._ko = ko; }
    if( progress && typeof progress === "function" ){
      tail._listener = progress;
    }
    next = tail.parole();
    if( this._jQuery ){ next._jQuery = true; }
    tail._progress();
    return next;
  }

  P._fork_step = _fork_step; function _fork_step(){
    var values = this._previous.values = arguments;
    var forks = this._previous._fork;
    var ii = 0, len = forks.length; while( ii < len ){
      fill.apply( forks[ ii++ ], values );
    }
  }

  P.fork = fork; function fork( code ){
    var branch = parole();
    var tail = this._tail();
    var forked;
    if( tail._previous && tail._previous._fork ){
      forked = tail._previous;
    }else if( !tail._next ){
      forked = tail;
      forked._fork = [];
      forked.parole();
      forked._step = _fork_step;
    }else{
      // Move the "tail" promise into a new one
      forked = tail;
      var main = parole();
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

  P._join = _join; function _join(){
    var fork = this;
    if( !(fork._fork && fork._step) ){
      if( !fork._previous || fork._previous === P ){ fork = this._tail(); }
      while( !(fork._fork && fork._step) ){
        fork = fork._previous;
        if( !fork )return this( [] );
      }
    }
    var p = parole();
    p._previous = fork;
    var forks = fork._fork;
    var list = [];
    var count = 0;
    var ii = 0, len = forks.length; while( ii < len ){
      forks[ ii ]._tail().on(
        function( list, ii, fork, err ){
          list.push( forks[ ii ] );
          if( ++count === len ){
            this.fill( null, list );
          }
        }.bind( p, list, ii, fork )
      );
      ii++;
    }
    return p;
  }

  P.join = join; function join(){
    if( !this
    || (!this.promises && (!this._previous || this._previous === P ))
    ){
      return (this || P).each( join, arguments );
    }
    if( this.promises )return this.promise;
    return arguments.length
    ? will.apply( this, [ _join ].concat( array( arguments ) ) )
    : this.will( _join );
  }

  P.subscribe = subscribe; function subscribe( subscriber ){
    return this.fork().on( subscriber );
  }

  P.upgrade = upgrade; function upgrade( v, delay ){
    if( arguments.length > 1 ){
      var that = this;
      var args = arguments;
      setTimeout( function(){ resolve.apply( that, args ); }, delay );
    }
    return this.then( null, function(){ return v; } );
  }

  // Also Q's
  P.timeout = timeout; function timeout( delay, msg ){
    var p = this;
    if( !isParole( p ) ){ p = parole(); }
    function timeout(){
      var err = new Error( msg );
      err.name = "ParoleTimeout";
      p.reject( err );
    }
    if( !msg ){ msg =  "Timed out after " + delay + " ms"; };
    var id = setTimeout( timeout, delay );
    p.then().on( function(){ clearTimeout( id ); } );
    return p;
  }

  P.resolve = resolve; function resolve( v ){
    var p = this;
    if( !isParole( p ) ){ p = parole(); }
    if( v && typeof v.then === "function" ){
      v.then(
        resolve.bind( p ),
        reject.bind(  p )
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

  P.reject = reject; function reject( r ){
    var p = this;
    if( !isParole( p ) ){ p = parole(); }
    if( false && r && typeof r.then === "function" ){
      r.then(
        reject.bind( p ),
        reject.bind( p )
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

  P.fill = fill; function fill( p ){
    if( this._listener ){
      this.values = arguments;
      this._emit();
      // ToDo: emit on chained listeners as per Q requirement
      if( this._Q ){

      }
    }
    if( this._step ){
      if( p && typeof p.then === "function" &&  arguments.length === 1 ){
        p.then(
          resolve.bind( this ),
          reject.bind(  this )
        );
      }else{
        //this.values = arguments;
        try{
          this._step.apply( this._next, arguments );
        }catch( err ){
          var next = this._next;
          if( next ){ next.reject( err ); }
        }
        //this.values = null;
      }
      return this;
    }
    var fork;
    if( !this.values ){
      fork = this._fork;
      this.values = arguments;
      if( fork ){
        var ii = 0; while( ii < fork.length ){
          fill.apply( fork[ ii++ ], arguments );
        }
        this._fork = [];
        return;
      }
      this._progress();
    }
    if( arguments.length ) return this;
    if( this.error ) throw this.value;
    return this.value;
  }

  P.reason = reason; function reason( e ){ return e || { paroleError: e } }

  P.scheduler = scheduler; function scheduler( t ){
    if( t === "sync" ){
      tick = null;
      return;
    }
    tick = t
    || ( typeof setImmediate !== "undefined" && setImmediate )
    || ( typeof process      !== "undefined" && process.nextTick )
    || setTimeout;
    return this;
  }

  P._progress = _progress; function _progress(){
    if( ( !this._next && !this._ok )
    || this._scheduled
    || !this.values
    ) return;
    if( !(this.error = this.values[ 0 ] ) ){
      this.value = this.values.length > 2
      ? slice1( this.values )
      : this.values[ 1 ];
    }else{
      if( typeof this.error === "object" && "paroleError" in this.error ){
        this.value = this.error.paroleError;
      }else{
        this.value = this.error;
      }
    }
    this._scheduled = true;
    // ToDo: optimize out this bind()
    schedule( _resolver, this );
  }

  P._resolver = _resolver; function _resolver(){
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

  P.each = each; function each( handler, objects ){
    var p = this;
    if( !isParole( p ) ){ p = parole(); }
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
        objects = [ parole().fill( null, false ) ];
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
          f.bind( null, p, a_p, ii, true ),
          f.bind( null, p, a_p, ii, false )
        );
      }else{
        f( p, null, ii, true, a_p );
      }
      ii++;
    }
    return p;
  }

  P.select = select; function select(){
    if( !this || !this.promises ){
      return (this || P).each( select, arguments );
    }
    return this;
  }

  P.collect = collect; function collect(){
    if( !this || !this.promises ){
      return (this || P).each( collect, arguments );
    }
    if( this.error )return this;
    this.values.push( this.value );
  }

  P.and = and; function and(){
    if( !this || !this.promises ){
      return (this || P).each( and, arguments );
    }
    if( this.error  ) return this;
    if( !this.value ) return this;
    if( this.list.length === this.promises.length )return this;
  }

  P.or = or; function or(){
    if( !this || !this.promises ){
      return (this || P).each( or, arguments );
    }
    if( this.error  ) return this;
    if( this.value )return this;
    if( this.list.length === this.promises.length )return this;
  }

  P.not = not; function not(){
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

  P.nand = nand; function nand(){
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

  // Q's
  P.all = all; function all( array ){
    return this.each( collect, array );
  }

  // Q's
  P.allResolved = allResolved; function allResolved( array ){
    var error;
    var value;
    return this.each( array, function(){
      if( this.error && !error ){
        error = this.error;
        value = this.value;
      }
      this.values.push( this.value );
      if( this.list.length === this.promises.length ){
        if( error ){
          this.error = error;
          this.value = value;
          return this;
        }
        return this.values;
      }
    });
  }

  // Q's
  P.spread = spread; function spread( ok, ko, progress ){
    return this.then(
      function(){ return ok.apply( ok, arguments ); },
      ko,
      progress
    );
  }

  // Q's
  P.thenResolve = thenResolve; function thenResolve( value ){
    return this.then( function(){ return value; } );
  }

  // Q's
  P.thenReject = thenReject; function thenReject( reason ){
    return this.then( function(){ throw reason; } );
  }

  // Q's
  P.makeNodeResolver = makeNodeResolver; function makeNodeResolver(){
    return this;
  }

  // Q's
  P.get = get; function get( m ){
    return this.then( function( o ){ return o[ m ]; } );
  }

  // Q's
  P.set = set; function set( m, v ){
    return this.then( function( o ){ o[ m ] = v; } );
  }

  // Q's
  P.del = del; function del( m ){
    return this.then( function( o ){ delete o[ m ]; } );
  }

  // Q's
  P.post = post; function post( m, args ){
    return this.then( function( o ){ return o[ m ].apply( o, args); } );
  }

  // Q's
  P.invoke = invoke; function invoke( m ){
    var args = arguments;
    return this.then( function( o ){ return o[ m ].apply( o, args); } );
  }

  // Q's
  P.keys = keys; function keys(){
    return this.then( function( o ){ return Object.keys( o ); } );
  }

  // Q's
  P.isFulfilled = isFulfilled; function isFulfilled( p ){
    if( !p ){ p = this; }
    if( isParole( p ) )return !!( p.values && !p.values[ 0 ] );
    return true;
  }

  // Q's
  P.isRejected = isRejected; function isRejected( p ){
    if( !p ){ p = this; }
    if( isParole( p ) )return !!( p.values && p.values[ 0 ] );
    return false;
  }

  // Q's
  P.isPending = isPending; function isPending( p ){
    if( !p ){ p = this; }
    if( isParole( p ) )return !!p.values;
    return false;
  }

  // Q's
  P.valueOf = valueOf; function valueOf( p ){
    if( !this.values ){
      // ToDo: figure out what promise this promise is waiting for
      return this;
    }
    if( this.error || this.values[ 0 ] ){
      this.exception = this.error || this.values[ 0 ];
      return this;
    }
    return this.value || this.values[ 1 ];
  }

  // Q's
  P.nfbind = nfbind; function nfbind( f ){
    return
    npost.bind( null, f, null, slice1( arguments ) );
  }

  // Q's
  P.nbind = nbind; function nbind( f, obj ){
    return
    npost.bind( null, obj, f, slice2( arguments ) );
  }

  P.npost = npost; function npost( target, f, args ){
    var p = parole();
    args = array( args ).push( p );
    try{ f.apply( target, args ); }
    catch( err ){ p.reject( err ); }
    return p;
  }

  P.ninvoke = ninvoke; function ninvoke( f, target ){
    return npost( f, target, slice2( arguments ) );
  }

  // Q's
  P.nfapply = nfapply; function nfapply( f, args ){
    return npost( null, f, args );
  };

  // Q's
  P.nfcall = nfcall; function nfcall( f ){
    return npost( null, f, slice1( arguments ) );
  };


  if( has_proto ){
    P.__proto__ = Function.prototype;
  }
  P.Parole = P;
  P.emit = fill;
  P.notify = fill;
  P.publish = fill;
  P.pipe = to;
  P.pand = and; // Please coffeescript?
  P.por  = or;
  P.pnot = not;
  P.nor  = not;
  P.pnor = not;
  P.pnand = nand;
  P["try"] = fcall;
  P["catch"] = fail;
  P["finally"] = P["final"] = fin;
  P["delete"] = del;
  P["yield"] = yielder;
  P.Q.isPromise = isParole;
  P.nextTick = schedule;
  P.nodeify = on;
  P.denodeify = nfbind;
  // Compile slightly more efficient _set_proto
  if( !has_proto ){
    if( typeof global !== "undefined" ){
      global.Parole = P;
    }else if( typeof window !== "undefined" ){
      window.Parole = P;
    }
    var src = "{\nvar p = Parole;"
    for( var fn in P ){
      if( P.hasOwnProperty( fn ) ){
        src += "obj." + fn + " = p." + fn + ";\n";
      }
    }
    src += "\n}";
    // console.log( src );
    _set_proto = _set_proto = Function( "obj", src);
  }
  _set_proto( parole );
  _set_proto( Q );
  var q_methods = [
        "isFulfilled", "isRejected", "isPending",
        "dispatch",
        "when", "spread",
        "get", "set", "del", "delete",
        "post", "send", "invoke",
        "keys",
        "fapply", "fcall", "fbind",
        "all", "allResolved",
        "timeout", "delay",
        "catch", "finally", "fail", "fin", "progress", "done",
        "nfcall", "nfapply", "nfbind", "denodeify", "nbind",
        "npost", "nsend", "ninvoke",
        "nodeify"
  ];
  for( var ii = 0 ; ii < q_methods.length ; ii++ ){
    P.Q[ q_methods[ ii ] ] = (function( f ){ return function(){
      var v = parole( v );
      return f.apply( v, arguments );
    };})( P[ q_methods[ ii ] ] );
  }
  P.scheduler();
  return P.parole;

})();

if( typeof module !== "undefined" && "exports" in module ){
  module.exports = Parole;
}



// whisper.js
//   Paroles are promises with steps, in callback disguise.
//   jQuery and Q compatible.
// (C) april 2013, Jean Hugues Robert -- github.com/JeanHuguesRobert
// MIT License

"use strict";

var Parole = (function(){

  // The Parole object methods
  var P = {};

  // Instance methods
  function Instance(){}
  var I = {};
  Instance.prototype = I;
  P.I = I;

  // Q compatible instance methods
  function InstanceQ(){}
  var IQ = { _Q: true };
  InstanceQ.prototype = IQ;
  P.IQ = IQ;

  // jQuery compatible instance methods
  var IJ = {};
  P.IJ = IJ;

  // Without __proto__ the API runs slower, but it works.
  var has_proto = !!{}.__proto__;

  // Without __defineGetter__(), the Q API runs slower
  var has_define_getter = !!{}.__defineGetter__;

  // Lazy evaluate resolvers for Q promises if possible
  if( has_define_getter ){
    IQ.__defineGetter__( "resolve", function(){
      var p = this;
      return this._resolve
      || ( this._resolve = function( v ){ fill.apply( p, [ void 0, v ] ); } );
    });
    IQ.__defineGetter__( "reject", function(){
      var p = this;
      return p._reject
      || ( this._reject = function( r ){ fill.call(  p, r ); } );
    });
    IQ.__defineGetter__( "notify", function(){
      var p = this;
      return p._notify
      || ( this._notify = function(){ emit.apply( p, arguments ); } );
    });
    IQ.__defineGetter__( "makeNodeResolver", function(){
      var p = this;
      return p._makeNodeResolver
      || ( this._makeNodeResolve = function(){ fill.apply( p, arguments ); } );
    });
  }

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

  var _set_proto = function( obj ){ obj.__proto__ = I; }

  P.toString = IQ.toString = function(){
    if( this._Q )return "[object Parole]";
    return this().toString();
  };

  function isParole( x ){
    return x
    && typeof x.upgrade === "function"
    && x !== parole;
  }

  // l8 pipe protocol, a work in progress (may 2013)
  // ToDo: maybe add flow control (back pressure?)
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

  P.parole = parole; function parole(){
    return !arguments.length ? _Parole() : when.apply( null, arguments );
  }

  function _Parole(){
    var p = function(){ return fill.apply( p, arguments ) };
    _set_proto( p );
    return p;
  }

  function _parole( tail ){
    var p;
    if( tail instanceof InstanceQ ){
      p = new InstanceQ();
    }else{
      p = function(){ return fill.apply( p, arguments ) };
      _set_proto( p );
    }
    tail._next = p;
    p._previous = tail;
    return p;
  }

  P.method = I.method = method; function method( method, target, args ){
    var p = isParole( this ) ? this : _Parole();
    try{ method.apply( target, (args && array( args ).push( p )) || [ p ] ); }
    catch( err ){ p.reject( err ); }
    return p;
  }

  P.delay = I.delay = IQ.delay = delay; function delay( duration, value ){
    var p = _Parole();
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
  IQ.pfbind = fbind; function fbind(){
    function scheduler( p ){
      if( !isParole( p ) ){ p = _Parole(); }
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
  IQ.fapply = fapply; function fapply(){
    var args = arguments;
    return this.then( function( f ){ return f.apply( u, args ); } );
  }

  // Q's
  IQ.fcall = fcall; function fcall(){ return this.fapply( arguments ); }

  I.partial = partial; function partial(){
    var fn = this;
    var args = arguments;
    var new_f = function(){
      if( arguments.length ){
        fill.apply( fn, array( args ).concat( array( arguments ) ) );
      }else{
        fill.apply( fn, args );
      }
    };
    // Result is a Promise/A, not a full-blown Parole, that costs much less
    new_f.then = then;
    new_f.upgrade = upgrade;
    return new_f;
  }

  P.Q = Q; function Q( stuff ){
    if( stuff && typeof stuff.then === "function" ){
      if( !(stuff instanceof InstanceQ) )return stuff;
    }
    var p = defer.apply( null, arguments );
    return p;
  }

  // Q's and When's
  P.defer = defer; function defer(){
    // Q compatible instances don't need to be functions
    var p = new InstanceQ();
    if( arguments.length ){
      p = when.apply( p, arguments );
    }
    p.promise = p;
    // ToDo: ?faster bind on demand using __defineGetter__()
    if( has_define_getter )return p;
    p.resolve          = function( v ){ fill.apply( p, [ void 0, v ] ); };
    p.reject           = function( r ){ fill.call(  p, r ); };
    p.notify           = function(){ _emit.apply( p, arguments ); };
    p.makeNodeResolver = function(){ makeNodeResolver.apply( p, arguments );};
    return p;
  }

  // Q's
  IQ.fin = fin; function fin( fn ){
    var p = _Parole();
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
    var p = _Parole();
    p._jQuery = true;
    return p;
  }

  P.legacy = legacy; function legacy( promise ){
    if( !promise ){ promise = this; }
    if( !isParole( promise ) ){ return when( promise ); }
    if( !promise._jQuery && !promise._Q )return promise;
    var p = _promise( promise );
    if( promise._jQuery  ){
      p._jQuery = false;
    }else if( promise._Q ){
      p._Q = false;
    }
    return p;
  }

  // Q's
  P.promise = promise; function promise( target ){
    var promise = _Parole();
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
  IJ.state = state; function state(){
    return _tail( this ).values
    ? (this.values[ 0 ] ? "rejected" : "resolved" )
    : "pending";
  }

  IJ._attach = _attach; function _attach( args, method, fn ){
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
  IQ.done = IJ.done = done; function done( ok, ko, prgrss ){
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
        var p = _Parole();
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
  IJ.fail = IQ.fail = fail; function fail( fn ){
    if( !this._jQuery )return this.then( null, fn );
    return this._attach( arguments, "fail", function( cb, err ){
      if( !err )return;
      cb.apply( this, slice1( arguments ) );
    } );
  }

  // jQuery's
  IJ.always = always; function always( fn ){
    if( !this._jQuery )return this.then( fn, fn );
    return this._attach( arguments, "always", function( cb, err ){
      cb.apply( this, slice( arguments, err ? 1 : 2 ) );
    } );Rent
  }

  // jQuery's and Q's
  IJ.progress = IQ.progress = progress; function progress( fn ){
    if( !this._jQuery )return this.then( null, null, fn );
    return this._attach( arguments, "progress", function( cb ){
      cb.apply( this, slice1( arguments ) );
    } );
  }

  I.on = on; function on( listener ){
    var done = this._listener;
    if( ( this._listener = listener ) && this.values && !done ){
      _emit( this );
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
          while( f = scheduler_queue[ ii++ ] ){
            f[ 0 ].apply( f[ 1 ], f[ 2 ] );
          }
        }catch( e ){
          //console.log( "Parole, schedule error: " + e, e.stack );
        }
        if( !f ){
          scheduler_queue = [];
          return;
        }
      }
    });
  }

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

  I.will = will; function will( code ){
    if( !code )return this;
    var tail = _tail( this );
    tail._step = code;
    var old_next = tail._next;
    var next = _parole( tail );
    if( old_next ){
      next._next = old_next;
      old_next._previous = next;
    }else if( tail._listener ){
      next._listener = tail._listener;
      tail._listener = null;
    }
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
    return next;
  }

  I.wills = wills; function wills( code ){
    return this.will( function(){
      var last = arguments[ arguments.length - 1 ];
      var args = array_slice.call( arguments, 0, -1 );
      if( !last || !last.length ) return code.apply( this, args );
      return code.apply( this, args.concat( last ) );
    });
  }

  P.from = I.from = from; function from( step ){
    if( !arguments.length ){
      if( !isParole( this ) ){
        var p = _Parole();
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
    var start= _head( this );
    fill.apply( start, arguments );
    return this;
  }

  I.pipe = pipe; function pipe( dest ){
    var pusher = dest;
    if( dest ){
      if( isParole( dest ) ){
        pusher = _queued( dest );
      }else if( isPipe( dest ) ){
        pusher = dest.push.bind( dest );
      }
    }
    var queue = _queued( this );
    _tail( queue ).on( pusher );
    return dest || queue;
  }

  I.push = push; function push(){
    if( !arguments.length )return;
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
    _tail( chain ).on( function(){
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

  function _head( target ){
    if( !target._previous || target._previous === P )return target;
    var start = target._start;
    if( start )return start;
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

  function _tail( target ){
    if( !target._step )return target;
    if( !target._next )return target;
    // Manage cache
    var step = target._end;
    if( step )return target._end =_tail( step );
    step = target._next;
    while( step._step ){ step = step._next; }
    return target._end = step;
  }

  I.jump = jump; function jump( step ){
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

  I.conclude = conclude; function conclude(){
    fill.apply( _tail( this ), arguments );
    return this;
  }

  P.define = define; function define( f ){
    return function(){
      // Install steps, provide arguments
      var gen = _Parole().from();
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

  P.generator = generator; function generator( f ){
    return function(){
      // Install steps
      var gen = _Parole().from();
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

  I.yielder = yielder; function yielder(){
    // Remember current step
    _head( this )._in = this;
    // Produce result
    var out = _tail( this );
    out.values = arguments;
    _emit( out );
  }

  P.when = I.when = when; function when( stuff ){
    // On existing or new Parole, p.when() or P.when() case
    var p = this;
    if( !isParole( p ) ){ p = _Parole(); }
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
  I.then = then; function then( ok, ko, progress ){
    var tail = _tail( this );
    var next = tail._next;
    if( next || tail._fork ){
      var branch = new Instance();
      if( this._jQuery ){ branch._jQuery = true; }
      if( tail.values ){
        fill.apply( branch, tail.values );
        return branch.then( ok, ko );
      }
      if( tail._fork ){
        tail._fork.push( branch );
      }else{
        // Move the "tail" promise into a new one
        var main = new Instance();
        if( tail._listener ){ main._listener = tail._listener; }
        if( tail._ok ){ main._ok = tail._ok; }
        if( tail._ko ){ main._ko = tail._ko; }
        if( this._jQuery ){ main._jQuery = true; }
        if( next ){
          main._next = next;
          next._previous = main;
          tail._next = null;
        }
        tail._listener = tail._ok = tail._ko = null;
        tail._fork = [ main, branch ];
      }
      return branch.then( ok, ko, progress );
    }
    if( ok && typeof ok === "function" ){ tail._ok = ok; }
    if( ko && typeof ko === "function" ){ tail._ko = ko; }
    if( progress && typeof progress === "function" ){
      tail._listener = progress;
    }
    next = new Instance();
    tail._next = next;
    next._previous = tail;
    if( this._jQuery ){ next._jQuery = true; }
    _progress( tail );
    return next;
  }

  function _fork_step(){
    var values = this._previous.values = arguments;
    var forks = this._previous._fork;
    var ii = 0, fork; while( fork = forks[ ii++ ] ){
      fill.apply( fork, values );
    }
  }

  I.fork = fork; function fork( code ){
    var branch = _Parole();
    var tail = _tail( this );
    var forked;
    if( tail._previous && tail._previous._fork ){
      forked = tail._previous;
    }else if( !tail._next ){
      forked = tail;
      forked._fork = [];
      _parole( forked );
      forked._step = _fork_step;
    }else{
      // Move the "tail" promise into a new one
      forked = tail;
      var main = _Parole();
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

  function _join(){
    var fork = this;
    if( !(fork._fork && fork._step) ){
      if( !fork._previous || fork._previous === P ){ fork = _tail( this ); }
      while( !(fork._fork && fork._step) ){
        fork = fork._previous;
        if( !fork )return this( [] );
      }
    }
    var p = _Parole();
    p._previous = fork;
    var forks = fork._fork;
    var list = [];
    var count = 0;
    var ii = 0, len = forks.length; while( ii < len ){
      _tail( forks[ ii ] ).on(
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

  I.join = join; function join(){
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

  I.subscribe = subscribe; function subscribe( subscriber ){
    return this.fork().on( subscriber );
  }

  I.upgrade = upgrade; function upgrade( v, delay ){
    if( arguments.length > 1 ){
      var that = this;
      var args = arguments;
      setTimeout( function(){ resolve.apply( that, args ); }, delay );
    }
    return this.then( null, function(){ return v; } );
  }

  // Also Q's
  P.timeout = I.timeout = IQ.timeout = timeout; function timeout( delay, msg ){
    var p = this;
    if( !isParole( p ) ){ p = _Parole(); }
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

  P.resolve = I.resolve = resolve; function resolve( v ){
    var p = this;
    if( !isParole( p ) ){ p = _Parole(); }
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

  P.reject = I.reject = reject; function reject( r ){
    var p = this;
    if( !isParole( p ) ){ p = _Parole(); }
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

  I.fill = fill; function fill( p ){
    if( this._listener ){
      this.values = arguments;
      _emit( this );
      // ToDo: emit on chained listeners as per Q requirement
      //if( this._Q ){}
    }
    if( this._step ){
      // ToDo: wait for promises or not?
      if( false && p && typeof p.then === "function" &&  arguments.length === 1 ){
        p.then(
          resolve.bind( this ),
          reject.bind(  this )
        );
        return;
      }else{
        try{
          this._step.apply( this._next, arguments );
        }catch( err ){
          this._next.reject( err );
        }
      }
      return this;
    }
    if( !this.values ){
      var fork = this._fork;
      this.values = arguments;
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

  function _progress( target ){
    if( ( !target._next && !target._ok )
    || target._scheduled
    || !target.values
    ) return;
    if( !(target.error = target.values[ 0 ] ) ){
      target.value = target.values.length > 2
      ? slice1( target.values )
      : target.values[ 1 ];
    }else{
      if( typeof target.error === "object" && "paroleError" in target.error ){
        target.value = target.error.paroleError;
      }else{
        target.value = target.error;
      }
    }
    target._scheduled = true;
    schedule( _resolver, target );
  }

  function _resolver(){
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

  P.each = I.each = each; function each( handler, objects ){
    var p = this;
    if( !isParole( p ) ){ p = _Parole(); }
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
        objects = [ _Parole().fill( null, false ) ];
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

  P.select = I.select = select; function select(){
    if( !this || !this.promises ){
      return (this || P).each( select, arguments );
    }
    return this;
  }

  P.collect = I.collect = collect; function collect(){
    if( !this || !this.promises ){
      return (this || P).each( collect, arguments );
    }
    if( this.error )return this;
    this.values.push( this.value );
  }

  P.and = I.and = and; function and(){
    if( !this || !this.promises ){
      return (this || P).each( and, arguments );
    }
    if( this.error  ) return this;
    if( !this.value ) return this;
    if( this.list.length === this.promises.length )return this;
  }

  P.or = I.or = or; function or(){
    if( !this || !this.promises ){
      return (this || P).each( or, arguments );
    }
    if( this.error  ) return this;
    if( this.value )return this;
    if( this.list.length === this.promises.length )return this;
  }

  P.not = I.not = not; function not(){
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

  P.nand = I.nand = nand; function nand(){
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
  IQ.spread = spread; function spread( ok, ko, progress ){
    return this.then(
      function(){ return ok.apply( ok, arguments ); },
      ko,
      progress
    );
  }

  // Q's
  IQ.thenResolve = thenResolve; function thenResolve( value ){
    return this.then( function(){ return value; } );
  }

  // Q's
  IQ.thenReject = thenReject; function thenReject( reason ){
    return this.then( function(){ throw reason; } );
  }

  // Q's
  function makeNodeResolver(){
    var that = this;
    return function(){ fill.apply( that, arguments ); }
  }

  // Q's
  IQ.get = get; function get( m ){
    return this.then( function( o ){ return o[ m ]; } );
  }

  // Q's
  IQ.set = set; function set( m, v ){
    return this.then( function( o ){ o[ m ] = v; } );
  }

  // Q's
  IQ.del = del; function del( m ){
    return this.then( function( o ){ delete o[ m ]; } );
  }

  // Q's
  IQ.post = post; function post( m, args ){
    return this.then( function( o ){ return o[ m ].apply( o, args); } );
  }

  // Q's
  IQ.invoke = invoke; function invoke( m ){
    var args = arguments;
    return this.then( function( o ){ return o[ m ].apply( o, args); } );
  }

  // Q's
  IQ.keys = keys; function keys(){
    return this.then( function( o ){ return Object.keys( o ); } );
  }

  // Q's
  IQ.isFulfilled = isFulfilled; function isFulfilled( p ){
    if( !p ){ p = this; }
    if( isParole( p ) )return !!( p.values && !p.values[ 0 ] );
    return true;
  }

  // Q's
  IQ.isRejected = isRejected; function isRejected( p ){
    if( !p ){ p = this; }
    if( isParole( p ) )return !!( p.values && p.values[ 0 ] );
    return false;
  }

  // Q's
  IQ.isPending = isPending; function isPending( p ){
    if( !p ){ p = this; }
    if( isParole( p ) )return !!p.values;
    return false;
  }

  // Q's
  IQ.valueOf = valueOf; function valueOf( p ){
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
  IQ.nfbind = nfbind; function nfbind( f ){
    return
    npost.bind( null, f, null, slice1( arguments ) );
  }

  // Q's
  IQ.nbind = nbind; function nbind( f, obj ){
    return
    npost.bind( null, obj, f, slice2( arguments ) );
  }

  IQ.npost = npost; function npost( target, f, args ){
    var p = _Parole();
    args = array( args ).push( p );
    try{ f.apply( target, args ); }
    catch( err ){ p.reject( err ); }
    return p;
  }

  IQ.ninvoke = ninvoke; function ninvoke( f, target ){
    return npost( f, target, slice2( arguments ) );
  }

  // Q's
  IQ.nfapply = nfapply; function nfapply( f, args ){
    return npost( null, f, args );
  };

  // Q's
  IQ.nfcall = nfcall; function nfcall( f ){
    return npost( null, f, slice1( arguments ) );
  };


  P.Parole = P;
  IQ.emit = fill;
  IJ.notify = fill;
  // l8's jargon uses "success", "failure" and "final"
  I.success  = then;
  I.failure  = fail;
  I.final    = fin;
  I["yield"] = yielder;
  // When's "ensure" and Q's try/catch/finally are cool too
  IQ["try"]     = fcall;
  IQ["catch"]   = fail;
  IQ["finally"] = IQ.ensure = fin;
  IQ["delete"]  = del;
  P.Q.isPromise = isParole;
  P.nextTick = schedule;
  IQ.nodeify = on;
  IQ.denodeify = nfbind;

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
  var ii = 0, mm; while( mm = q_methods[ ii++ ] ){
    P.Q[ mm ] = (function( f ){ return function(){
      var v = _Parole();
      return f.apply( v, arguments );
    };})( IQ[ mm ] || I[ mm ] || P[ mm ] );
  }
  for( fn in I ){ try{ IQ[ fn ] = I[ fn ]; }catch( e ){}; }

  if( has_proto ){
    I.__proto__ = Function.prototype;
    P.__proto__ = Function.prototype;
    parole.__proto__ = P;
    Q.__proto__ = P;
  }else{
    // When browser does not support __proto__ (IE doesn't support it)
    _set_proto = function( obj ){
      for( fn in P ){
        if( P.hasOwnProperty( fn ) ){ obj[ fn ] = P[ fn ]; }
      }
    }
    _set_proto( parole );
    _set_proto( Q );
    // Compile a _set_proto() to mixin methods
    if( typeof global !== "undefined" ){
      global.Parole = P;
    }else if( typeof window !== "undefined" ){
      window.Parole = P;
    }
    var src = "{\n"
    src += "var i = Parole.I;\n"
    for( var fn in P.I ){
      src += "obj." + fn + " = i." + fn + ";\n";
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

  P.scheduler();
  return parole;

})();

if( typeof module !== "undefined" && "exports" in module ){
  module.exports = Parole;
}



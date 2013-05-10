// whisper.js
//   Paroles are promises with steps, in callback disguise.
// (C) april 2013, Jean Hugues Robert -- github.com/JeanHuguesRobert
// MIT License

"use strict";

// ToDo: avoid global var, thanks to using a closure
var ProtoParole = {

  isParole: function( x ){
    return typeof x === "function"
    && x.__proto__ === ProtoParole
    && x !== ProtoParole.parole;
  },

  isPipe: function( x ){
    return x && typeof x.pipe === "function" && (x.in || x.out);
  },

  parole: function( stuff ){
    //function f(){ ProtoParole._fulfill.apply( this.cb, arguments ); }
    //var obj = { cb: null };
    //var callback = f.bind( obj );
    //obj.cb = callback;
    var callback = function(){
      return ProtoParole._fulfill.apply( callback, arguments )
    };
    if( ProtoParole.isParole( this ) ){
      var tail = this._tail();
      //console.assert( !tail.next )
      tail.next = callback;
      callback.previous = tail;
    }
    callback.__proto__ = ProtoParole;
    if( !arguments.length ) return callback;
    return arguments.length > 1
    || typeof stuff !== "function"
    || typeof stuff.then !== "function"
    ? ProtoParole.will.apply( callback, arguments )
    : callback.when( stuff );
  },

  curry: function(){
    var fn = this;
    var args = arguments;
    var new_f = function(){
      if( arguments.length ){
        fn.apply(
          fn,
          Array.prototype.slice.call( args )
          .concat( Array.prototype.slice.call( arguments ) )
        );
      }else{
        fn.apply( fn, args );
      }
    };
    new_f.__proto__ = fn;
    return new_f;
  },

  defer: function(){
    var p = ProtoParole.parole.apply( this, arguments );
    return p.promise = p;
  },

  Deferred: function(){
    return ProtoParole.parole();
  },

  promise: function( target ){
    if( !target )return this;
    var promise = ProtoParole.parole();
    for( var method in [ "then", "done", "fail", "always" ] ){
      target[ method ] = ProtoParole[ method ].bind( promise );
    }
    return promise;
  },

  state: function(){
    return this.values
    ? (this.values[ 0 ] ? "rejected" : "resolved" )
    : "pending";
  },

  _attach: function( args, method, fn ){
    var cb;
    for( var ii = 0 ; ii < arguments.length ; ii++ ){
      cb = arguments[ ii ];
      if( cb.length ){
        ProtoParole[ method ].apply( this, cb );
      }else{
        this.fork().on( fn.bind( this, cb ) );
      }
    }
  },

  done: function(){
    return _attach( arguments, "done", function( cb, err ){
      if( err )return;
      cb.apply( this, Array.prototype.slice.call( arguments, 2 ) );
    } );
  },

  fail: function(){
    return _attach( arguments, "fail", function( cb, err ){
      if( !err )return;
      cb.apply( this, Array.prototype.slice.call( arguments, 1 ) );
    } );
  },


  always: function(){
    return _attach( arguments, "always", function( cb, err ){
      cb.apply( this, Array.prototype.slice.call( arguments, err ? 1 : 2 ) );
    } );
  },

  progress: function(){
    return _attach( arguments, "progress", function( cb ){
      cb.apply( this, arguments );
    } );
  },

  on: function( listener ){
    if( ( this._listener = listener ) && this.values ){ this._emit(); }
    return this;
  },

  _squeue: [],

  schedule: function( f ){
    var tick = ProtoParole.tick;
    if( !tick )return f();
    var queue = ProtoParole._squeue;
    queue.push( f );
    if( queue.length === 1 ){
      tick( function(){
        var queue = ProtoParole._squeue;
        var ii = 0;
        while( true ){
          try{
            queue[ ii++ ]();
          }finally{
            if( ii === queue.length ){
              ProtoParole._squeue = [];
              return;
            }
          }
        }
      });
    }
  },

  _emit: function(){
    var values = this.values;
    this.values = null;
    return this._listener.apply( this, values );
  },

  will: function( code ){
    if( !code )return this;
    this.step = code;
    var next = this.parole();
    //console.assert( this.next );
    if( !this.previous || this.values ){
      var args;
      if( this.values ){
        if( arguments.length > 1 ){
          args = Array.prototype.slice.call( arguments, 1 )
          .concat( Array.prototype.slice.call( this.values ) );
        }else{
          args = this.values;
        }
      }else{
        if( arguments.length > 1 ){
          args = Array.prototype.slice.call( arguments, 1 );
        }
      }
      ProtoParole._fulfill.apply( this, args );
    }
    return next;
  },

  wills: function( code ){
    return this.will( function(){
      var last = arguments[ arguments.length - 1 ];
      var args = Array.prototype.slice.call( arguments, 0, -1 );
      if( !last || !last.length ) return code.apply( this, args );
      return code.apply( this, args.concat( last ) );
    });
  },

  from: function( step ){
    if( !arguments.length ){
      if( !ProtoParole.isParole( this ) ){
        var parole = ProtoParole.parole();
        parole.previous = ProtoParole;
        return parole;
      }
      if( !this.previous ){ this.previous = ProtoParole; }
      return this;
    }
    if( arguments.length === 1 && ProtoParole.isPipe( step ) ){
      return step.to( this );
    }
    var start= this._head();
    ProtoParole._fulfill.apply( start, arguments );
    return this;
  },

  to: function( dest ){
    if( dest ){
      if( ProtoParole.isPipe( dest ) ){
        dest = step.in;
      }else if( ProtoParole.isParole( dest ) ){
        dest = step._queued();
      }
    }
    var queue = this._queued();
    queue.on( dest );
    return dest || queue;
  },

  _queued: function(){
    var chain = this._head();
    var queue = chain._queue;
    if( queue )return queue;
    queue = ProtoParole.from();
    queue.in = queue.out = queue;
    queue._fifo = [];
    queue._chain = chain;
    chain._queue = chain._tail()._queue = queue._queue = queue;
    chain._tail().on( function(){
      if( !this._queue._fifo.length )return;
      this._queue._fifo.shift();
      if( !this._queue._fifo.length ){ this._queue._fifo = []; }
      var next = this._queue.next;
      if( next ){ ProtoParole._fulfill.apply( next, arguments ); }
      if( !this._queue._fifo.length  )return;
      ProtoParole.jump.apply( this._queue._chain, this._queue._fifo[ 0 ] );
    })._queue = queue;
    queue.will( function(){
      this._queue._fifo.push( arguments );
      if( this._queue._fifo.length === 1 ){
        ProtoParole.jump.apply( this._queue._chain, arguments );
      }
    })._queue = queue;
    return queue;
  },

  _head: function(){
    if( !this.previous || this.previous === ProtoParole )return this;
    var start = this._start;
    if( start )return start;
    start = this;
    var step = start;
    var found = step.step;
    while( step && (!found || step.step) ){
      start = step;
      if( !found && step.step ){ found = true; }
      step = step.previous;
    }
    return this._start = start;
  },

  _tail: function(){
    if( !this.next )return this;
    if( !this.step )return this;
    var step = this._end;
    if( step )return this._end = step._tail();
    // ToDo: follow .on() forks's next
    step = this;
    while( true ){
      //console.assert( step.next );
      step = step.next;
      if( !step.step )break;
    }
    return this._end = step;
  },

  jump: function( step ){
    var start;
    var args;
    if( typeof step === "function" && typeof step.step === "function" ){
      start = step;
      if( arguments.length > 1 ){
        args = Array.prototype.slice.call( arguments, 1 );
      }else{
        args = start.values;
      }
    }else{
      start = this._head();
      if( arguments.length ){
        args = arguments;
      }else{
        args = start.values;
      }
    }
    ProtoParole.schedule(
      ProtoParole._fulfill.apply.bind( ProtoParole._fulfill, start, args )
    );
    return this;
  },

  conclude: function(){
    ProtoParole._fulfill.apply( this._tail(), arguments );
    return this;
  },

  when: function( stuff ){
    var parole = this;
    if( !ProtoParole.isParole( parole ) ){
      parole = ProtoParole.parole();
    }
    if( stuff && typeof stuff.then === "function" ){
      stuff.then(
        function( ok ){ parole._fulfill( null, ok ) },
        function( ko ){ parole.reject( ko );        }
      );
    }else if( arguments.length > 1 ){
      parole.each( arguments, function( r ){ return r.error ? r : r.value; } );
    }else{
      parole._fulfill( null, stuff );
    }
    return parole;
  },

  then: function( ok, ko, progress ){
    var tail = this._tail();
    var next = tail.next;
    if( next || tail._fork ){
      var branch = ProtoParole.parole();
      if( tail.values ){
        ProtoParole._fulfill.apply( branch, tail.values );
        return branch.then( ok, ko );
      }
      if( tail._fork ){
        tail._fork.push( branch );
      }else{
        // Move the "tail" promise into a new one
        var main = ProtoParole.parole();
        main._ok = tail._ok;
        main._ko = tail._ko;
        if( next ){
          main.next = next;
          next.previous = main;
          tail.next = null;
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
    tail._progress();
    return next;
  },

  _fork_step: function(){
    var fork = this.previous;
    console.assert( fork._fork );
    var values = this.values;
    if( values )return;
    var forks = this._fork;
    var len   = forks.length;
    for( var ii = 0 ; ii < len ; ii++ ){
      ProtoParole._fulfill.apply( forks[ ii ], values );
    }
  },

  fork: function( code ){
    var branch = ProtoParole.parole();
    var tail = this._tail();
    var fork;
    if( tail.previous && tail.previous._fork ){
      fork = tail.previous;
    }else if( !tail.next ){
      fork = tail;
      fork._fork = [];
      fork.parole();
      fork._step = ProtoParole._fork_step;
    }else{
      // Move the "tail" promise into a new one
      fork = tail;
      var main = ProtoParole.parole();
      main.values    = fork.values;
      main._fork     = fork._fork;
      main._listener = fork._listener;
      main._ok       = fork._ok;
      main._ko       = fork._ko;
      main.next      = fork.next;
      main.previous  = fork;
      fork.next      = main;
      fork.will( ProtoParole._fork_step );
      fork._fork = [ ];
    }
    fork._fork.push( branch );
    branch.previous = fork;
    if( fork.values ){ ProtoParole._fulfill.apply( branch, fork.values ); }
    if( !code )return branch;
    ProtoParole.will.apply( branch, arguments );
    return fork.next;
  },

  _join: function(){
    var fork = this._tail();
    while( true ){
      if( fork._fork && fork._step )break;
      fork = fork.previous;
      if( !fork )return this( [] );
    }
    var parole = ProtoParole.parole();
    parole.previous = fork;
    var forks = fork._fork;
    var len = forks.length;
    var list = [];
    var count = 0;
    for( var ii = 0 ; ii < len ; ii++ ){
      forks[ ii ]._tail().on(
        function( list, ii, fork, err ){
          list.push( forks[ ii ] );
          if( ++count === len ){
            this._fulfill( null, list );
          }
        }.bind( parole, list, ii, fork )
      );
    }
    return parole;
  },

  join: function(){
    if( !this || ( !this.promises && !this.previous ) ){
      return (this || ProtoParole).each( ProtoParole.join, arguments );
    }
    if( this.promises )return this.promise;
    return arguments.length
    ? ProtoParole.will.apply(
      this,
      [ ProtoParole._join ].concat( Array.prototype.slice.call( arguments ) )
    )
    : this.will( ProtoParole._join );
  },

  subscribe: function( subscriber ){
    return this.fork().on( subscriber );
  },

  upgrade: function( v, delay ){
    if( arguments.length > 1 ){
      setTimeout( function(){ this.resolve( v ); }.bind( this ), delay );
    }
    return this.then( null, function(){ return v; } );
  },

  timeout: function( promise, delay ){
    var parole = this;
    if( !ProtoParole.isParole( parole ) ){
      parole = ProtoParole.parole();
    }
    var timeout = function(){
      var err = new Error( "Parole timeout" );
      err.name = "ParoleTimeout";
      this.reject( err );
    }.bind( parole );
    if( arguments.length === 1 ){
      setTimeout( timeout, promise );
    }else{
      if( !promise
      ||  typeof promise.then !== "function"
      ){
        parole.resolve( promise );
        return parole;
      }
      var timeout_id = setTimeout( timeout, delay );
      promise.then(
        function( ok ){
          clearTimeout( timeout_id );
          this.resolve( ok );
        }.bind( parole ),
        function( ko ){
          clearTimeout( timeout_id );
          this.reject( ko );
        }.bind( parole )
      );
    }
    return parole;
  },

  resolve: function( v ){
    if( arguments.length <= 1 ){
      this._fulfill( null, v );
    }else{
      ProtoParole._fulfill.apply(
        this,
        [ null ].concat( Array.prototype.slice.call( arguments ) )
      );
    }
    return this;
  },

  reject: function( r ){
    if( arguments.length <= 1 ){
      this._fulfill( ProtoParole.reason( r ) );
    }else{
      ProtoParole._fulfill.apply(
        this,
        [ ProtoParole.reason( r ) ]
        .concat( Array.prototype.slice.call( arguments, 1 ) )
      );
    }
    return this;
  },

  _fulfill: function( p ){
    if( this._listener ){
      var save = !this.step && arguments;
      this.values = arguments;
      this._emit();
      this.values = save;
    }
    if( this.step ){
      if( p && typeof p.then === "function" &&  arguments.length === 1 ){
        p.then(
          function( ok ){ this.resolve( ok ); }.bind( this ),
          function( ko ){ this.reject(  ko ); }.bind( this )
        );
      }else{
        this.values = arguments;
        try{
          this.step.apply( this.next, arguments );
        }catch( err ){
          var next = this.next;
          if( next ){ next.reject( err ); }
        }
      }
      return this;
    }
    if( !this.values ){
      this.values = arguments;
      var fork = this._fork;
      if( fork ){
        for( var ii = 0 ; ii < fork.length ; ii++ ){
          ProtoParole._fulfill.apply( fork[ ii ], arguments );
        }
        this._fork = [];
        return;
      }
      this._progress();
    }
    if( arguments.length ) return this;
    if( this.error ) throw this.value;
    return this.value;
  },

  reason: function( e ){ return e || { paroleError: e } },

  scheduler: function( scheduler ){
    ProtoParole.tick = scheduler
    || ( typeof setImmediate !== "undefined" && setImmediate )
    || ( typeof process      !== "undefined" && process.nextTick )
    || setTimeout;
    return this;
  },

  _progress: function(){
    if( ( !this.next && !this._ok )
    || this._scheduled
    || !this.values
    ) return;
    if( !(this.error = this.values[ 0 ] ) ){
      this.value = this.values.length > 2
      ? Array.prototype.slice( this.values, 1 )
      : this.values[ 1 ];
    }else{
      if( typeof this.error === "object" && "paroleError" in this.error ){
        this.value = this.error.paroleError;
      }else{
        this.value = this.error;
      }
    }
    this._scheduled = true;
    ProtoParole.schedule( ProtoParole._resolve.bind( this ) );
  },

  _resolve: function(){
    var next;
    var fn = this.error ? this._ko : this._ok;
    if( !fn ){
      if( next = this.next ){
        ProtoParole._fulfill.apply( next, this.values );
      }
      return;
    }
    try{
      var rslt = fn.call( this, this.value );
      if( !( next = this.next ) ) return;
      if( !rslt || typeof rslt.then !== "function" ){
        next._fulfill( null, rslt );
        return;
      }
      rslt.then(
        function( ok ){ next._fulfill( null, ok ); },
        function( ko ){ next.reject( ko ); }
      );
    }catch( err ){
      next = this.next;
      if( next ){ next.reject( err ); }
    }
  },

  each: function( handler, paroles ){
    var parole = this;
    if( !ProtoParole.isParole( parole ) ){ parole = ProtoParole.parole(); }
    if( typeof handler !== "function" ){
      if( !paroles ){
        paroles = handler;
        handler = null;
      }else{
        var tmp = handler;
        handler = paroles;
        paroles = tmp;
      }
    }
    if( !paroles || !paroles.length ){
      if( handler === ProtoParole.or || handler === ProtoParole.and ){
        paroles = [ ProtoParole.parole()._fulfill( null, false ) ];
      }else if( !paroles ){
        paroles = [];
      }
    }
    if( !handler ){ handler = ProtoParole.collect; }
    parole.promises = Array.prototype.slice.call( paroles );
    parole.list    = [];
    parole.array   = [];
    parole.results = [];
    var len = paroles.length;
    var p;
    var done = false;
    function f( parole, promise, ii, ok, value ){
      if( done )return;
      var chunk = {
        parole:  parole,
        promises: parole.promises,
        promise: this,
        index:   ii,
        rank:    parole.list.length,
        error:   !ok,
        value:   value,
        list:    parole.list,
        array:   parole.array,
        values:  parole.results
      };
      parole.list.push( chunk );
      parole.array[ ii ] = chunk;
      var rslt;
      try{
        rslt = handler.call( chunk, chunk );
        if( typeof rslt !== "undefined" ){
          if( rslt === chunk ){
            done = true;
            parole._fulfill(
              ProtoParole.reason( rslt.error && rslt.value ),
              rslt.value
            );
            return
          }
          if( rslt === parole.list
          || rslt === parole.arrays
          || rslt === parole.results
          ){
            done = true;
            parole._fulfill( null, rslt );
            return;
          }
          parole.results.push( rslt );
        }
        if( parole.list.length === parole.promises.length ){
          done = true;
          parole._fulfill( null, parole.results );
          return;
        }
      }catch( err ){
        done = true;
        parole.reject( err );
      }
    };
    for( var ii = 0 ; ii < len ; ii++ ){
      p = parole.promises[ ii ];
      if( p && typeof p.then === "function" ){
        p.then(
          f.bind( null, parole, p, ii, true ),
          f.bind( null, parole, p, ii, false )
        );
      }else{
        f( parole, null, ii, true, p );
      }
    }
    return parole;
  },

  select:  function(){
    if( !this ||  !this.promises ){
      return (this || ProtoParole).each( ProtoParole.select, arguments );
    }
    if( !this.error )return this.value;
  },

  collect: function(){
    if( !this || !this.promises ){
      return (this || ProtoParole).each( ProtoParole.collect, arguments );
    }
    if( !this.error )return this.value;
  },

  and: function(){
    if( !this || !this.promises ){
      return (this || ProtoParole).each( ProtoParole.and, arguments );
    }
    if( this.error  ) return this;
    if( !this.value ) return this;
    if( this.list.length === this.paroles.length ) return this;
  },

  or: function(){
    if( !this || !this.promises ){
      return (this || ProtoParole).each( ProtoParole.or, arguments );
    }
    if( !this.error && this.value ) return this;
    if( this.list.length === this.paroles.length ) return this;
  }

};

ProtoParole.emit = ProtoParole._fulfill;
ProtoParole.notify = ProtoParole.emit;
ProtoParole.pipe = ProtoParole.to;
ProtoParole.__proto__ = function(){}.__proto__;
ProtoParole.parole.__proto__ = ProtoParole;
ProtoParole.Parole = ProtoParole;
ProtoParole.scheduler();
var Parole = ProtoParole.parole;

if( typeof module !== "undefined" && "exports" in module ){
  module.exports = Parole;
}



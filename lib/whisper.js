// whisper.js
//   Paroles are promises with steps, in callback disguise.
// (C) april 2013, Jean Hugues Robert -- github.com/JeanHuguesRobert
// MIT License

"use strict";

// ToDo: avoid global var, thanks to using a closure
var ProtoParole = {

  isParole: function( x ){ return typeof x === "function" && x.__proto__ === ProtoParole && x !== ProtoParole.parole; },

  isPipe: function( x ){ return x && typeof x.pipe === "function" && (x.in || x.out); },

  parole: function( stuff ){
    //function f(){ ProtoParole._fulfill.apply( this.cb, arguments ); }
    //var obj = { cb: null };
    //var callback = f.bind( obj );
    //obj.cb = callback;
    var callback = function(){ return ProtoParole._fulfill.apply( callback, arguments ) };
    if( ProtoParole.isParole( this ) ){
      var tail = this._tail();
      //console.assert( !tail.next )
      tail.next = callback;
      callback.previous = tail;
    }
    callback.__proto__ = ProtoParole;
    if( !arguments.length ) return callback;
    return arguments.length > 1 || typeof stuff !== "function" || typeof stuff.then !== "function"
    ? ProtoParole.will.apply( callback, arguments )
    : callback.when( stuff );
  },

  curry: function(){
    var fn = this;
    var args = arguments;
    var new_f = function(){
      if( arguments.length ){
        fn.apply( fn, Array.prototype.slice.call( args ).concat( Array.prototype.slice.call( arguments ) ) );
      }else{
        fn.apply( fn, args );
      }
    };
    new_f.__proto__ = fn;
    return new_f;
  },

  defer: function(){
    var p = ProtoParole.parole();
    return p.promise = p;
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
    if( arguments.length === 1 && ProtoParole.isPipe( step ) )return step.to( this );
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
    ProtoParole.schedule( ProtoParole._fulfill.apply.bind( ProtoParole._fulfill, start, args ) );
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
        function( ko ){ parole.reject( ko );      }
      );
    }else{
      parole._fulfill( null, stuff );
    }
    return parole;
  },

  then: function( ok, ko ){
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
      return branch.then( ok, ko );
    }
    if( ok && typeof ok === "function" ){ tail._ok = ok; }
    if( ko && typeof ko === "function" ){ tail._ko = ko; }
    next = tail.parole();
    tail._progress();
    return next;
  },

  fork: function( code ){
    var tail = this._tail();
    var next = tail.next;
    var fork;
    var branch = ProtoParole.parole();
    branch.previous = tail;
    var result;
    if( code ){
      result = that;
      ProtoParole.will.apply( branch, [ branch ].concat( Array.prototype.slice.call( arguments, 1 ) ) );
    }else{
      result = branch;
    }
    if( !next ){
      fork = tail.parole();
      fork._listener = true;
      fork._fork = [  branch ];
      branch.values = fork.value = tail.values;
      return result;
    }
    if( next._fork && next._listener ){
      next._fork.push( branch );
      return result;
    }
    // Move the "tail" promise into a new one
    var main = ProtoParole.parole();
    main.values    = tail.values;
    main._fork     = tail._fork;
    main._step     = tail._step;
    main._listener = tail._listener;
    main._ok       = tail._ok;
    main._ko       = tail._ko;
    main.next = next;
    next.previous = main;
    tail._listener = true;
    tail._fork = [ main, branch ];
    return result;
  },

  join: function(){
    var tail = this._tail().next;
    var fork = tail && tail._fork;
    var parole = ProtoParole.parole();
    parole.previous = this;
    if( !fork ){
      parole._fulfill( null, [] );
    }else{
      tail.will( function(){
        var len = fork.length;
        var list = [];
        var count = 0;
        for( var ii = fork ; ii < len ; ii++ ){
          fork[ ii ]._tail().on(
            function( list, ii, fork, err ){
              list.push( fork[ ii ] );
              if( err || ( ++count === len ) ){
                this._fulfill( err, list );
              }
            }.bind( parole, list, ii, fork )
          );
        }
      });
    }
    return parole;
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
      if( typeof promise !== "function" || typeof promise.then !== "function" ){
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
    if( arguments.length <= 1 )return this._fulfill( null, v );
    return ProtoParole._fulfill.apply( this, [ null ].concat( Array.prototype.slice.call( arguments ) ) );
  },

  reject: function( r ){ return this._fulfill( this.reason( r) ); },

  _fulfill: function( p ){
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
    var fork = this._fork;
    if( fork ){
      var is_thens = !this._listener;
      if( !is_thens || !this.values ){
        this.values = arguments;
        for( var ii = 0 ; ii < fork.length ; ii++ ){
          ProtoParole._fulfill.apply( fork[ ii ], arguments );
        }
        if( is_thens ){
          //if( this.previous ){ this.previous.next = null; }
          this._fork = [];
          return this;
        }
      }
    }else if( this._listener ){
      this.values = arguments;
      this._emit();
    }
    if( this._scheduled ){
      if( arguments.length ) return this;
      if( this.error ) throw this.value;
      return this.value;
    }else if( !this.values ){
      this.values = arguments;
      this._progress();
    }
    return this;
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
    if( !fn ) return ( next = this.next ) && ProtoParole._fulfill.apply( next, this.values );
    try{
      var rslt = fn.call( this, this.value );
      if( !( next = this.next ) ) return;
      if( !rslt || typeof rslt.then !== "function" ) return next._fulfill( null, rslt );
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
            return parole._fulfill( ProtoParole.reason( rslt.error && rslt.value ), rslt.value );
          }
          if( rslt !== parole.values ){ parole.results.push( rslt ); }
        }
        if( parole.list.length === parole.promises.length ){
          done = true;
          return parole._fulfill( null, parole.results );
        }
      }catch( err ){
        done = true;
        parole.reject( err );
      }
    };
    for( var ii = 0 ; ii < len ; ii++ ){
      p = parole.promises[ ii ];
      if( p && typeof p.then === "function" ){
        p.then( f.bind( null, parole, p, ii, true ), f.bind( null, parole, p, ii, false ) );
      }else{
        f( parole, null, ii, true, p );
      }
    }
    return parole;
  },

  select:  function(){
    if( !this || !this.promises )return (this || ProtoParole).each( ProtoParole.select, arguments );
    if( !this.error )return this.value;
  },

  collect: function(){
    if( !this || !this.promises )return (this || ProtoParole).each( ProtoParole.collect, arguments );
    if( !this.error )return this.value;
  },

  and: function(){
    if( !this || !this.promises )return (this || ProtoParole).each( ProtoParole.and, arguments );
    if( this.error  ) return this;
    if( !this.value ) return this;
    if( this.list.length === this.paroles.length ) return this;
  },

  or: function(){
    if( !this || !this.promises )return (this || ProtoParole).each( ProtoParole.or, arguments );
    if( !this.error && this.value ) return this;
    if( this.list.length === this.paroles.length ) return this;
  }

};

ProtoParole.emit = ProtoParole._fulfill;
ProtoParole.pipe = ProtoParole.to;
ProtoParole.__proto__ = (function(){}).__proto__;
ProtoParole.parole.__proto__ = ProtoParole;
ProtoParole.Parole = ProtoParole;
ProtoParole.scheduler();
var Parole = ProtoParole.parole;

if( typeof module !== "undefined" && "exports" in module ){
  module.exports = Parole;
}



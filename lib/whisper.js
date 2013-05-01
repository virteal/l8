// whisper.js
//   Paroles are promises with steps, in callback disguise.
// (C) april 2013, Jean Hugues Robert -- github.com/JeanHuguesRobert
// MIT License

"use strict";

var ParoleProto = {

  isParole: function( x ){ return typeof x === "function" && x.__proto__ === ParoleProto; },

  parole: function( stuff ){
    //function f(){ this.cb._fulfill.apply( this.cb, arguments ); }
    //var obj = { cb: null };
    //var callback = f.bind( obj );
    //obj.cb = callback;
    var callback = function(){ return callback._fulfill.apply( callback, arguments ) };
    if( typeof this === "function" && this.__proto__ === ParoleProto ){
      // Set up next link, to new parole
      var tail = this;
      // Skip "will()" steps
      while( tail.next && tail.next.step ){ tail = tail.next; }
      tail.next = callback;
      callback.previous = tail;
    }
    callback.__proto__ = ParoleProto;
    if( !arguments.length ) return callback;
    return arguments.length > 1 || ( typeof stuff === "function" && !stuff.then )
    ? callback.will.apply( callback, arguments )
    : callback.when( stuff );
  },

  defer: function(){
    var p = ParoleProto.parole();
    return p.promise = p;
  },

  on: function( listener ){
    if( ( this.listener = listener ) && this.values ){ this._emit(); }
    return this;
  },

  _queue: [],

  _enqueue: function( f ){
    var queue = ParoleProto._queue;
    if( !queue.length ){
      var tick = ParoleProto.tick;
      tick( function(){
        var queue = ParoleProto._queue;
        var ii = 0;
        while( true ){
          try{
            queue[ ii++ ]();
          }finally{
            if( ii === queue.length ){
              ParoleProto._queue = [];
              return;
            }
          }
        }
      });
    }
    queue.push( f );
  },

  _emit: function(){
    var values = this.values;
    this.values = null;
    return this.listener.apply( this, values );
  },

  will: function( code ){
    this.step = code;
    this.cb = this.parole();
    if( !this.previous || this.values ){
      var args;
      if( this.values ){
        args = Array.prototype.slice.call( arguments, 1 )
        .concat( Array.prototype.slice.call( this.values ) );
      }else{
        args = Array.prototype.slice.call( arguments, 1 );
      }
      this._fulfill.apply( this, args );
    }
    return this.cb;
  },

  wills: function( code ){
    return this.will( function(){
      var last = arguments[ arguments.length - 1 ];
      var args = Array.prototype.slice.call( arguments, 0, -1 );
      if( !last || !last.length ) return code.apply( this, args );
      return code.apply( this, args.concat( last ) );
    });
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
      start = this._start;
      if( !start ){
        start = step = this;
        while( step && step.step ){
          start = step;
          step = step.previous;
        }
        this._start = start;
      }
      if( arguments.length ){
        args = Array.prototype.slice.call( arguments );
      }else{
        args = start.values;
      }
    }
    ParoleProto._enqueue( function(){ start._fulfill.apply( start, args ); } );
    return this;
  },

  conclude: function(){
    var tail = this;
    var next;
    while( tail.step && (next = tail.next) ){
      tail.next = null;
      tail = next;
    }
    if( !tail.step ){ tail._fulfill.apply( tail, arguments ); }
  },

  when: function( stuff ){
    var that = this;
    if( !that || that === ParoleProto ){ that = ParoleProto.parole(); }
    if( stuff && typeof stuff.then === "function" ){
      stuff.then(
        function( ok ){ that._fulfill( null, ok ) },
        function( ko ){ that.reject( ko );      }
      );
    }else{
      that._fulfill( null, stuff );
    }
    return this;
  },

  then: function( ok, ko ){
    this.listener = null;
    var next = this.next;
    if( next || this.fork ){
      var branch = ParoleProto.parole();
      if( this.values ){
        branch._fulfill.apply( branch, this.values );
        return branch.then( ok, ko );
      }
      if( this.fork ){
        this.fork.push( branch );
      }else{
        // Move the "this" promise into a new one
        var main = ParoleProto.parole();
        main.ok = this.ok;
        main.ko = this.ko;
        if( next ){
          main.next = next;
          next.previous = main;
        }
        this.fork = [ main, branch ];
      }
      return branch.then( ok, ko );
    }
    if( ok && typeof ok === "function" ){ this.ok = ok; }
    if( ko && typeof ko === "function" ){ this.ko = ko; }
    next = this.parole();
    this._progress();
    return next;
  },

  upgrade: function( v ){ return this.then( null, function(){ return v; } ); },

  resolve: function( v ){ return this._fulfill( null, v ); },

  reject: function( r ){ return this._fulfill( this.reason( r) ); },

  _fulfill: function( p ){
    var fork = this.fork;
    if( fork ){
      if( !this.values ){
        this.values = arguments;
        var branch;
        for( var ii = 0 ; ii < fork.length ; ii++ ){
          branch = fork[ ii ];
          branch._fulfill.apply( branch, arguments );
        }
      }
    }else if( this.listener ){
      this.values = arguments;
      this._emit();
    }else if( this._queued ){
      if( arguments.length ) return this;
      if( this.error ) throw this.value;
      return this.value;
    }else if( !this.step ){
      if( !this.values ){
        this.values = arguments;
        this._progress();
      }
    }else if( arguments.length === 1 && typeof p === "function" && p.then ){
      var that = this;
      p.then(
        function( ok ){ that.resolve( ok ); },
        function( ko ){ that.reject(  ko ); }
      );
    }else{
      this.values = arguments;
      try{
        this.step.apply( this.cb, arguments );
      }catch( err ){
        var next = this.next;
        if( next ){ next.reject( err ); }
      }
    }
    return this;
  },

  reason: function( e ){ return e || { paroleError: e } },

  scheduler: function( scheduler ){
    ParoleProto.tick = scheduler
    || ( typeof setImmediate !== "undefined" && setImmediate )
    || ( typeof process      !== "undefined" && process.nextTick )
    || setTimeout;
    return this;
  },

  _progress: function(){
    if( ( !this.next && !this.ok )
    || this._queued
    || !this.values
    ) return;
    this._queued = true;
    ParoleProto._enqueue( this._resolve.bind( this ) );
    if( !(this.error = this.values[ 0 ] ) ){
      this.value = this.values.length > 2
      ? Array.prototype.slice( this.values, 1 )
      : this.values[ 1 ];
      return;
    }
    if( typeof this.error === "object" && "paroleError" in this.error ){
      this.value = this.error.paroleError;
    }else{
      this.value = this.error;
    }
  },

  _resolve: function(){
    var next;
    var fn = this.error ? this.ko : this.ok;
    if( !fn ) return ( next = this.next ) && next._fulfill.apply( next, this.values );
    try{
      var rslt = fn.call( this, this.value );
      if( !( next = this.next ) ) return;
      if( !rslt ) return next._fulfill( null, rslt );
      if( typeof rslt.then !== "function" ) return next._fulfill( null, rslt );
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
    var that = this;
    if( !that || that === ParoleProto ){ that = ParoleProto.parole(); }
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
      if( handler === ParoleProto.or || handler === ParoleProto.and ){
        paroles = [ ParoleProto.parole()._fulfill( null, false ) ];
      }else if( !paroles ){
        paroles = [];
      }
    }
    if( !handler ){ handler = ParoleProto.collect; }
    var list  = [];
    that.list = list;
    var array = [];
    that.array = array;
    var values = [];
    var len = paroles.length;
    var p;
    var f = function( ii, ok, value ){
      if( !f )return;
      var chunk = {
        parole:  this,
        error:   !ok,
        value:   value,
        paroles: paroles,
        list:    list,
        rank:    list.length,
        array:   array,
        index:   ii,
        values:  values
      };
      list.push( chunk );
      array[ chunk.index ] = chunk;
      var rslt;
      try{
        rslt = handler.call( chunk, chunk );
        if( typeof rslt === "undefined" ) return;
        if( rslt === chunk ){
          f = null;
          return that._fulfill( rslt.error && rslt.value, rslt.value );
        }
        if( rslt !== values ){ values.push( rslt ); }
        if( list.length === len ){
          f = null;
          return that._fulfill( null, values );
        }
      }catch( err ){
        that.reject( err );
      }
    };
    for( var ii = 0 ; ii < len ; ii++ ){
      p = paroles[ ii ];
      if( p && typeof p.then === "function" ){
        p.then( f.bind( p, ii, true ), f.bind( p, ii, false ) );
      }else{
        f.call( null, ii, true, p );
      }
    }
    return that;
  },

  select:  function(){
    if( !this || !this.paroles )return (this || ParoleProto).each( ParoleProto.select, arguments );
    if( !this.error )return this.value;
  },

  collect: function(){
    if( !this || !this.paroles )return (this || ParoleProto).each( ParoleProto.collect, arguments );
    if( !this.error )return this.value;
  },

  and: function(){
    if( !this || !this.paroles )return (this || ParoleProto).each( ParoleProto.and, arguments );
    if( this.error  ) return this;
    if( !this.value ) return this;
    if( this.list.length === this.paroles.length ) return this;
  },

  or: function(){
    if( !this || !this.paroles )return (this || ParoleProto).each( ParoleProto.or, arguments );
    if( !this.error && this.value ) return this;
    if( this.list.length === this.paroles.length ) return this;
  }

};

ParoleProto.parole.__proto__ = ParoleProto;
ParoleProto.Parole = ParoleProto;
ParoleProto.scheduler();

if( typeof module !== "undefined" && "exports" in module ){
  module.exports = ParoleProto.parole;
}



// whisper.js
//   Paroles are promises in callback disguise.
// (C) april 2013, Jean Hugues Robert -- github.com/JeanHuguesRobert
// MIT License

"use strict";

var Parole = {

  parole: function( stuff ){
    //function f(){ this.cb._fulfill.apply( this.cb, arguments ); }
    //var obj = { cb: null };
    //var callback = f.bind( obj );
    //obj.cb = callback;
    var callback = function(){ callback._fulfill.apply( callback, arguments ) };
    if( this && this.__proto__ === Parole ){
      // Set up next link, to new parole
      var tail = this;
      // Skip "will()" steps
      while( tail.next && tail.next.step ){ tail = tail.next; }
      tail.next = callback;
      callback.previous = tail;
    }
    callback.__proto__ = Parole;
    if( !arguments.length ) return callback;
    return arguments.length > 1 || ( typeof stuff === "function" && !stuff.then )
    ? callback.will.apply( callback, arguments )
    : callback.when( stuff );
  },

  on: function( listener ){
    if( ( this.listener = listener ) && this.values ){ this._emit(); }
    return this;
  },

  _emit: function(){
    var values = this.values;
    this.values = null;
    return this.listener.apply( this, values );
  },

  will: function( code ){
    this.step = code;
    this.cb = this.parole();
    if( !this.previous ){
      var args = Array.prototype.slice.call( arguments, 0 );
      args[ 0 ] = null;
      this._fulfill.apply( this, args );
    }
    return this.cb;
  },

  exit: function(){
    var tail = this;
    var next;
    while( tail.step && (next = tail.next) ){
      tail.next = null;
      tail = next;
    }
    if( !tail.step ){ tail._fulfill.apply( tail, arguments ); }
  },

  when: function( stuff ){
    if( stuff && typeof stuff.then === "function" ){
      var that = this;
      stuff.then(
        function( ok ){ that._fulfill( null, ok ) },
        function( ko ){ that.reject( ko );      }
      );
    }else{
      this._fulfill( null, stuff );
    }
    return this;
  },

  then: function( ok, ko ){
    var next = this.next;
    if( next || this.fork ){
      var branch = Parole.parole();
      if( this.values ){
        branch._fulfill.apply( branch, this.values );
        return branch.then( ok, ko );
      }
      if( this.fork ){
        this.fork.push( branch );
      }else{
        // Move the "this" promise into a new one
        var main = Parole.parole();
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

  _fulfill: function(){
    if( !this.values || this.listener ){ this.values = arguments; }
    var fork;
    if( fork = this.fork ){
      var branch;
      for( var ii = 0 ; ii < fork.length ; ii++ ){
        branch = fork[ ii ];
        branch._fulfill.apply( branch, arguments );
      }
      return this;
    }
    if( this.listener ){
      this._emit();
    }else if( !this.step ){
      if( this.ticked ){
        if( arguments.length ) return this;
        if( this.error ) throw this.value;
        return this.value;
      }
      this._progress();
    }else{
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

  tick: (typeof process !== "undefined" && process.nextTick) || setTimeout,

  sync: function( scheduler ){
    Parole.tick = scheduler;
    return this;
  },

  _progress: function(){
    if( ( !this.next && !this.ok )
    || this.ticked
    || !this.values
    ) return;
    this.ticked = true;
    var tick = Parole.tick;
    tick( this._resolve.bind( this ) );
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
    if( !fn ) return ( next = this.next )&& next._fulfill.apply( next, this.values );
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
      if( next = this.next ){ next.reject( err ); }
    }
  },

  each: function( handler, paroles ){
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
      if( handler === Parole.or || handler === Parole.and ){
        paroles = [ Parole.parole()._fulfill( null, false ) ];
      }else if( !paroles ){
        paroles = [];
      }
    }
    var that  = this;
    var list  = [];
    this.list = list;
    var array = [];
    this.array = array;
    var values = [];
    var len = paroles.length;
    var p;
    var f = function( ii, ok, value ){
      if( !f )return;
      var chunk = {
        parole:  this,
        paroles: paroles,
        index:   ii,
        rank:    list.length,
        error:   !ok && (value || true),
        value:   value,
        list:    list,
        array:   array,
        values:  values
      };
      list.push( chunk );
      array[ chunk.index ] = chunk;
      if( !handler ){
        if( that.list.length === len )return that._fulfill( 0, that.array );
      }
      var rslt;
      try{
        rslt = handler.call( chunk, chunk );
        if( typeof rslt === "undefined" ) return;
        if( rslt === chunk ){
          f = null;
          return that._fulfill( rslt.error, rslt.value );
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
      p = p[ ii ];
      if( p && p.then ){
        p.then( f.bind( p, ii, true ), f.bind( p, ii, false ) );
      }else{
        f( ii, true, p );
      }
    }
  },

  select:  function(){
    if( !this.paroles )return this.each( Parole.select, arguments );
    if( !this.error )return this;
  },

  collect: function(){
    if( !this.paroles )return this.each( Parole.collect, arguments );
    if( !this.error )return this.value;
  },

  and: function(){
    if( !this.paroles )return this.each( Parole.and, arguments );
    if( this.error ) return this;
    if( !this.value ){
      this.error = this.value;
      return this;
    }
    if( this.list.length === this.paroles.length ){
      return this;
    }
  },

  or: function(){
    if( !this.paroles )return this.each( Parole.or, arguments );
    if( !this.error && this.value ){
      return this;
    }
    if( this.list.length === this.paroles.length ){
      this.error = this.value = this.parole;
      return this;
    }
  }

};

if( typeof module !== "undefined" ){
  module.exports.Parole = Parole;
  module.exports.parole = Parole.parole;
}



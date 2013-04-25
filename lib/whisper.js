// whisper.js
//   Paroles are chains of light promises in callback disguise.
// (C) april 2013, Jean Hugues Robert -- github.com/JeanHuguesRobert
// MIT License

var Parole = {

  parole: function( code ){
    var callback = function(){ callback.fulfill.apply( callback, arguments ) };
    if( this && this.parole ){
      var tail = this;
      while( tail.next && tail.next.step ){ tail = tail.next; }
      tail.next = callback;
      callback.previous = tail;
      if( tail.tick !== Parole.tick ){ callback.tick = tail.tick; }
    }else{
      callback.head = true;
    }
    callback.__proto__ = Parole;
    if( code ) return callback.will.apply( callback, arguments );
    return callback;
  },

  on: function( listener ){
    if( ( this.listener = listener ) && this.values ){ this._fire(); }
    return this;
  },

  _fire: function(){
    try{ this.listener.apply( this, this.values ); }
    finally{ this.values = null; }
  },

  will: function( code ){
    this.step = code;
    this.cb = this.parole();
    if( this.head ){
      var args = Array.prototype.slice.call( arguments, 0 );
      args[ 0 ] = null;
      this.fulfill.apply( this, args );
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
    if( !tail.step ){ tail.fulfill.apply( tail, arguments ); }
  },

  then: function( ok, ko ){
    this.listener = null;
    if( ok && typeof ok === "function" ){
       this.ok   = ok;
       this.done = false;
    }
    if( ko && typeof ko === "function" ){
      this.ko   = ko;
      this.done = false;
    }
    this._progress();
    return this.parole();
  },

  else: function( ko ){
    if( !ko || typeof ko !== "function" ) return this;
    var previous = this.previous;
    if( !previous || previous.ko ) return this;
    previous.ko = ko;
    previous._progress();
    return this;
  },

  fulfill: function( err ){
    if( this.done ){
      var next;
      if( !this.step && arguments.length && (next = this.next) ){
        this.next = null;
        next.fulfill.apply( next, arguments );
        return this;
      }
      if( this.error ) throw this.error;
      return this.values.length === 1 ? this.value : this.values;
    }
    if( !this.values || this.listener ){
      this.values = arguments;
      this.error  = this.value = err;
    }
    if( this.listener ) return this._fire(),     this;
    if( !this.step    ) return this._progress(), this;
    try{
      this.step.apply( this.cb, arguments );
    }catch( err ){
      if( this.next ){ this.next.fulfill( err ); }
    }
    return this;
  },

  tick: (typeof process !== "undefined" && process.nextTick) || setTimeout,

  sync: function( queuer ){
    this.tick = queuer;
    return this;
  },

  _progress: function(){
    if( this.done || !this.values || this.listener ) return this;
    var tick = this.tick;
    if( tick ){
      this.tick = null;
      return tick( this, 0 );
    }
    this.done = true;
    if( this.error ) return this._resolve( this.ko );
    if( !this.ok ) return this._resolve();
    this.value  = this.values[ 1 ];
    this.values = Array.prototype.slice.call( this.values, 1 );
    this._resolve( this.ok );
  },

  _resolve: function( fn ){
    var next = this.next;
    if( !fn ) return next && next.fulfill.apply( next, this.values );
    try{
      var rslt = fn.apply( this, this.values );
      if( !next && !( next = this.next ) ) return;
      if( !rslt ) return next.fulfill( null, rslt );
      if( typeof rslt.then !== "function" ) return next.fulfill( null, rslt );
      rslt.then(
        function( ok ){ next.fulfill( null, ok ); },
        function( ko ){ next.fulfill( ko || true ); }
      );
    }catch( err ){
      if( next ){ next.fulfill( err || true ); }
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
        paroles = [ Parole.parole().fulfill( null, true ) ];
      }else if( !paroles.length ){
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
        error:   !ok && value,
        value:    ok && value,
        list:    list,
        array:   array,
        values:  values
      };
      list.push( chunk );
      array[ chunk.index ] = chunk;
      if( !handler ){
        if( this.list.length === len )return that.fulfill( 0, this.array );
      }
      var rslt;
      try{
        rslt = handler.call( chunk, chunk );
        if( typeof rslt === "undefined" ) return;
        if( rslt === chunk ){
          f = null;
          return that.fulfill( rslt.error, rslt.value );
        }
        if( rslt !== values ){ values.push( rslt ); }
        if( list.length === len ){
          f = null;
          return that.fulfill( null, values );
        }
      }catch( err ){
        that.fulfill( err || true );
      }
    };
    for( var ii = 0 ; ii < len ; ii++ ){
      (p = p[ ii ]).then( f.bind( p, ii, true ), f.bind( p, ii, false ) );
    }
  },

  select:  function(){ if( !this.error )return this; },

  collect: function(){ if( !this.error )return this.value; },

  and: function(){
    if( this.error || !this.value ){
      this.error = this.value = this.parole;
      return this;
    }
    if( this.list.length === this.paroles.length ){
      this.value = this.parole;
      return this;
    }
  },

  or: function(){
    if( !this.error && this.value ){
      this.value = this.parole;
      return this;
    }
    if( this.list.length === this.paroles.length ){
      this.error = true;
      return this;
    }
  }

};

if( typeof module !== "undefined" ){
  module.exports.Parole = Parole;
  module.exports.parole = Parole.parole;
}



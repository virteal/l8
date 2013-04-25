// outcome.js
//   Light promises
// (C) 2013, Jean Hugues Robert -- virteal.com -- twitter.com/jhr
// MIT License
var slice = Array.prototype.slice
var Outcome = {
  fire: function( err ){
    this.error  = err;
    this.values = arguments;
    this.value  = arguments[ 0 ];
    if( err && !this.all ){
      if( this.ko ) return this.ko.call( this, err );
    }else{
      if( this.ok  ) return this.ok.apply( this, (this.value = this.values[ 1 ], slice.call( this.values, 1 ) ) );
      if( this.all ) return this.all.apply( this, arguments );
    }
  },
  when: function( all ){ ( this.all = all ) && this.ready && all.apply( this, this.ready ); },
  "if": function( ok ){
    if( this.ready && !this.err ){
      ok && ok.apply( this, (this.value = this.values[ 1 ], slice.call( this.values, 1 ) ) );
    }else{
      this.ok = ok;
    }
    return this;
  },
  "else": function( ko ){
    (this.ready && this.err ) ? ko && ko.call( this, this.err ) : ( this.ko = ko )
  },
  then: function( ok, ko ){ this.if( ok ).else( ko ); }
}
exports.callback = function(){
  var f = function(){ f.fire.apply( f, arguments ) }
  f.__proto__ = Outcome;
  if( arguments.length ){
    if( arguments.length === 2 ){
      f.if(   arguments[ 0 ] );
      f.else( arguments[ 1 ] );
    }else{
      f.when( arguments[ 0 ] );
    }
  }
  return f;
}

var to = exports.callback();
setTimeout( to, 1000 );
to.when( function(){ console.log( "Timeout" ); } );
to.if(   function( v ){ console.log( "Timeout", v ); } );
console.log( "ready" );
process.stdin.resume();

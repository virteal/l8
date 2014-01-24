// boxon.js
//   Boxons are 50loc thenable indirect callbacks
//
// (C) 2014, Jean Hugues Robert -- github.com/JeanHuguesRobert -- @jhr
// MIT License
//
// Please look for test suite in test/boxon.js

"use strict";

(function(){

  var boxon = function( f ){
    
    var BOXONS_DONT_CHAIN = "Boxon is not a chainable promise";
    
    var box = function(){
      if( box._result ){
        if( arguments.length )return;
        if( box._result[0] )throw box._result[0];
        if( box._result.length <= 2 )return box._result[1];
        return Array.slice.call( box._result, 1 );
      }
      box._result = arguments;
      box.then( box._ok, box._ko, true );
      return box.boxon( box._on );
    };
    
    var then;
    if( (typeof f === "object" || typeof f === "function" )
    && typeof (then = f.then) === "function"
    ){
      box._on = null;
      box._result = null;
      then.call( f, 
        function( ok ){ box( null, ok ) },
        function( ko ){ box( ko )       }
      );
    }else if( typeof f === "function" && arguments.length === 1 ){
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
        return BOXONS_DONT_CHAIN;
      }
      if( !this._result[0] ){
        ok && setImmediate( ok.bind(  null, 
          this._result.length < 3
          ? this._result[1]
          : Array.slice.call( this._result, 1 )
        ) );
      }else{
        ko && setImmediate( ko.bind( null, this._result[0] ) );
      }
      return BOXONS_DONT_CHAIN;
    };
    
    return box;
  };

  // Export global Boxon, platform dependant
  typeof module !== "undefined" && "exports" in module && (module.exports = boxon);
  typeof global !== "undefined" && (global.Boxon = boxon);
  typeof window !== "undefined" && (window.Boxon = boxon);

})();



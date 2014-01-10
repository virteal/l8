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
    
    var box = function(){
      if( box._result )return box._result;
      box._result = arguments;
      box.boxon( box._on );
      box.then( box._ok, box._ko );
      return box;
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
      if( f && this._result ){ f.apply( null, this._result ); }
      return this;
    };
    
    box.then = function( ok, ko ){
      if( !this._result ){
        this._ok = ok;
        this._ko = ko;
        return "boxon";
      }
      if( !this._result[0] ){
        ok && setImmediate( ok.bind( null, this._result[1] ) );
      }else{
        ko && setImmediate( ko.bind( null, this._result[0] ) );
      }
      return "boxon";
    };
    
    return box;
  };

  // Export global Boxon, platform dependant
  typeof module !== "undefined" && "exports" in module && (module.exports = boxon);
  typeof global !== "undefined" && (global.Boxon = boxon);
  typeof window !== "undefined" && (window.Boxon = boxon);

  // Smoke test
  false && boxon()
  .boxon( function( _, m ){ console.log( "sync: " + m ); }
  )( null, "hello Boxon" )
  .then( function( m ){ console.log( "async: " + m ); } );
})();



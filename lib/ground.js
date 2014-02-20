// ground.js
//    set context for grounded callbacks
//
// Feb 18 2014 by @jhr
//
// Similar to "thread local variables" but for callbacks not threads.
//
// Usage : f = Ground( {ctx:"hello"}, function(){ xxx( Ground.scope.ctx ) } );
// Usage : X = Ground.bind( {ctx:"hello" } );
//         f = X(function(){ xxx( this.ctx ) });

(function(){

  var ground = function( scope, f, ctx ){
    if( typeof scope === "function" ){
      ctx = f;
      f = scope;
      scope = ground.scope || {};
    }
    return function(){
      ground.scope = scope;
      var r = f.apply( ctx || this || scope, arguments );
      ground.scope = null;
      return r;
    };
  };
  
  ground.bind = function( scope, bctx ){
    var that = this || scope;
    return function( f, ctx ){
      return ground.call( that, scope, f, ctx || bctx );
    };
  };
  
  // Export global Ground, platform dependant
  typeof module !== "undefined" && "exports" in module && (module.exports = ground);
  typeof global !== "undefined" && (global.Ground = ground);
  typeof window !== "undefined" && (window.Ground = ground);

})();

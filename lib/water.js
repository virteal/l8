// water.js
//  reactive things with consequences
//
// Feb 19 2014 by @jhr

(function(){
  
  var lazy_mode  = false;
  var pending_node;
  var generation = 0;
  
  function try_call( f, target, arg1, arg2 ){
    try{ return f.call( target, arg1, arg2 ) }catch( _ ){ /* ignored */ }
  }
  
  function try_apply( f, target, args ){
    try{ return f.apply( target, args ) }catch( _ ){ /* ignored */ }
  }
  
  var water = function(){
    
    // Instance members, enclosed in closure
    var current, age, sources, dep = [], dirty, pending, transform, boxons, queue, iqueue;
    
    function wakeup(){
      if( !dirty || pending ){
        console.log( "Bad wakeup()" );
        return;
      }
      var ii = 0;
      var w;
      var node;
      try{
        node = pending_node;
        pending_node = h2o;
        pending      = true;
        while( w = sources[ii++] ){ w() }
      }finally{
        pending_node = node;
      }
    }
    
    function update( now ){
      if( typeof now === "undefined" )return;
      if( age === generation )return;
      // Update to new value
      if( now === lazy ){
        // Stop propagation if already dirty
        if( dirty )return;
        dirty = true;
      }else{
        current = now;
        age     = generation;
        dirty   = false;
        pending = false;
        if( boxons ){
          var list = boxons;
          boxons = null;
          var b;
          var ii = 0;
          while( b = list[ii++] ){
            try_call( b, null, null, current );
          }
        }
      }
      // Signal change to dependent waters
      var ii = 0;
      var f;
      while( f = dep[ ii++ ] ){
        try_call( f.water, f, now, true );
      }
      // Process next queued operation if any
      if( queue ){
        var args = queue[ iqueue++ ];
        if( !args ){
          queue = null;
        }else{
          try_apply( h2o, args );
        }
      }
    }
    
    function update_cb( err, value ){
      if( !err )return;
      generation++;
      update( value );
    }

    var h2o = function( val, auto ){
      if( !arguments.length ){
        if( pending_node ){
          if( dirty && !pending ){
            wakeup();
          }
          if( !dirty ){
            pending_node( current, true );
          }
        }
        return current;
      }
      // Queue operation if another one is pending
      if( queue ){
        queue.push( arguments );
        return h2o;
      }
      var ready;
      var ii;
      var w;
      // If b( another_water ) then add a dependent water
      if( val && val.water ){
        // If called by source so that dep can track it
        if( auto ){
          // Remember source if lazy
          sources && sources.push( val );
        // If called on source, add dep to list of deps, then update it  
        }else{
          // ToDo: use Array.indexOf()?
          ii = 0;
          while( ( w = dep[ii++] ) && ( w !== val ) ){}
          // If not alreay present
          if( !w ){
            dep.push( val );
            // Tell lazy dep to track it's source
            val( h2o, true );
            // If source is dirty, schedule refresh
            if( dirty ){
              // Unless already done before
              if( !pending ){ wakeup() }
            // If source is available, tell dep about it
            }else if( typeof current !== "undefined" ){
              try_call( val, val, current, true );
            }
          }
        }
      // if b( a_boxon ) or b( a_function ), in lazy mode
      }else if( sources
      && val
      && ( val.boxon || ( transform && typeof val === "function" ) )
      ){
        if( !dirty && typeof current !== "undefined" ){
          (val.boxon || val)( null, current );
        }else{
          if( boxons ){
            boxons.push( val.boxon || val );
          }else{
            boxons = [ val.boxon || val ];
          }
          if( dirty && !pending ){
            wakeup();
          }
        }
      // If b( funct ) then set the transform method
      }else if( typeof val === "function" && !val.then && !val.boxon ){
        // b( water ) is special, predicate to test readyness
        if( val === water ){
          if( arguments.length === 2 ){
            transform = arguments[1];
          }else{
            ready = current || (typeof current !== "undefined") || void 0;
            if( !water.source )return ready;
            // Add current as dependent
            // ToDo: use Array.indexOf()?
            ii = 0;
            while( ( w =  dep[ii++] ) && ( w !== water.source ) ){}
            if( !w ){
              dep.push( water.source );
            }
            h2o();
            return ready;
          }
        // b( lazy ) is special, signals dirtyness
        }else if( val === lazy ){
          update( lazy );
        }else if( !transform ){
          transform = val;
          // Update dependencies
          h2o( dep );
        }
      // If b( sources, funct ) then set the transform method and sources
      }else if( typeof auto === "function" ){
        transform = auto;
        ready = true;
        ii = 0;
        while( w = val[ii++] ){
          w( h2o );
          ready = ready && typeof w() !== "undefined";
        }
        ready && h2o( 0 );
      // If b( value ) or b( boxon_or_promise )
      }else if( typeof val !== "undefined" ){
        if( auto ){
          // Lazy propagation if node is lazy
          if( sources && !pending ){
            if( dirty )return;
            dirty = true;
            val = lazy;
          }
        }else{
          generation++;
        }
        if( val === dep ){ val = void 0; }
        var now;
        if( !transform || transform === idem || (val === lazy) ){
          now = val;
        }else if( typeof transform === "function" ){
          if( typeof current === "undefined" ){ water.source = h2o; }
          now = try_call( transform, h2o, val === dep ? void 0 : val );
          water.source = null;
        }else{
          now = transform;
        }
        // If new value is async, queue further operations until delivery
        if( now ){
          var then;
          if( then = now.then ){
            if( !queue ){
              queue = [];
              iqueue = 0;
            }
            then.call( now, update );
          }else if( then = now.boxon ){
            if( !queue ){
              queue = [];
              iqueue = 0;
            }
            then.call( now, update_cb );
          }else if( now !== dep ){
            update( now );
          }
        }else{
          update( now );
        }
      }
      return h2o;
    };
  
    h2o.water = h2o;
    if( lazy_mode ){
      sources = [];
      dirty = true;
    }  
    if( arguments.length ){ h2o.apply( this, arguments ); }
    return h2o;
  };
  
  var lazy = function(){
    try{
      lazy_mode = true;
      return water.apply( this, arguments );
    }finally{
      lazy_mode = false;
    }
  };
  water.lazy = lazy;
  
  var idem = function( x ){ return x };
  water.idem = idem;
  
  // Smoke test: A, B, C, D, C == A + B, D == A + B
  if( 1 ){
    var a = water(), b = water(), c = water(), d = water();
    // c water is made of a and b water, according to some function
    c( function(){ return a(water) && b(water) && a() + b(); } );
    // it waters a function
    c( water( function( v ){ console.log( "c is now: " + v ) } ) );
    // d is water is made of a and b water, mixed by some function
    d( [ a, b ], function(){ return a() + b(); } );
    // it waters a function too
    d( water( function( v ){ console.log( "d is now: " + v ) } ) );
    // l is lazy water, available on demand only
    var l = water.lazy( water.idem );
    // d water will flows to l, when asked
    d( l );
    // l waters a boxon, once full, you need another one
    l( { boxon: function( _, v ){ console.log( "l is now: " + v) } } );
    console.log( c(), d() ); // undefined, a is missing
    // let's pour some "a" water
    a( 0 );
    console.log( c(), d() ); // undefined, b is missing
    // and then let's pour some "b" water
    b( 2 );
    // what do we get?
    console.log( c(), d() ); // 2
    a( 3 );
    console.log( c(), d() ); // 5
    // Let's fill a cup of "l" water, it's made of "d" water, "on demand"
    l( function( _, v ){ console.log( "l is now: " + v) } );
  }
  
  // Export global Water, platform dependant
  typeof module !== "undefined" && "exports" in module && (module.exports = water);
  typeof global !== "undefined" && (global.Water = water);
  typeof window !== "undefined" && (window.Water = water);

})();

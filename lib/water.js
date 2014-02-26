// water.js
//  reactive things with consequences
//
// Feb 19 2014 by @jhr

(function(){
  
  // My de&&bug() and de&&mand() darlings
  function bug(){ console.log.apply( console, arguments ); }
  function mand( b ){ if( b )return; de&&bug( "assert error"); throw "!"; }
  var de = false, trace = bug;
  
  var init_sources = {}; // Sentinel value used to determine sources
  var event        = {}; // Sentinel value when building interop callback
  
  var err_handler = function( e ){
    trace( "Water error", e );
    throw e;
  };
  
  var lazy_mode  = false;
  
  var pending_node;
  
  /*
   *  Delivery of value updates should happen once per round.
   */
   
  var nested = 0;
  var queue  = [];
  
  function delivery( h2o, cb ){
    // First phase of delivery keeps last updated value only and queue callback
    var slot;
    if( cb._round === water.round )return cb._deliverer;
    cb._round = water.round;
    return cb._deliverer = function(){
      // If called for the first time
      if( !slot ){
        de&&bug( "Visit, ctx:", h2o.id, "cb:", cb.id, "args:", arguments[0] );
        queue.push( slot = { water: h2o, cb: cb, args: arguments } );
      // If another call, just override previous arguments
      }else{
        de&&bug( "Revisit, ctx:", h2o.id, "cb:", cb.id, "args:", arguments[0] );
        slot.args = arguments;
      }
    };
  }
  
  function dispatch(){
    // Second phase of delivery, after update is all done
    if( --nested ){
      de&&bug( "Skip nested dispatch()", nested + 1 );
      return;
    }
    if( !queue.length ){
      de&&bug( "Final end of round", water.round );
      water.round++;
      return;
    }
    nested++;
    de&&bug( "Dispatch at level", nested );
    var list = queue;
    queue = [];
    var ii = 0;
    var slot;
    var cb;
    var old   = water.current;
    var old_f = water.transform;
    var old_b = water.callback;
    de&&bug( "End of round", water.round );
    water.round++;
    de&&bug( "Deliver ", list.length, "changes" );
    while( slot = list[ ii++ ] ){
      de&&bug( "Deliver change on water", slot.water.id );
      water.current   = slot.water;
      water.transform = cb = slot.cb;
      water.callback  = cb;
      try_apply( cb, cb, slot.args );
    }
    water.current   = old;
    water.transform = old_f;
    water.callback  = old_b;
    dispatch();
  }
  
  function transform_call( transform, h2o, val ){
    try{ return transform.call( h2o, val );
    }catch( err ){ return { water: h2o, error: err } }
  }
  
  function try_call( f, target, arg1, arg2 ){
    try{ f.call( target, arg1, arg2 ); }catch( err ){ error( err ) }
  }
  
  function try_apply( f, target, args ){
    try{ f.apply( target, args ) }catch( err ){ error( err) }
  }
  
  function noop(){}
  
  var water = function(){
    
    // Instance members, enclosed in closure
    var current;
    var dirty, pending;
    var sources, deps; // ToDo: use an enumerable weak map!
    var transform;
    var cb;
    var queue, iqueue;
    
    function wakeup(){
      // Lazy nodes are computed "on demand", using their sources
      if( !dirty || pending ){
        trace( "Bad wakeup()" );
        return;
      }
      var ii = 0;
      var w;
      var node;
      try{
        node = pending_node;
        // Set global, the node to update
        pending_node = h2o;
        // Until refreshed, it is "pending"
        pending      = true;
        // Ask each source to update the pending node
        while( w = sources[ii++] ){ w() }
      }finally{
        pending_node = node;
      }
    }
    
    function update( now ){
      // Update to new value
      if( typeof now === "undefined" )return;
      // Lazy propagation invalidate cached values, recursive
      if( now === lazy ){
        // Stop propagation if already dirty
        if( dirty )return;
        dirty = true;
        nested++;
      // Actual value propagation, recursive too
      }else{
        nested++;
        current = now;
        dirty   = false;
        pending = false;
        // Fire callbacks
        if( cb ){
          var list = cb;
          cb = null;
          var b;
          var ii = 0;
          while( b = list[ii++] ){
            b( current );
          }
        }
      }
      de&&bug( "Update at level", nested );
      // Signal change to dependent waters
      if( deps ){
        var f;
        for( var ii = 0 ; f = deps[ ii ] ; ii++ ){
          // Update it, in "auto" mode
          delivery( h2o, f )( now, true );
        }
      }
      // Process next queued operations if any
      // ToDo: should use a global queue or a "per node" queue?
      if( queue ){
        var args = queue[ iqueue++ ];
        if( !args ){
          queue = null;
        }else{
          // Process one item only, it shall call update()
          // ToDo: stack overflow?
          try_apply( h2o, h2o, args );
        }
      }
      dispatch();
    }
    
    function async_update( value ){
      nested--;
      de&&bug( "Async", nested );
      update( value );
    }
    
    function async_update_cb( err, value ){
      nested--;
      de&&bug( "Async cb", nested );
      if( !err )return;
      update( value );
    }

    var h2o = function( val, auto ){
      
      // b( lazy ) is special, private, signals dirtyness
      if( val === lazy )return update( lazy );

      // b(), accessor, may trigger refresh if lazy node
      if( !arguments.length ){
        // If about the source of a child lazy node, refresh (see wakeup())
        if( pending_node ){
          // If that node is dirty, it needs to be refreshed
          if( dirty ){
            if( !pending ){ wakeup(); }
          // If node is ready, propagate source value to child pending node
          }else{
            // "auto" mode
            pending_node( current, true );
          }
          return;
        }
        // Return cached value, or throw an exception
        if( current && current.water )throw current.error;
        return current;
      }
      
      var ready;
      var ii;
      var w;
      
      // b( another_water [, remove_flag] ), add/remove a dependent node
      if( val && val._water && typeof auto !== "function" ){
        val = val._water;
        // If "private" call by source node so that deps can track it
        if( auto ){
          // Remember or remove source if lazy
          if( sources ){
            // If remove
            if( arguments.length === 3 ){
              ii = 0;
              while( ( w = sources[ ii++ ] ) && ( w != val ) ){}
              if( w ){
                // ToDo: compact array?
                sources[ ii - 1 ] = noop;
              }
            // If add
            }else{
              sources.push( val );
            }
          }
          return;
        //  Called on source, add/rmv node to list of deps & then update node  
        }else{
          if( !deps ){ 
            if( auto )return h2o;
            de&&bug( "First explicit dep", h2o.id, "->", val.id );
            deps = [];
          }
          // some true value when available, or else 'undefined'
          ready = current || (typeof current !== "undefined") || void 0;
          // ToDo: use Array.indexOf()?
          ii = 0;
          while( ( w = deps[ ii++ ] ) && ( w !== val ) ){}
          // Only if not alreay present
          if( !w ){
            if( !auto ){
              de&&bug( "Another explicit dep", h2o.id, val.id );
              deps.push( val );
              // "private". Tell lazy dep to track it's source, ie "auto" mode
              val( h2o, true );
              // If source is dirty, schedule refresh, will update all deps
              // ToDo: should avoid that, node is lazy for a reason...
              if( dirty ){
                // Unless already done before
                if( !pending ){ wakeup() }
                ready = false;
              // If source is available, tell dep about it
              }else if( typeof current !== "undefined" ){
                try_call( val, val, current, true );
              }
            }
          // If already there
          }else{
            // If remove
            if( auto ){
              // ToDo: compact array?
              deps[ ii - 1 ] = noop;
              // remove from val's sources too, when present
              val( h2o, true, true );
            }
          }
          return ready;
        }
      }
        
     if( val === water ){
      
        // b( water ) is special, track sources and/or test availability
        if( arguments.length === 1 ){
          // some true value when available, or else 'undefined'
          ready = current || (typeof current !== "undefined") || void 0;
          // If b(water) is not called by a transform function, we're done
          if( !water.current )return ready;
          // If b(water) is called by a transform function, add dependent
          // ToDo: use Array.indexOf()?
          if( !deps ){
            de&&bug( "First auto dep", h2o.id, water.current.id );
            deps = [ water.current ];
            return ready;
          }
          ii = 0;
          while( ( w = deps[ii++] ) && ( w !== water.current ) ){}
          if( !w ){
            de&&bug( "Another auto dep", h2o.id, water.current.id );
            deps.push( water.current );
          }
          return ready;
        }
        
        // b( water, water ) on lazy water creates a demand, private
        if( auto === water && sources ){
          var f = function( cb ){
            if( arguments.length === 0 )return h2o();
            if( cb === water )return h2o( water );
            return h2o( water, cb );
          };
          f._water = h2o;
          return f;
        }
        
        // b( water, cb ) on lazy water, attach a callback
        if( arguments.length === 2 && sources ){
          var uf = auto.boxon || auto;
          var f2 = function( v ){
            water.callback = uf;
            dirty   = true;
            pending = true;
            uf( (v && v.water) ? v.err : null, v );
          };
          var f3 = delivery( h2o, f2 );
          // Call right now if some value is ready
          if( !dirty && typeof current !== "undefined" ){
            f3( current );
          // Schedule delayed call and refresh node if it is lazy
          }else{
            // ToDo: avoid duplicates
            if( cb ){
              cb.push( f3 );
            }else{
              cb = [ f3 ];
            }
            // Refresh dirty lazy node, unless already scheduled
            if( dirty && !pending ){ wakeup(); }
          }
          return h2o;
        }

      } // b( water, ... ) cases
      
      // b( dflt, water ) returns a nodejs style callback that pours water
      if( auto === water ){
        if( val === event ){
          return function( rslt ){
            if( arguments.length === 1 ){
              h2o( rslt );
            }else{
              h2o( Array.prototype.slice( arguments ) );
            }
          };
        }else{
          return function( err ){
            if( err ){
              h2o( val === water ? { water: h2o, error: err } : val );
            }else if( arguments.length <= 2 ){
              h2o( arguments[1] );
            }else{
              h2o( Array.prototype.slice.call( arguments, 1 ) );
            }
          };
        };
      }
        
      // b( init, funct [, sources] ), set the transform method and sources
      if( typeof auto === "function" ){
        transform = auto;
        if( typeof val !== "undefined" 
        && val !== water
        && (!val || !val._water )
        ){
          current = val;
        }
        // If some source was provided
        if( (val && val._water) || arguments[2] ){
          var src;
          if( !val || !val._water ){
            src = arguments[2];
          }else{
            if( arguments[2] ){
              src = [val._water].concat( Array.slice.call( arguments[2] ) );
            }else{
              src = [val._water];
            }
          }
          ready = true;
          ii = 0;
          // Tell each source to feed this node
          while( w = src[ii++] ){
            w( h2o );
            ready = ready && typeof w() !== "undefined";
          }
          // If all sources are ready, use one of them to start feeding node
          ready && val.length && h2o( val[0]() );
        // If sources are specified by transform function itself
        }else{
          h2o( init_sources );
        }
        return h2o;
      }
      
      // b( value ), setter
      if( typeof val !== "undefined" ){
        
        // If automatic propagation
        if( auto ){
          // Lazy propagation if node is lazy
          if( sources && !pending ){
            if( dirty )return;
            dirty = true;
            // Will propagate a pseudo value, a sentinel, to avoid recompute
            val = lazy;
          }
        // If user initiated update
        }else{}
        
        // Detect sentinel, kind of a hack to trigger a recompute
        if( val !== init_sources ){
          // Queue operation if another one, async, is not finished yet
          if( queue && !auto ){
            // ToDo: shall use a global queue or a "per node" queue?
            queue.push( arguments );
            return h2o;
          }
        }
        
        var now;
        
        // Apply transform, this computes the node's new value
        if( transform === idem || !transform ){
          // No transformation
          transform = idem;
          now = val;
        }else if( typeof transform === "function" ){
          // Transformation done by a function
          // b(water) needs special care during setup phase to track sources
          //if( typeof current === "undefined" || val === init_sources ){
            water.current = h2o;
          //}
          now = transform_call( transform, h2o, val === init_sources ? void 0 : val );
          water.current = null;
        }else{
          // Transformation into a fixed value
          now = transform;
        }
        
        // Propagate new value to deps
        if( now ){
          // If new value is async, queue propagation until delivery
          // Until delivery, push operations on node are queued too
          var then;
          if( then = now.then ){
            if( !queue ){
              queue = [];
              iqueue = 0;
            }
            // Delay callback dispatch until async completes
            nested++;
            de&&bug( "Async promise", nested );
            then.call( now, async_update );
          }else if( then = now.boxon ){
            if( !queue ){
              queue = [];
              iqueue = 0;
            }
            // Delay callback dispatch until async completes
            nested++;
            de&&bug( "Async boxon", nested );
            then.call( now, async_update_cb );
          }else if( now !== init_sources ){
            update( now );
          }
        }else{
          update( now );
        }
        return h2o;
      }
      
    }; // end of function h2o()
  
    // Duck typing
    h2o._water = h2o;
    
    // Uniq id
    h2o.id = water.id++;
    
    // Lazy mode creates lazy nodes, such nodes need to know their sources
    if( lazy_mode ){
      sources = [];
      dirty = true;
    }
    
    if( arguments.length ){ h2o.apply( this, arguments ); }
    if( !transform ){ transform = idem; }
    return h2o;
  };
  
  var lazy = function(){
    try{
      lazy_mode = true;
      var w = water( water, water );
      var recur = function( w, list ){
        var item;
        var ii = 0;
        while( item = list[ ii++ ] ){
          if( item._water ){
            item._water( w );
          }else{
            recur( w, item );
          }
        }
      };
      recur( w, arguments );
      var f = function( cb ){ return w( water, cb ); };
      f._water = w;
      return f;
    }finally{
      lazy_mode = false;
    }
  };
  water.demand = lazy;
  
  var idem   = function( x ){ return x };
  water.idem = idem;
  water.noop = noop;
  water.once = noop;
  water.on   = function(){ water.current( water, noop ); };
  water.off  = function(){ water.current( water, null ); };
  water.event = event;
  
  water.void    = function( v ){ return typeof v === "undefined"; };
  water.failure = function( v ){ return v && v.water && v.error;  };
  water.success = function( v ){
    return ( v && ( !v.water || !v.error ) ) || typeof v !== "undefined";
  };
  water.water   = function( w ){ return (w && w._water) || void 0; };
  
  var error = function( error ){
    if( !err_handler )return;
    err_handler( error );
  };
  
  water.error = function( handler ){
    if( !arguments.length )return err_handler;
    err_handler = handler;
    return water;
  };
  
  water.round     = 1;
  water.id        = 0;
  water.current   = null;
  water.transform = null;
  water.callback  = null;
  
  water.again = function( cb ){
    return water.current( water, cb || water.callback );
  };
  
  water.auto = function( current, cb ){
    if( !cb && current && !current._water ){
      cb = current;
      current = null;
    }
    if( !current ){ current = water.current; }
    if( cb ){
      var cb_ctx = water.transform;
      var cb_cb  = water.callback;
      var that = this;
      return function(){
        var old    = water.current;
        var old_t  = water.transform;
        var old_cb = water.callback;
        water.current   = current;
        water.transform = cb_ctx;
        water.callback  = cb_cb;
        try{
          return cb.apply( that, arguments );
        }finally{
          water.current   = old;
          water.transform = old_t;
          water.callback  = old_cb;
        }
      };
    }else{
      return function( source, remove ){
        source( current, remove );
        return source;
      };
    }
  };
  
  function Fluid(){}
  function MakeFluid( w ){
    var f = new Fluid();
    f._water = (w && w._water) || water.apply( null, arguments );
    return f;
  }
  Fluid.prototype = {
    
    water: function(){ return this._water; },
    
    push: function( x ){ return this._water( x ); },
    
    value: function(){ return this._water(); },
    
    filter: function( p ){
      return MakeFluid( water( this._water, function( v ){
        if( v && v.water && v.error )return v;
        if( p( v ) )return v;
      }));
    },
    
    reject: function( p ){
      return MakeFluid( water( this._water, function( v ){
        if( v && v.water && v.error )return v;
        if( !p( v ) )return v;
      }));
    },
    
    map: function( p ){
      return MakeFluid( water( this._water, function( v ){
        if( v && v.water && v.error )return v;
        return p( v );
      }));
    },
    
    error: function( p ){
      return MakeFluid( water( this._water, function( v ){
        if( !v.water || !v.error )return;
        return p( v.error );
      }));
    },
    
    reduce: function( p, init ){
      return MakeFluid( water( water, function( v ){
        if( v && v.water && v.error )return v;
        // If no init value, use first value as initial value
        if( typeof init === "undefined" ){
          init = v;
          return;
        }
        var r = p( init, v );
        // Remember result for next round, unless undefined or error
        if( typeof r !== "undefined"
        && ( !r || !r.water )
        ){
          init = r;
        }
        return r;
      }, [this._water] ) );
    },
    
    tap: function( p ){
      water.demand( this._water )( function( err, v ){
        water.again();
        if( err )return;
        p( v );
      });
      return this;
    },
    
    once: function( p ){
      water.demand( this._water )( function( err, v ){
        if( err ){
          water.again();
          return;
        }
        p( this() );
      });
      return this;
    },
    
    from: function( source, remove ){
      if( source && source._water ){
        source._water( this._water, remove );
        return this;
      }
      var f = MakeFluid();
      this.from( f );
      if( typeof source === "function" ){
        var args = Array.slice.call( arguments );
        args[0] = this;
        source.apply( f, args );
        return this;
      }
      return f;
    },
    
    to: function( destination, remove ){
      if( destination && destination._water ){
        this._water( destination._water, remove );
        return this;
      }
      var f = MakeFluid();
      this.to( f );
      if( typeof destination === "function" ){
        var args = Array.slice.call( arguments );
        args[0] = this;
        destination.apply( f, args );
        return this;
      }
      return f;
    }
  };
  Fluid.prototype.where = Fluid.prototype.select = Fluid.prototype.filter;
  Fluid.prototype.step = Fluid.prototype.map;
  water.Fluid = water.fluid = MakeFluid;
  
  // Smoke test: A, B, C, D, C == A + B, D == A + B
  if( 1 ){
    var id0 = water(), a = water(), b = water(), c = water(), d = water();
    a.label = "a"; b.label = "b"; c.label = "c"; d.label = "d";
    // c water is made of a and b water, according to some function
    c( water, function(){
      return a(water) && b(water) && a() + b(); } );
    // it waters a function
    water( c, function( v ){ trace( "c is now: " + v ) } );
    // d water is made of a and b water, mixed by some function
    d( water, function(){ 
      return a() + b(); }, [ a, b ] );
    // it waters a function too
    water( d, function( v ){ trace( "d is now: " + v ) } );
    // l is lazy water, available on demand only
    var l = water.demand();
    l._water.label = "l";
    // d water will flows to l, when asked
    d( l );
    // l waters a boxon, once full, you need another one
    l( { boxon: function( _, v ){ trace( "l is now: " + v) } } );
    trace( c(), d() ); // undefined, undefined, a is missing
    // let's pour some "a" water
    trace( "Fire 0 on 'a'" );
    a( 0 );
    trace( c(), d() ); // undefined, NaN, b is missing
    // and then let's pour some "b" water
    trace( "Fire 2 on 'b'" );
    b( 2 );
    // what do we get?
    trace( c(), d() ); // 2 2
    trace( "Fire 3 on 'a'" );
    a( 3 );
    trace( c(), d() ); // 5 5
    // Let's fill a cup of "l" water, it's made of "d" water, "on demand"
    l( function( _, v ){ trace( "l is now: " + v) } );
    
    var fact = water(), fact_out = water(), fact_loop = water();
    fact( water, function( v ){ return [v,1] }, [] );
    fact_loop(  fact, function( v ){
      // trace( "fact", v );
      var n = v[0], total = v[1];
      if( n <= 1 ){
        fact_out( total );
      }else{
        return [ n - 1, n * total ];
      }
    });
    fact_loop( fact_loop );
    water.demand( fact_out )( function( _, v ){ trace( "Fact", v ); } );
    fact( 170 );
    trace( "fact_out", fact_out() );
    var source = water();
    var sink = water();
    //de = true;
    water.fluid()
      .from( source )
        .filter( function( v )   { return v > 0;  }    )
        .map(    function( v )   { return v * 10; }    )
        .reduce( function( p, v ){ return p + v;  }, 0 )
        .tap(    trace )
      .to( sink );
    source( -1 );
    trace( "push 1, get 10" );
    source(  1 );
    source( -2 );
    trace( "push 2, get 30 (10 + 2 * 10)" );
    source(  2 );
    trace( "push 10, get 130 (30 + 10 * 10)" );
    source( 10 );
    trace( sink() );
  }
  
  // Export global Water, platform dependant
  typeof module !== "undefined" && "exports" in module && (module.exports = water);
  typeof global !== "undefined" && (global.Water = water);
  typeof window !== "undefined" && (window.Water = water);

})();

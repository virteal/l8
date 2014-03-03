// water.js
//   reactive things with consequences
//
// Feb 19 2014 by @jhr

"use strict";
(function(){
  
  // My de&&bug( msgs ) and de&&mand( predicate ) darlings
  function bug(){ console.log.apply( console, arguments ); }
  function mand( b ){ if( b )return; de&&bug( "assert error"); throw "water!"; }
  var de = false, trace = bug;
  
  var init_sources = {}; // Sentinel value used to determine sources
  var event        = {}; // Sentinel value when building interop callback
  var propagate    = {}; // Sentinel value for auto propagation
  
  var autodep      = { message: "Water autodep" };
  
  // Default internal error handler, for bugs only, not in production
  var err_handler = function( e ){
    trace( "Water error", e );
    throw e;
  };
  
  // Set by .lazy() to build lazy water sources instead of regular ones
  var lazy_mode = false;
  
  // Set during recursive traversal of sources to detect lazy node to update
  var pending_node;
  
  /*
   *  Dependencies managements. Sources feed destinations that depend on them
   */
  
  // Lists of ancestors, ie recursive list of sources, are somehow cached
  var sources_round = 0;
  
  /*
   *  Dependencies are stored in arrays.
   *  ToDo: use a hash map to avoid O(n) cost?
   */
   
  var fast_item_index = 0;
  
  // Like array.indexOf(), side effect on global fast_item_index
  function fast_index_of( list, member ){
    var ii = 0;
    var item;
    while( item = list[ ii++ ] ){
      if( item === member )return fast_item_index = ii - 1;
    }
    return fast_item_index = -1;
  }
  
  // True if item is in list, side effect on fast_item_index 
  function fast_includes( list, member ){
    return fast_index_of( list, member ) !== -1;
  }
  
  // Insert member at end unless alreay present, side effect on fast_item_index
  function fast_insert( list, member ){
    var ii = 0;
    var item;
    while( item = list[ ii++ ] ){
      if( item === member ){
        fast_item_index = ii - 1;
        return true;
      }
    }
    list[ fast_item_index = ii - 1 ] = member;
    return false;
  }
  
  // Connect a source with a destination. No propagation here, there is
  // some similar code with propagation handling somewhere else.
  function connect( source, destination ){
    var list;
    // Add destination to source's list of dependents
    list = source._deps;
    // If first dep, create list
    if( !list ){
      source._deps = [ destination ];
    // Else, add unless there already
    }else{
      // If already there, no more work to do
      if( ! fast_insert( list, destination ) )return;
    }
    // Invalidate all cached lists of recursive sources, brutal
    // ToDo: revalidate lists that are not impacted
    sources_round++;
    // Add to destination's list of sources
    list = destination._sources;
    if( !list ){
      destination._sources = [ source ];
    }else{
      // Add to existing list, no check, it's not there already
      de&&mand( !fast_includes( list, source ) );
      list[ list.length ] = source;
    }
  }
  
  // Disconnect a source from a destination
  function disconnect( source, destination ){
    var list;
    // Remove from source's list of dependents
    list = source._deps;
    // Empty list? nothing to remove
    if( !list )return;
    // Not in list? nothing to remove
    if( !fast_includes( list, destination ) )return;
    // If in list, change entry into no-op. In reciprocal case too.
    list[ fast_item_index ] = noop;
    // Now remove reciprocal relationship, ie remove from destination's sources
    list = destination._sources;
    list[ fast_index_of( list, source ) ] = noop;
    // Invalidate all cached lists of recursive sources, brutal
    sources_round++;
    // ToDo: revalidate lists that are not impacted
    // Strategy to compact lists, ie remove no-ops, but not too often
    if( !source._dep_compact_queued ){
      source._dep_compact_queue = true;
      sources_compact_queue.push( source );
    }
    if( !destination._src_compact_queued ){
      destination._src_compact_queued = true;
      destinations_compact_queue.push( destination );
    }
    // After enough changes, it's probably a good idea to compact
    if( ++compact_holes % 1000 ){
      compact_dependencies();
    }
  }
  
  // Compaction of dependencies lists, when enough holes in them
  var compact_holes = 0;
  var sources_compact_queue      = [];
  var destinations_compact_queue = [];
  
  // Compact dependency lists, to remove "no-op" holes in them
  function compact_dependencies(){
    var ii;
    var queue;
    var jj;
    var list;
    var item;
    var buf;
    // Compact sources lists
    queue = sources_compact_queue;
    ii = 0;
    var destination;
    while( destination = queue[ ii++ ] ){
      list = list._sources;
      buf = [];
      jj = 0;
      while( item = list[ jj++ ] ){
        if( item !== noop ){
          buf.push( item );
        }
      }
      destination._sources = buf;
      destination._src_compact_queued = false;
    }
    // Compact destination lists
    queue = destinations_compact_queue;
    ii = 0;
    var source;
    while( source = queue[ ii++ ] ){
      list = list._deps;
      buf = [];
      jj = 0;
      while( item = list[ jj++ ] ){
        if( item !== noop ){
          buf.push( item );
        }
      }
      source._deps = buf;
      source._dep_compact_queued = false;
    }
  }
  
  // True if destination depends on source, directly or indirectly
  function depends_on( destination, source ){
    var ii = 0;
    // Cannot depend on itself
    if( source === destination )return false;
    // False if no more sources to check
    var sources = destination._sources;
    if( !sources )return false;
    var item;
    // Check each source that destination depends on
    while( item = sources[ ii++ ] ){
      // Return true if searched source is found among destination's sources
      if( item === source )return true;
      // Also return true if a destination's source depends on searched source
      // ToDo: stack overflow?
      if( depends_on( item, source ) )return true;
    }
    return false;
  }
  
  /*
   *  Delivery of value updates should happen once per round. Ie if same
   *  dependent is impacted multiple times, it's better to update it once
   *  only, using last update.
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
    var ii = 0;
    var jj;
    var sources;
    var source;
    var slot;
    var cb;
    var old   = water.current;
    var old_f = water.transform;
    var old_b = water.callback;
    // ToDo: should not create new round until queue is empty
    de&&bug( "End of round", water.round );
    water.round++;
    // ToDo: should not clear queue until fully processed
    queue = [];
    de&&bug( "Deliver", list.length, "changes" );
    // Consume queue, by progressively removing top level sources
    var count = 0;
    // Bluid list of all changed sources
    var sources = [];
    ii = 0;
    while( slot = list[ ii++ ] ){
      sources.push( slot.cb );
    }
    // Loop until count of processed entries cover whole queue
    while( count < list.length  ){
      count = 0;
      ii    = 0;
      while( slot = list[ ii++ ] ){
        // Skip already processed entry
        if( slot === noop ){
          count++;
          continue;
        }
        de&&bug( "Deliver change on water", slot.water.id );
        // Do not call cb if it still depends on something
        // that could change. IE if something it depends on is in the queue.
        cb = slot.cb;
        jj = 0;
        while( source = sources[ jj++ ] ){
          if( source === noop )continue;
          de&&mand( cb._water );
          if( depends_on( cb, source ) )break;
        }
        if( source )break;
        water.current   = slot.water;
        water.transform = cb;
        water.callback  = cb;
        try_apply( cb, cb, slot.args );
        // Mark processed entry
        list[ ii - 1 ] = sources[ ii - 1 ] = noop;
        count++;
      }
    }
    water.current   = old;
    water.transform = old_f;
    water.callback  = old_b;
    dispatch();
  }
  
  function transform_call( transform, h2o, val ){
    try{
      water.current  = h2o;
      water.prologue = h2o;
      return transform.call( water.it = h2o, val );
    }catch( err ){
      // Filter out access error during transform prologue
      if( err && err.water && err.error === autodep )return;
      // Turn exception into error value
      return { water: h2o, error: err } ;
    }finally{
      water.current  = null;
      water.prologue = null;
    }
  }
  
  function try_call( f, target, arg1, arg2 ){
    try{ f.call( water.it = target, arg1, arg2 ); }catch( err ){ error( err ) }
  }
  
  function try_apply( f, target, args ){
    try{ f.apply( water.it = target, args ) }catch( err ){ error( err) }
  }
  
  function noop(){}
  
  /*
   *  Water object are functions, with some enhancements
   */
  
  var water = function(){
    
    // Instance members, enclosed in closure
    var current;
    var is_lazy, dirty, pending;
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
        // Ask each source to update the pending node, recursive
        while( w = h2o._sources[ ii++ ] ){ w() }
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
      if( h2o._deps ){
        var f;
        for( var ii = 0 ; f = h2o._deps[ ii ] ; ii++ ){
          // Update it, in "auto" mode
          delivery( h2o, f )( now, propagate );
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
    
    function async_update_error( error ){
      nested--;
      de&&bug( "Async error", nested );
      update( water.fail( error ) );
    }
    
    function async_update_cb( err, value ){
      nested--;
      de&&bug( "Async cb", nested );
      if( err ){ value = water.fail( err ); }
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
            pending_node( current, propagate );
          }
          return;
        }
        // Add an autodep if invoked from a transform prologue
        if( water.prologue ){
          de&&bug( "prologue autodep", h2o.id, "->", water.prologue.id );
          h2o( water.prologue );
        }
        // Return cached value, or throw an exception
        if( typeof current !== "undefined" ){
          // If { water: w, error: e } error, throw it
          if( current.water )throw current.error;
          return current;
        }
        // Abort computation if access from a transform fn, catcher adds dep
        if( water.prologue )throw { water: h2o, error: autodep };
        return;
      }
      
      var ready;
      var ii;
      var w;
      
      // b( another_water [, remove_flag] ), add/remove a dependent node
      if( val && val._water && typeof auto !== "function" ){
        val = val._water;
        if( auto ){
          disconnect( val, h2o );
          return h2o;
        //  Called on source, add node to list of deps & then update node  
        }else{
          if( !h2o._deps ){
            de&&bug( "First explicit dep", h2o.id, "->", val.id );
            h2o._deps = [];
          }
          // some true value when available, or else 'undefined'
          ready = current || (typeof current !== "undefined") || void 0;
          ii = 0;
          while( ( w = h2o._deps[ ii++ ] ) && ( w !== val ) ){} // vs slow indexOf
          // Only if not already present
          if( !w ){
            de&&bug( "Explicit dep", h2o.id, val.id );
            h2o._deps.push( val );
            if( !val._sources ){
              val._sources = [ h2o ];
            }else{
              val._sources.push( h2o );
              // List of all sources will have to be recomputed
            }
            // All lists of sources will have to be recomputed
            // ToDo: figure out a finer granularity
            sources_round++;
            // If source is dirty, schedule refresh, will update all deps
            // ToDo: should avoid that, node is lazy for a reason...
            if( dirty ){
              // Unless already done before
              if( !pending ){ wakeup() }
              ready = false;
            // If source is available, tell dep about it
            }else if( typeof current !== "undefined" ){
              try_call( val, val, current, propagate );
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
          connect( h2o, water.current );
          return ready;
        }
        
        // b( water, water ) on lazy water creates a demand, private
        if( auto === water && is_lazy ){
          var f = function( cb ){
            if( arguments.length === 0 )return h2o();
            if( cb === water )return h2o( water );
            return h2o( water, cb );
          };
          f._water = h2o;
          return f;
        }
        
        // b( water, cb ) on lazy water, attach a callback
        if( arguments.length === 2 && is_lazy ){
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
          var init_src;
          ii = 0;
          // Tell each source to feed this node
          while( w = src[ii++] ){
            if( w._water ){
              w._water( h2o );
              if( ready = ready && typeof w._water() !== "undefined" && !init_src ){
                init_src = w._water;
              }
            // Push data if it is not a water source
            }else{
              h2o( w );
            }
          }
          // If all sources are ready, use first one to start feeding node
          ready && init_src && h2o( init_src() );
        // If sources are specified by transform function itself
        }else{
          h2o( init_sources );
        }
        return h2o;
      }
      
      // b( value ), setter
      if( typeof val !== "undefined" ){
        
        // If automatic propagation
        if( auto === propagate ){
          // Lazy propagation if node is lazy
          if( is_lazy && !pending ){
            if( dirty )return;
            dirty = true;
            // Will propagate a pseudo value, a sentinel, to avoid recompute
            val = lazy;
          }
        // If user initiated update
        }else{
          if( arguments.length > 1 ){
            val = Array.prototype.slice( arguments );
          }
        }
        
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
          now = transform_call( transform, h2o, val === init_sources ? void 0 : val );
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
            then.call( now, async_update, async_update_error );
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
    
    // Dependencies
    h2o.sources = h2o.deps = null;
    h2o._src_compact_queued = h2o._dep_compact_queued = false;
    
    // Lazy mode creates lazy nodes, such nodes need to know their sources
    if( lazy_mode ){
      is_lazy = true;
      dirty   = true;
    }
    
    if( arguments.length ){
      h2o.apply( this, arguments );
    }
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
      if( arguments.length ){
        var cb;
        // If last argument is a cb, is it not a source
        if( typeof ( cb = arguments[ arguments.length - 1 ] ) === "function " ){
          // Flatten and then add sources, not including the last argument
          if( arguments.length > 1 ){
            recur( w, Array.protototype.slice( 0, arguments.length - 1 ) );
          }
          w( water, cb );
        // Flatten and then add sources
        }else{
          recur( w, arguments );
          cb = null;
        }
      }
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
  
  water.void    = function( v ){ return typeof v === "undefined" || void 0; };
  
  water.failure = function( v ){ return v && v.water && v.error && v;  };
  
  water.success = function( v ){
    return (v && !v.water && v )
    || (typeof v !== "undefined" && (v || true) );
  };
  water.water = function( w ){ return (w && w._water) || void 0; };
  
  water.fail = function( e ){
    return { water: (water.current || water), error: e || water.end };
  };
  
  water.end = function( v ){
    return v && v.water && v.error === water.end && v;
  };
  
  water.wrap = function( x ){
    if( typeof x === "undefined" )return { water_wrapped: true, value: x };
    if( !x )return x;
    if( x._water
    ||  x.water
    ||  x.then
    ||  x.boxon
    )return { water_wrapped: true, value: x };
    return x;
  };
  
  water.unwrap = function( x ){ 
    return !x ? x : ( x.water_wrapped ? x.value : x );
  };
  
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
  water.id        = 1;
  water.it        = null;
  water.current   = null;
  water.prologue  = false;
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
        try{
          water.current   = current;
          water.transform = cb_ctx;
          water.callback  = cb_cb;
          return cb.apply( water.it = that, arguments );
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
  
  // Sentinel for access error to not ready water
  water.access = autodep;
  
  /*
   *  Fluid. Streams of water, with a "fluid" API
   */
  
  function Fluid(){}
  Fluid.prototype = {
    
    closed: false,
    
    factory: function( w ){
      this._water = (w && w._water) || water.apply( null, arguments );
      return this;
    },
    
    toString: function(){
      if( !this.label )return "Fluid" + this._water.id;
      return "Fluid" + this._water.id + "[" + this.label + "]";
    },
    
    close: function(){
      if( this.closed )return this;
      this.closed = true;
      this._water( { water: this, error: water.end } );
      return this;
    },
    
    water: function(){ return this._water; },
    
    push: function( x ){ 
      if( this.closed )return this;
      this._water( x );
      return this;
    },
    
    callback: function( dflt ){
      if( arguments.length === 0 ){ dflt = water; }
      return this._water( dflt, water );
    },
    
    concat: function(){
      var that = this;
      Array.prototype.slice( arguments ).forEach( function( a ){
        if( a ){
          if( a._water){
            that.from( a );
          }else{
            a.forEach( function( v ){ that.push( v ); } );
          }
        }
      });
    },
    
    fail: function( e ){ return this.push( water.fail( e ) ); },
    
    value: function(){ return this._water(); },
    
    filter: function( p ){
      var f = MakeFluid( water( this._water, function( v ){
        if( v && v.water )return v;
        if( p.call( fluid.it = water.it = f, v ) )return v;
      }));
      return f;
    },
    
    find: function( p ){
      var index = 0;
      var ctx = arguments.length > 1 ? arguments[1] : void 0;
      var f = MakeFluid( water( this._water, function( v ){
        if( v && v.water )return v;
        fluid.it = f;
        if( p.call( water.it = ctx, v, index++, f ) )return v;
      }));
      return f;
    },
    
    findIndex: function( p ){
      var index = 0;
      var ctx = arguments.length > 1 ? arguments[1] : void 0;
      var f = MakeFluid( water( this._water, function( v ){
        if( v && v.water )return v;
        fluid.it = f;
        if( p.call( water.it = ctx, v, index++, f ) )return index - 1;
        return -1;
      }));
      return f;
    },

    indexOf: function( elem ){
      var from  = arguments.length ? arguments[1] : 0;
      var index = 0;
      var f = MakeFluid( water( this._water, function( v ){
        if( v && v.water )return v;
        if( index < from || v !== elem ){
          index++;
          return -1;
        }
        return index++;
      }));
      return f;
    },

    join: function( ){
      var sep = arguments.length ? arguments[0] : ",";
      var str;
      var f = MakeFluid( water( this._water, function( v ){
        if( v && v.water )return v;
        if( !str ){
          str = "" + v;
        }else{
          str = str + sep + v;
        }
        return str;
      }));
      return f;
    },

    reject: function( p ){
      var f = MakeFluid( water( this._water, function( v ){
        if( v && v.water )return v;
        if( !p.call( f, v ) )return v;
      }));
      return f;
    },
    
    map: function( p ){
      var ctx = arguments.length > 1 ? arguments[1] : void 0;
      var index = 0;
      var f = MakeFluid( water( this._water, function( v ){
        if( v && v.water )return v;
        fluid.it = f;
        return p.call( water.it = ctx, v, index++, f );
      }));
      return f;
    },
    
    forEach: function( cb ){
      var ctx = arguments.length > 1 ? arguments[1] : void 0;
      var index = 0;
      this.tap( function( v ){
        cb.call( water.it = ctx, v, index++, this ); }
      );
      return this;
    },
    
    every: function( cb ){
      var ctx = arguments.length > 1 ? arguments[1] : void 0;
      var done = false;
      var index = 0;
      this.tap( function( v ){
        if( done )return;
        done = !cb.call( water.it = ctx, v, index++, this );
      });
      return this;
    },
    
    some: function( cb ){
      var ctx = arguments.length > 1 ? arguments[1] : void 0;
      var done = false;
      var index = 0;
      this.tap( function( v ){
        if( done )return;
        done = cb.call( water.it = ctx, v, index++, this );
      });
      return this;
    },
    
    error: function( p ){
      var that = this;
      var f = MakeFluid( water( this._water, function( v ){
        if( !v.water )return;
        fluid.it = f;
        return p.call( water.it = that, v.error );
      }));
      return f;
    },
    
    reduce: function( p, init ){
      var index = 0;
      var f = MakeFluid( water( water, function( v ){
        if( v && v.water )return v;
        // If no init value, use first value as initial value
        if( typeof init === "undefined" ){
          init = v;
          return;
        }
        var r = p.call( fluid.it = water.it = f, init, v, index++, f );
        // Remember result for next round, unless undefined or error
        if( typeof r !== "undefined"
        && ( !r || !r.water )
        ){
          init = r;
        }
        return r;
      }, [this._water] ) );
      return f;
    },
    
    tap: function( p ){
      var that = this;
      water.demand( this._water )( function( err, v ){
        water.again();
        if( err )return;
        p.call( fluid.it = water.it = that, v );
      });
      return this;
    },
    
    log: function( msg ){ 
      if( !arguments.length )return this.tap( trace );
      return this.tap( function( v ){
        trace( msg, v );
      });
    },
    
    stateful: function(){
      if( this._state && this._state.a && !arguments.length )return this;
      var tap_done = this.state;
      if( arguments.length ){
        if( this._state ){
          this._state.a = arguments[0];
        }else{
          this._state = { a: arguments[0] };
        }
      }
      if( !tap_done ){
        this.tap( function( v ){
          if( this._state.a && water.success( v ) ){ this._state.a.push( v ); } 
        });
      }
      return this;
    },
    
    stateless: function(){
      if( !this._state )return this;
      this._state.a = null;
      return this;
    },
    
    state: function(){
      if( !arguments.length )return this._state && this._state.a;
      var idx = arguments[0];
      if( idx >= 0 )return this._state.a[idx];
      var a = this._state.a;
      idx = a.length + idx;
      if( idx < 0 )return;
      if( arguments.length > 1 )return a[idx] = arguments[2];
      return a[idx];
    },
    
    once: function( p ){
      var that = this;
      water.demand( this._water )( function( err, v ){
        if( err ){
          water.again();
          return;
        }
        p.call( fluid.it = water.it = that, v );
      });
      return this;
    },
    
    from: function( source, remove ){
      if( source && source._water ){
        source._water( this._water, remove );
        return this;
      }
      // Interop with l8 parole pipes
      if( source.pipe && source.push ){
        source.pipe( this );
        return this;
      }
      if( source && source.forEach ){
        var that = this;
        source.forEach( function( v ){ that.push( v ); } );
        return this;
      }
      if( arguments.length ){
        this.push( source );
        return this;
      }
      return this;
    },
    
    _to: function(){},
    
    to: function( destination, remove ){
      if( destination ){
        if( destination._water ){
          this._water( destination._water, remove );
          return this;
        // Interop with l8 parale pipes
        }else if( destination.pipe && destination.push ){
          var bridge = destination._water_in_bridge;
          if( !remove && !bridge ){
            bridge = water( this._water, function( v ){
              if( water.success( v ) ){ destination.push( v ); }
            });
            destination._water_in_bridge = bridge;
          }
          if( bridge ){ this._water( bridge, remove ); }
        }
      }
      var f = MakeFluid();
      this.to( f );
      if( typeof destination === "function" ){
        var args = Array.slice.call( arguments );
        args[0] = this;
        fluid.it = f;
        destination.apply( water.it = f, args );
        return this;
      }
      return f;
    },
    
    // ToDo: implement _to(),_from() logic
    _from: function(){}
  };
  Fluid.prototype.where     = Fluid.prototype.select = Fluid.prototype.filter;
  Fluid.prototype.step      = Fluid.prototype.map;
  Fluid.prototype.subscribe = Fluid.prototype.tap;
  Fluid.prototype.pipe      = Fluid.prototype.to; // l8 "pipe" protocol
  Fluid.prototype.catch     = Fluid.failure;
  
  function MakeFluid( w ){
    var f = new Fluid();
    return f.factory.apply( fluid.it = water.it = f, arguments );
  }
  var fluid = water.Fluid = water.fluid = MakeFluid;
  
  MakeFluid.mixin = function( x, klass ){
    if( !klass ){ klass = Fluid; }
    if( x ){
      for( var key in x ){
        if( x.hasOwnProperty( key ) ){
          klass.prototype[ key ] = x[ key ];
        }
      }
    }
    return klass;
  };
  
  // Smoke test
  if( 1 ){
    
    // A, B, C, D where C == A + B, D == A + B
    var a = water();
    var b = water();
    var c = water();
    var d = water();
    a.label = "a"; b.label = "b"; c.label = "c"; d.label = "d";
    // c water is made of a and b water, according to some function
    c( water, function(){
      // return a(water) && b(water) && a() + b();
      trace( "Compute C" );
      return a() + b();
    } );
    // it waters a function
    water( c, function( v ){ trace( "c is now: " + v ) } );
    // d water is made of a and b water, mixed by some function
    d( water, function(){ 
      trace( "Compute D" );
      return a() + b(); }, [ a, b ] );
    // it waters a function too
    water( d, function( v ){ trace( "d is now: " + v ) } );
    // l is lazy water, available on demand only
    var l = water.demand();
    l._water.label = "l";
    // d water will flows to l, when asked
    d( l );
    // ask l to water a boxon, once full, you need another one
    l( { boxon: function( _, v ){ trace( "l is now: " + v) } } );
    trace( c(), d() ); // undefined, undefined, a is missing
    // let's pour some "a" water
    trace( "Fire 0 on 'a'" );
    a( 0 );
    trace( c(), d() ); // undefined, undefined, b is missing
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
    
    // Diamong DAG, without unecessary recomputations
    var A = water( 0 );
    var B = water();
    var C = water();
    var D = water();
    B( water, function(){ return A() * 5 } );
    C( water, function(){ return A() * 5 } );
    D( water, function(){ trace( "Compute D" ); return B() + C() } );
    trace( "D is", D() );
    trace( "Fire A using 2" );
    A( 2 );
    trace( "D is now 20:", D() );
    A( 4 );
    trace( "D is now 40:", D() );
    

    // Fact, Fact_loop, Fact_out where Fact_out === factorial( Fact )
    // This is "Turing Complete"
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
    fact( 170 ); // 171! is Infinity
    trace( "fact_out", fact_out() );
    
    // Fluids
    var source  = water();
    var source2 = water();
    var sink    = water();
    //de = true;
    water.fluid()
      .from( source  )
      .from( source2 )
        .filter( function( v )   { return v > 0;  }    )
        .map(    function( v )   { return v * 10; }    )
        .reduce( function( p, v ){ return p + v;  }, 0 )
        .log()
      .to( sink );
    source( -1 );
    trace( "push 1, get 10" );
    source(  1 );
    source( -2 );
    trace( "push 2, get 30 (10 + 2 * 10)" );
    source(  2 );
    trace( "push 10, get 130 (30 + 10 * 10)" );
    source2( 10 );
    trace( "push 1, push 2, get 140, get 150" );
    water.fluid().to( source2 ).from( [ 1, 1 ] ); 
    trace( sink() );
    de&&mand( sink() === 150 );
  }
  
  // Export global Water, platform dependant
  typeof module !== "undefined" && "exports" in module && (module.exports = water);
  typeof global !== "undefined" && (global.Water = water);
  typeof window !== "undefined" && (window.Water = water);

})();

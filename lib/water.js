// water.js
//   reactive things with consequences
//
// Feb 19 2014 by @jhr

"use strict";
(function(){
  
  // My de&&bug( msgs ) and de&&mand( predicate ) darlings
  function bug(){ 
    console.log.apply( console, arguments );
    if( arguments.length
    &&  arguments[0]
    &&  arguments[0].indexOf
    &&  arguments[0].indexOf( "DEBUGGER" ) !==  -1 
    )debugger;
  }
  function mand( b ){
    if( b )return;
    debugger;
    throw "water!";
  }
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
  
  // Set by .demand() to build lazy water sources instead of regular ones
  var lazy_mode = false;
  
  // Set during recursive traversal of sources to detect lazy node to update
  var pending_node;
  
  /*
   *  Dependencies managements. Sources feed destinations that depend on them
   */
  
  // Lists of ancestors, ie recursive list of sources, are somehow cached
  var sources_round = 0;  // ToDo: implement this?
  
  /*
   *  Dependencies are stored in arrays.
   *  ToDo: use a hash map to avoid O(n) cost?
   */
   
  var fast_item_index = 0;
  
  // Like array.indexOf(), side effect on global fast_item_index
  function fast_index_of( list, member ){
    de&&mand( list );
    var ii = 0;
    var item;
    while( item = list[ ii++ ] ){
      if( item === member )return fast_item_index = ii - 1;
    }
    return fast_item_index = -1;
  }
  
  // True if item is in list, side effect on fast_item_index 
  function fast_includes( list, member ){
    return list && fast_index_of( list, member ) !== -1;
  }
  
  // Insert member at end unless alreay present, side effect on fast_item_index
  // Return true if insert, return false if alredy present
  function fast_insert( list, member ){
    de&&mand( list );
    var ii = 0;
    var item;
    while( item = list[ ii++ ] ){
      if( item === member ){
        fast_item_index = ii - 1;
        return false;
      }
    }
    list[ fast_item_index = ii - 1 ] = member;
    return true;
  }
  
  // Connect a source with a destination. No propagation here, there is
  // some similar code with propagation handling somewhere else.
  // Return true if new connection, return false if already connected.
  function connect( source, destination ){
    source      = source._water;
    destination = destination._water;
    var list;
    // Add destination to source's list of dependents
    list = source._deps;
    // If first dep, create list
    if( !list ){
      source._deps = [ destination ];
    // Else, add unless there already
    }else{
      // If already there, no more work to do
      if( !fast_insert( list, destination ) ){
        de&&mand( fast_includes( source._deps,         destination ) );
        de&&mand( fast_includes( destination._sources, source      ) );
        de&&bug( "Already connected", source.id, "->", destination.id );
        return false;;
      }
    }
    de&&mand( fast_includes( source._deps, destination ) );
    // Source processed, now process destination
    sources_round++;
    // Add to destination's list of sources
    de&&mand( !fast_includes( destination._sources, source ) );
    list = destination._sources;
    if( !list ){
      destination._sources = [ source ];
    }else{
      // Add to existing list, no check, it's not there already
      de&&mand( !fast_includes( list, source ) );
      list[ list.length ] = source;
    }
    de&&mand( fast_includes( source._deps,         destination ) );
    de&&mand( fast_includes( destination._sources, source      ) );
    de&&bug( "New connection", source.id,
      source.label ? "[" + source.label + "]" : "", 
      "->", destination.id,
      destination.label ? "[" + destination.label + "]" : ""
    );
    de&&mand( !connect( source, destination ) );
    // Invalidate all cached lists of recursive sources, brutal
    // ToDo: revalidate lists that are not impacted
    return true;
  }
  
  // Disconnect a source from a destination
  // Return true if disconnected, return false if was already not connected
  function disconnect( source, destination ){
    source      = source._water;
    destination = destination._water;
    var list;
    // Remove from source's list of dependents
    list = source._deps;
    // Empty list? nothing to remove
    if( !list )return false;
    // Not in list? nothing to remove
    if( !fast_includes( list, destination ) ){
      de&&mand( !fast_includes( source._deps,         destination ) );
      de&&mand( !fast_includes( destination._sources, source      ) );
      de&&bug( "Already removed connection", source.id, "->", destination.id );
      return false;
    }
    de&&mand( fast_includes( source._deps,         destination ) );
    de&&mand( fast_includes( destination._sources, source      ) );
    // If in list, change entry into no-op. In reciprocal case too.
    list[ fast_item_index ] = noop;
    // Now remove reciprocal relationship, ie remove from destination's sources
    list = destination._sources;
    de&&mand( fast_includes( list, source ) );
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
    de&&mand( !fast_includes( source._deps,         destination ) );
    de&&mand( !fast_includes( destination._sources, source      ) );
    de&&bug( "Removed connection", source.id, "->", destination.id );
    de&&mand( !disconnect( source, destination ) );
    return true;
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
   
  var nested  = 0;
  var queue   = [];
  var effects = [];
  
  function delivery( h2o, destination ){
    de&&mand( h2o         && h2o._water                        );
    de&&mand( destination && typeof destination === "function" );
    // First phase of delivery keeps last updated value only and queue callback
    var slot;
    if( destination._round === water.round )return destination._deliverer;
    destination._round = water.round;
    return destination._deliverer = function(){
      // If called for the first time
      if( !slot ){
        de&&bug( "Visit, ctx:", h2o.id, "destination:", destination.id, "args:", 
        (arguments[0] && arguments[0].water)
        ? "Water.error: " + arguments[0].error
        : "" + arguments[0]
        );
        queue.push( slot = { water: h2o, destination: destination, args: arguments } );
      // If another call, just override previous arguments
      }else{
        de&&bug( "Revisit, ctx:", h2o.id, "destination:", destination.id, "args:", 
        (arguments[0] && arguments[0].water)
        ? "Water.error: " + arguments[0].error
        : "" + arguments[0]
        );
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
      de&&bug( "End of round", water.round );
      water.round++;
      var ii = 0;
      var item;
      var list = effects;
      effects = [];
      if( !list.length )return;
      while( item = list[ ii++ ] ){
        // ToDo: err handling
        item();
      }
    }
    // Don't reenter dispatch(), only one loop is active
    nested++;
    de&&bug( "Dispatch()" );
    var list = queue;
    var ii = 0;
    var jj;
    var source;
    var slot;
    var destination;
    var old   = water.source;
    var old_f = water.transform;
    var old_b = water.callback;
    de&&bug( "Deliver", list.length, "changes" );
    // Consume queue, by progressively removing top level sources
    var count = 0;
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
        // Do not call cb if it still depends on a source that changes too.
        // IE if something it depends on is in the queue and not yet updated.
        destination = slot.destination;
        de&&bug( "Deliver change on", (destination._water && destination.id ) || "callback" );
        jj = 0;
        while( source = list[ jj++ ] ){
          if( source === noop )continue;
          source = source.destination;
          if( destination._water && depends_on( destination, source ) )break;
        }
        if( source )break;
        water.current   = slot.water;
        water.transform = destination;
        water.callback  = destination;
        // Mark processed entry
        list[ ii - 1 ] = noop;
        count++;
        // Enable cycling changes
        destination._round = 0;
        // Propagate change
        try_apply( destination, destination, slot.args );
        if( nested > 1 )break;
      }
      if( nested > 1 )break;
    }
    water.current   = old;
    water.transform = old_f;
    water.callback  = old_b;
    if( nested === 1 ){ queue = []; }
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
    try{ return f.call( water.it = target, arg1, arg2 );
    }catch( err ){ return water.error( err ); }
  }
  
  function try_apply( f, target, args ){
    try{ return f.apply( water.it = target, args );
    }catch( err ){ return water.error( err); }
  }
  
  function noop(){}
  
  /*
   *  Water object are functions, with some enhancements
   */
  
  var water = function(){
    
    // Instance members, enclosed in closure
    var current;
    var dirty, pending;
    var transform;
    var callbacks;
    
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
      if( now === demand ){
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
        if( callbacks ){
          var list = callbacks;
          callbacks = null;
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

    var h2o = function a_water( val, auto ){
      
      var source, destination;
      
      // b( demand ) is special, private, signals dirtyness
      if( val === demand )return update( demand );

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
          connect( h2o, water.prologue ); // source, destination
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
      
      var ready, ii, w;
      
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
        
        // b( water, dest [, remove_flag] ) setup a b->dest connection
        if( auto && auto._water ){
          source      = h2o;
          destination = auto._water;
          if( arguments[2] ){
            return disconnect( source, destination );
          }
          //  Called on source, add node to list of deps & then update node
          if( !source._deps ){
            de&&bug( "First explicit dep", source.id, "->", destination.id );
            source._deps = [];
          }
          // Source has some (true) value when available, or else 'undefined'
          ready = current || (typeof current !== "undefined") || void 0;
          ii = 0;
          while( ( w = source._deps[ ii++ ] ) && ( w !== destination ) ){}
          // Only if not already present, ie not a dep yet
          if( w ){
            de&&mand( fast_includes( source._deps,         destination ) );
            de&&mand( fast_includes( destination._sources, source      ) );
          }else{
            de&&bug( "Explicit dep", source.id, "->", destination.id );
            de&&mand( !fast_includes( source._deps,         destination ) );
            de&&mand( !fast_includes( destination._sources, source      ) );
            source._deps.push( destination );
            if( !destination._sources ){
              destination._sources = [ source ];
            }else{
              destination._sources.push( source );
              // List of all sources will have to be recomputed
            }
            de&&mand( fast_includes( source._deps,         destination ) );
            de&&mand( fast_includes( destination._sources, source      ) );
            de&&bug( "New water connection", source.id,
              source.label ? "[" + source.label + "]" : "", 
              "->", destination.id,
              destination.label ? "[" + destination.label + "]" : ""
            );
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
              try_call( destination, destination, current, propagate );
            }
          }
          // Contract, dest is in src.deps & src is in dest.srcs
          de&&mand( fast_includes( source._deps,         destination ) );
          de&&mand( fast_includes( destination._sources, source      ) );
          // Return something true if source is ready
          return ready;
        }
        
        // b( water, water, default ) returns a nodejs style callback that pours water
        if( auto === water && arguments.length === 3 ){
          val = arguments[2];
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
                h2o( val === water.error ? { water: h2o, error: err } : val );
              }else if( arguments.length <= 2 ){
                h2o( arguments[1] );
              }else{
                h2o( Array.prototype.slice.call( arguments, 1 ) );
              }
            };
          }
        }
          
         // b( water, water ) on lazy water creates a demand, private
        if( auto === water && h2o.is_lazy ){
          var f = function( cb ){
            if( arguments.length === 0 )return h2o();
            if( cb === water )return h2o( water );
            return h2o( water, cb );
          };
          f._water = h2o;
          return f;
        }
        
        // b( water, cb ) on lazy water, attach a callback
        if( arguments.length === 2 && h2o.is_lazy ){
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
            if( callbacks ){
              callbacks.push( f3 );
            }else{
              callbacks = [ f3 ];
            }
            // Refresh dirty lazy node, unless already scheduled
            if( dirty && !pending ){ wakeup(); }
          }
          return h2o;
        }

      } // b( water, ... ) cases
      
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
              src = [val._water].concat( Array.prototype.slice.call( arguments[2] ) );
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
              w._water( water, h2o );
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
        
        // b( source_water [, remove_flag] ), add/remove a source node
        if( val && val._water ){
          source      = val._water;
          destination = h2o;
          source( water, destination, auto );
          return h2o;
        }
         
        // If automatic propagation
        if( auto === propagate ){
          // Lazy propagation if node is lazy
          if( h2o.is_lazy && !pending ){
            if( dirty )return;
            dirty = true;
            // Will propagate a pseudo value, a sentinel, to avoid recompute
            val = demand;
          }
        // If user initiated update
        }else{
          if( arguments.length > 1 ){
            val = Array.prototype.slice.call( arguments );
          }
        }
        
        var now;
        
        de&&mand( val !== water );
        
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
        
        if( now === water )debugger;
        de&&mand( now !== water );
        
        // Propagate new value to deps
        if( now ){
          // If new value is async, queue propagation until delivery
          // Until delivery, push operations on node are queued too
          var then;
          if( typeof ( then = now.then ) === "function" ){
            // Delay callback dispatch until async completes
            nested++;
            de&&bug( "Async promise", nested );
            then.call( now, async_update, async_update_error );
          }else if( typeof ( then = now.boxon ) === "function" ){
            // Delay callback dispatch until async completes
            nested++;
            de&&bug( "DEBUGGER Async boxon", nested );
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
    
    if( de ){
      h2o.toString = function(){
        return "Water" + this.id + (this.label ? "[" + this.label + "]" : "" );
      };
    }
    
    // Dependencies
    h2o.sources = h2o.deps = null;
    h2o._src_compact_queued = h2o._dep_compact_queued = false;
    
    // Lazy mode creates lazy nodes
    if( h2o.is_lazy = lazy_mode ){
      dirty = true;
    }
    
    if( arguments.length ){
      h2o.apply( this, arguments );
    }
    if( !transform ){ transform = idem; }
    return h2o;
    
  }; // End of water()
  
  
  water.connect    = connect;
  water.disconnect = disconnect;
  
  var demand = function(){
    try{
      lazy_mode = true;
      var w = water( water, water );
      var recur = function( w, list ){
        var item;
        var ii = 0;
        while( item = list[ ii++ ] ){
          if( item._water ){
            item._water( water, w );
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
  water.demand = demand;
  
  water.lazy = function( x, v ){
    if( arguments.length < 2 )return x.is_lazy;
    if( !( x.is_lazy = !!v ) ){
      x();
    }
    return x;
  };
  
  water.filler = function( x, dflt ){ return x( water, water, dflt ); };
  
  var idem = function( x ){ return x };
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
  
  water.async = function( v ){
    return v
    && ( typeof v.then === "function" || typeof v.boxon === "function " );
  };
  
  water.wrap = function( x ){
    if( typeof x === "undefined" )return { water_wrapped: true, value: x };
    if( !x )return x;
    if( x._water
    ||  x.water
    ||  typeof x.then  === "function"
    ||  typeof x.boxon === "function"
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
  
  water.effect = function( cb ){ effects.push(    cb ); };
  water.back   = function( cb ){ effects.unshift( cb ); };
  
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
  
  // Simple boxon implementation. See boxon.js for a more elaborated one.
  water.boxon = function(){
    var done;
    var cbs = [];
    var box = function(){
      if( done )return;
      if( arguments.length > 2 ){
        done = [null].concat( Array.prototype.slice.call( 1 ) );
      }else{
        done = arguments;
      }
      var ii = 0;
      var cb;
      while( cb = cbs[ ii++ ] ){
        cb.call( box, done );
      }
      cbs = null;
    };
    box.boxon = function( cb ){
      if( typeof cb !== "function" )return box.call( box, arguments );
      if( !done ){
        cbs.push( cb );
      }else{
        cb.call( box, done );
      }
    };
    return box;
  };
  water.boxon.cast = function( p ){
    var box = water.boxon();
    var boxon = p.boxon;
    if( boxon ){
      boxon.call( boxon, box );
      return box;
    }
    var then = p.then;
    if( then ){
      then.call( p,
        function( err ){ box( err || water.fail( err ) ); },
        function( r   ){ box( null, r ); }
      );
      return box;
    }
    box( null, p );
    return box;
  };
  
  water.define = function( f ){
    var inp = water();
    var out = water();
    var demand = water.demand( out );
    f( inp, out );
    return function( v, cb ){
      if( arguments.length === 1 )return inp( v ), out();
      var cb = arguments[1];
      water.effect( function(){
        demand( cb );
        inp( v );
      } );
    };
  };
  
  // Sentinel for access error to not ready water
  water.access = autodep;
  
  
  /* --------------------------------------------------------------------------
   *  Fluid. Streams of water, with a "fluid" API
   */
  
  function Fluid(){}
  var stack = [];
  Fluid.prototype = {
    
    closed: false,
    
    make: MakeFluid,
    
    initialize: function( w ){
      this._water = (w && w._water) || water.apply( null, arguments );
      return this;
    },
    
    toString: function(){
      if( !this._label )return "Fluid" + this._water.id;
      return "Fluid" + this._water.id + "[" + this._label + "]";
    },
    
    label: function(){
      if( !arguments.length )return this._water.label;
      this._water.label = arguments[0];
      return this;
    },
    
    close: function(){
      if( this.closed )return this;
      this.closed = true;
      this._water( { water: this, error: water.end } );
      return this;
    },
    
    water: function(){ return this._water; },
    
    push: function( x ){ 
      if( this.closed || typeof x === "undefined" )return this;
      // Bufferize if some propagation is running
      if( !nested ){
        this._water( x );
      }else{
        var that = this;
        effects.push( function(){
          that.push( x );
        });
      }
      return this;
    },
    
    _push: function( x ){ 
      if( this.closed || typeof x === "undefined" )return this;
      this._water( x );
      return this;
    },
    
    filler: function( dflt ){
      if( arguments.length === 0 ){ dflt = water; }
      return this._water( dflt, water );
    },
    
    concat: function(){
      var that = this;
      Array.prototype.slice.call( arguments ).forEach( function( a ){
        if( a ){
          if( a._water ){
            that.from( a );
          }else{
            a.forEach( function( v ){ that.push( v ); } );
          }
        }
      });
    },
    
    fail: function( e ){ return this._push( water.fail( e ) ); },
    
    value: function(){ return this._water(); },
    
    filter: function( p ){
      var f = this.make( water( this._water, function( v ){
        if( v && v.water )return v;
        if( typeof p !== "function" ){
          if( p )return v;
          return;
        }
        var r = try_call( p, fluid.it = water.it = f, v );
        if( r )return r.water ? r : v;
      }));
      return f;
    },
    
    find: function( p ){
      var index = 0;
      var ctx = arguments.length > 1 ? arguments[1] : void 0;
      var f = this.make( water( this._water, function( v ){
        if( v && v.water )return v;
        if( typeof p !== "function" ){
          index++;
          if( v === p )return v;
          return;
        }
        fluid.it = f;
        var r = try_call( p, water.it = ctx, v, index++, f );
        if( r )return r.water ? r : v;
      }));
      return f;
    },
    
    findIndex: function( p ){
      var index = 0;
      var ctx = arguments.length > 1 ? arguments[1] : void 0;
      var f = this.make( water( this._water, function( v ){
        if( v && v.water )return v;
        if( typeof p !== "function" ){
          index++;
          if( v === p )return index - 1;
          return;
        }
        fluid.it = f;
        var r = try_call( p, water.it = ctx, v, index++, f );
        if( r )return r.water ? r : index - 1;
        return;
      }));
      return f;
    },

    indexOf: function( elem ){
      var from  = arguments.length ? arguments[1] : 0;
      var index = 0;
      var f = this.make( water( this._water, function( v ){
        if( v && v.water )return v;
        if( index < from || v !== elem ){
          index++;
          return;
        }
        return index++;
      }));
      return f;
    },

    join: function(){
      var sep = arguments.length ? arguments[0] : ",";
      var str;
      var f = this.make( water( this._water, function( v ){
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
      var f = this.make( water( this._water, function( v ){
        if( v && v.water )return v;
        if( typeof p !== "function" ){
          if( v !== p )return v;
          return;
        }
        var r = try_call( p,  f, v );
        if( r && r.water )return v;
        if( !r )return v;
      }));
      return f;
    },
    
    map: function( p ){
      var ctx = arguments.length > 1 ? arguments[1] : void 0;
      var index = 0;
      var f = this.make( water( this._water, function( v ){
        if( v && v.water )return v;
        if( typeof p !== "function" )return p;
        fluid.it = f;
        return try_call( p, water.it = ctx, v, index++, f );
      }));
      return f;
    },
    
    flatten: function(){
      var f = this.make( water( this._water, function( v ){
        if( v && v.water )return v;
        var result = v;
        if( result
        && typeof result !== "string"
        && typeof result.forEach === "function" 
        && !result._water
        ){
          var first;
          var first_done;
          result.forEach( function( v ){
            if( !first_done && typeof v !== "undefined" ){
              first = v;
              first_done = true;
            }else{
              f.push( v );
            }
          } );
          return first;
        }
        return result;
      }));
      return f;
    },
    
    flatmap: function( p ){
      var ctx = arguments.length > 1 ? arguments[1] : void 0;
      var index = 0;
      var f = this.make( water( this._water, function( v ){
        if( v && v.water )return v;
        fluid.it = f;
        var result = try_call( p, water.it = ctx, v, index++, f );
        if( result && result.water )return result;
        if( result
        && typeof result !== "string"
        && typeof result.forEach === "function"
        && !result._water
        ){
          var first;
          var first_done;
          result.forEach( function( v ){
            if( !first_done ){
              first = v;
              first_done = true;
            }else{
              f.push( v );
            }
          } );
          return first;
        }
        return result;
      }));
      return f;
    },
    
    forEach: function( cb ){
      var ctx = arguments.length > 1 ? arguments[1] : void 0;
      var index = 0;
      this.tap( function( v ){
        fluid.it = this;
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
      var f = this.make( water( this._water, function( v ){
        if( !v.water )return;
        fluid.it = f;
        return try_call( p, water.it = that, v.error );
      }));
      return f;
    },
    
    reduce: function( p, init ){
      var index = 0;
      var f = this.make( water( water, function( v ){
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
    
    tap: function( f ){
      var that = this;
      var fl = this.make( water( water, function( v ){
        if( v && v.water )return v;
        f.call( fluid.it = water.it = that, v );
      }, [this._water] ) );
      return this;
    },
    
    log: function( msg ){ 
      if( !arguments.length )return this.tap( trace );
      return this.tap( function( v ){
        trace.apply( null,
          [ msg ].concat( Array.prototype.slice.call( arguments ) )
        );
      });
    },
    
    debug: function( msg ){
      if( !arguments.length ){
        return this.tap( function(){
          if( !de )return;
          trace.apply( null,
            [ "DEBUG", that.toString(), msg ].concat( Array.prototype.slice.call( arguments ) )
          );
        } );
      }
      var that = this;
      return this.tap( function( v ){
        if( !de )return;
        trace.apply( null,
          [ "DEBUG", that.toString(), msg ].concat( Array.prototype.slice.call( arguments ) )
        );
      });
    },
    
    route: function( rules ){
      var r;
      de&&bug( ".route() on " + this );
      var main;
      var router = this.make( water( this._water, function a_router( v ){
        fluid.it = router;
        de&&bug( "a_router(), this: " + this + ", fluid.it: " + fluid.it );
        if( v && v.water )return v;
        var item;
        var p;
        var out;
        for( item in rules ){
          if( out )break;
          if( !rules.hasOwnProperty( item ) )continue;
          p = rules[ item ];
          if( typeof p !== "function" ){
            if( v === p ){
              out = main[ item ];
            }
          }else{
            r = try_call( p, fluid.it = router, v );
            if( typeof r !== "undefined" ){
              if( r ){
                if( r.water )return r;
                out = main[ item ];
              }
            }
          }
        }
        // If some rule matched, direct value to that branch
        if( out  ){
          out._push( v );
        // Else, value keeps flowing on the main path
        }else{
          return v;
        }
      } ) );
      main = this.make().from( router );
      // Create a branch for each rule
      var item;
      for( item in rules ){
        if( !rules.hasOwnProperty( item ) )continue;
        main[ item ] = water.fluid();
        de&&bug( ".route(), add branch: " + item + " is " + main[ item ] );
      }
      stack.push( { route: router } );  // Entry for .repeat()
      stack.push( { main:  main   } );
      de&&bug( "route(), route: " + this + ", main: " + main );
      return main;
    },
    
    stack: function(){
      if( !stack.length )throw new Error( "invalid fluid.stack()" );
      stack.push( { branch: this } );
      return this;
    },
    
    branch: function( p ){
      return this.route( { branch: p } );
    },
    
    "if": function( p ){
      var b = this.branch( p ).branch;
      de&&bug( ".if() on this: " + this + ", returns " + b );
      return b;
    },
    
    "else": function(){
      // Retrieve main branch
      var main = stack.pop();
      de&&mand( main.main );
      // Push "then" output
      stack.push( { branch: this } );
      stack.push( { main: main.main, is_else: true } );
      return main.main;
    },
    
    else_if: function( p ){
      var main = stack.pop();
      de&&mand( main.main );
      var new_main = main.branch( p );
      // Push "then" output
      stack.push( { branch: this     } );
      stack.push( { main:   new_main } );
      return new_main.branch;
    },
    
    end_if: function(){
      var main = stack.pop();
      de&&bug( "end_if(), top of stack " + main.main );
      // if...end_if
      if( !main.is_else ){
        // Push "then" output
        this.stack();
        main = main.main;
        de&&bug( "end_if(), this pushed: " + this + ", main: " + main );
      // if...else...end_if
      }else{
        main = this;
        de&&bug( "end_if(), this main:" + main );
      }
      // Concat with others
      var item;
      while( !( item = stack.pop() ).route ){
        if( item.branch ){
          de&&bug( "end_if(), main from( " + item.branch + " )" );
          main.from( item.branch );
        }
      }
      de&&bug( "end_if(), return main: " + main );
      return main;
    },
    
    "repeat": function( m ){
      var main = stack.pop();
      if( !main.is_else ){
        this.stack();
        main = main.main;
      }else{
        main = this;
      }
      var branches = this.make();
      // Concat with others
      var item;
      while( !( item = stack.pop() ).route ){
        if( item.branch ){
          branches.from( item.branch );
        }
      }
      //f.to( entry );
      branches.tap( function( v ){
        item.route._push( v );
      });
      return main;
    },
    
    stateful: function(){
      if( this._state && this._state.a && !arguments.length )return this;
      var tap_done = this._state;
      if( arguments.length ){
        if( this._state ){
          this._state.a = arguments[0];
        }else{
          this._state = { a: arguments[0] };
        }
      }else{
        if( !this._state ){
          this._state = { a: [] };
        }else if( !this._state.a ){
          this._state.a = [];
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
        source._water( water, this, remove );
        return this;
      }
      // Interop with l8 parole pipes
      if( source.pipe && source.push ){
        source.pipe( this );
        return this;
      }
      // Interop with iterable sources
      // ToDo: ECMAScript 6 interators
      if( source
      && typeof source !== "string"
      && typeof source.forEach === "function"
      ){
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
    
    not_from: function( x ){ return this.from( x, true ); },
    
    _to: function(){},
    
    to: function( destination, remove ){
      if( destination ){
        if( destination._water ){
          this._water( water, destination, remove );
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
    
    not_to: function( x ){ return this.to( x, true ); },
    
    // ToDo: implement _to(),_from() logic
    _from: function(){},
    
    hold: function(){ nested++; return this; },
    release: function(){
      if( nested ){ dispatch(); }
      return this;
    }
  };
  Fluid.prototype.where     = Fluid.prototype.select = Fluid.prototype.filter;
  Fluid.prototype.step      = Fluid.prototype.map;
  Fluid.prototype.each      = Fluid.prototype.forEach;
  Fluid.prototype.subscribe = Fluid.prototype.tap;
  Fluid.prototype.pipe      = Fluid.prototype.to; // l8 "pipe" protocol
  Fluid.prototype.catch     = Fluid.prototype.failure;
  Fluid.prototype.junction  = Fluid.prototype.end_if;
  Fluid.prototype.while     = Fluid.prototype.if;
  Fluid.prototype.end_while = Fluid.prototype.repeat;
  
  function MakeFluid( source ){
    var f = new Fluid();
    f.fluid = Fluid();
    return f.initialize.apply( fluid.it = f, arguments );
  }
  MakeFluid.fluid = Fluid;
  var fluid = water.Fluid = water.fluid = MakeFluid;
  
  MakeFluid.define = (function( f ){
    var inp = this();
    var out = f( inp );
    return function( v ){ return inp.push( v ), out.value(); };
  });
  
  var mixin = MakeFluid.mixin = function( target, source ){
    if( arguments.length < 2 ){
      source = target;
      target = this.fluid.prototype;
    }
    if( source ){
      for( var key in source ){
        if( source.hasOwnProperty( key ) ){
          target[ key ] = x[ key ];
        }
      }
    }
    return target;
  };
  
  MakeFluid.method = function( name, fn ){
    if( typeof name === "function" ){
      fn   = name;
      name = fn.name;
    }
    var job = function( input ){
      return fn.call( fluid.it = input, arguments ); 
    };
    if( name ){
      this.fluid.prototype[ name ] = function(){
        return fn.call( fluid.it = this, arguments );
      };
    }
    return job;
  };
  
  MakeFluid.subclass = function( members ){
    var base_proto = this.fluid.prototype;
    function FluidSubclass(){}
    FluidSubclass.prototype = mixin( {}, base_proto );
    var maker = function(){
      var f = new FluidSubclass();
      f.fluid = FluidSubclass;
      f.super = base_proto;
      return f.initialize.apply( fluid.it = f, arguments );
    };
    mixin( maker, this.fluid );
    maker.fluid = FluidSubclass;
    FluidSubclass.make = maker;
    if( members ){
      mixin( FluidSubclass.prototype, members );
    }
    return maker;
  };
  
  MakeFluid.hold    = Fluid.prototype.old;
  MakeFluid.release = Fluid.prototype.release;
  
  // Smoke test
  if( 1 ){
    
    // A, B, C, D where C == A + B, D == A + B
    trace( "c = a + b, d = a + b" );
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
    d( water, l );
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
    
    // Diamond DAG, without needless computations
    // A, B, C, D where B = A * 5 and C = A * 5 and  D = B + C
    var A = water( 0 );
    var B = water();
    var C = water();
    var D = water();
    B( water, function(){ trace( "Compute B" ); return A() * 5 } );
    C( water, function(){ trace( "Compute C" ); return A() * 5 } );
    D( water, function(){ trace( "Compute D" ); return B() + C() } );
    trace( "D is", D() );
    de&&mand( D() === 0 );
    trace( "Fire A using 2" );
    A( 2 );
    trace( "D is now 20:", D() );
    de&&mand( D() === 20 );
    A( 4 );
    trace( "D is now 40:", D() );
    de&&mand( D() === 40 );

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
    trace( "push 1, push 2, get 140, get 160" );
    water.fluid().to( source2 ).from( [ 1, 2 ] ); 
    trace( "sink", sink() );
    de&&mand( sink() === 160 );
    
    trace( "squared() method" );
    water.fluid.method( function square(){
      return fluid.it.map( function( it ){ return it * it; } );
    } );
    var ss = water.fluid().hold().from( [ 10, 20, 30 ] );
    var results = ss.square().log( "squared" ).stateful().state();
    ss.release(); // => squared 100 squared 400 squared 900
    trace( results ); // => [ 100, 400, 900 ]
    
    trace( "Cyclic water" );
    var fact = water.define( function( arg, ret ){
      arg( water, function( v ){ return [ v, 1 ] }, [] );
      var loop = water();
      loop( arg, function( v ){
        var n = v[0], total = v[1];
        if( n <= 1 ){
          ret( total );
        }else{
          return [ n - 1, n * total ];
        }
      } );
      loop( loop );
    } );
    trace( "fact 170", fact( 170 ) ); // 171! is Infinity
    
    trace( "Cyclic fluid" );
    fact = water.fluid.define( function( fluid ){ return fluid
      .map( function( v ){ return [ v, 1 ]; } )
      .while( function( v ){ return v[0] > 1; } )
        .map( function( v ){
          var n = v[0], total = v[1];
          return [ n - 1, n * total ];
        })
      .end_while()
      .map( function( v ){ return v[1]; } );
    } );
    trace( "fact 170", fact( 170 ) ); // 171! is Infinity
  }
  
  // Export global Water, platform dependant
  typeof module !== "undefined" && "exports" in module && (module.exports = water);
  typeof global !== "undefined" && (global.Water = water);
  typeof window !== "undefined" && (window.Water = water);

})();

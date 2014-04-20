// water.js
//   reactive things with consequences.
//
// Feb 19 2014 by @jhr
//
// This file has no external dependencies. MIT license.
//
// It manages "water sources" that depends the one on the other and whose
// content gets transformed by each water source "transform" function.
// It respects topological order, even in the case of diamond configuration
// where a water source depends on multiple sources that all get changed due
// to some earlier change.
// It handles sources whose transformed output is one to one, one to none or
// one to many (map, filter, flatten).
// It handles async transform, waiting for the result before propagating it.
// When parallel activities is required, multiple "water machines" can run
// in parallel.
//
// A "fluid" API provides a reactive functional API built on top of raw water
// sources. Different "classes" of fluids can be defined, with methods local
// to each class: OO streams.

"use strict";
(function(){
  
  // My de&&bug( msgs ) and de&&mand( predicate ) darlings
  function bug(){ 
    console.log.apply( console, arguments );
    // Invoke debugger if string DEBUGGER appears somewhere
    for( var ii = 0 ; ii < arguments.length ; ii++ ){
      if( arguments[ ii ]
      &&  typeof arguments[ ii ].indexOf === "function"
      &&  arguments[ ii ].indexOf( "DEBUGGER" ) !== -1 
      ){
        debugger;
        break;
      }
    }
  }
  function mand( b ){
    if( b )return;
    bug( "l8/water.js, assert error" );
    debugger;
    throw new Error( "water.js assert" );
  }
  var de = false, trace = bug;
  
  var init_sources = {}; // Sentinel value used to determine sources
  var event        = {}; // Sentinel value when building interop callback
  var propagate    = {}; // Sentinel value for auto propagation
  
  // Access to an undef water source from a transform fn may raise this error
  var autodep = { message: "Water autodep" };
  
  // Default internal error handler, for bugs only, not in production
  var err_handler = function( e ){
    trace( "Water error", e );
    debugger;
    throw e;
  };
  
  // Flag set by .demand() to build lazy water sources instead of regular ones
  var lazy_mode = false;
  
  // Set during recursive traversal of sources to detect lazy node to update
  var pending_node;
  
  /*
   *  Dependencies managements. Sources feed destinations that depend on them
   */
  
  // Lists of ancestors, ie recursive list of sources, are somehow cached
  var sources_round = 0;  // ToDo: implement this?
  
  /*
   *  Dependencies are stored in arrays. A dependency is a relation between
   *  two water sources where one source "depends" on the other. A change to
   *  a source requires the source's dependent water sources to be recomputed.
   *  ToDo: use a hash map to avoid O(n) cost?
   *  ToDo: weak map style of garbaddge collection
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
  // Return true if insert, return false if already present
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
  // some similar code with initial propagation handling somewhere else.
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
        de&&bug( "Already connected", inspect( source ), "->", inspect( destination ) );
        return false;;
      }
    }
    de&&mand( fast_includes( source._deps, destination ) );
    // Source processed, now process destination
    de&&mand( !fast_includes( destination._sources, source ) );
    // Add to destination's list of sources
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
    de&&bug( "New connection", inspect( source ), 
      "->", inspect( destination )
    );
    de&&mand( !connect( source, destination ) );
    // Invalidate all cached lists of recursive sources, brutal
    sources_round++;
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
      de&&bug( "Already removed connection", inspect( source ), "->", inspect( destination ) );
      return false;
    }
    de&&mand( fast_includes( source._deps,         destination ) );
    de&&mand( fast_includes( destination._sources, source      ) );
    // If in list, change entry into no-op.
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
    de&&bug( "Removed connection", inspect( source ), "->", inspect( destination ) );
    de&&mand( !disconnect( source, destination ) );
    return true;
  }
  
  // Remove all connections, it should enable garbage collection
  function dispose( source ){
    source = source._water;
    var list;
    var ii;
    var item;
    list = source._sources;
    while( item = list[ ii++ ] ){
      if( item !== noop ){
        disconnect( item, source );
      }
    }
    list = source._deps;
    while( item = list[ ii++ ] ){
      if( item !== noop ){
        disconnect( source, item );
      }
    }
    source._sources = [];
    source._deps    = [];
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
  
  // True if destination depends on source, directly or indirectly.
  // Each water source may have many water sources it depends on and many
  // destination water sources that depends on it.
  function depends_on( destination, source ){
    var ii = 0;
    // Cannot depend on itself, this would prevent loops
    if( source === destination )return false;
    // False if no more sources to check
    var sources = destination._sources;
    if( !sources )return false;
    var item;
    // Check each source that the destination depends on
    while( item = sources[ ii++ ] ){
      // Return true if searched source is found among destination's sources
      if( item === source )return true;
      // Also return true if a destination's source depends on searched source
      // ToDo: stack overflow?
      if( depends_on( item, source ) )return true;
    }
    return false;
  }
  
  // Some pretty print for debugging, detects "water" function objects
  function inspect( stuff ){
    if( typeof stuff !== "function" )return stuff;
    if( !stuff._water )return "Function";
    return "Water" + stuff.id
    + ( stuff.label ? "[" + stuff.label + "]" : "");
  }
  
  // Concurrent change propagations require multiple "machines"
  function Machine( options ){
    this.autodep = options && options.autodep;
    this.nested  = 0;   // nested updates are actually processed at top level
    this.queue   = [];  // thanks to a queue that respects dependencies order.
    this.effects = [];  // effects are fn to run after updates are all done
    this.processing_effects = 0; // help to detect when machine is ready again
    this.cb      = null; // callback to call when machine is ready again
    de&&mand( this.ready() );
  }
  
  // Switch to a different "current" machine. Sets Machine.current
  Machine.prototype.resume = function(){
    var old = Machine.current;
    Machine.current = this;
    return old;
  };
  
  Machine.prototype.ready = function(){
    if( this.nested                       )return false;
    if( this.queue.length                 )return false;
    if( this.effect && this.effect.length )return false;
    if( this.processing_effects           )return false;
    return true;
  };
  
  // Submit code to run, cb is called when all changes & effects are done
  Machine.prototype.submit = function( code, cb ){
    if( this.cb )throw new Error( "water.js, cannot submit(), busy" );
    var old = this.resume();
    if( !cb ){ cb = water.boxon(); }
    var box = water.boxon();
    this.cb = box;
    try{
      code();
      if( this.ready() ){ this._emit_ready(); }
    }catch( err ){
      box( err );
    }finally{
      old.resume();
    }
    box( cb );
    return cb;
  };
  
  // Internal, called when machine is ready to accept another .submit()
  Machine.prototype._emit_ready = function(){
    // Call the .submit() registered callback, if any, clear it too
    if( this.cb ){
      var cb = this.cb;
      this.cb = null;
      // ToDo: error handling
      if( typeof cb === "function" ){ cb(); }
    }
    return this;
  };
  
  Machine.prototype.steps = function( list, cb ){
    // ToDo: nestable .steps(), ie handling of a queue of steps
    if( !cb ){ cb = water.boxon(); }
    var ii = 0;
    var that = this;
    function consume(){
      if( ii >= list.length ){
        if( typeof cb === "function" ){ cb(); }
        return;
      }
      that.submit( function(){ list[ ii++ ](); }, consume );
    }
    consume();
    return cb;
  };
  
  // There is a default "Machine.current" machine
  (new Machine()).resume();
  
  /*
   *  Delivery of value updates should happen once per round. Ie if same
   *  dependent is impacted multiple times, it's better to update it once
   *  only, using last update. Multiple value delivery to the same destination
   *  are collapsed into a single delivery, using the last delivered new value
   */
   
  function delivery( machine, h2o, destination ){
    // Source is a water source
    de&&mand( h2o && h2o._water );
    // Destination is either a water source or a callback
    de&&mand( destination && typeof destination === "function" );
    // First phase of delivery keeps last updated value only and queue callback
    var slot;
    // If already scheduled, return scheduled slot updater
    if( destination._round === water.round )return destination._deliverer;
    // Previous deliverers are now useless, one for this "round" is required
    destination._round = water.round;
    // Return a function that will update the allocated queue slot
    // ToDo: is it ok to attach a "._deliverer" property to non water functions
    return destination._deliverer = function(){
      // If called for the first time, create a slot and remember new value
      if( !slot ){
        de&&bug(
          "Visit, ctx:", inspect( h2o ),
          "destination:", inspect( destination ),
          "args:", 
          (arguments[0] && arguments[0].water)
          ? "Water.error: " + arguments[0].error
          : "" + arguments[0]
        );
        // Add to queue, so that change is done during the second phase
        machine.queue.push( slot = { 
          water: h2o,
          destination: destination,
          args: arguments
        } );
      // If another call, just override previous arguments
      }else{
        de&&bug(
          "Revisit, ctx:", inspect( h2o ),
          "destination:", inspect( destination ),
          "args:", 
          (arguments[0] && arguments[0].water)
          ? "Water.error: " + arguments[0].error
          : "" + arguments[0]
        );
        slot.args = arguments;
      }
    };
  }
  
  function dispatch( machine ){
    // Second phase of delivery, after update is all done.
    // Dispatching respects the topological order
    while( true ){
      if( --machine.nested ){
        // Another call to dispatch() is active, it will do the job
        de&&bug( "Skip nested dispatch()", machine.nested + 1 );
        return;
      }
      var list, ii, item;
      // When no changes remain, it's time for the "effects"
      // "effects" are changes to perform during the next propagation round
      if( !machine.queue.length ){
        de&&bug( "End of round", water.round );
        water.round++;
        ii = 0;
        list = machine.effects;
        // If no effects remain, at all levels, machine is ready again
        if( !list.length ){
          if( !machine.processing_effects ){
            // No effects here and no outer effects either, machine is ready
            machine._emit_ready();
          }
          return;
        }
        // Clear list now so that new effects order is level local
        // Effects are often FIFO, LIFO is useful for fluid.flatten()
        machine.effects = [];
        // Process effects. Increment flag so that nested effects are detected
        machine.processing_effects++;
        // Process all effects at the current level
        while( item = list[ ii++ ] ){
          // Item is a callback. It was registered using water.effect() & .back()
          // ToDo: err handling
          item();
        }
        // Restore initial effect level
        machine.processing_effects--;
      }
      // Set flag to don't reenter dispatch(), only one loop must be active
      machine.nested++;
      de&&bug( "Dispatch()" );
      // Queue can be increased during the loop itself
      // Note: the queue is neither FIFO nor LIFO, it respects dependencies
      // This means that nodes without dirty dependencies are updated first
      list = machine.queue;
      ii = 0;
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
      var done;
      // Loop until count of processed entries cover whole queue
      while( count < list.length  ){
        count = 0;
        ii    = 0;
        // Error detection, something's got to happen during each iteration
        done = false;
        // Loop over all changes, until something happens
        while( slot = list[ ii++ ] ){
          // Skip already processed entry
          if( slot === noop ){
            count++;
            continue;
          }
          // Do not call cb if it still depends on a source that changes too.
          // IE if something it depends on is in the queue and not yet updated.
          destination = slot.destination;
          jj = 0;
          // Look for something else the "destination" depends on
          while( source = list[ jj++ ] ){
            if( source === noop )continue;
            source = source.destination;
            if( destination._water && depends_on( destination, source ) )break;
          }
          // If such a source was found, delay update until that source is ok
          if( source )break;
          // Mark processed entry
          list[ ii - 1 ] = noop;
          count++;
          de&&bug( "Deliver change on", inspect( destination ) );
          water.current   = slot.water;
          water.transform = destination;
          water.callback  = destination;
          var args = slot.args;
          // Enable cycling changes
          destination._round = 0;
          // Propagate change. water.current is the source
          try_apply( destination, destination, args );
          done = true;
          // Exit loop if another loop is required, due to some async result
          if( machine.nested > 1 )break;
        }
        // If nothing was done, there is an issue. Not expected!
        if( !done ){
          error( new Error( "Invalid water dependencies, infinite loop" ) );
          break;
        }
        // Also exit this loop if another loop is required due to async
        if( machine.nested > 1 )break;
      }
      water.current   = old;
      water.transform = old_f;
      water.callback  = old_b;
      // Unless loop was ended due to some async result, queue is now all done
      if( machine.nested === 1 ){ machine.queue = []; }
    }
  }
  
  function transform_call( transform, h2o, val ){
    try{
      water.current  = h2o;
      water.prologue = h2o;
      return transform.call( water.it = h2o, val );
    }catch( err ){
      // Filter out access error during transform prologue, ie return undefined
      if( err && err.water && err.error === autodep )return;
      // Turn other exceptions into error values
      return { water: h2o, error: err } ;
    }finally{
      water.current  = null;
      water.prologue = null;
    }
  }
  
  function try_call( f, target, arg1, arg2 ){
    try{ return f.call( water.it = target, arg1, arg2 );
    }catch( err ){ return water.fail( err ); }
  }
  
  function try_apply( f, target, args ){
    try{ return f.apply( water.it = target, args );
    }catch( err ){ return water.fail( err ); }
  }
  
  function noop(){}
  
  // ToDo: move outside of closure, using ._dirty && ._pending
  function wakeup( machine, h2o ){
    // Lazy nodes are computed "on demand", using their sources
    if( de && ( !h2o.dirty || h2o.pending ) ){
      de&&bug( "Bad wakeup()" );
      de&&mand( false );
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
      h2o.pending = true;
      // Ask each source to update the pending node, recursive
      while( w = h2o._sources[ ii++ ] ){ w() }
    }finally{
      pending_node = node;
    }
  }
  
  // Update a water source with a new value, in the context of a water machine
  function update( machine, h2o, now ){
    var list, ii, item;
    de&&mand( now !== water );
    // Update to new value, filter out "undefined". kind of "Maybe" monad
    if( typeof now === "undefined" )return;
    // Lazy propagation just invalidate cached values, recursive
    if( now === demand ){
      // Stop propagation if already dirty
      if( h2o.dirty )return;
      h2o.dirty = true;
      machine.nested++;
    // Actual non lazy value propagation, recursive too
    }else{
      machine.nested++;
      h2o.current = now;
      h2o.dirty   = false;
      h2o.pending = false;
      // Fire callbacks for that specific water source
      if( h2o.callbacks ){
        list = h2o.callbacks;
        h2o.callbacks = null;
        ii = 0;
        while( item = list[ ii++ ] ){
          item( h2o.current );
        }
      }
    }
    de&&bug( "Update at level", machine.nested );
    // Signal change to dependent waters
    if( h2o._deps ){
      for( ii = 0 ; item = h2o._deps[ ii ] ; ii++ ){
        // Update it, in "auto" mode
        if( now && now.water_changes ){
          list = now.water_changes;
          var jj = list.length;
          while( jj-- ){
            (function( item, v ){
               water.back( function(){ item( v, propagate ); } );
            })( item, list[ jj ] );
          }
        }else{
          delivery( machine, h2o, item )( now, propagate );
        }
      }
    }
    // Signal collapsed changes
    dispatch( machine );
  }
  
  // Update when promise is resolved
  function async_update( machine, h2o, value ){
    machine.nested--;
    de&&bug( "Async", machine.nested );
    update( machine, h2o, value );
  }
  
  // Update when promise is rejected
  function async_update_error( machine, h2o, error ){
    machine.nested--;
    de&&bug( "Async error", machine.nested );
    update( machine, h2o, water.fail( error ) );
  }
  
  // Update based on f( err, ...result ) callback
  function async_update_cb( machine, h2o, err, value ){
    machine.nested--;
    de&&bug( "Async cb", machine.nested );
    if( err ){ value = water.fail( err ); }
    if( arguments.length > 2 ){
      value = Array.prototype.slice.call( 1 );
    }
    update( machine, h2o, value );
  }
    
    /*
   *  Water object are functions, with some enhancements
   */
  
  var water = function(){
    
    // Instance members, enclosed in closure. Some other ones are properties
    //var current;        // ToDo: move to ._current property
    //var dirty, pending; // ToDo: move to ._dirty & ._pending properties
    //var transform;
    //var callbacks;
    
    var h2o = function a_water( val, auto ){
      
      var source, destination;
      
      // b(), accessor, may trigger refresh if lazy node
      if( !arguments.length ){
        // If about the source of a child lazy node, refresh (see wakeup())
        if( pending_node ){
          // If that node is dirty, it needs to be refreshed
          if( h2o.dirty ){
            if( !h2o.pending ){ wakeup( Machine.current, h2o ); }
          // If node is ready, propagate source value to child pending node
          }else{
            // "auto" mode
            pending_node( h2o.current, propagate );
          }
          return;
        }
        // Add an autodep if invoked from a transform prologue
        if( water.prologue && Machine.current.autodep ){
          // ToDo: avoid constly autodep if water source say so
          de&&bug( "prologue autodep", inspect( h2o ), "->", inspect( water.prologue ) );
          connect( h2o, water.prologue ); // source, destination
        }
        // If some "current" value, return that value, or throw an exception
        if( typeof h2o.current !== "undefined" ){
          // If { water: w, error: e } error, throw it
          if( h2o.current.water )throw h2o.current.error;
          return h2o.current;
        }
        // Abort computation if access from a transform fn: catcher adds dep
        if( water.prologue && Machine.current.autodep ){
          throw { water: h2o, error: autodep };
        }
        return;
      }
      
      // b( demand ) is special, private, signals dirtyness
      if( val === demand )return update( Machine.current, h2o, demand );

      var ready, ii, w;
      
      if( val === water ){
      
        // b( water ) is special, track sources and/or test availability
        if( arguments.length === 1 ){
          // some true value when available, or else 'undefined'
          ready = h2o.current || (typeof h2o.current !== "undefined") || void 0;
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
            de&&bug( "First explicit dep", inspect( source ), "->", inspect( destination ) );
            source._deps = [];
          }
          // Return true or 'undefined' according to "current" value presence
          ready = !!h2o.current || (typeof h2o.current !== "undefined") || void 0;
          ii = 0;
          // Look for already present dependency
          while( ( w = source._deps[ ii++ ] ) && ( w !== destination ) ){}
          // Only if not already present, ie not a dep yet
          if( w ){
            de&&mand( fast_includes( source._deps,         destination ) );
            de&&mand( fast_includes( destination._sources, source      ) );
          }else{
            de&&bug( "Explicit dep", inspect( source ), "->", inspect( destination ) );
            de&&mand( !fast_includes( source._deps,         destination ) );
            de&&mand( !fast_includes( destination._sources, source      ) );
            source._deps.push( destination );
            if( !destination._sources ){
              destination._sources = [ source ];
            }else{
              destination._sources.push( source );
              // ToDo: cached list of all sources would have to be recomputed
            }
            de&&mand( fast_includes( source._deps,         destination ) );
            de&&mand( fast_includes( destination._sources, source      ) );
            de&&bug( "New water connection", inspect( source ),
              "->", inspect( destination )
            );
            // ToDo: all cached lists of sources would have to be recomputed
            // ToDo: figure out a finer granularity
            sources_round++;
            // If source is dirty, schedule refresh, will update all deps
            // ToDo: should avoid that, node is lazy for a reason...
            if( h2o.dirty ){
              // Unless already done before
              if( !h2o.pending ){ wakeup( Machine.current, h2o ); }
              ready = false;
            // If source is available, tell dep about it
            }else if( typeof h2o.current !== "undefined" ){
              try_call( destination, destination, h2o.current, propagate );
            }
          }
          // Contract, dest is in src.deps & src is in dest.srcs
          de&&mand( fast_includes( source._deps,         destination ) );
          de&&mand( fast_includes( destination._sources, source      ) );
          // Return true if source is ready or else return "undefined"
          return ready;
        }
        
        // b( water, water, default ) returns a nodejs style callback that pours water
        if( auto === water && arguments.length === 3 ){
          val = arguments[2];
          // Not a nodejs callback actually, more like an event listener
          if( val === event ){
            return function( rslt ){
              if( arguments.length === 1 ){
                h2o( rslt );
              }else{
                h2o( Array.prototype.slice.call( arguments ) );
              }
            };
          }else{
            return function( err ){
              if( err ){
                // If "default" is Water.error, wrap error, else keep it as is
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
          var a_demand = function( cb ){
            // a_demand() returns the current value or throws
            if( arguments.length === 0 )return h2o();
            // a_demand( Water ) delegates to undeflying water source
            if( cb === water ){
              h2o( water );
              return a_demand;
            }
            // a_demand( cb ) install a one shot callback
            h2o( water, cb );
            return a_demand;
          };
          // "demand" objects duck type as water sources
          a_demand._water = h2o;
          return a_demand;
        }
        
        // b( water, cb ) on lazy water, attach a one shot callback
        if( arguments.length === 2 && h2o.is_lazy ){
          var user_cb = auto.boxon || auto;
          var wrapped_cb = function( v ){
            water.callback = user_cb;
            h2o.dirty   = true;
            h2o.pending = true;
            // ToDo: err handling
            user_cb( (v && v.water) ? v.err : null, v );
          };
          var a_delivery = delivery( Machine.current, h2o, wrapped_cb );
          // Call right now if some value is ready
          if( !h2o.dirty && typeof h2o.current !== "undefined" ){
            a_delivery( h2o.current );
          // Schedule delayed call and refresh node if it is lazy
          }else{
            // ToDo: avoid duplicates
            if( h2o.callbacks ){
              h2o.callbacks.push( a_delivery );
            }else{
              h2o.callbacks = [ a_delivery ];
            }
            // Refresh dirty lazy node, unless already scheduled
            if( h2o.dirty && !h2o.pending ){ wakeup( Machine.current, h2o ); }
          }
          return h2o;
        }

      } // b( water, ... ) cases
      
     // b( init, funct [, sources] ), set the transform method and sources
      if( typeof auto === "function" ){
        h2o.transform = auto;
        if( typeof val !== "undefined" 
        && val !== water
        && (!val || !val._water )
        ){
          // Set initial value
          h2o.current = val;
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
          while( w = src[ ii++ ] ){
            if( w._water ){
              w._water( water, h2o );
              if( ready = ready && typeof w._water.current !== "undefined" && !init_src ){
                init_src = w._water;
              }
            // Push data if it is not a water source
            }else{
              ready = false;
              h2o( w );
            }
          }
          // If all sources are ready, use first one to start feeding node
          ready && init_src && h2o( init_src() );
        // If sources are specified by transform function itself
        }else{
          // transform( undefined ) will be called, that's the only such case
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
          if( h2o.is_lazy && !h2o.pending ){
            if( h2o.dirty )return;
            h2o.dirty = true;
            // Will propagate a pseudo value, a sentinel, to avoid recompute
            val = demand;
          }
        // If user initiated update
        }else{
          // w( a, b, c ) is turned into w( [ a, b, c ] )
          if( arguments.length > 1 ){
            val = Array.prototype.slice.call( arguments );
          }
        }
        
        var now;
        
        // Apply transform, this computes the node's new value
        if( h2o.transform === idem ){
          // No transformation. Avoid calling it, for speed
          now = val;
        }else if( typeof h2o.transform === "function" ){
          // Transformation done by a function
          // b(water) needs special care during setup phase to track sources
          now = transform_call( h2o.transform, h2o, val === init_sources ? void 0 : val );
          de&&mand( now !== water );
        }else{
          // Transformation into a fixed value
          now = h2o.transform;
        }
          de&&mand( now !== water );
        
        // Propagate new value to deps
        var machine = Machine.current;
        if( now ){
          // If new value is async, queue propagation until delivery
          // Until delivery, push operations on nodes are queued too
          var then;
          if( typeof ( then = now.then ) === "function" ){
            // Delay callback dispatch until async completes
            machine.nested++;
            de&&bug( "Async promise", machine.nested );
            then.call( now, 
              function( ok ){ async_update(       machine, h2o, ok ); },
              function( ko ){ async_update_error( machine, h2o, ko ); }
            );
          }else if( typeof ( then = now.boxon ) === "function" ){
            // Delay callback dispatch until async completes
            machine.nested++;
            de&&bug( "Async boxon", machine.nested );
            then.call( now, function(){
              async_update_cb.apply( null, [ machine, h2o ].concat(
                Array.prototype.slice.call( arguments )
              ));
            });
          }else if( now !== init_sources ){
            update( machine, h2o, now );
          }
        }else{
          update( machine, h2o, now );
        }
        return h2o;
      }
      
    }; // end of function h2o()
  
    // Duck typing
    h2o._water = h2o;
    
    // Uniq id
    h2o.id = water.id++;
    
    // In debug mode, redefine toString()
    if( de ){
      h2o.toString = function(){ return inspect( this ); };
    }
    
    // Dependencies, none initially
    h2o.sources = h2o.deps = null;
    h2o._src_compact_queued = h2o._dep_compact_queued = false;
    
    // Lazy mode creates lazy nodes
    if( h2o.is_lazy = lazy_mode ){
      // ToDo: remove dirty member from closure
      h2o.dirty = true;
    }
    
    // Default transform is to keep values unchanged
    if( !h2o.transform ){ h2o.transform = idem; }

    // If some args, invoke new water source using them
    if( arguments.length ){
      return h2o.apply( this, arguments );
    }
    return h2o;
    
  }; // End of water()
  
  
  water.connect    = connect;
  water.disconnect = disconnect;
  water.dispose    = dispose;
  
  // Create "on demand" lazy water source
  var demand = function(){
    try{
      lazy_mode = true;
      var a_demand = water( water, water );
      var recur = function( a_demand, list ){
        var item;
        var ii = 0;
        while( item = list[ ii++ ] ){
          if( item._water ){
            item._water( water, a_demand );
          }else{
            recur( a_demand, item );
          }
        }
      };
      if( arguments.length ){
        var cb;
        // If last argument is a cb, is it not a source
        if( typeof ( cb = arguments[ arguments.length - 1 ] ) === "function " ){
          // Flatten and then add sources, not including the last argument
          if( arguments.length > 1 ){
            recur( a_demand, Array.protototype.slice( 0, arguments.length - 1 ) );
          }
          a_demand( cb );
        // Flatten and then add sources
        }else{
          recur( a_demand, arguments );
          cb = null;
        }
      }
      return a_demand;
    }finally{
      lazy_mode = false;
    }
  };
  water.demand = demand;
  
  water.lazy = function( x, v ){
    // Getter
    if( arguments.length < 2 )return x.is_lazy;
    // Setter
    if( !( x.is_lazy = !!v ) ){
      // When not lazy, make sure an update is scheduled
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
  
  /*
   *  Some values are special
   */
   
  water.is_void    = function( v ){ return typeof v === "undefined" || void 0; };
  
  water.is_failure = function( v ){ return v && v.water && v.error && v;  };
  
  water.is_success = function( v ){
    return (v && !v.water && v )
    || (typeof v !== "undefined" && (v || true) );
  };
  water.water = function( w ){ return (w && w._water) || void 0; };
  
  water.fail = function( e ){
    return { water: (water.current || water), error: e || "fail" };
  };
  
  water.is_close = function( v ){
    return v && v.water && v.error === "close" && v;
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
  
  water.changes = function( list ){
    return { water_changes: list };
  };
  
  water.change = function( val ){
    return { water_changes: [ val ] };
  };
  
  // ToDo: study that
  var error = function( error ){
    if( !err_handler )return;
    err_handler( error );
  };
  
  water.error = function( handler ){
    if( !arguments.length )return err_handler;
    err_handler = handler;
    return water;
  };
  
  // Globals
  water.round     = 1;
  water.id        = 1;
  water.it        = null;
  water.current   = null;
  water.prologue  = false;
  water.transform = null;
  water.callback  = null;
  
  /*
   *  Misc
   */
   
  water.again = function( cb ){
    return water.current( water, cb || water.callback );
  };
  
  water.effect = function( cb ){ Machine.current.effects.push(    cb ); };
  water.back   = function( cb ){ Machine.current.effects.unshift( cb ); };
  water.async  = function( av ){
    var machine = Machine.current;
    var current_water = water.current;
    if( !av ){
      water.effect( function(){
        current_water( av );
      });
    }
    var then = av.then;
    if( then ){
      then.call( av,
        function( ok ){
          var old = machine.resume();
          current_water( ok );
          old.resume();
        },
        function( ko ){
          var old = machine.resume();
          current_water( water.fail( ko ) );
          old.resume();
        }
      );
    }else if( then = av.boxon ){
      then.call( then, function( err, r ){
        var old = machine.resume();
        if( err ){
          current_water( water.fail( err ) );
        }else if( arguments.length === 2 ){
          current_water( r );
        }else{
          current_water( Array.prototype.slice.call( arguments, 1 ) );
        }
        old.resume();
      });
    }
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
  
  // Simple boxon implementation. See boxon.js for a more elaborated one.
  water.boxon = function( cb ){
    var done;
    var cbs = [];
    var box = function( cb ){
      if( typeof cb === "function" ){
        if( !done ){
          cbs.push( cb );
        }else{
          cb.apply( box, done );
        }
        return;
      }
      if( done )return;
      if( arguments.length > 2 ){
        done = [null].concat( Array.prototype.slice.call( 1 ) );
      }else{
        done = arguments;
      }
      var ii = 0;
      var item;
      while( item = cbs[ ii++ ] ){
        item.apply( item, done );
      }
      cbs = null;
    };
    box.boxon = box;
    if( arguments.length ){ box.apply( box, arguments ); }
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
  
  water.Machine = Machine;
  water.machine = function( options ){ return new Machine( options ); };
  water.submit  = function( e, cb ){ return Machine.current.submit( e, cb ); };
  water.steps   = function( l, cb ){ return Machine.current.steps( l, cb ); };
  
  
  /* --------------------------------------------------------------------------
   *  Fluid. Streams of water, with a "fluid" API
   */
  
  // Class Fluid
  function Fluid(){}
  
  // .if()/.else()/.end() as well as .while()/.end_while()... require a stack
  var stack = [];
  
  Fluid.prototype = {
    
    closed: false,    // due to a "close" error
    
    make: MakeFluid,  // Subclasses redefine it.
    
    initialize: function(){},  // Applied on each "this.make()" new object
    
    toString: function(){
      if( !this._label )return "Fluid" + this._water.id;
      return "Fluid" + this._water.id + "[" + this._label + "]";
    },
    
    label: function(){ // For debug typically
      if( !arguments.length )return this._water.label;
      this._water.label = arguments[0];
      return this;
    },
    
    close: function(){
      if( this.closed )return this;
      this.push( { water: this, error: "close" } );
      return this;
    },
    
    // Each fluid instance delegates to a water source
    water: function(){ return this._water; },
    
    // Inject some new content, get's queued until previous is processed
    push: function( x ){ 
      if( this.closed || typeof x === "undefined" )return this;
      // Bufferize if some propagation is already running
      if( Machine.current.nested ){
        var that = this;
        Machine.current.effects.push( function(){
          // try again later
          // ToDo: better queue handling, to avoid excessive requeing
          that.push( x );
        });
      // Or propagate change now if this is a direct change
      }else{
        // Detect special "close" error
        if( x && x.water && x.error === "close" ){
          this.closed = true;
          // ToDo: schedule remove of all dependents, no more changes to expect
        }
        this._water( x );
      }
      return this;
    },
    
    _push: function( x ){ 
      if( this.closed || typeof x === "undefined" )return this;
      de&&mand( !v || !v.water || v.water.error !== "close" );
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
    
    fail: function( e ){
      if( !e || e === "close" )return this.close();
      return this.push( water.fail( e ) );
    },
    
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
    
    map: function( transformer ){
      var ctx = arguments.length > 1 ? arguments[1] : void 0;
      var index = 0;
      var f = this.make( water( this._water, function( v ){
        if( v && v.water )return v;
        if( typeof transformer !== "function" )return transformer;
        fluid.it = f;
        return try_call( transformer, 
          water.it = ctx || f._water, v, index++, transformer
        );
      }));
      return f;
    },
    
    raw: function( transformer ){
      var ctx = arguments.length > 1 ? arguments[1] : void 0;
      var f = this.make( water( this._water, function( v ){
        if( typeof transformer !== "function" )return transformer;
        fluid.it = f;
        return try_call( transformer, 
          water.it = ctx || f._water, v, transformer
        );
      }));
      return f;
    },
    
    first: function( init ){
      var done;
      var ctx = arguments.length > 1 ? arguments[1] : void 0;
      var f = this.make( water( this._water, function( v ){
        if( done )return v;
        if( v && v.water )return v
        fluid.it = f;
        var r = try_call( init, 
          water.it = ctx || f._water, v, init
        );
        if( typeof r === "undefined" )return;
        if( r && r.water )return r;
        done = true;
        return v;
      }));
      return f;
    },
    
    failure: function( mapper ){
      var f;
      if( !arguments.length ){
        f = this.make( water( this._water, function( v ){
          if( v && v.water && v.error !== "close" )return v.error;
        }));
      }else{
        f = this.make( water( this._water, function( v ){
          if( !v || !v.water || v.error === "close" )return v;
          if( typeof mapper !== "function" )return mapper;
          fluid.it = f;
          return try_call( mapper,water.it = f._water, v.error );
        }));
      }
      return f;
    },
    
    final: function( mapper ){
      var f = this.make( water( this._water, function( v ){
        if( !v || !v.water || v.error !== "close" )return v;
        if( typeof mapper !== "function" )return mapper;
        fluid.it = f;
        return try_call( mapper, water.it = f._water );
      }));
      return f;
    },
    
    cut: function(){
      return this.make();
    },
    
    assert: function( p ){
      var f = this.make( water( this._water, function( v ){
        if( v && v.water )return v;
        fluid.it = f;
        var r = try_call( p, water.it = f._water, v );
        if( !r )return { water: f._water, error: new Error( "Fluid assert" ) };
        return v;
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
          return { water_changes: result };
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
          return { water_changes: result };
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
    
    tap: function( fn ){
      var that = this;
      var f = this.make( water( water, function( v ){
        if( v && v.water )return v;
        fn.call( fluid.it = water.it = that, v );
        return v;
      }, [ this._water ] ) );
      return f;
    },
    
    log: function( msg ){ 
      if( !arguments.length )return this.tap( trace );
      return this.tap( function( v ){
        if( typeof msg === "function" ){
          trace.call( null, msg( arguments ) );
        }else{
          trace.apply( null,
            [ msg ].concat( Array.prototype.slice.call( arguments ) )
          );
        }
      });
    },
    
    debug: function( msg ){
      var that = this;
      var f = this.make( water( water, function( v ){
        if( !msg ){
          trace.apply( null,
            [ "DEBUG", that.toString() ].concat( inspect( v ) )
          );
        }else{
          //if( !de )return;
          trace.apply( null,
            [ "DEBUG", that.toString(), msg ].concat( inspect( v ) )
          );
        }
        return v;
      }, [ this._water ] ) );
      return f;
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
      if( !arguments.length ){
        var err = water.fluid();
        var router = this.make( water( this._water, function err_router( v ){
          fluid.it = router;
          if( !v || !v.water || v.error === "close" )return v;
          err._push( v );
        } ) );
        var new_main = this.make().from( router );
        stack.push( { route: router   } );
        stack.push( { main:  new_main } );
        return err;
      }
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
      if( !arguments.length ){
        var err = water.fluid();
        var router = this.make( water( this._water, function err_router( v ){
          fluid.it = router;
          if( !v || !v.water || v.error === "close" )return v;
          err._push( v );
        } ) );
        var new_main = this.make().from( router );
        stack.push( { branch: this     } );
        stack.push( { main:   new_main } );
        return err;
      }
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
          if( this._state.a && water.is_success( v ) ){ this._state.a.push( v ); } 
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
    
    cast: function( klass ){
      if( !klass ){ klass = fluid; }
      return klass().from( this );
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
              if( water.is_success( v ) ){ destination.push( v ); }
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
    
    dispose: function(){ dispose( this._water ); },
    
    hold: function(){ Machine.current.nested++; return this; },
    release: function(){
      if( Machine.current.nested == 1 ){
        dispatch( Machine.current );
      }else{
        Machine.current.nested--;
      }
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
  
  function init_fluid(){
    var args = arguments;
    if( !arguments.length ){
      this._water = water();
    }else if( arguments[0] && arguments[0]._water ){
      this._water = arguments[0];
      if( arguments.length === 1 ){
        args = [];
      }else{
        args = Array.prototype.slice.call( arguments, 1 );
      }
    }else{
      this._water = water();
      args = arguments;
    };
    var r = this.initialize.apply( fluid.it = this, args );
    return typeof r === "undefined" ? this : r;
  }
  
  function MakeFluid(){
    var f = new Fluid();
    f.fluid = Fluid();
    return init_fluid.apply( f, arguments );
  }
  MakeFluid.make    = MakeFluid;
  MakeFluid.fluid   = Fluid;
  MakeFluid.fail    = water.fail;
  MakeFluid.close   = "close";
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
          target[ key ] = source[ key ];
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
  
  MakeFluid.subclass = function( name, init, members ){
    var base_maker = this;
    if( typeof name === "function" ){
      members = init;
      init    = name;
      name    = init.name
    }else if( name.initialize ){
      members = name;
      init    = name.initialize;
      name    = init.name;
    }
    if( members ){
      if( init ){ members.initialize = init; }
    }else{
      if( init ){ members = { initialize: init }; }
    }
    var base_proto = base_maker.fluid.prototype;
    function FluidSubclass(){}
    FluidSubclass.prototype = mixin( {}, base_proto );
    FluidSubclass.prototype.super = base_proto;
    FluidSubclass.prototype.fluid = FluidSubclass;
    var maker = function fluid_subclass(){
      var f = new FluidSubclass();
      return init_fluid.apply( f, arguments );
    };
    FluidSubclass.prototype.make  = maker;
    // New class inherits class methods from base class
    mixin( maker, base_maker );
    if( base_maker.it ){ delete maker.it; }
    // Export the actual class, its prototype contains the instance methods
    maker.make  = maker;
    maker.fluid = FluidSubclass;
    maker.super = base_maker.make;
    if( members ){
      mixin( FluidSubclass.prototype, members );
    }
    // Export factory into all super classes
    if( name ){
      var su = maker;
      while( su ){
        su[ name ] = maker;
        su = su.super;
      }
    }
    return maker;
  };
  
  MakeFluid.hold    = Fluid.prototype.old;
  MakeFluid.release = Fluid.prototype.release;
  
  // Smoke test
  if( process.argv[1].indexOf( "/lib/water.js" ) !== -1 ){
    
    // Use autodep
    water.machine({ autodep: true }).resume();
    //de = true;
    
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
    A.label = "A"; B.label = "B"; C.label = "C", D.label = "D";
    B( water, function(){ trace( "Compute B" ); return A() * 5 } );
    trace( "B is", B() );
    de&&mand( B() === 0 );
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
    water.submit( function(){
      ss.release(); // => squared 100 squared 400 squared 900
    }, function(){
      trace( results ); // => [ 100, 400, 900 ]
    } );
    
    trace( "increment, for numbers" );
    water.fluid.subclass( function number(){} );
    water.fluid.number.method( function incr(){
      return this.map( function( it ){ return it + 1; } );
    });
    var numbers = water.fluid.number();
    var last_number = numbers.incr().log();
    numbers.push( 1 ).push( 2 );
    trace( last_number.value() );
    
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
    
    trace( "Errors, multiple results, closing" );  
    var err_fluid = water.fluid();
    err_fluid
    .if().failure()
      .map( [ "default1", "default2"] )
      .flatten()
    .end_if()
    .final( function(){ return "Closing!"; } )
    .log( "last" );
    err_fluid.push( "ok" ).fail( "some error" ).close(); // => ok default1 & 2
  }
  
  // Export global Water, platform dependant
  typeof module !== "undefined" && "exports" in module && (module.exports = water);
  typeof global !== "undefined" && (global.Water = water);
  typeof window !== "undefined" && (window.Water = water);

})();

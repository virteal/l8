// test/vote.js
//  sample test application: reactive liquid democracy
//
// "When liquid democracy meets Twitter..."
//
// april 2014 by @jhr

"use strict";

function ephemeral( app ){

app.version = "0.1";

/*
 *  First, let's create an "ephemeral" reactive dataflow framework.
 *  Application specific code comes next.
 */
 
var l8    = app.l8    = require( "l8/lib/l8.js"    );

// Boxons are similar to promises, but very light
var boxon = app.boxon = require( "l8/lib/boxon.js" );

// Water sources are reactive variables
var water = app.water = require( "l8/lib/water.js" );

// Fluids are streams of piped data
var fluid = app.fluid = water.fluid;

// My de&&bug() darling, traces that can be disabled with low overhead
var de        = false;
var debugging = true; // Interactive mode, useful to debug test cases
var trace     = app.trace = l8.trace;
var bug       = app.bug   = trace;

app.debug_mode = function( x ){
// Get/set debug mode
  if( arguments.length ){
    de = !!x;
  }
  return de;
}

function mand( b, msg ){
// de&&mand() is like assert()
  if( b )return;
  var tmp = msg ? ": " + msg : msg;
  bug( "l8/test/vote.js, assert error" + tmp );
  if( de && debugging )debugger;
  if( ! (de && debugging ) )throw new Error( "vote.js assert" );
}
app.assert = mand;

// de&&bugger() invokes the debugger only in debugging mode
function bugger(){ if( debugging )debugger; }
app.bugger = bugger;

function error_traced( f ){
// error_traced( fn ) is like fn but with exceptions traced in debug mode
  return !de ? f : function(){
    try{
      return f.apply( this, arguments );
    }catch( err ){
      trace( "Error", err, err.stack );
      if( debugging ){
        debugger;
      }else{
        throw err;
      }
    }
  };
}
app.error_traced = error_traced;


// Misc. util

function noop(){}

var _ = app._ = noop();      // _ === undefined

var extend = function( to, from ){
// Fast inject of properties. Note: not just owned ones, prototype's too
  for( var ii in from ){ to[ ii ] = from[ ii ]; }
  return to;
};
app.extend = extend;

// Cool to load all vocabulary at once in some scope.
// Usage: require( "ephemeral.js" ).into( global )
app.into  = function( obj ){ extend( obj, app ); };

var cached_array_diff = {};
function array_diff( old, now, no_cache ){
// Compare two sets of objects and detect changes.
// Returns { old:[.], now:[.], added:[.], removed:[.], kept:[.], changes: nn );
  if( !old ){ old = [] }
  if( !now ){ now = [] }
  if( !old.length ){
    return cached_array_diff = {
      old:     old,
      now:     now,
      added:   now,
      removed: [],
      kept:    [],
      changes: now.length
    };
  }
  if( !now || !now.length ){
    return cached_array_diff = {
      old:     old,
      now:     now,
      removed: old,
      added:   [],
      kept:    [],
      changes: old.length
    };
  }
  // Return cached value if diff about same arrays
  // ToDo: that won't work if array content got changed, ie mutable arrays
  if( old === cached_array_diff.old
  &&  now === cached_array_diff.now
  && !no_cache
  )return cached_array_diff;
  var added   = [];
  var removed = [];
  var kept    = [];
  old.forEach( function( v ){
    if( now.indexOf( v ) === -1 ){
      removed.push( v );
    }else{
      kept.push( v );
    }
  });
  now.forEach( function( v ){
    if( old.indexOf( v ) === -1 ){
      added.push( v );
    }
  });
  return cached_array_diff = {
    old:     old,
    now:     now,
    added:   added,
    removed: removed,
    kept:    kept,
    changes: added.length + removed.length
  };
}
app.diff = array_diff;


/*
 *  Reactive entities management
 */

//var global = this;

var epoch = 0; // 1397247088461; // 2034 is too soon
function now(){
  return now.now || l8.now - epoch;
}

app.now = now;
var ONE_YEAR   = app.ONE_YEAR   = 365 * 24 * 60 * 60 * 1000;
var ONE_MONTH  = app.ONE_MONTH  =  31 * 24 * 60 * 60 * 1000;
var ONE_WEEK   = app.ONE_WEEK   =   7 * 24 * 60 * 60 * 1000;
var ONE_DAY    = app.ONE_DAY    =       24 * 60 * 60 * 1000;
var ONE_HOUR   = app.ONE_HOUR   =            60 * 60 * 1000;
var ONE_MINUTE = app.ONE_MINUTE =                 60 * 1000;


/*
 *  Computation steps managements
 *
 *  Steps create or update entities.
 *  They can trigger consequences by pushing an entity into a fluid.
 *  If the same entity is pushed multiple times into the same fluid, only
 *  the first push is actually performed.
 */

var Stepping  = 0;
var StepQueue = [];
var PushQueue = [];
var PushMap   = {};

function steps( list ){
  de&&mand( !Stepping );
  Stepping++;
  //debugger;
  if( list ){
    list.forEach( function( item ){
      step( item );
    });
  }
  var queue  = StepQueue;
  StepQueue = [];
  var box = boxon();
  water.steps( queue ).boxon( function( err ){
    if( err ){
      // Get rid of potential new steps, cancelled
      StepQueue = [];
      Stepping--;
      box( err );
      return;
    }
    // If new steps where created, perform them now
    if( StepQueue.length ){
      steps().boxon( function( err ){
        Stepping--;
        box( err ); } );
    }else{
      Stepping--;
      box();
    }
  } );
  return box;
}

function step( fn ){
  var s = function(){
    de&&mand( !StepQueue.length );
    try{
      fn();
    }catch( err ){
      trace( "Failed step", err, err.stack );
      throw err;
    }
    // Code was run, do pushes, at most one per fluid
    var queue = PushQueue;
    PushQueue = [];
    var map   = PushMap;
    PushMap = {};
    queue.forEach( function( f_e ){
      var fluid  = f_e.fluid;
      var entity = f_e.entity;
      var push_id = "" + fluid.water().id + "." + entity.id;
      // If such push is still pending, push and mark as 'done'
      if( map[ push_id ] !== "done" ){
        map[ push_id ] = "done";
        fluid.push( entity );
      }
    } );
  };
  StepQueue.push( s );
}

function push( f, e ){
// Add a push operation for an entity, done at end of current 'step'.
// During a step, multiple push operations are reduced to a single operation.
  var push_id = "" + f.water().id + "." + e.id;
  var state = PushMap[ push_id ];
  if( !state || state === "done" ){
    PushMap[ push_id ] = "pending"; // pending
    PushQueue.push( { fluid: f, entity: e } );
  }
  return e;
}


/*
 *  Voting machines.
 *
 *  There is a main voting machine and domain specific ones.
 *  Machines belongs to some "owner".
 *  Vote in domain specific machine is possible for persons who belong to
 *  that domain only. When the owner is a Twitter user, only followed users
 *  can vote.
 *  Note: each vote in a domain specific machine also impact the same topic
 *  in the main machine. That way, results for domain members can be compared
 *  with results from the general audience.
 *
 *  ToDo: factorize to make this application neutral.
 */
 
function Machine( options ){
  this.options = options;
  this.owner   = options.owner || "@jhr";
}

app.machine = Machine;
var MainMachine = Machine.current = Machine.main = new Machine({});


/*
 *  Ids - increasing integers
 *
 *  Ids are integers. When an entity needs one, NextId is provided and
 *  then incremented. NextId is adjusted to always be more than any previously
 *  used id (stored ones typically).
 */

// Global pool of all entities, id indexed
var NextId      = 0;
var MaxSharedId = 9999;
var AllEntities = [];
app.AllEntities = AllEntities;

var lookup = function( id ){
// Look for an existing entity based on id, xor undefined.
// Also detect forward reference ids and adjust NextId accordingly.
  // Sometimes the UID is actually already an entity or a type
  if( id.is_entity )return id;
  if( id.prototype && id.prototype.is_entity )return id.prototype;
  // Sometimes the UID is actually an entity type name
  if( typeof id === "string" )return AllEntities[ id ];
  if( id >= NextId ){
    de&&bug( "Forward UID lookup", id );
    NextId = id + 1;
  }
  return AllEntities[ id ];
};

var debug_entity;
app.set_debug_entity = function( x ){
// Helper to start traces, before failing test cases typically
  debug_entity = x || NextId;
};

var alloc_id = function( x ){
// Entities have an unique id. This function checks if a provided id is
// a forward reference id and adjusts NextId accordingly. If no id is
// provided, one is returned and NextId is incremented.
  if( x ){
    if( x >= NextId ){
      de&&bug( "Forward UID", x );
      NextId = x + 1;
    }
    return x;
  }
  // de&&bug( "New UID", NextId );

  // debug_entity, when met, starts debug mode, useful for failing test cases
  if( NextId === debug_entity ){
    trace( "Start interactive debugging for entity " + NextId );
    de = true;
    debugging = true;
  }
  return NextId++;
};


/*
 *  Base class for all entities.
 *
 *  From latin "ens" + "itas", is being (real, physical).
 *   aka: a thing.
 *
 *  Entities have an ID, usually.
 *  There is a global table of all entities: AllEntities.
 *  Ephemeral entities will "expire", sometimes prematurely.
 *  Entities without an ID are "updates": they describe changes about
 *  properties of an existing entity; they are "values", not "objects".
 *
 *  Attributes:
 *    - id -- an integer, unique, increasing
 */

function Entity( options ){
  // Make sure the entity has an id
  this.id = alloc_id( options.id );
  // Track all entities, some of them will expire
  AllEntities[ this.id ] = this;
}
app.Entity = Entity;

// Define __proto__ for Entity instances
extend( Entity.prototype, {
  
  // To enable "duck" typing
  is_entity: true,
  
  // Redefined by sub types
  type: "Entity",

  // Type checker
  is_a: function( type ){ return this.constructor === type; },
  
  // Create a new entity or update an existing one (ie one with same "key")
  create: function( options ){ return new Entity( options ); },
  
  // Most entities "expires", usually after some delay. Some may "resurrect"
  expired: function(){ return false; },

  // Some entities are actually updates about another entity
  is_update: function(){ return false; },
  is_create: function(){ return !this.is_update(); },
  
  // Queue a push, done at end of current step
  push: function( a_fluid ){ return push( a_fluid, this ); },
  
  // Debug related
  log: function( f ){ trace( f ? f.call( this, this ) : this.toString() ); },
  toString: function(){
    return ""
    + (this === this.constructor.prototype ? "Proto" : "")
    + this.type
    + "." + this.id
    + (this.label ? "[" + this.label + "]" : "" );
  }
  
} );

// ToDo: is this OK?
Entity.prototype.constructor = Entity;
Entity.type = function( named_f ){ return type( named_f, this ); };

// Pretty print for debugging
var abbreviations = {
  orientation: "o",      // short, because frequent
  vote:        "v",
  win:         "win",
  disagree:    "disa",
  against:     "again",
  total:       "tot",
  direct:      "dir",
  duration:    "dura",
  topic:       "&",
  tag:         "#",       // so called #hashtags
  timestamp:   "ts",
  proposition: "prop",
  persona:     "@",       // @name for users/personas
  "result":    "+",       // +results of votes on a proposition
  "time_touched": "touch"
};

function abbreviate( str ){
// Improve signal/noise in long traces using abbreviations
  var tmp = str;
  if( tmp.length <= 3 )return tmp;
  // Remove plural, ie remove ending 's'
  if( tmp[ tmp.length - 1 ] === "s" && tmp !== "ts" ){
    tmp = tmp.substring( 0, tmp.length - 1 );
  }
  // Either use an abbreviation or remove voyels
  return abbreviations[ tmp ]
  || tmp[0] + tmp.substring( 1 ).replace( /[aeiou]/g, "" );
}


function pretty( v, level ){
// Similar to inspect() but customized for entities
  
  if( arguments.length < 2 ){ level = 1; }
  
  if( level < 0 )return ".";
  
  var buf = "";
  
  if( v === _ )return "_";
  
  if( typeof v === "function" || typeof v === "object" ){

    if( v === null )return "null";
    if( typeof v === "function" ){

      // Water, get current |value
      if( v._water ){
        buf += "|" + pretty( v._water.current, level && level - 1 );
        return buf;

      // ref() => &id
      }else if( v.rid ){
        if( v.entity ){
          buf += "&" + pretty( v.entity, level && level - 1 );
        }else{
          buf += "&" + v.rid;
        }

      // normal functions
      }else{
        if( v.name ){
          buf += "." + v.name + "()";
        }else{
          buf += "()";
        }
      }

    // Water errors!
    }else if( v.watered ){
      buf += "!" + pretty( v.error, level && level - 1) + "!";
      
    }else if( Array.isArray( v ) ){
      if( level === 0 || !v.length ){
        return "[]" + (v.length ? "." + v.length : "");
      }else{
        var abuf = [];
        v.forEach( function( v ){
          abuf.push( pretty( v, level - 1 ) );
        });
        return "[" + abuf.join( " " ) + "]";
      }

    // Objects, if entity => toString()
    }else{
      if( level <= 1 ){
        if( v.is_entity ){
          buf += v.toString(); 
        }else{
          if( level === 0 )return "{.}";
        }
      }
    }

    if( level <= 0 )return buf;

    // Display attributes of object
    var lbuf = [];
    var val;
    for( var attr in v ){
      if( attr !== "id" && v.hasOwnProperty( attr ) ){
        val = v[ attr ];
        // Skip label, if already displayed
        if( v.is_entity && attr === "label" )continue;
        // Skip "buried" unless actually buried
        if( attr === "buried" ){
          if( val ){ lbuf.push( "buried" ) }
          continue;
        // Show "timestamp" & "time_touched" relative to now vs since epoch
        }else if( attr === "timestamp" || attr === "time_touched" ){
          val -= now();
        // Turn "expire" into a boolean that is false if expiration is remote
        }else if( attr === "expire" ){
          if( ( val.water && val() || val ) - now() > 2 * 24 * 60 * 60 * 1000 ){
            val = false;
          }
        // Skip "effect" when there is none
        }else if( attr === "effect" ){
          if( val === _ )continue;
          // Skip "next_effect" when there is none
        }else if( attr === "next_effect" ){
          if( !val )continue;
        // Skip "updates" when only the initial create update is there
        }else if( attr === "updates" ){
          if( val._water && val() && val().length === 1 )continue;
          if( Array.isArray( val ) && val.length === 1 )continue;
        // Skip "now" and "was" attributes, too much noise
        }else if( attr === "now" || attr === "was" )continue;
        // For booleans, show the flag name, with a ! prefix if false
        if( val === true || val === false ){
          lbuf.push( (val ? "" : "!") + abbreviate( attr ) );
          continue;
        }
        if( typeof val !== "function" ){ attr = abbreviate( attr ); }
        lbuf.push( "" + attr + "" + pretty( val, level && level - 1 ) );
      }
    }
    if( !lbuf.length )return buf;
    return buf + "{" + lbuf.join( " " ) + "}";
    
  }else if( typeof v === "string" ){
    return buf + '"' + v + '"';
    
  }else if( v === ONE_YEAR ){
    return "1year";
    
  }else if( v === true ){
    return "_t";
    
  }else if( v === false ){
    return "_f";
    
  }else{
    return buf + "" + v;
  }
}
app.pretty = pretty;

function dump_entity( x, level ){
  if( !level ){ level = 1; }
  trace( pretty( x, level ) );
  //console.log( "Value", x.value() );
}
app.dump_entity = dump_entity;

function dump_entities( from, level ){
// This is a debugging tool at the moment.
// ToDo: implement a "dump_to_file()" that basically store a snapshot of the
// entire "image" of all entities.
// It should then be easy to later restore memory image of the entities and
// from that starting point handle the additional change log to fully restore
// any state.
// This is probably the simple way to compress a change log.
//   image + change log => new image.
// Nota: the compression is not a size compression, it is a speed compression
// because rebuilding the image from a blank image + the full log of changes
// takes much longer than rebuilding it from a snapshot image + the log of
// additional changes. The size of the image will shrink only when some
// entities expires. Consequently, an image can get quite large, which is
// an issue when memory is limited.
// Nota: storing an image let external programs perform analysis on that image
// to extract relevant information without having to duplicate the full
// update logic implemented by the image producer.
// Nota: for large image, the dump could block the machine for too long. In
// such cases, some incremental dump could be implemented, probably using some
// copy on change logic during the dump to avoid inconsistencies.
// Nota: if the image can be compressed to a reasonable size, it could be
// sent to subscribers, together with further changes, so that such subscribers
// could run the update logic locally and maintain a synchronized copy of the
// original image.
// Nota: an incremental sharing of the image is possible if changes done on the
// copy fail when they miss parts of the image, ask for these parts, and then
// replay that change, until it succeeds. This works like virtual memory, where
// accesses may generate "page faults" when data must be restored from swap.
// Nota: this master/slaves scheme can scale somehow but the "master" image
// is still a bottleneck. Specially considering the fact that any slave
// initiated update must be sent to the master in order to receive the changes
// to apply on the local copy (potentially partial) of the image.
// Nota: the slave could maintain a "shadow" copy of the image, in parallel to
// the true synchronized image, in order to provide quick feedback to whoever
// initiated the update ; there is a risk that such a shadow image never gets
// discarded by the true image, if connection with the master gets lost
// for too long for example. The issue is even more complex if sub slaves
// are informed about that shadow image. But it is feasible!
  trace( "--- ENTITY DUMP ---" );
  if( !level ){ level = 1; }
  var list = AllEntities;
  var ii = from || 0;
  var item;
  if( ii <= MaxSharedId ){
    while( item = list[ ii++ ] ){
      dump_entity( item, level );
    }
    ii = MaxSharedId + 1;
  }
  while( item = list[ ii++ ] || ii < NextId ){
    item && dump_entity( item, level );
  }
  //console.log( "RootTopic:", value( RootTopic, true ) );
  trace( "--- END DUMP ---" );
}
app.dump_entities = dump_entities;


/*
 *  Types for ephemeral entities.
 *
 *  Usage:
 *     base_type.type( sub_type );
 *     function sub_type( options ){
 *        ... called by sub_type.create( options ) ...
 *        return this; // or something else, like constructors
 *     }
 *     sub_type.prototype.instance_method_xx = function( xxx ){ xxx };
 */

var type = function( ctor, base, opt_name ){
// Prototypal style inheritance with typed entities.
// "ctor" is a function. It's name is the subtype name.
// It is called in two cases:
// - To initialize a newly created entity
// - To update an existing entity
// It must call this.register( key ) to distinguish these cases.
//  'key' can be any string, including a combination of ids, "." separated.
// After that call, this.is_update() is false for creations.
//   this.water() returns l8 water() for entities xor almost idem() for updates
  if( !base ){ base = Ephemeral; }
  var proto = base.prototype;
  var name = opt_name || ctor.name;
  var sub = ctor.prototype = extend( {}, proto );
  sub.type = name;
  sub.constructor = ctor;
  sub.super  = proto;  // Access to super instance stuff, like instance methods
  ctor.super = base;   // Access to super static stuff, like class methods
  ctor.ctors = [];     // All constructors, from Entity, down to this new type
  var a_ctor = ctor;
  while( a_ctor ){
    ctor.ctors.unshift( a_ctor );
    a_ctor = a_ctor.super;
  }
  var entity_fluid = ctor.fluid = fluid();
  sub.push = function( f ){
    if( f ){
      de&&mand( !f.is_update() );
      push( f, this );
      return this;
    }
    de&&mand( !this.is_update() );
    push( entity_fluid, this );
    var sup = this.super.push;
    // ToDo: fix stack overflow
    if( 0 && sup ){
      sup.call( this );
    }
    return this;
  };
  // Build the instance creation/update function
  ctor.create = sub.create = function( options ){
    var obj = Entity.created = Object.create( sub );
    //if( !options ){ obj.machine = Machine.current; }
     // Call all constructors, including super, super's super, etc
    var ii = 1;
    var list = ctor.ctors;
    var a_ctor;
    var r;
    // ToDo: unroll for speed
    Entity.call( obj, options );
    while( a_ctor = list[ ii++ ] ){
      r = a_ctor.call( obj, options );
      if( r ){ obj = r; }
    }
    //de&&bug( "New entity", "" + pretty( obj, 2 ) );
    // Push new entity on the fluid bound to the entity's type, unless proto
    if( proto_entity ){
      if( obj ){
        obj.push();
      }
    }
    return obj;
  };
  // ToDo: improve create/update syntax
  sub.update = function( options ){
    options.key = this.key;
    return this.create( options );
  };
  // Create the prototypal instance. It will will create new instances
  var proto_entity = Object.create( sub );
  Entity.call( proto_entity, { machine: MainMachine } );
  // ctor.create( { machine: MainMachine } );
  ctor.prototype = sub = AllEntities[ name ] = proto_entity;
  ctor.id = proto_entity.id;
  app[ name ] = ctor;
  de&&bug( "Create entity " + pretty( proto_entity ) );
  // Create global table of all entities of this new type
  ctor.all = {};
  ctor.find = function( key ){ return ctor.all[ key ] };
  // Ease sub typing
  ctor.type = function( sub_type, opt_name ){
    return type( sub_type, ctor, opt_name );
  };
  de&&mand( proto_entity === proto_entity.constructor.prototype );
  de&&mand( proto_entity.is_entity );
  de&&mand( proto_entity.id );
  de&&mand( proto_entity.super === proto );
  de&&mand( proto_entity.constructor === ctor );
  de&&mand( proto_entity.constructor.prototype === proto_entity );
  return proto_entity;
};


Function.prototype.water = Function.prototype.when = function(){
// Ember style computed property.
// Usage, during entity's .create() only:
//  this.attr = function(){ this.other_attr() * 10 }.water( this.other_attr );
// When .create() is called, Entity.created points to the being created obj
  var w = water();
  // Bind the water obj with the transform function and with the target entity
  w.entity = Entity.created;
  w.entity_transform = this;
  w( _, function_watered, arguments );
  return w;
};

function function_watered(){
  var entity    = Water.current.entity;
  var transform = Water.current.entity_transform;
  var r;
  try{
    r = transform.apply( entity, arguments );
  }catch( err ){
    trace( "Water transform error", err, "on entity " + entity, err.stack );
    de&&bugger();
  }
  return r;
}


/*
 *  Entities sometimes reference each others using ids, when stored typically
 */

function ref(){
  var f = function(){
    // Set
    if( arguments.length ){
      var entity = arguments[0];
      // r( some_entity )
      if( typeof entity === "object" ){
        f.entity = entity;
        f.rid   = entity.id;
      // r( some_id )
      }else{
        f.entity = null;
        f.rid   = alloc_id( entity ) || 0;
      }
      return f;
    }
    // Get
    if( f.entity )return f.entity;
    return f.entity = AllEntities[ f.rid ];
  };
  if( arguments.length ){
    f.apply( null, arguments );
  }else{
    f.entity = null;
    f.rid   = 0;
  }
  return f;
}

function deref( o, seen ){
// Resolve id references into pointers
  if( !o )return o;
  if( typeof o === "function" ){
    // o can be a type sometimes, it is the prototype that is an entity
    if( o.prototype.is_entity ){
      o = o.prototype;
    }else{
      if( o.rid )return o();
      return o;
    }
  }
  if( typeof o !== "object" )return o;
  if( !seen ){
    seen = {};
  }else{
    if( o.is_entity ){
      if( seen[ o.id ] )return o;
      seen[ o.id ] = true;
    }
  }
  for( var attr in o ){
    if( o.hasOwnProperty( attr ) ){
      if( attr !== "machine" ){
        o[ attr ] = deref( o[ attr ], seen );
      }
    }
  }
  return o;
}

/*
 *  json encoding of entity requires changing pointers into references.
 *  if o.attr points to an entity, it is replaced by an o.$attr with an id.
 *  In arrays, pointers are replaced by { $: id } values.
 */

var cached_rattr_encode = {};
var cached_rattr_decode = {};

function rattr_encode( attr ){
  var v;
  if( v = cached_rattr_encode[ attr ] )return v;
  v = "$" + attr;
  cached_rattr_encode[ attr ] = v;
  cached_rattr_decode[ v    ] = attr;
  return v;
}

function rattr_decode( attr ){
  var v;
  if( v = cached_rattr_decode[ attr ] )return v;
  v = attr.substring( 1 );
  cached_rattr_encode[ v    ] = attr;
  cached_rattr_decode[ attr ] = v;
  return v;  
}

function json_encode( o ){
// Change pointers into id references for json storage
  if( typeof o !== "object" )return o;
  var json;
  if( Array.isArray( o ) ){
    json = [];
    o.forEach( function( v, ii ){
      if( v ){
        if( v.id ){
          json[ ii ] = { $: v.id };
        }else if( v.rid ){
          json[ ii ] = { $: v.rid };
        }else{
          json[ ii ] = json_encode( v );
        }
      }else{
        json[ ii ] = v;
      }
    });
    return json;
  }
  json = {};
  for( var attr in o ){
    if( o.hasOwnProperty( attr ) ){
      if( attr === "machine" )continue;
      if( o[ attr ] ){
        if( o[ attr ].is_entity ){
          json[ rattr_encode( attr ) ] = o[ attr ].id;
        }else if( o[ attr ].rid ){
          json[ rattr_encode( attr ) ] = o[ attr ].rid;
        }else{
          json[ attr ] = json_encode( o[ attr ] );
        }
      }else{
        json[ attr ] = o[ attr ];
      }
    }
  }
  return json;
}

function json_decode_resolve( id ){
  alloc_id( id );
  var entity = lookup( id );
  return entity || ref( id );
}

function json_decode( o ){
  if( typeof o !== "object" )return o;
  var decoded;
  if( Array.isArray( o ) ){
    decoded = [];
    o.forEach( function( v, ii ){
      if( v && v.$ ){
        decoded[ ii ] = json_decode_resolve( v.$ );
      }else{
        decoded[ ii ] = v;
      }
    });
    return decoded;
  }
  decoded = {};
  for( var attr in o ){
    if( o.hasOwnProperty( attr ) ){
      if( attr[0] === "$" ){
        decoded[ rattr_decode( attr ) ] = json_decode_resolve( o[ attr ] );
      }else{
        decoded[ attr ] = json_decode( o[ attr ] );
      }
    }
  }
  return decoded;
}


function value( x, force ){
// Entity's value is a snapshot of the entity's current state
  // console.log( x );
  var o;
  var a;
  var r;
  if( x ){
    if( x.is_entity && x.buried ){
      return _;
    }else if( x.is_entity && !force ){
      return x.id;
    }else if( typeof x === "function" ){
      if( x._water ){
        return value( x._water.current );
      }
    }else if( typeof x === "object" ){
      if( x.watered ){
        return { watered: "water", error: value( x.error ) };
      }else if( Array.isArray( x ) ){
        a = [];
        x.forEach( function( v, ii ){
          a[ ii ] = value( v );
        });
        return a;
      }else{
        o = {};
        // Scan all properties, including inherited ones
        for( var attr in x ){
          r = value( x[ attr ] );
          if( typeof r !== "undefined"
          // Filter out some attributes
          && [ "machine", "type", "v", "super", "is_entity", "buried", "was", "now" ]
            .indexOf( attr ) === -1
          ){
            o[ attr ] = r;
          }
        }
        return o;
      }
    }else{
      return x;
    }
  }else{
    return x;
  }
}
app.value = value;

Entity.prototype.value = function(){
// The "value" of an entity is a snapshot copy of the current value of all
// it's attributes. Some attributes are actually skipped because they relate
// to the internal mechanic of the change processing.
  //de&&mand( Machine.current = this.machine );
  return value( this, true );
};


/*
 *  The only constant is change - Heraclitus
 *
 *  Changes are TOPs: Target.Operation( Parameter ). They describe an event/
 *  action about something. Usually it's about creating or updating an entity.
 *
 *  Changes are the only inputs of the Ephemeral machine.
 *
 *  The processing of change produces one or more effects. The first effect
 *  is linked with the changed entity and linked with further effects from
 *  there. An effect, see Effect entity base type below, is an entity, either
 *  a new one or an updated one.
 *
 *  Attributes:
 *  - Entity/id
 *  - ts          -- timestamp
 *  - t           -- target type
 *  - o           -- operation, ie "create" typically, it's a create/update
 *  - p           -- parameters, sent to the type.create() function
 *  - from        -- optional link to some previous change
 *  - to          -- the first entity that was impacted by the change
 *  - last_effect -- the last entity that was impacted by the change
 *  - change      -- optional, when change is somehow an effect itself
 */

Entity.type( Change );
function Change( options ){
  this.ts   = options.timestamp || now();
  this.t    = options.t;
  this.o    = options.o || "create";
  this.p    = options.p || {};
  this.from = options.from;
  this.to   = options.to;
  this.last_effect = null; // Tail of linked effect, see .next_effect
  this.change = null;      // When change is somehow an effect itself
}

Change.prototype.process = function(){
// This is the mapping function applied on the fluid of Changes
  var target = lookup( this.t );
  de&&mand( target );
  var operation = this.o || "create";
  de&&bug( "\nChange.process, invoke", operation, "on " + target, "p:", value( this.p ) );
  try{
    // If not id was provided for the new entity, reuse the change's id itself
    if( this.p && !this.p.id && this.id ){
      // This is useful to avoid id excessive expansion during restarts
      this.p.id = this.id;
    }
    // Remember what is the change currently processed, see Effect constructor
    Change.current = this;
    // Freeze time until next change
    now.now = this.p.ts;
    return target[ operation ].call( target, this.p );
  }catch( err ){
    trace( "Could not process change", value( this, true ), err, err.stack );
    return water.fail( err );
  }
};


/*
 *  Effect entity, abstract type
 *  aka Mutable
 *
 *  Changes produce effects. Let's track the updates.
 *  All effects come from some Change, the last change involved is remembered
 *  and other effects due to that same last change are linked together. This
 *  is mainly for auditing/debugging but it might be useful for other
 *  purposes.
 *
 *  Attributes:
 *  - Entity/id   -- an integer, unique, increasing
 *  - key         -- a unique key, a string
 *  - change      -- the change that triggered the effect
 *  - next_effect -- next effect in change's list of effects (see Change/to)
 *  - effect      -- optional, the updated entity, if effect is an update
 *  If the effect is not an update, then it is the updated entity:
 *  - updates     -- array of snapshoot values of the entity, ie log
 *  - was         -- the last snapshoot value of the entity
 */

Entity.type( Effect );
function Effect( options ){
  var change = Change.current;
  de&&mand( change );
  // Effect is due to a change, link change to effects, linked list
  this.change = change;
  // If first effect
  if( !change.to ){
    change.to = this;
    change.last_effect = this;
    this.next_effect = null;
  // Else effect is an indirect effect of the initial change, link them
  }else{
    de&&mand( change.last_effect );
    change.last_effect.next_effect = this;
    change.last_effect = this;
    this.next_effect = null;
  }
  // Also remember this change as the "first" update, ie the "create" update
  this.updates = water( [ change.p ] );
  this.was     = null;
  // Some effects are about a pre existing entity, ie they are updates.
  // .register( key ) will detect such cases
  this.key    = options.key;
  this.effect = _;
}

Effect.prototype.update = function( other ){
// Default update() injects other's attributes into entity.
  de&&mand( other.is_update() );
  for( var attr in other ){
    if( !other.hasOwnProperty( attr ) )continue;
    // Skip inherited attributes
    if( attr in Effect.prototype )continue;
    // If target attribute is a function, call it, ie update water sources
    if( typeof this[ attr ] === "function" && this[ attr ]._water ){
      // Updates are values, no water in them
      de&&mand( typeof other[ attr ] !== "function" );
      this[ attr ]( other[ attr ] );
      continue;
    }
    // Skip attributes that don't already exists
    if( !this.hasOwnProperty( attr ) )continue;
    this[ attr ] = other[ attr ];
  }
  return this;
};

Effect.prototype.touch = function(){
// Called by .register(), when there is an update.
// To be redefined by sub types
  return this;
};

Effect.prototype.register = function( key ){
// Register entity and detect updates about pre-existing entities
  //if( this.id === 10009 )debugger;
  if( typeof key !== "string" ){
    key = AllEntities[ key ];
    de&&mand( key );
    key = key.key;
    de&&mand( key );
  }
  // Look for an existing entity with same type and same key
  this.key = key;
  var entity = this.constructor.all[ key ];
  // If found then this entity is actually an update for that existing entity
  if( entity ){
    de&&bug( "Update on " + entity + ", key:" + key + ", update: " + this );
    de&&mand( entity !== this );
    de&&mand( !entity.is_update() );
    // ToDo: does such an update need UID?
    // Remember the target entity that this update produces an effect on
    if( this.id === 10016 )debugger;
    this.effect = entity;
    //this.to = entity;
    de&&mand( this.is_update() );
    de&&mand( !entity.is_update() );
    // Add the update to the entity's log of updates
    var updates = entity.updates();
    entity.was = entity.value();
    updates.push( entity.was );
    entity.updates( updates );
    // Invoke possibly redefined .touch()
    entity.touch();
    return entity;
  }
  // Genuine new entity, key first seen, track it
  de&&bug( "Key for new " + this + " is: " + key );
  this.constructor.all[ key ] = this;
  return this;
};
  
Effect.prototype.is_update = function(){ return !!this.effect; };
  
Effect.prototype.water = function( other ){
// Changes to entities involves watering the original with an update.
  // There must be actual water only in the original, not in the updates
  return other === this
  ? water
  : function water_update( init_val ){
    // x = water( init_val );
    if( typeof init_val !== "undefined" )return init_val;
    // x = water( _, ff, [ init_val, other_deps... ] )
    return arguments[2] && arguments[2][0];
  };
};


 /*
  *  Immutable entities are one shot effects, no updates
  */

Effect.type( Immutable );
function Immutable(){};

Immutable.prototype.register = function(){
  var target = Effect.prototype.register.apply( this, arguments );
  de&&mand( target === this );
  return target;
};


/*
 *  Version entity
 *
 *  Persisted entity are stored in "log" files. Whenever a new version of this
 *  software is created, with changes to the data schema, a new version entity
 *  is created.
 *  During restore (from log) global Change.versioning progresses until it
 *  reaches the value of Change.version, the current version of the schema.
 *  As a result, code can check Change.versioning to adapt the schema of older
 *  changes.
 */

Change.version    = "1";
Change.versioning = "";

Entity.type( Version );
function Version( options ){
  this.label = Change.version = options.label;
}


/*
 *  The rest is ephemeral. It will expire and be buried, unless resurrected.
 *  Abstract type.
 *
 *  Lifecycle: create(), [renew()], expiration(), [resurrect() + renew()]...
 *
 *  Attributes:
 *  - Entity/id
 *  - Effect/key
 *  - Effect/updates
 *  - Effect/was
 *  - timestamp    -- time at creation
 *  - time_touched -- time when last touched/updated
 *  - duration     -- life expectancy
 *  - buried       -- flag, true after expiration without resurrection
 *  - expire       -- time of expiration, is timestamp + duration
 */

Effect.type( Ephemeral );
function Ephemeral( options ){
  this.timestamp    = options.timestamp || now();
  this.time_touched = options.time_touched || this.timestamp;
  this.duration     = water( options.duration || ONE_YEAR );
  this.buried       = false;
  this.expire       = function(){
    var limit = this.timestamp + this.duration();
    if( now() > limit ){
      this.bury();
    }else{
      this.schedule( limit );
    }
    return limit;
  }.when( this.duration );
}

Ephemeral.prototype.expired = function(){
  if( this.buried )return true;
  return now() > this.expire();
};

Ephemeral.prototype.bury = function(){
  if( this.buried )return;
  this.buried = true;
  this.expiration();
  // Clear object if not resurrected, this enables some garbage collection
  if( this.buried ){
    for( var attr in this ){
      if( attr !== "is_entity" && attr !== "buried" ){
        var v = this[ attr ];
        if( v ){
          if( v._water ){ water.dispose( v ); }
        }
        this[ attr ] = undefined;
      }
    }
    // Also remove from list of all entities to prevent new references to it
    AllEntities[ this.id ] = null;
  }
};

Ephemeral.prototype.expiration = function(){
  // Default is to create an expiration entity but subtype can do differently
  Expiration.create( { entity: this } );
};

Ephemeral.prototype.resurrect = function(){
// To be called from a redefined .expiration(), needs a renew().
  if( !this.buried )throw new Error( "Resurrect Entity" );
  this.buried = false;
  // Resurrection.create( { entity: this ); } );
};

Ephemeral.prototype.schedule = function( limit ){
  var delay = limit - now();
  if( delay < 0 ){ delay = 0; }
  var that = this;
  setTimeout( function(){
    if( that.expired() ){ that.bury(); }
  }, delay );
};

Ephemeral.prototype.age = function(){
  return now() - this.timestamp;
};

Ephemeral.prototype.age_touched = function(){
  return now() - this.time_touched;
};

Ephemeral.prototype.renew = function( duration ){
  if( this.buried )return;
  if( !duration ){ duration = ONE_YEAR; }
  var new_limit = now() + duration;
  var total_duration = new_limit - this.timestamp;
  this.duration( total_duration );
  // Renewal.create( { entity: this } );
};

Ephemeral.prototype.touch = function(){
  var delay = this.expire() - ( this.time_touched = now() );
  // If touched after mid life, extend duration to twice the current age
  if( delay < this.age() / 2 ){
    this.renew( this.age() * 2 );
  }
  // Touch.create( { entity: this } );
};


/*
 *  Base type of event entities
 *
 *  Attributes:
 *  - Entity/id
 */

Immutable.type( Event );
function Event(){}


/*
 *  Expiration entity
 *  This is the event that occurs when an entity expires.
 *
 *  When this event occurs, the entity cannot be resurrected anymore.
 *  To resurrected an entity when it is about to expire, one needs to
 *  redefine the .expiration() method of that entity.
 *
 *  Attributes:
 *  - Entity/id
 *  - entity -- the entity that expired
 */
 
 Event.type( Expiration );
 function Expiration( options ){
   de&&mand( this.buried );
   this.entity = options.entity;
 }


/*
 *  Trace entity
 *
 *  This is for deployed systems
 *
 *  Attributes:
 *  - Entity/id
 *  - severity   -- critical/error/warn/info/debug
 *  - parameters -- list of parameters
 *  - subject    -- the entity this trace is about, if any
 */
 
Event.type( Trace );
function Trace( options ){
  this.subject     = options.subject;
  this.severity    = options.severity;
  this.parameters  = options.parameters;
}

// Trace event severity
Trace.debug    = "debug";
Trace.info     = "info";
Trace.warn     = "warn";
Trace.error    = "error";
Trace.critical = "critical";

function TRACE( e, p ){ Trace.create({ event: e, parameters: p }); }
function DEBUG(){    TRACE( Trace.debug,    arguments ); }
function INFO(){     TRACE( Trace.info,     arguments ); }
function WARN(){     TRACE( Trace.warn,     arguments ); }
function ERROR(){    TRACE( Trace.error,    arguments ); }
function CRITICAL(){ TRACE( Trace.critical, arguments ); }

app.TRACE    = TRACE;
app.DEBUG    = DEBUG;
app.INFO     = INFO;
app.WARN     = WARN;
app.ERROR    = ERROR;
app.CRITICAL = CRITICAL;

/*
 *  Persistent changes processor
 */

function persist( fn, a_fluid, filter ){
  // At some point changes will have to be stored
  var restore_done = false;
  a_fluid.tap( function( item ){
    // Don't store while restoring from store...
    if( !restore_done )return;
    // Some changes don't deserve to be stored
    if( filter && !filter( item ) )return;
    // Don't log traces slowly
    if( item.type === "Trace" ){
      // ToDo: write traces, fast
      return;
    }
    try{
      de&&bug( "Write", fn, "id:", item.id );
      // ToDo: let entity decide about is own storage format
      var value = json_encode( deref( item ) );
      var json;
      if( 0 ){
        if( item.store_value ){
          value = item.store_value();
        }else{
          value = Entity.store_value.call( item );
        }
      }
      // Special handling for "Change" entity
      // ToDo: should be in Change.prototype.store_value()
      if( value.o === "create" ){
        // Remove default o:"create" member from Change entities
        value.o = _;
        // Get rid of duplicated id
        de&&mand( value.id === value.p.id );
        value.id = _;
        // Move timestamp into "options" parameter
        value.p.ts = value.ts;
        value.ts = _;
        // Remove .to if it points to the entity itself
        if( value.$to && value.p.$to === value.uid ){
          value.$to = _;
        }
        // Remove .last_effect and change, internal use only
        value.$last_effect = value.change = _;
        // As a result value.t is like an SQL table name
        // and value.p is like an SQL record
      }
      // Track max id so far, needed at restore time
      // value.lid = NextId - 1;
      json = JSON.stringify( value );
      fs.appendFileSync( fn, json + "\r\n" );
    }catch( err ){
      trace( "Could not write to", fn, "id:", item.id, "err:", err );
      trace( err );
    }
  });
  // Return a boxon, fulfilled when restore is done
  var next = boxon();
  var fs = require( "fs" );
  if( Ephemeral.force_bootstrap ){
    try{ fs.unlinkSync( fn ); }catch( _ ){}
    restore_done = true;
    next( "forced bootstrap" ); return next;
  }
  // Determine what should be the next UID, greater than anything stored
  // ToDo: avoid reading whole file!
  try{
    var content = fs.readFileSync( fn, "utf8" );
    var idx = content.lastIndexOf( '"id":' );
    if( idx !== -1 ){
      content = content.substring( idx + '"id":'.length );
      content = parseInt( content, 10 );
      de&&bug( "Restore, max id:", content );
      alloc_id( content );
    }
  }catch( err ){
    // File does not exist, nothing to restore
    restore_done = true;
    // Log version
    if( Change.version !== Change.versioning ){
      Change.versioning = null;
      step( function(){
        Change.create({ t: "Version", o: "create", p: { label: Change.version } });
      } );
    }
    next( err );
    return next;
  }
  // Will feed a flow with records streamed from the file
  var change_flow = fluid();
  var error;
  change_flow // .log( "Restore" )
  .map( json_decode )
  .failure( function( err ){
    // ToDo: errors should terminate program
    error = err;
    change_flow.close();
  })
  .final( function(){
    de&&bug( "End of restore" );
    // restore done. what is now pushed to "changes" gets logged
    restore_done = true;
    now.now = 0;
    // Log version
    if( Change.version !== Change.versioning ){
      Change.versioning = null;
      step( function(){
        Change.create({ t: "Version", o: "create", p: { label: Change.version } } ); 
      } );
    }
    next( error );
  })
  .to( a_fluid );
  // Use a Nodejs stream to read from previous changes from json text file
  // Use npm install split module to split stream into crlf lines
  var split = require( "split" );
  var input = fs.createReadStream( fn );
  input
  .on( "error", function( err    ){
    trace( "Error about test/vote.json", err );
    change_flow.fail( err );
    change_flow.close();
  })
  .pipe( split( JSON.parse ) )
  // ToDo: use "readable" + read() to avoid filling all data in memory
  .on( "data",  function( change ){ change_flow.push( change ); } )
  .on( "error", function( err ){
    trace( "Restore, stream split error", err );
    // ToDo: only "unexpected end of input" is a valid error
    // flow.fail( err );
  })
  .on( "end", function(){
    de&&bug( "EOF reached", fn );
    change_flow.close();
  });
  return next;
}

 
fluid.method( "pretty", function(){
  return fluid.it.map( function( it ){ return pretty( it ); } );
} );

de&&Expiration.fluid.pretty().log( "Log Expiration" );

function start( bootstrap, cb ){
// Start the "change processor".
// It replays logged changes and then plays new ones.
// When there is no log, it bootstraps first.
  var time_started = l8.update_now();
  if( !cb ){ cb = boxon(); }
  de&&dump_entities();
  // Here is the "change processor"
  Change.fluid
  .map( function( change ){
    return Change.prototype.process.call( deref( change ) ); })
  .failure( function( err ){
      trace( "Change process error", err );
  })
  ;//.pretty().log();
  // It replays old changes and log new ones
  persist(
    app.store || "ephemeral.json.log",
    Change.fluid,
    function( item ){ return item.t !== "Trace"; } // filter trace entities
  ).boxon( function( err ){
    var ready = boxon();
    if( !err ){
      de&&bug( "Restored from " + app.store );
      ready();
    }else{
      trace( "Restore error", err );
      // ToDo: handle error, only ENOENT is ok, ie file does not exist
      de&&bug( "Bootstrapping" );
      time_started = l8.update_now();
      var step_list = bootstrap();
      step_list.push( function(){
        trace( "Bootstrap duration: "
          + ( l8.update_now() - time_started )
          + " ms"
        );
      } );
      try{
        steps( step_list ).boxon( function( err ){
          de&&bug( "Bootstrap done" );
          ready( err );
        });
      }catch( err ){
        trace( "Bootstrap error", err, err.stack );
        ready( err );
      }
    }
    ready( function( err ){
      de&&dump_entities();
      trace( "Start duration: "
        + ( l8.update_now() - time_started )
        + " ms"
      );
      if( err ){
        CRITICAL( "Cannot proceed, corrupted " + app.store );
        dump_entities();
        cb( err ); // new Error( "Corrupted store" ) );
      }else{
        INFO( "READY" );
        cb();
      }
    });
  });
}

// More exports
Ephemeral.start = function( bootstrap, cb ){
  // id 0...9999 are reserved for meta objects
  NextId = MaxSharedId + 1;
  start( bootstrap, cb );
};

Ephemeral.inject = function( t, p ){
  if( Array.isArray( t ) )return steps( t );
  if( Stepping ){
    return Change.create( { t: t, o: "create", p: p } );
  }else{
    return steps( [
      function(){
        Change.create( { t: t, o: "create", p: p } )
      }
    ]);
  }
};

Ephemeral.get_next_id = function(){ return NextId; };
Ephemeral.ref = ref;

// Exports
app.ice    = function ice( v ){  // Uniform access water/constant
  return function(){ return v; }; // Unused, yet
};

return app;

} // end of function ephemeral()

// exports = ephemeral;



/* ========================================================================= *\
 * ========================= Application specific code ===================== *
\* ========================================================================= */


var vote = { store: "vote.json.log" }; // ToDo: "file://vote.json.log"
// require( "ephemeral.js" )( vote )
ephemeral( vote );

var l8        = vote.l8;
var Event     = vote.Event;
var Effect    = vote.Effect;
var Ephemeral = vote.Ephemeral;

// My de&&bug() and de&&mand() darlings
var de      = false;
var trace   = vote.trace;
var bug     = trace;
var bugger  = vote.bugger;
var error_traced = vote.error_traced;
var mand    = vote.assert;
var assert  = vote.assert;

// More imports
var value   = vote.value;
var pretty  = vote.pretty;
var water   = vote.water;
var diff    = vote.diff;
var _       = vote._;
//debugger;


var namize_cache = {};

function namize( label ){
  // Twitter name & hashtags are case insensitive but are displayed with case
  if( !label )return label;
  var tmp = namize_cache[ label ];
  if( tmp )return tmp;
  tmp = label.toLowerCase();
  namize_cache[ label ] = tmp;
  namize_cache[ tmp ] = tmp;
  return tmp;
}

function name_equal( a, b ){
  return namize( a ) === namize( b );
}


/*
 *  Persona entity
 *
 *  Individuals and groups.
 *
 *  Individuals can vote. Vote is about topics, either propositions or tags.
 *  Multiple votes on the same topic are possible, new vote erases the previous
 *  one. Delegations of voting power can be established, based on tags and
 *  given to an agent who can vote (or delegate) on behalf of the delegator.
 *
 *  Individual's label the twitter name of some twitter account, possibly an
 *  account bound to a "true human person" or a fake or whatever emerges (AI,
 *  ...). One individual, one vote.
 *
 *  Groups are personas that don't vote. However, groups have orientations like
 *  individuals. As a result, one can delegate to a group. The orientation of
 *  a group is the consolidation of the orientations of the group members,
 *  where each member's orientation is weighted according to the number of
 *  members in it (group members can be groups themselves).
 *
 *  Group's label is the twitter name of some twitter account. As a result,
 *  the management of the membership is done by whoever controls that
 *  twitter account. To add a member, follow that member.
 *
 *  Attributes:
 *    - Entity/id
 *    - Effect/key
 *    - label            -- unique name, idem to key
 *    - role             -- "individual" or "group"
 *    - members          -- friends or group's members
 *    - memberships      -- to groups
 *    - delegation       -- of persona to agent, about tagged topics
 *    - delegation_from  -- idem, agent's side, relation is bidirect
 *    - votes            -- all votes, both direct & indirect
 */

Ephemeral.type( Persona );
function Persona( options ){

  this.label            = options.label || options.key;
  this.name             = namize( this.label );

  var persona = this.register( this.name );
  var water   = this.water( persona );

  this.role             = options.role || Persona.individual;
  this.members          = water( [] );
  this.memberships      = water( [] );
  this.delegations      = water( [] );
  this.delegations_from = water( [] );
  this.votes            = water( [] );
  // ToDo: total number of votes, including votes for others.
  // This would make it easy to detect "super delegates"

  // ToDo: test update()
  if( this.is_update() )return persona.update( this );

  // Indexes, for faster access
  this.votes_indexed_by_proposition = {};
}

// Persona roles
Persona.individual = "individual";
Persona.group      = "group";

Persona.prototype.is_group      = function(){ return this.role === "group"; };
Persona.prototype.is_individual = function(){ return !this.is_group();      };

Persona.find = function( key ){
// Key are case insensitive on twitter
  return Persona.all[ namize( key ) ];
}

Persona.prototype.get_vote_on = function( proposition ){
// If there is a vote by persona on said topic, return it, or null/undef
  de&&mand( proposition.is_a( Topic ) );
  var found_vote = this.votes_indexed_by_proposition[ proposition.key ];
  if( typeof found_vote !== "undefined" )return found_vote;
  this.votes().every( function( vote ){
    if( vote.proposition === proposition ){
      found_vote = vote;
      return false;
    }
    return true;
  });
  trace( "BUG? unexpected vote on " + proposition + " of " + this );
  this.votes_indexed_by_proposition[ proposition.key ] = found_vote || null;
  return found_vote;
};

Persona.prototype.get_orientation_on = function( proposition ){
// Return orientation on topic if it exits, or else undefined
  de&&mand( proposition.is_a( Topic ) );
  var vote = this.get_vote_on( proposition );
  return vote && vote.orientation();
};

Persona.prototype.add_delegation = function( delegation, loop ){
// Called when a delegation is created. This will also add the reverse
// relationship (delegation_from), on the agent's side.
  de&&mand( delegation.is_a( Delegation ) );
  de&&mand( delegation.persona === this );
  var delegations = this.delegations() || [];
  if( delegations.indexOf( delegation ) !== -1 ){
    trace( "BUG? Delegation already added " + delegation
      + ", persona: " + this
      + ", agent: " + delegation.agent
    );
    return this;
  }
  var now = delegations.slice(); // ToDo: need a copy?
  now.push( delegation );
  de&&bug( "Add delegation " + delegation
   + " for persona " + this 
   + " for topics tagged " + pretty( delegation.tags() )
   + " to agent " + delegation.agent
  ); 
  this.delegations( now );
  if( !loop ){
    delegation.agent.add_delegation_from( delegation, true );
  }
  return this;
};

Persona.prototype.add_delegation_from = function( delegation, loop ){
// Called by Persona.add_delegation() to sync the agent side of the
// one to one bidirectional relation.
  de&&mand( delegation.agent === this );
  var delegations_from = this.delegations_from() || [];
  if( delegations_from.indexOf( delegation ) !== -1 ){
    trace( "BUG? Delegation 'from' already added: " + delegation
      + ", agent: " + delegation.agent
      + ", persona: ", delegation.persona
    );
  }
  var now = delegations_from.slice();
  now.push( delegation );
  de&&bug( "Add delegation " + delegation
   + " by agent " + this 
   + " for topics tagged " + pretty( delegation.tags() )
   + " from persona " + delegation.persona
  ); 
  this.delegations_from( now );
  if( !loop ){
    delegation.persona.add_delegation( delegation, true );
  }
  return this;
};


Persona.prototype.vote_for_others = function( vote ){
// When a persona was given delegation, her vote may cascade into votes for
// other personas, on the same proposition.
  de&&mand( vote.persona === this );
  var persona     = this;
  var orientation = vote.orientation();
  var proposition = vote.proposition;
  var delegations_from = this.delegations_from() || [];
  if( !delegations_from.length )return this;
  de&&bug( "Persona " + persona + " votes " + orientation
    + " on proposition " + vote.proposition
    + " for at most " + delegations_from.length + " other personas"
  );
  //debugger;
  delegations_from.forEach( function( delegation ){
    if( proposition.is_tagged( delegation.tags() ) ){
      de&&bug( "Cascade delegated vote by " + persona
        + " on behalf of " + delegation.persona 
        + " for proposition: " + proposition
        + ", orientation: " + orientation
      );
      var vote = Vote.create({
        persona:     delegation.persona,
        delegation:  delegation,
        proposition: proposition,
        orientation: orientation
      });
      // Remember all votes due to the said delegation
      delegation.track_vote( vote );
    }
  });
  return this;
};

Persona.prototype.delegates_to = function( agent, tags, seen ){
// Predicate to assert the existence of a delegation by a persona to some
// agent, directly or indirectly.
  if( !seen ){ seen = {}; }
  if( seen[ this.id ] ){
    trace( "Loop detected when looking for agent " + agent );
    return false;
  }
  seen[ this.id ] = true;
  return !this.delegations().every( function( delegation ){
    return !delegation.delegates_to( agent, tags, seen );
  });
};


Persona.prototype.find_applicable_delegations = function( proposition ){
  var found_delegations = [];
  var delegations = this.delegations();
  delegations.forEach( function( delegation ){
    if( delegation.is_active()
    && delegation.includes_proposition( proposition )
    ){
      found_delegations.push( delegation );
    }
  });
  return found_delegations;
};

Persona.prototype.track_vote = function( vote ){
// Called by Vote constructor
  de&&mand( vote.persona === this );
  var votes = this.votes();
  de&&mand( votes.indexOf( vote ) === -1 );
  votes.push( vote );
  this.votes( votes );
  this.votes_indexed_by_proposition[ vote.proposition.key ] = vote;
  return this;
};

Persona.prototype.add_member = function( member ){
  var members = this.members();
  de&&mand( members.indexOf( member ) === -1 );
  members.push( member );
  this.members( members );
  return this;
};

Persona.prototype.remove_member = function( member ){
  var members = this.members();
  var idx     = members.indexOf( member );
  if( idx === -1 )return this;
  members.splice( idx, 1 );
  this.members( members );
  return this;
};

Persona.prototype.is_member_of = function( group ){
  // ToDo: add index to speed things up
  // return group.members_indexed_by_persona( this.key );
  return group.members().indexOf( this ) !== -1;
};

Persona.prototype.has_member = function( persona ){
  return persona.is_member_of( this );
};

Persona.prototype.add_membership = function( membership ){
  var memberships = this.memberships();
  de&&mand( memberships.indexOf( membership ) === -1 );
  // Remember index inside persona's .memberships[], to speed up removal
  // ToDo: use an hashmap?
  membership.insert_index = memberships.length;
  memberships.push( membership );
  this.memberships( memberships );
  return this;
};

Persona.prototype.remove_membership = function( membership ){
  var memberships = this.memberships();
  var idx = membership.insert_index;
  de&&mand( typeof idx !== "undefined" );
  // ToDo: quid of compaction?
  memberships[ idx ] = _;
  membership.insert_index = _;
  // memberships.splice( idx, 1 );
  // Not cloned, not needed
  this.memberships( memberships );
  return this;
};


/*
 *  Source entity
 *
 *  - Describes the "reference material" that explains why a topic was created
 *  - or why a vote was assigned to some persona when that vote does not come
 *    from the persona herself. Note: a twitter persona can override such
 *    votes, as she is the most legitimate source.
 */

Ephemeral.type( Source );
function Source( options ){
  this.topic   = options.topic;
  this.persona = options.persona;
  this.label   = options.label;
  this.url     = options.url;
}


/*
 *  A Tweet entity.
 */

Ephemeral.type( Tweet );
function Tweet( options ){

  de&&mand( options.persona );
  de&&mand( options.id_str );

  this.persona     = options.persona;
  this.label       = options.id_str;
  this.text        = options.text || "?";
  this.user        = options.user; // id_str of the user
  this.screen_name = options.screen_name || "?"; // What comes after @
  this.name        = options.name || this.screen_name;
  this.vote        = water( options.vote ); // When associated to a vote
  this.topic       = water( options.topic || (options.vote && options.vote.proposition ) );
  this.api         = options.api; // Whatever the Twitter API provides
  this.origin      = options.origin || Tweet.received;
}

// Tweet origin
Tweet.sent     = "sent";     // Tweet sent to twitter
Tweet.received = "received"; // Tweet received from twitter


/*
 *  Topic entity
 *
 *  Atomic topics are the ultimate target of votes.
 *  aka Propositions
 *    their source is typically a tweet.
 *    they can be tagged.
 *  Tag topics help to classify propositions. 
 *    they don't have a source, maybe.
 *    they can be voted on too, like propositions.
 *      this could help develop a folksonomy of tags, based on votes
 *
 *  ToDo: split in Topic plus two sub types, tags and propositions?
 *
 *  Attributes
 *    - Entity/id
 *    - Effect/key
 *    - label        -- name of proposition (a tweet id_str) or #xxxx tag, key
 *    - source       -- source could be a url, typically
 *    - propositions -- tags track the propositions they tag
 *    - delegations  -- tags track the delegations they impact, can be huge!
 *    - tags         -- propositions track the tags assigned to them
 *    - votes_log    -- propositions track all the votes about them
 *    - result       -- the result of votes on the proposition
 */
 
Ephemeral.type( Topic );
function Topic( options ){
  
  de&&mand( options.label );

  this.label = options.label;
  this.name  = namize( this.label );

  var topic = this.register( this.name );
  var water = this.water( topic );
  
  this.source       = water( options.source );
  this.votes_log    = water( options.votes_log );
  this.propositions = water( options.propositions );
  this.tags         = water( options.tags );
  this.delegations  = water( options.delegations );
  this.result       = options.result
    || ( this.is_create() && Result.create({ proposition: this } ) );

  // ToDo: implement .update()?
  if( this.is_update() )return topic.update( this );
  
  // Let's tag the propositions
  if( options.propositions ){
    options.propositions.forEach( function( proposition ){
      proposition.add_tag( topic );
    });
  }else{
    topic.propositions( [] );
  }
  
  // Let the tags know that a new proposition uses them
  if( options.tags ){
    options.tags.forEach( function( tag ){
      if( !tag.propositions ){
        trace( "Missing .propositions for tag " + tag, value( tag, true ) );
      }
      de&&mand( tag.propositions && typeof tag.propositions === "function" );
      tag.add_proposition( topic );
    });
  }else{
    topic.tags( [] );
  }
}

Topic.find = function( key ){
  return Topic.all[ namize( key ) ];
}

Topic.prototype.update = function( other ){
  // ToDo: handle .tags and .propositions changes
  this.source( other.source );
  if( other.result ){ this.result = other.result };
  if( other.delegations ){ this.update_delegations( other.delegations ); }
  return this;
};

Topic.prototype.update_delegations = function( list ){
  trace( "ToDo: update delegations" );
  this.delegations( list );
  return this;
};

Topic.prototype.is_proposition = function(){ return this.label[0] !== "#"; };
Topic.prototype.is_tag         = function(){ return !this.is_proposition(); };

Topic.prototype.heat = function(){
// Compute the "heat" of a topic. "Hot topics" should come first.
  var touched = this.result.time_touched || this.time_touched;
  // Recently touched are hot
  var age = vote.now() - touched;
  if( age < vote.ONE_MINUTE )return touched;
  if( age < vote.ONE_HOUR   )return touched;
  // Less recently touched topics are hot depending on number of direct votes
  // Less recently touched tags are hot depending on number of propositions
  return this.is_tag() ? this.propositions().length : this.result.direct();
};

Topic.prototype.filter_string = function(){
  var sorted_tags = this.tags().sort( function( a, b ){
    // Most agreed first
    var a_rank = a.result.orientation() + a.result.direct();
    var b_rank = a.result.orientation() + a.result.direct();
    if( a < b )return -1;
    if( a > b )return  1;
    return 0;
  })
  var buf = [];
  sorted_tags.forEach( function( tag ){
    buf.push( tag.label );
  });
  buf = buf.sort( function(){

  })
  return buf.join( " " );
};

Topic.prototype.add_vote = function( v ){
  this.log_vote( v );
  this.result.add_vote( v );
  return this;
};


Topic.prototype.remove_vote = function( was ){
// Called by vote.remove()
  //this.log_anti_vote( was );
  this.result.remove_vote( was );
};

Topic.prototype.log_vote = function( v ){
// Called by .add_vote()
// There is a log of all votes. It is a snapshot copy of the vote value that is
// kept because a persona's vote can change over time.
  var val = v.value();
  val.snaptime = vote.now();
  val.entity = v;
  val.persona_label = v.persona.label;
  var votes_log = this.votes_log();
  if( !votes_log ){ votes_log = []; }
  votes_log.push( val );
  this.votes_log( votes_log );
  return this;
};

Topic.prototype.log_anti_vote = function( was ){
// Called by remove_vote()
// When a vote is removed (erased), it is removed from the log of all the votes
// on the proposition.
  var votes_log = this.votes_log();
  // Look for the logged vote
  var found_idx;
  var ii = votes_log.length;
  while( ii-- ){
    if( votes_log[ ii ].entity.id === was.id ){
      found_idx = ii;
      break;
    }
  }
  // The vote must be there, ie log_vote() was called before
  de&&mand( typeof found_idx !== "undefined" );
  // No clone, votes contains the valid votes, ie not the removed ones
  // ToDo: this is rather slow, maybe nullification would be better, with
  // some eventual compaction
  votes_log.splice( found_idx, 1 );
  this.votes_log( votes_log );
  return this;
};


Topic.prototype.add_tag = function( tag, loop ){
  var list = this.tags() || [];
  var idx = list.indexOf( tag );
  // Done if already there
  if( idx !== -1 )return this;
  // ToDo: avoid clone?
  var new_list = list.slice();
  new_list.push( tag );
  this.tags( new_list );
  if( !loop ){
    tag.add_proposition( this, true );
    tag.update_votes();
  }
  return this;
};

Topic.prototype.remove_tag = function( tag, loop ){
  var list = this.tags() || [];
  var idx = list.indexOf( tag );
  // Done if already not there
  if( idx === -1 )return this;
  // ToDo: avoid clone?
  var new_list = list;
  de&&mand( idx !== - 1 );
  new_list.splice( idx, 1 );
  this.tags( new_list );
  if( !loop ){
    tag.remove_proposition( this, true );
    tag.update_votes();
  }
  return this;
};

Topic.prototype.add_proposition = function( proposition, loop ){
// Each tag has a list of all the propositions that are tagged with it
  var list = this.propositions() || [];
  // Done if already there
  if( list.indexOf( proposition ) !== - 1 )return this;
  // ToDo: avoid clone?
  var new_list = list.slice();
  new_list.push( proposition );
  this.propositions( new_list );
  if( !loop ){
    proposition.add_tag( this, true );
    this.update_votes();
  }
  return this;
};

Topic.prototype.remove_proposition = function( proposition, loop ){
  var list = this.propositions()|| [];
  var idx = list.indexOf( proposition );
  // Done if already not there
  if( idx === -1 )return this;
  // ToDo: avoid clone
  var new_list = list;
  de&&mand( idx !== - 1 );
  new_list.splice( idx, 1 );
  this.propositions( new_list );
  if( !loop ){
    proposition.remove_tag( this, true );
    this.update_votes();
  }
  return this;
};

Topic.prototype.is_tagged = function( tags ){
// Returns true if a topic includes all the specified tags
// Note: #something always includes itself, ie proposition xxx is #xxx tagged
  if( typeof tags === "string" ){
    return string_tags_includes( this.tags_string(), tags );
  }
  return tags_includes( this.tags() || [], tags, this );
};

Topic.prototype.tags_string = function(){
  var topic_tags_str = this.is_tag() ? [ this.label ] : [ "#" + this.label ];
  var topic_tags = this.tags() || [];
  topic_tags = topic_tags
  .sort( function( a, b ){
    return a.heat() - b.heat()
  })
  .forEach( function( tag ){
    topic_tags_str.push( tag.name );
  });
  return topic_tags_str.join( " " );
};

function string_tags_includes( tags, other_tags ){
  tags       = " " + tags.toLowerCase().trim() + " ";
  other_tags = " " + other_tags.toLowerCase().trim() + " ";
  if( tags.length < other_tags.length )return false;
  return other_tags.split( " " ).every( function( tag ){
    if( !tag )return true;
    return tags.indexOf( tag  ) !== -1;
  });
}

function tags_includes( tags, other_tags, proposition ){
// Checks that all the other tags are also inside the tags set
// [] does not include [ #a ]
// [ #a, #b, #c ] does include [ #a, #b ]
// [ #a, #b ] does not include [ #a, #c ]
  if( tags.length < other_tags.length )return false;
  for( var tag in other_tags ){
    if( tags.indexOf( other_tags[ tag ] ) === -1 ){
      // When an other tag is not found, enable the proposition to tag itself
      if( !proposition
      || ( other_tags[ tag ].name !== proposition.name
        && other_tags[ tag ].name !== '#' + proposition.name )
      )return false;
    }
  }
  return true;
}

Topic.prototype.add_delegation = function( delegation, loop ){
// Each tag has a list of all the delegations that involve it
  var delegations = this.delegations() || [];
  if( delegations.indexOf( delegation ) === -1 ){
    delegations.push( delegation );
    this.delegations( delegations );
  }
  if( !loop ){
    delegation.add_tag( this, true );
  }
  return this;
};

Topic.prototype.update_votes = function(){
  // Something changed, this may have an impact on delegated votes
  var delegations = this.delegations() || [];
  delegations.forEach( function( delegation ){
    // ToDo: hum... complex!
    trace( "ToDo: handle delegation " + delegation + " in update_votes()" );
    delegation.update_votes();
  });
  return this;
};


/*
 *  Tagging event (or detagging)
 *
 *  This event is created typically when some UI changes the tags for a
 *  proposition/topic.
 *  Potential huge side effects...
 *  Only the owner of the proposition is supposed to have such a power!
 *  Specially when tags are removed.
 *  It is expected that the owner may change tags in order to favor the
 *  the proposition, by using tags that brings lots of positive votes but are
 *  either too general or not well related to the topic at hand. Voters can
 *  fight abusive tagging using Vote.protest.
 *
 *  ToDo: this should be an Action, not an Event
 */

Event.type( Tagging );
function Tagging( options ){
  de&&mand( options.proposition );
  this.proposition = options.proposition;
  // Tags/Detags are either #str or Tag entities, this gets normalized
  this.tags        = options.tags   || [];
  this.detags      = options.detags || [];
  var that = this;
  // Remove tags first, this will restrict the delegations that apply
  var detag_entities = [];
  this.detags.forEach( function( tag ){
    de&&mand( tag.substring( 0, 1 ) === '#' );
    var tag_entity = ( tag.is_entity && tag ) || Topic.find( tag );
    if( !tag_entity ){
      trace( "Cannot detag, inexistent tag " + tag );
    }else{
      if( detag_entities.indexOf( tag_entity ) === -1 ){
        detag_entities.push( tag_entity );
        that.proposition.remove_tag( tag_entity );
      }
    }
  });
  // Then add tags, this will expand the delegations that apply
  var tag_entities = [];
  this.tags.forEach( function( tag ){
    var tag_entity = ( tag.is_entity && tag ) || Topic.find(  tag );
    if( !tag_entity ){
      trace( "On the fly creation of first seen tag " + tag );
      de&&mand( tag.substring( 1 ) === '#' );
      tag_entity = Topic.create( { label: tag } );
    }
    if( tag_entities.indexOf( tag_entity ) === -1 ){
      tag_entities.push( tag_entity );
      that.proposition.add_tag( tag_entity );
    }
  });
  // Normalizes, keep entities only, no strings, no duplicates
  this.detags = tag_entities;
  this.tags   = tag_entities;
}


/*
 *  Vote entity
 *
 *  Personas can vote on propositions. They can change their mind.
 *  A group votes when the consolidated orientation of the group changes.
 *  Vote is either "direct" or "indirect" with a delegation.
 *  Analysts can vote on behalf of personas, based on some public source.
 *  ToDo: analysts should be able to vote on behalf of personas only for
 *  some topics, based on tags.
 */
 
Ephemeral.type( Vote );
function Vote( options ){

  // Decide: is it a new entity or an update? key is persona_id.proposition_id
  var key = options.id_key ||( options.persona.id + "." + options.proposition.id );
  var vote = this.register( key );

  var orientation  = options.orientation || Vote.neutral;
  var persona      = options.persona     || vote.persona;
  var proposition  = options.proposition || vote.proposition;
  de&&mand( persona     );
  de&&mand( proposition );
  this.persona     = persona;
  this.label       = options.label || (persona.label + "/" + orientation );
  this.proposition = proposition;
  if( this.is_create() ){
    this.analyst     = water( options.analyst );
    this.source      = water( options.source );
    this.delegation  = water( options.delegation  || Vote.direct  );
    // Analysts vote "in the open", no privacy ; otherwise defaults to private
    this.privacy     = water( (options.analyst && Vote.public )
      || options.privacy || Vote.public
    );
    this.previously  = water( options.previously  || Vote.neutral );
    this.orientation = water();
    var w = water( _, error_traced( update ), [ this.delegation, this.orientation ] );
    w.vote = this;
    this.persona.track_vote( this );
    this.orientation( orientation );
  }else{
    vote.update( this, options );
  }
  return vote;
  
  // Trigger on orientation or delegation change
  function update(){
    var vote = water.current.vote;
    try{
      if( vote.was
      &&  vote.was.orientation === vote.orientation()
      &&  vote.was.delegation  === vote.delegation()
      ){
        // No changes
        trace( "BUG? useless update of vote " + vote );
        return;
      }
      // Orientation or delegation changed
      if( vote.was ){ vote.remove( vote.was ); }
      if( !options.label ){
        vote.label = vote.persona.label + "/" + vote.orientation();
      }
      vote.add();
      // Push updated entity
      vote.push();
      // Handle delegated votes
      //water.effect( function(){
        vote.persona.vote_for_others( vote );
      //});
    }catch( err ){
      trace( "Could not process vote " + vote, err, err.stack );
      console.trace( err );
      de&&bugger();
    }
  }
}


// Vote orientations
Vote.indirect = "indirect";
Vote.neutral  = "neutral";
Vote.agree    = "agree";
Vote.disagree = "disagree";
Vote.protest  = "protest";
Vote.blank    = "blank";

// Vote delegation, "direct" or indirect via agent
Vote.direct = "direct";

// Vote privacy
Vote.public  = "public";
Vote.secret  = "secret";
Vote.private = "private";

Vote.prototype.is_direct = function(){
  return this.delegation() === Vote.direct;
};

Vote.prototype.is_indirect = function(){
  return !this.is_direct();
};

Vote.prototype.is_public = function(){
  return this.privacy() === Vote.public;
};

Vote.prototype.is_secret = function(){
  return this.privacy() === Vote.secret;
};

Vote.prototype.is_private = function(){
  return this.privacy() === Vote.private;
};

Vote.prototype.update = function( other, options ){
  this.analyst(     other.analyst     = options.analyst     );
  this.source(      other.source      = options.source      );
  this.previously(  other.previously  = options.previously  );
  this.privacy(     other.privacy     = options.privacy     );
  // Don't delegate vote if a direct non neutral vote exists
  if( (options.delegation && options.delegations !== Vote.direct )
    && this.delegation() === Vote.direct
    && this.orientation() !== Vote.neutral
  ){
    de&&bug( "Not delegated, direct vote rules" );
    return this;
  }
  this.delegation(  other.delegation  = options.delegation || Vote.direct );
  this.orientation( other.orientation = options.orientation );
  return this;
};

Vote.prototype.expiration = function(){
// At expiration vote becomes private direct neutral for a while
  if( !this.is_neutral() ){
    this.resurrect();
    this.renew();
    this.orientation( Vote.neutral );
    this.delegation(  Vote.direct  );
    this.privacy(     Vote.private );
  }else{
    this.super.expiration.call( this );
  }
  return this;
};

Vote.prototype.is_neutral = function(){
  return this.orientation() === Vote.neutral;
};

Vote.prototype.add = function(){
  if( this.orientation() === Vote.neutral ){
    // Direct neutral vote enables delegated votes
    if( this.delegation() === Vote.direct ){
      this.delegate();
      if( this.delegation() !== Vote.direct ){
        return this;
      }
    }else{
      return this;
    }
  }
  // Indirect votes are processed at agent's level
  //if( this.orientation() === Vote.indirect )return;
  var vote = this;
  // Votes of groups have no impacts on results
  if( vote.persona.is_group() )return this;
  de&&mand( this.proposition );
  // ToDo: is the .effect required?
  //water.effect(
  //  function(){
      de&&bug( "Add vote " + vote 
        + " now " + vote.orientation()
        + " of " + vote.persona
        + " via " + vote.delegation()
        + " for proposition " + vote.proposition
      );
      vote.proposition.add_vote( vote );
  //  }
  //);
  return this;
};

Vote.prototype.remove = function( was ){
  //debugger;
  de&&mand( !was.is_entity );
  this.previously( was.orientation );
  if( was.orientation === Vote.neutral )return this;
  // Indirect votes are processed at agent's level
  //if( was.orientation === Vote.indirect )return;
  var vote = this;
  // Votes of groups have no impacts on results
  if( vote.persona.is_group() )return this;
  // ToDo: is the .effect required?
  //water.effect(
  //  function(){
      de&&bug( "Remove vote " + vote 
        + " previously " + was.orientation
        + " of " + vote.persona
        + " via " + was.delegation
        + " from proposition " + vote.proposition
      );
      //de&&bugger();
      vote.proposition.remove_vote( was );
  //  }
  //);
  return this;
};

Vote.prototype.delegate = function(){
// Direct neutral vote triggers delegations
  //de&&mand( this.orientation() === Vote.neutral );
  de&&mand( this.delegation()  === Vote.direct  );
  var delegations = this.find_applicable_delegations();
  if( !delegations.length )return this;
  // If multiple delegations apply, select the most recently touched active one
  // ToDo:
  var recent_delegation = null;
  delegations.forEach( function( delegation ){
    if( !recent_delegation
    || delegation.age_touched() < recent_delegation.age_touched()
    ){
      recent_delegation = delegation;
    }
  });
  return this.delegate_using( recent_delegation );
};

Vote.prototype.find_applicable_delegations = function(){
  return this.persona.find_applicable_delegations( this.proposition );
};

Vote.prototype.delegate_using = function( delegation ){
  var agent = delegation.agent;
  var agent_vote = agent.get_vote_on( this.proposition );
  if( !agent_vote )return this;
  var agent_orientation = agent_vote.orientation();
  if( agent_orientation === Vote.neutral )return this;
  de&&bug( "Delegated vote by " + agent
      + " on behalf of " + this.persona
      + " for proposition: " + this.proposition
      + ", orientation: " + agent_orientation
  );
  var vote = Vote.create({
    persona:     delegation.persona,
    delegation:  delegation,
    proposition: this.proposition,
    orientation: agent_orientation
  });
  delegation.track_vote( vote );
  return this;
};

Effect.type( Result );
function Result( options ){
  
  de&&mand( options.proposition );
  
  var result = this.register( "" + options.proposition.id );
  var water  = this.water( result );
  
  this.proposition = options.proposition;
  this.label       = this.proposition.label;
  this.neutral     = water( options.neutral   || 0 ); // ToDo: remove this?
  this.blank       = water( options.blank     || 0 );
  this.protest     = water( options.protest   || 0 );
  this.agree       = water( options.agree     || 0 );
  this.disagree    = water( options.disagree  || 0 );
  this.direct      = water( options.direct    || 0 );
  this.secret      = water( options.secret    || 0 );
  this.private     = water( options.private   || 0 ),
  this.count       = water( 0 );

  // If this is an update, it simply supersedes the so far known result.
  // This is handy to import bulk results from an external system or to
  // compact the persistent log of changes.
  if( this.is_update() ){
    result.neutral(  this.neutral  );
    result.blank(    this.blank    );
    result.protest(  this.protest  );
    result.agree(    this.agree    );
    result.disagree( this.disagree );
    result.direct(   this.direct   );
    result.secret(   this.secret   );
    result.private(  this.private  );
    result.count(    this.count    );
    return result;
  }
  
  // Computed attributes, including orientation transition detection
  
  this.total = function(){
    this.count( this.count() + 1 );
    this.time_touched = vote.now();
    var old = this.total();
    var r = this.neutral()
    + this.blank()
    + this.protest()
    + this.agree()
    + this.disagree();
    de&&bug( "  Total for " + this, "is:", r, "was:", old,
      "direct:", this.direct()
    );
    return r;
  }.when( this.neutral, this.blank, this.protest, this.agree, this.disagree );
  this.total( 0 );
  de && ( this.total.label = "total" );
  
  this.against = function(){
    var old = this.against();
    var r = this.disagree() + this.protest();
    de&&bug( "  Against about " + this, "is:", r, "was:", old );
    return r;
  }.when( this.disagree, this.protest );
  this.against( 0 );
  de && ( this.against.label = "against" );
  
  this.win = function(){
    var old = this.win();
    var r = this.agree() > this.against();
    de&&bug( "  Win about " + this, "is:", r, "was:", old );
    return r;
  }.when( this.agree, this.against );
  this.win( false );
  de && ( this.win.label = "win" );
  
  this.orientation = function(){
    var old = this.orientation() || Vote.neutral;
    var now;
    //if( this.proposition.id === 10017 )de&&bugger();
    de&&bug( "  Computing orientation for " + this,
      "expired:", this.expired(),
      "agree:",   this.agree(),
      "against:", this.against(),
      "protest:", this.protest(),
      "blank:",   this.blank()
    );
    if( this.expired() ){
      now = Vote.neutral;
    }else if( this.agree() > this.against() ){
      // Won
      if( this.agree() > this.blank() ){
        // agree > blank, > against
        now = Vote.agree;
      }else{
        // blank > agree, > against
        now = Vote.blank;
      }
    }else{
      // Lost
      if( this.disagree() > this.neutral() ){
        if( this.disagree() > this.blank() ){
          if( this.disagree() > this.protest() ){
            now = Vote.disagree;
          }else{
            now = Vote.protest;
          }
        }else{
          if( this.blank() > this.protest() ){
            now = Vote.blank;
          }else{
            now = Vote.protest;
          }
        }
      }else{
        if( this.disagree() > this.blank() ){
          if( this.disagree() > this.protest() ){
            now = Vote.disagree;
          }else{
            now = Vote.protest;
          }
        }else{
          if( this.blank() > this.protest() ){
            now = Vote.blank;
          }else{
            now = this.protest() ? Vote.protest : Vote.neutral;
          }
        }
      }
    }
    de&&bug( "  Computed orientation " + this, "was:", old, "is:", now ); //, value( this, true ) );
    if( now !== old ){
      de&&bug( "  Change of orientation, create a transition" );
      //debugger;
      Transition.create({ result: this, orientation: now, previously: old });
      return now;
    }
    // Else don't produce a new value
    return _;
  }.when( this.agree, this.against, this.blank );

  this.orientation( Vote.neutral );
  de && ( this.orientation.label = "orientation" );

  return this;
}

Result.prototype.add_vote = function( vote ){
// Called by topic.add_vote()
  de&&mand( vote.proposition === this.proposition );
  // Neutral votes have no impacts at all
  if( vote.orientation() === Vote.neutral )return this;
  this[ vote.orientation() ]( this[ vote.orientation() ]() + 1 );
  if( vote.delegation() === Vote.direct ){
    this.direct( this.direct() + 1 );
  }
  return this;
};

Result.prototype.remove_vote = function( was ){
// Called by topic.remove_vote()
  de&&mand( was.proposition === this.proposition.id );
  // Nothing was done when neutral vote was added, nothing needed now either
  if( was.orientation === Vote.neutral )return this;
  var old_o = this[ was.orientation ]();
  de&&mand( old_o > 0 );
  this[ was.orientation ]( old_o - 1 );
  if( was.delegation === Vote.direct ){
    var old_d = this.direct();
    de&&mand( old_d > 0 );
    this.direct( old_d - 1 );
  }
  return this;
};


/*
 *  Transition event entity.
 *
 *  A transition is the event that occurs when the consolidated orientation
 *  changes on a topic.
 */
 
Event.type( Transition );
function Transition( options ){
  de&&mand( options.result );
  de&&mand( options.orientation );
  de&&mand( options.previously );
  this.result      = options.result;
  this.orientation = options.orientation;
  this.previously  = options.previously;
}


/*
 *  Delegation entity.
 *
 *  It describes how a persona's vote is delegated to another persona.
 *  A delegation involves a filter that detects the involved topics. That
 *  filter is a list of tags, with an "and" logic. A proposition tagged with
 *  all the tags in that list will pass the filter and be voted on by the
 *  designated agent persona.
 *  Because delegations are transitive, if an agent delegates to another
 *  agent that delegate to the first agent, directly or indirectly, then there
 *  is a "delegation loop". In such case, the delegation cannot be activated.
 */

Ephemeral.type( Delegation );
function Delegation( options ){
  
  //debugger;
  
  de&&mand( options.persona );
  de&&mand( options.agent   );
  de&&mand( options.tags    );
  
  var delegation = this.register( "" + this.id );
  var water      = this.water( delegation );

  // Delegation are transitive, there is a risk of loops
  if( !options.inactive
  && options.agent.delegates_to( options.persona, options.tags )
  ){
    trace( "Loop detected for delegation " + pretty( options ) );
    // ToDo: should provide a "reason" to explain the deactivation
    options.inactive = true;
  }
  
  this.persona  = options.persona;
  this.agent    = options.agent;
  this.label    = this.agent.label;
  this.votes    = water( [] ); // Votes done because of the delegation
  this.tags     = water( [] );
  this.inactive = water();

   if( this.is_update() ){
    // If change to list of tags
    if( options.tags && diff( options.tags, delegation.tags() ).changes ){
      this.inactive = options.inactive || delegation.inactive();
      // Deactivate delegated votes
      delegation.inactive( true );
      delegation.tags( options.tags );
      // Activate delegated votes
      // ToDo: is water.effect() needed?
      if( !this.inactive ){
        water.effect( function(){ delegation.inactive( false ); } );
      }
      return delegation;
    }
    // If change to activation flag only
    delegation.inactive( this.inactive );
    return delegation;
  }

  this.previous_tags = null;
  this.was_inactive  = true;
  var w = water( _,  error_traced( update ), [ this.inactive, this.tags ] );
  w.delegation = this;

  // Fire initial update
  this.inactive( true );
  this.tags( options.tags );
  water.effect( function(){
    delegation.inactive( !!options.inactive );
  });
  this.persona.add_delegation( this );
  return this;

  function update(){
    //debugger;
    var delegation  = water.current.delegation;
    var delta       = diff( delegation.previous_tags, delegation.tags() );
    var inactive    = delegation.inactive();
    var need_update = false;
    // If change in activation
    if( inactive !== delegation.was_inactive ){
      need_update = true;
      delegation.was_inactive = inactive;
      // Delegation became active
      if( !inactive ){
        trace( "Activate delegation" );
        // Refuse to activate a delegation that loops
        if( delegation.agent.delegates_to( delegation.persona, delta.now ) ){
          trace( "Looping delegation is deactivated ", pretty( delegation ) );
          // ToDo: provide some explanation about why activation was refused
          delegation.inactive( true );
        }
        // Delegation becomes inactive
      }else{
        de&&bug( "ToDo: deactivate a delegation" );
      }
    }
    // If changes in tags
    if( delta.changes ){
      // Before such changes, delegation was deactivated
      de&&mand( inactive );
      need_update = true;
      delegation.previous_tags = delta.now;
      var added    = delta.added;
      var removed  = delta.removed;
      var kept     = delta.kept;
      // If totally different sets
      if( !kept.length ){
        removed.forEach( function( tag ){
          de&&bug( "ToDo: handle removed tag " + tag + " for fresh delegation " + delegation );

        });
        added.forEach( function( tag ){
          de&&bug( "Add tag " + tag + " for fresh delegation " + delegation );
          tag.add_delegation( delegation, true );
          // true => don't add tag back to delegation, it's being done here
        });
      // If sets with some commonality
      }else{
        removed.forEach( function( tag ){
          de&&bug( "ToDo: handle removed tag " + tag + " for delegation " + delegation );

        });
        added.forEach( function( tag ){
          de&&bug( "ToDo: handle added tag " + tag + " for delegation " + delegation );

        });
      }
    }
    // Update existing votes and make new delegated votes
    if( need_update ){
      delegation.update_votes();
    }
  }
}

Delegation.prototype.is_active = function(){
  return !this.inactive();
};

Delegation.prototype.is_inactive = function(){
  return !this.is_active();
};

Delegation.prototype.filter_string = function(){
  var buf = [];
  this.tags().forEach( function( tag ){
    buf.push( tag.label );
  });
  return buf.join( " " );
};

Delegation.prototype.update_votes = function(){
  var delegation = this;
  var tags     = delegation.tags();
  var inactive = delegation.inactive();
  var votes = delegation.votes() || [];
  votes.forEach( function( vote ){
    // Check that vote is still delegated as it was when last updated
    if( vote.delegation() !== delegation )return;
    // Does the delegation still include the voted proposition?
    var included = delegation.includes_proposition( vote.proposition );
    // If tags changed (now excludes the proposition) or agent's mind change
    var new_orientation = !inactive && included
      ? delegation.agent.get_orientation_on( vote.proposition )
      : Vote.neutral;
    if( new_orientation && new_orientation !== vote.orientation() ){
      // If vote becomes neutral, maybe another delegation thinks otherwise?
      if( false && new_orientation === Vote.neutral && !included ){
        vote.delegate();
        // If no other agent, true neutral
        if( vote.delegation() === delegation ){
          Vote.create({
            persona: vote.persona,
            delegation: Vote.direct,
            proposition: vote.proposition,
            orientation: Vote.neutral
          });
        }
      }else{
        Vote.create({
          persona: vote.persona,
          delegation: Vote.direct,
          proposition: vote.proposition,
          orientation: new_orientation
        });
      }
    }
  });
  // Discover new delegated votes for tagged propositions
  delegation.vote_on_tags( tags, inactive );
  return this;
};

Delegation.prototype.vote_on_tags = function( tags, inactive ){
  var delegation = this;
  if( inactive )return this;
  var candidate_propositions;
  // Sort tags by increasing number of topics, it speeds up the 'and' logic
  var sorted_tags = tags.slice();
  sorted_tags.sort( function( a, b ){
    return a.propositions().length - b.propositions().length; }
  );
  sorted_tags.forEach( function( tag ){
    // Start with a set of topics, the smaller one
    if( !candidate_propositions ){
      candidate_propositions = tag.propositions().slice();
      // Keep topics that are also tagged with the other tags
    }else{
      var propositions = tag.propositions();
      candidate_propositions.forEach( function( proposition, idx ){
        // If a proposition is not tagged, flag it for removal
        if( propositions.indexOf( proposition ) === -1 ){
          candidate_propositions[ idx ] = null;
        }
      });
    }
  });
  // Collect kept propositions, they match the tags
  if( candidate_propositions ){
    var all_tagged_propositions = [];
    candidate_propositions.forEach( function( proposition ){
      if( proposition ){ all_tagged_propositions.push( proposition ); }
    });
    // Vote on these propositions, based on agent's orientation
    all_tagged_propositions.forEach( function( proposition ){
      var orientation = delegation.agent.get_orientation_on( proposition );
      if( orientation ){
        // Create a vote
        de&&bug( "New delegation implies vote of " + delegation.persona
            + " thru agent " + delegation.agent
            + ", orientation: " + orientation
        );
        Vote.create( {
          persona:     delegation.persona,
          delegation:  delegation,
          proposition: proposition,
          orientation: orientation
        });
      }
    });
  }
  return this;
};

Delegation.prototype.add_tag = function( tag, loop ){
  var tags = this.tags() || [];
  if( tags.indexOf( tag ) !== -1 )return this;
  var now = tags.slice();
  now.push( tag );
  this.tags( now );
  if( !loop ){
    tag.add_delegation( this, true );
  }
  return this;
};


Delegation.prototype.track_vote = function( vote ){
// Called when a persona vote is created due to the agent voting
  var votes = this.votes();
  if( votes.indexOf( vote ) !== -1 )return this;
  // Note: no clone for the array, not needed
  votes.push( vote );
  this.votes( votes );
  return this;
};


// At expiration, the delegation becomes inactive for a while
Delegation.prototype.expiration = function(){
  if( !this.inactive() ){
    this.resurrect();
    this.renew();
    this.inactive( true );
    this.push();
  }else{
    this.super.expiration.call( this );
  }
  return this;
};

Delegation.prototype.includes_tags = function( tags ){
  return tags_includes( tags, this.tags() );
};

Delegation.prototype.includes_proposition = function( proposition ){
  return this.includes_tags( proposition.tags() );
};

Delegation.prototype.delegates_to = function( agent, tags, seen ){
  if( !seen ){ seen = {}; }
  if( seen[ this.agent.id ] ){
    trace( "Loop detected when looking for agent " + agent
    + " in delegation " + this + " of " + this.persona );
    return false;
  }
  seen[ this.id ] = true;
  if( this.includes_tags( tags ) ){
    if( this.agent === agent
    || this.agent.delegates_to( agent, tags, seen )
    ){
      return false;
    }
  }
  return true;
};


/*
 *  Membership entity.
 *
 *  They make personas members of group personas.
 */

Ephemeral.type( Membership );
function Membership( options ){
  
  de&&mand( options.member ); // a persona
  de&&mand( options.group  ); // a group persona typically
  de&&mand( options.group.is_group() );
  
  var key = "" + options.member.id + "." + options.group.id;
  var membership = this.register( key );

  if( this.is_create() ){
    this.member   = options.member;
    this.group    = options.group;
    this.member.add_membership( this );
    this.inactive = water();
    this.inactive.membership = this;
    this.inactive( _, update, [ !!options.inactive ] );
  }else{
    membership.inactive( !!options.inactive )
  }
  return membership;

  // ToDo: handle change in membership activation
  function update( is_inactive ){
    var old = water.current.current;
    if( old === is_inactive )return _;
    // Change
    if( !is_inactive ){
      // Activate
      de&&bug( "Activate membership" );
      water.current.membership.group.add_member( membership.member );
    }else{
      // Deactivate
      de&&bug( "Deactivate membership" );
      water.current.membership.group.remove_member( membership.member );
    }
    return is_inactive;
  }
  
}


Membership.prototype.expiration = function(){
// Handle expiration, first deactivate membership and then remove it
  if( !this.inactive() ){
    this.resurrect();
    this.renew();
    this.inactive( true );
  }else{
    this.super.expiration.call( this );
    this.member.remove_membership( this );
  }
  return this;
};

// Exports
// export = vote;


/* ========================================================================= *\
 * ======================== Vote front end processor ======================= *
\* ========================================================================= */


/*
 *  For UI
 */
 
Ephemeral.type( Visitor );
function Visitor( options ){
  this.persona     = options.persona;
  this.twitter     = options.twitter; // Twitter credentials
  this.actions     = Ephemeral.fluid();
}


/*
 *  Action entity.
 *  This is what a Visitor does. She needs an UI for that purpose.
 */

Ephemeral.type( Action );
function Action( options ){
  this.visitor     = options.visitor;
  this.verb        = options.verb;
  this.parameters  = options.parameters;
}


var replized_verbs = {};
var replized_verbs_help = {};

function bootstrap(){
// This function returns a list of functions that when called can use
// Ephemeral.inject() to inject changes into the machine. The next function
// in the list is called once all effects of the previous function are fully
// done.
// The bootstrap() function is used in the main() function using Ephemeral.
// start(). That latter function will call bootstrap() only when there is
// no log file of persisted changes.

  var debugging = true;

  function def( f, help ){
    replized_verbs[ f.name ] = f;
    replized_verbs_help[ f.name ] = help;
  }

  function c( t, p ){
    trace( "INJECT " + t.name + " " + pretty( p ) );
    return Ephemeral.ref( Ephemeral.inject( t.name, p ).id );
  }
  def( c, "type +opt1:v1 +opt2:v2 ... -- inject a Change" );

  function p( n ){
    return p[n] = c( Persona, { label: n } );
  }
  def( p, "@name -- create a person" );

  function g( n ){
    return p[n] = c( Persona, { label: n, role: "group" } );
  }
  def( g,"@name -- create a group" );

  function t( n, l ){
  // Create a proposition topic, tagged
    if( !Array.isArray( l ) ){
      l = [ l ];
    }
    return t[n] = c( Topic, { label: n, source: "bootstrap", tags: l } );
  }
  def( t, "name +#tag1 +#tag2 ... -- create proposition topic, tagged" );

  function tag( n ){
    return t[n] = c( Topic, { label: n } );
  }
  def( tag, "#name -- create a tag topic" );

  function tagging( p, d, t ){
    if( !Array.isArray( d ) ){
      d = [ d ];
    }
    if( !Array.isArray( t ) ){
      t = [ t ];
    }
    return c( Tagging, { proposition: p, detags: d, tags: t } );
  }
  def( tagging, "&proposition +#detag1 ... , +#tag1 ... -- create a tagging" );


  function v( p, t, o ){
  // Create/Update a vote
    de&&mand( p ); de&&mand( t );
    return v[ v.n++ ]
    = c( Vote, { persona: p, proposition: t, orientation: o } );
  }
  v.n = 0;
  def( v, "&persona &proposition orientation -- create/update a vote" );

  function d( p, t, a, i ){
    if( !Array.isArray( t ) ){
      t = [ t ];
    }
    return d[ d.n++ ] = c( Delegation,
      { persona: p, tags: t, agent: a } );
  }
  d.n = 0;
  def( d, "&persona +#tag1 ... &agent -- create/update a delegation" );

  function r( t, a, d, p, b, n, dir ){
  // Update a result
    return c( Result, { proposition: t,
      agree: a, disagree: d, protest: p, blank: b, neutral: n, direct: dir
    } );
  }

  function m( p, g, i ){
  // Create/Update a membership
    return c( Membership, { member: p, group: g, inactive: i } );
  }
  def( m, "&member &group +inactive:? -- create/update a membership" );

  for( var verb in replized_verbs ){
    http_repl_commands[ verb ] = replized_verbs[ verb ];
  }

  var entity;
  function e( type, key ){
  // Retrieve an entity by key. Usage: e( type, entity or type, key, ... )
  //   ex: e( Persona, "@jhr" )
  //   ex: e( Vote, Persona, "@jhr", Topic, "Hulot president" );
  //   ex: e( Vote, e( Persona, "@jhr"), Topic, "Hulot president" );
  //   ex: e( Vote, Persona, @jhr, e( Topic, "Hulot president" ) );
    if( arguments.length === 1 && type && type.is_entity )return entity = type;
    if( arguments.length === 2 )return entity = type.find( key );
    var id = "";
    var ii = 1;
    while( ii < arguments.length ){
      if( arguments[ ii ].is_entity ){
        id += "." + arguments[ ii ].id;
        ii += 1;
      }else{
        id += "." + arguments[ ii ].find( arguments[ ii + 1 ] ).id;
        ii += 2;
      }
    }
    return entity = type.find( id.substring( 1 ) );
  }

  // This bootstrap is also the test suite...., a() is assert()
  var test_description = "none";
  function a( prop, msg ){
    if( prop )return;
    trace( "DESCRIPTION: " + test_description );
    trace( "Test, error on entity " + pretty( entity, 2 ) );
    console.trace();
    !( de && debugging ) && assert( false, msg );
    de&&bugger;
  }

  var test_count = 0;
  var test_list  = [];
  function describe( text ){
    return function(){
      test_count++;
      test_description = text;
      test_list.push( text );
    }
  }

  function summary(){
    trace( "TEST SUMMARY\n" + test_list.join( "\n" ) );
    trace( "TESTS, " + test_count + " successes"                )
  }

  // Test entities
  var /* individuals */ kudocracy, jhr, hulot, peter;
  var /* groups */ g_hulot;
  var /* tags */ t_president, t_kudocracy;
  var /* propositions */ p_kudocracy, p_hulot;
  var /* votes */ v_jhr, v_peter, v_hulot;
  var /* Results */ r_hulot;

  trace( "Bootstrap - vote.js test suite" );
  return [

    //                          *** Personas ***

    describe( "Personas creation " ),
    function(){ p( "@kudocracy"                                             )},
    function(){ kudocracy = e( Persona, "@kudocracy"                        )},
    function(){ a( kudocracy, "persona @kudocracy exists"                   )},
    function(){ p( "@jhr"                                                   )},
    function(){ jhr = e( Persona, "@jhr"                                    )},
    function(){ p( "@john"                                                  )},
    function(){ p( "@luke"                                                  )},
    function(){ p( "@marc"                                                  )},
    function(){ p( "@peter"                                                 )},
    function(){ peter = e( Persona, "@peter"                                )},
    function(){ p( "@n_hulot"                                               )},
    function(){ hulot = e( Persona, "@n_hulot"                              )},

    //                          *** Groups ***

    describe( "Groups creation" ),
    function(){ g( "Hulot_friends"                                          )},
    function(){ g_hulot = e( Persona, "Hulot_friends"                       )},
    function(){ a( g_hulot.is_group() && !g_hulot.is_individual()           )},

    //                        *** Membership ***

    describe( "Membership creation" ),
    function(){ m( jhr, g_hulot                                             )},
    function(){ a(  jhr.is_member_of( g_hulot)                              )},
    function(){ a(  g_hulot.has_member( jhr )                               )},
    function(){ m( jhr, g_hulot, true /* inactive */                        )},
    function(){ a( !jhr.is_member_of( g_hulot )                             )},
    function(){ a( !g_hulot.has_member( jhr )                               )},
    function(){ m( jhr, g_hulot                                             )},
    function(){ a(  jhr.is_member_of( g_hulot)                              )},
    function(){ a(  g_hulot.has_member( jhr )                               )},

    //                          *** Tags ***

    describe( "Tags creation" ),
    function(){ tag( "#kudocracy"                                           )},
    function(){ t_kudocracy = e( Topic, "#kudocracy"                        )},
    function(){ tag( "#president"                                           )},
    function(){ t_president = e( Topic, "#president"                        )},
    function(){ a(  t_president, "Topic #president exists"                  )},
    function(){ a(  t_president.is_tag()                                    )},
    function(){ a( !t_president.is_proposition()                            )},


    //                     *** Propositions ***

    describe( "Propositions creation" ),
    function(){ t( "kudocracy", []                                          )},
    function(){ p_kudocracy = e( Topic, "kudocracy"                         )},
    function(){ t( "hollande_president",  [ t_president ]                   )},
    function(){ a( e( Topic, "hollande_president").is_proposition()         )},
    function(){ t( "hulot_president",     [ t_president ]                   )},
    function(){ p_hulot = e( Topic, "hulot_president"                       )},
    function(){ a( p_hulot.is_proposition()                                 )},
    function(){ a( r_hulot = p_hulot.result                                 )},

    //                     *** Delegations ***

    function(){ d( jhr, [ t_president ], hulot                              )},

    //                        *** Votes ***

    describe( "@kudocray wants kudocracy" ),
    describe( "Peter first disagrees, about the 'Hulot president' prop" ),
    function(){ v( peter, p_hulot, "disagree"                               )},
    function(){ v_peter = e( Vote, peter, p_hulot                           )},
    function(){ a( r_hulot.orientation() === "disagree"                     )},
    function(){ a( !r_hulot.win()                                           )},
    function(){ a( r_hulot.disagree() === 1                                 )},
    function(){ a( r_hulot.against()  === 1                                 )},
    function(){ a( r_hulot.total()    === 1                                 )},
    function(){ a( r_hulot.direct()   === 1                                 )},

    describe( "Then Peter agrees" ),
    function(){ v( peter, p_hulot, "agree"                                  )},
    function(){ a( r_hulot.orientation() === "agree"                        )},
    function(){ a( r_hulot.win()                                            )},
    function(){ a( r_hulot.agree()    === 1                                 )},
    function(){ a( r_hulot.against()  === 0                                 )},
    function(){ a( r_hulot.total()    === 1                                 )},
    function(){ a( r_hulot.direct()   === 1                                 )},

    describe( "Then Peter votes blank" ),
    function(){ v( peter, p_hulot, "blank"                                  )},
    function(){ a( r_hulot.orientation() === "blank"                        )},
    function(){ a( !r_hulot.win()                                           )},
    function(){ a( r_hulot.agree()    === 0                                 )},
    function(){ a( r_hulot.against()  === 0                                 )},
    function(){ a( r_hulot.blank()    === 1                                 )},
    function(){ a( r_hulot.total()    === 1                                 )},
    function(){ a( r_hulot.direct()   === 1                                 )},

    describe( "Then Peter protests" ),
    function(){ v( peter, p_hulot, "protest"                                )},
    function(){ a( r_hulot.orientation() === "protest"                      )},
    function(){ a( !r_hulot.win()                                           )},
    function(){ a( r_hulot.agree()    === 0                                 )},
    function(){ a( r_hulot.against()  === 1                                 )},
    function(){ a( r_hulot.blank()    === 0                                 )},
    function(){ a( r_hulot.protest()  === 1                                 )},
    function(){ a( r_hulot.total()    === 1                                 )},
    function(){ a( r_hulot.direct()   === 1                                 )},

    describe( "Then Peters gets to neutral, equivalent to 'not voting'" ),
    function(){ v( peter, p_hulot, "neutral"                                )},
    function(){ a( r_hulot.orientation() === "neutral"                      )},
    function(){ a( !r_hulot.win()                                           )},
    function(){ a( r_hulot.agree()    === 0                                 )},
    function(){ a( r_hulot.against()  === 0                                 )},
    function(){ a( r_hulot.blank()    === 0                                 )},
    function(){ a( r_hulot.protest()  === 0                                 )},
    function(){ a( r_hulot.total()    === 0                                 )},
    function(){ a( r_hulot.direct()   === 0                                 )},

    describe( "Hulot votes, jhr too because of a delegation" ),
    function(){ v( hulot, p_hulot, "agree"                                  )},
    function(){ a( r_hulot.orientation() === "agree"                        )},
    function(){ a( r_hulot.win()                                            )},
    function(){ a( r_hulot.agree()    === 2                                 )},
    function(){ a( r_hulot.against()  === 0                                 )},
    function(){ a( r_hulot.total()    === 2                                 )},
    function(){ a( r_hulot.direct()   === 1                                 )},

    describe( "Then Hulot gets to neutral" ),
    function(){ v( hulot, p_hulot, "neutral"                                )},
    function(){ a( r_hulot.orientation() === "neutral"                      )},
    function(){ a( !r_hulot.win()                                           )},
    function(){ a( r_hulot.agree()    === 0                                 )},
    function(){ a( r_hulot.against()  === 0                                 )},
    function(){ a( r_hulot.blank()    === 0                                 )},
    function(){ a( r_hulot.protest()  === 0                                 )},
    function(){ a( r_hulot.total()    === 0                                 )},
    function(){ a( r_hulot.direct()   === 0                                 )},

    describe( "Hulot votes but jhr decides to vote directly" ),
    function(){ v( hulot, p_hulot, "agree"                                  )},
    function(){ a(  r_hulot.win()                                           )},
    function(){ a( r_hulot.total()    === 2                                 )},
    function(){ a( r_hulot.direct()   === 1                                 )},
    function(){ v( jhr, p_hulot, "disagree"                                 )},
    function(){ a( !r_hulot.win()                                           )},
    function(){ a( r_hulot.total()    === 2                                 )},
    function(){ a( r_hulot.direct()   === 2                                 )},

    describe( "Hulot votes but jhr decided to vote directly, respect" ),
    function(){ v( hulot, p_hulot, "blank"                                  )},
    function(){ a( r_hulot.total()    === 2                                 )},
    function(){ a( r_hulot.blank()    === 1                                 )},
    function(){ a( r_hulot.direct()   === 2                                 )},

    describe( "jhr erases his vote and so relies again on his delegation"),
    function(){ v( jhr, p_hulot, "neutral"                                  )},
    function(){ a( r_hulot.total()    === 2                                 )},
    function(){ a( r_hulot.blank()    === 2                                 )},
    function(){ a( r_hulot.direct()   === 1                                 )},

    describe( "Detag p_hulot, so that jhr's delegation does not apply" ),
    function(){ tagging( p_hulot, [ "#president" ], []                      )},
    function(){ a( r_hulot.total()    === 1                                 )},
    function(){ a( r_hulot.blank()    === 1                                 )},
    function(){ a( r_hulot.direct()   === 1                                 )},

    describe( "Restore that tag, jhr delegation applies" ),
    function(){ tagging( p_hulot, [], [ "#president" ]                      )},
    function(){ a( r_hulot.total()    === 2                                 )},
    function(){ a( r_hulot.blank()    === 2                                 )},
    function(){ a( r_hulot.direct()   === 1                                 )},

    describe( "Hulot votes, agree count includes jhr's delegated vote" ),
    function(){ v( hulot, p_hulot, "agree"                                  )},
    function(){ a( r_hulot.total()    === 2                                 )},
    function(){ a( r_hulot.blank()    === 0                                 )},
    function(){ a( r_hulot.agree()    === 2                                 )},
    function(){ a( r_hulot.direct()   === 1                                 )},

    function(){ trace( "**************************************************" )},
    function(){ v( peter, p_hulot, "neutral"                                )},
    function(){ v( hulot, p_hulot, "disagree"                               )},
    function(){ v( peter, p_hulot, "agree"                                  )},
    //function(){ r( p_hulot, 102, 101, 1, 12, 1000, 99                       )},
    function(){ summary(                                                    )},

  function(){} ];
}


/* ---------------------------------------------------------------------------
 *  Dataflow processing. TBD
 *  Each fluid is fed whenever an entity is created or updated.
 *  The only valid action is to inject a change in the machine:
 *    vote.ephemeral.push( type, {...named parameters...} );
 *  That change gets logged in a persistent store and will be replayed whenever
 *  the machine is restarted.
 */

if( de ){
  vote.Persona    .fluid.pretty().log( "-->Log Persona"    );
  vote.Membership .fluid.pretty().log( "-->Log Membership" );
  vote.Source     .fluid.pretty().log( "-->Log Source"     );
  vote.Topic      .fluid.pretty().log( "-->Log Topic"      );
  vote.Delegation .fluid.pretty().log( "-->Log Delegation" );
  vote.Vote       .fluid.pretty().log( "-->Log Vote"       );
  vote.Result     .fluid.pretty().log( "-->Log Result"     );
  vote.Transition .fluid.pretty().log( "-->Log Transition" );
  vote.Visitor    .fluid.pretty().log( "-->Log Visitor"    );
  vote.Action     .fluid.pretty().log( "-->Log Action"     );
}
//Ephemeral.persist( "test/vote.trace.log", Trace.fluid );

/*
 *  Minimal HTTP session management
 *    Session is associated to source ip address.
 *    ToDo: use a cookie
 */


function Session( ip ){
// Constructor, called by .login() only (except for default local session)
  // Return existing obj with same ip
  var session = Session.all[ ip ];
  if( session )return session;
  // Or init a new object
  this.ip            = ip;
  this.visitor       = null;
  this.filter        = "";
  this.current_page  = [];
  this.previous_page = [];
  this.proposition   = null;
  Session.all[ ip ]  = this;
  return this;
}

Session.all = {};

// Defaults to local session
Session.current = new Session( "127.0.0.1" );

Session.prototype.login = function( ip ){
  if( ip !== Session.current.ip ){
    Session.current = new Session( ip );
    return Session.current;
  }else{
    return this;
  }
}

Session.prototype.is_local = function(){
  return this.ip === "127.0.0.1";
}


/*
 *  The http REPL (Read, Eval, Print, Loop) is a very simple UI
 *  to test interactively the Vote engine.
 *
 *  The BASIC style verbs were first introduced in test/input.coffee
 */

require( "l8/lib/queue" );
var http        = require( "http" );
var url         = require( "url" );
var querystring = require( "querystring" );

// IO tools. BASIC style

var screen    = [];

var cls = function(){
  screen = [];
  set_head( "" );
  set_body( "" );
};

var print     = function( msg ){
  ("" + msg).split( "\n" ).forEach( function( m ){ if( m ){ screen.push( m ); } } );
};

var printnl   = function( msg ){ print( msg ); print( "\n" ); };

var http_repl_head = "";
var set_head = function( x ){
  http_repl_head = x;
};

var http_repl_body = "";
var set_body = function( x ){
  http_repl_body = x;
};

var PendingResponse = null;
var respond = function( question ){
  if( !PendingResponse )return;
  if( PendingResponse.redirect ){
    PendingResponse.writeHead( 302, { Location: PendingResponse.redirect } );
    PendingResponse.end();
    PendingResponse = null;
    return;
  }
  PendingResponse.writeHead( 200, { 'Content-Type': 'text/html' } );
  var options = [];
  http_repl_history.forEach( function( item ){
    options.push( '<option value="' + item + '">' );
  });
  var head = http_repl_head;
  var body = http_repl_body;
  http_repl_head = http_repl_body = null;
  if( !body ){
    body = [
      '<div id="container" style="background-color: white;">',
      '<div class="content" id="content">',
      screen.join( "<br\>" ),
      '</div>',
      '<div id="footer">',
      '<form name="question" url="/" style="width:50%">',
      question,
      '<input type="text" name="input" placeholder="a command or help" autofocus list="history" style="width:99%">',
      '<datalist id="history">',
      options.join( "\n" ),
      '</datalist>',
      '<input type="submit">',
      link_to_command( "help" ),link_to_page( "index" ),
      '</form>',
      //'<script type="text/javascript" language="JavaScript">',
      //'document.question.input.focus();',
      //'</script>',
      '</div>', // footer
      '</div>', // container
    ].join( "\n" );
  }
  PendingResponse.end( [
    '<!DOCTYPE html><html>',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>Kudocracy test UI, liquid democracy meets twitter...</title>',
    '<link rel="shortcut icon" href="http://simpliwiki.com/yanugred16.png" type="image/png">',
    head || '<link rel="stylesheet" type="text/css" href="/simpliwiki.css">',
    '</head>',
    '<body>',
    body,
    '</body>',
    '</html>'
  ].join( '\n' ) );
  PendingResponse = null;
};

var HttpQueue = l8.queue( 1000 );
var input = l8.Task( function( question ){ this
  .step( function(){
    respond( question );
    HttpQueue.get() } )
  .step( function( req, res ){
    //this.trace( "Handling new http request, " + req.method + ", " + req.url );
    if( req.method !== "GET" || !( req.url === "/" || req.url[1] == "?" ) ){
      res.writeHead( 404, { "Content-Type": "text/plain" } );
      res.end( "404 Not Found\n" );
      return input( question );
    }
    // Detect change in source ip address, when change, logout
    // ToDo: some session management
    var ip = req.headers[ "x-forwarded-for" ]
    || req.connection.remoteAddress
    || req.socket.remoteAddress
    || req.connection.socket.remoteAddress;
    Session.current.login( ip );
    PendingResponse = res;
    PendingResponse.request = req;
    PendingResponse.query = url.parse( req.url, true).query
    var data = PendingResponse.query.input;
    var more = PendingResponse.query.input2;
    if( data ){
      if( more ){ data += " " + more; }
      more = PendingResponse.query.input3;
      if( more ){ data += " " + more; }
      more = PendingResponse.query.input4;
      if( more ){ data += " " + more; }
      more = PendingResponse.query.input5;
      if( more ){ data += " " + more; }
      return data.substring( 0, 140 );
    }
    input( question );
  } );
} );

/*
 *  Test UI is made of pages.
 *
 *  Each page is a function that returns an array of two elements. The
 *  first element is to become the "head" of the HTML response, the second
 *  element is the body.
 *  Note: this is currently purely sync but moving to async will be simple to
 *  do when required.
 */

var http_repl_pages = {
  index:        page_index,
  help:         page_help,
  login:        page_login,
  visitor:      page_visitor,
  persona:      page_persona,
  delegations:  page_delegations,
  groups:       page_groups,
  proposition:  page_proposition,
  propositions: page_propositions,
  tags:         page_propositions
};

function page( name ){
  var f = name && http_repl_pages[ name ];
  // No name => list names
  if( !f ){
    for( name in http_repl_pages ){
      printnl( name );
    }
    return;
  }
  var head = null;;
  var body = null;
  var result;
  try{
    result = f.apply( this, arguments );
    head = result[ 0 ];
    body = result[ 1 ];
    if( Array.isArray( head ) ){
      head = head.join( "" );
    }
    if( Array.isArray( body ) ){
      body = body.join( "" );
    }
    Session.current.previous_page = Session.current.current_page;
    Session.current.current_page  = Array.prototype.slice.call( arguments );
  }catch( err  ){
    trace( "Page error", name, err, err.stack );
  }
  set_head( head );
  set_body( body );
};

function redirect( page ){
// Set HTTP response to 302 redirect, to redirect to specified page
  if( !PendingResponse )return;
  if( !page ){ page = "index"; }
  page = page.replace( / /g, "%20" );
  PendingResponse.redirect = "?input=page%20" + page;
}

function redirect_back(){
// Set HTTP response to 302 redirect, to redirect to the page from where the
// current HTTP request is coming.
  if( !Session.current.current_page )return redirect( "propositions" );
  redirect( Session.current.current_page.join( "%20" ) );
}

/*
 *  <a href="...">links</a>
 */

function link_to_command( cmd ){
  var url_code = querystring.escape( cmd );
  return '<a href="?input=' + url_code + '">' + cmd + '</a>';
}

function link_to_page( page, value, title ){
  var url_code;
  if( page[0] === "@" ){
    url_code= querystring.escape( page );
    if( !value ){ value = page; }
    page = value;
  }else{
    var url_code= querystring.escape( value || "" );
  }
  if( page === "index"){
    value = '<strong>Kudo<em>c</em>racy</strong>';
  }
  if( !value ){ value = page; }
  return '<a href="?input=page+' + page + '+' + url_code + '">'
  + (title || value)
  + '</a>';
}

function link_to_twitter_user( user ){
  return '<a href="https://twitter.com/' + user + '">' + user + '</a>';
}

function link_to_twitter_tags( tags ){
  if( tags.indexOf( " " ) !== -1 ){
    var buf = [];
    tags.split( " " ).forEach( function( tag ){
      if( !tag )return;
      buf.push( link_to_twitter_tags( tag ) );
    });
    return buf.join( " " );
  }
  return '<a href="https://twitter.com/search?f=realtime&q=%23'
  + tags.substring( 1 )
  + '">' + tags + '</a>';
}

function link_to_twitter_filter( query ){
  return '<a href="https://twitter.com/search?f=realtime&q='
  + querystring.escape( query )
  + '">' + query + '</a>';
}


/*
 *  Page common elements/parts
 */


function page_style(){
  return '<link rel="stylesheet" href="http://simpliwiki.com/simpliwiki.css" type="text/css">';
}


function page_header( left, center, right ){
  if( !left ){
    left = link_to_page( "index" );
  }
  if( Session.current.visitor ){
    right = ( (right && (right + " ")) || "" )
    + link_to_page(
      Session.current.visitor.label,
      "visitor",
      Session.current.visitor.label
    );
  }else{
    right = ( (right && (right + " ")) || "" )
      + link_to_page( "login" );
  }
  return [
    '<div class="header fade" id="header"><div id="header_content">',
      '<div class="top_left">',
        left || "",
      '</div>',
      '<div class="top_center" id="top_center">',
        center || "",
      '</div>',
      '<div class="top_right">',
        ( (right && (right + " ")) || "" ) + link_to_page( "help" ),
      '</div>',
    '</div></div><br><br>',
    '<div id="container" style="margin:0.5em;"><div id="content" ><div id="content_text">',
    ''
  ].join( "\n" );
}

function page_footer(){
  return [
    '\n</div></div></div><div class="fade" id="footer"><div id="footer_content">',
    link_to_page( "propositions", "", "propositions" ), " ",
    link_to_page( "tags", "", "tags" ),
    '<div id="powered"><a href="https://github.com/virteal/kudocracy">',
    '<img src="http://simpliwiki.com/yanugred16.png"/>',
    '<strong>kudo<em>c</em>racy</strong>',
    '</a></div>',
    '</div></div>',
    '<script>!function(d,s,id){var js,fjs=d.getElementsByTagName(s)[0],p=/^http:/.test(d.location)?"http":"https";if(!d.getElementById(id)){js=d.createElement(s);js.id=id;js.src=p+"://platform.twitter.com/widgets.js";fjs.parentNode.insertBefore(js,fjs);}}(document, "script", "twitter-wjs");</script>',
  ].join( "" );
}

function page_index(){
  Session.current.visitor = null;
  return [ '<link rel="stylesheet" href="http://simpliwiki.com/style.css" type="text/css">',
  [
    '<img src="http://simpliwiki.com/alpha.gif" type="img/gif" style="position:absolute; top:0; right:0;"></img>',
    '<div id="background" class="background"></div>',
    '<div id="header" class="sw_header">',
      '<div class="sw_header_content">',
        '<div style="float:left;" class="sw_logo sw_boxed">',
          '<div style="float:left;">',
          '<img src="http://simpliwiki.com/yanugred64.png" width="64" height="64" type="image/png" alt="YanUg"/>',
          '</div>',
          '<div id="slogan" style="min-height:64px; height:64px;">',
          '<strong>' + link_to_twitter_tags( "#kudocracy" ) + '</strong>',
          '<br>new democracy',
          '</div>',
        '</div>',
        '<span id="tagline">',
        '<h3 id="tagline">',
          link_to_twitter_tags(
            "#democracy #vote #election #liqdem #LiquidDemocracy #participation"
          ),
        '</h3>',
        //'<small><i>a tribute to <a href="http://wikipedia.org">Wikipedia</a></i></small>',
        '</span>',
      '</div>',
    '</div><br><br>',
    '<div id="footer" class="sw_footer sw_boxed">',
    '\n<form name="proposition" url="/">',
    '<input type="hidden" name="input" maxlength="140" value="page propositions"/>',
    '<input type="text" placeholder="all" name="input2"/>',
    ' <input type="submit" value="propositions?"/>',
    '</form>\n',
    '</div>',
    '<br><a href="https://twitter.com/intent/tweet?button_hashtag=kudocracy&hashtags=vote&text=new%20democracy" class="twitter-hashtag-button" data-related="Kudocracy,vote">Tweet #kudocracy</a>',
    ' <a href="https://twitter.com/Kudocracy" class="twitter-follow-button" data-show-count="true">Follow @Kudocracy</a>',
    '<div><div><div>' + page_footer()
  ].join( "" ) ];
}

function page_help(){
  var r = [
    page_style(),
    [ ]
  ];
  r[1] = [
    page_header(
      _,
      link_to_twitter_tags( "#kudocracy" ),
      Session.current.visitor
        ? link_to_page( Session.current.visitor.label, "visitor", "vote!" )
        : link_to_page( "login" )
    ),
    '<h2>What is it?</h2><br>',
    'An experimental voting system where people can like/dislike hashtags.',
    '<br><br><h2>hashtags?</h2><br>',
    'Hashtags are keywords used to categorize topics. See also ',
    '#<a href="http://www.hashtags.org/quick-start/">hashtags.org</a>.',
    '<br><br><h2>How is it different?</h2><br>',
    '<ol>',
    '<li>Votes are reversible, you can change your mind.</li>',
    '<li>Propositions are searchable using tags.</li>',
    '<li>Delegates may vote for you on some propositions.</li>',
    '<li>You can follow their recommendations or vote directly.</li>',
    '<li>Results are updated in realtime after each vote.</li>',
    '<li>You can share your votes or hide them.</li>',
    '<li>It is <a href="https://github.com/virteal/kudocracy">open source</a>.</li>',
    '</ol>',
    '<br><h2>Is it available?</h2><br>',
    'No, not yet. What is available is a prototype. Depending on ',
    'success (vote #kudocracy!), the prototype will hopefully expand into ',
    'a robust system able to handle billions of votes from millions of ',
    'persons. That is not trivial and requires help.',
    '<br><br><h2>Who are you?</h2><br>',
    'My name is Jean Hugues Robert, ',
    link_to_twitter_user( "@jhr" ),
    '. I am a 48 years old software developper ',
    'from Corsica (the island where Napoleon was born). When I discovered the',
    ' <a href="http://en.wikipedia.org/wiki/Delegative_democracy">',
    'Delegative democracy</a> concept, I liked it. I think that it would ',
    'be a good thing to apply it broadly, using modern technology, technology ',
    'that people now use all over the world.<br>' +
    'I hope you agree. ',
    // Twitter tweet & follow buttons
    (   '<a href="https://twitter.com/intent/tweet?button_hashtag=kudocracy'
      + '&hashtags=agree,kudocracy,democracy,vote,participation,LiquidDemocracy'
      + '&text=new%20democracy" '
      + 'class="twitter-hashtag-button" '
      + 'data-related="Kudocracy,vote">Tweet #kudocracy</a>'
    ),(
      ' <a href="https://twitter.com/Kudocracy'
      + '" class="twitter-follow-button" data-show-count="true">'
      + 'Follow @Kudocracy</a>'
    ),
    '<br><br><h2>Misc</h2><br>',
    'Debug console: ' + link_to_command( "help" ),
    '<br><br>',
    page_footer()
  ];
  return r;
}

function vote_menu( vote, proposition, orientation ){
  function o( v, l ){v
    return '\n<option value="' + v + '">' + (v || l) + '</option>';
  }
  // vote is either a vote or a persona
  var vote_id;
  if( vote.type === "Vote" ){
    vote_id = vote.id;
    proposition = vote.proposition;
  }else{
    vote_id = "" + vote.id + "." + proposition.id;
  }
  return [
    '\n<form name="vote" url="/">',
    '<input type="hidden" name="input" value="change_vote"/>',
    '<input type="hidden" name="vote_id" value="' + vote_id + '"/>',
    '<select name="orientation">',
    o( "orientation" ), o( "agree"), o( "disagree" ), o( "protest" ), o( "blank" ), o( "delete" ),
    '</select>',
    '<select name="privacy">',
    o( "privacy" ), o( "public"), o( "secret" ), o( "private" ),
    '</select>',
    '<select name="duration">',
    o( "duration" ), o( "one year"), o( "one month" ), o( "one week" ),
    o( "24 hours" ), o( "one hour"),
    '</select>',
    '<input type="submit" value="Vote"/>',
    '</form>\n',
    // Twitter tweet button
    '<a href="https://twitter.com/intent/tweet?button_hashtag='
    + proposition.label
    + '&hashtags=kudocracy,vote,'
    + (vote.type !== "Vote"
      ? (orientation && orientation + "," || "")
      : vote.orientation() + ","
      )
    + proposition.tags_string().replace( / /g, "," ).replace( /#/g, "")
    + '&text=new%20democracy" '
    + 'class="twitter-hashtag-button" '
    + 'data-related="Kudocracy,vote">Tweet ' + proposition.label + '</a>'
].join( "" );
}

function page_visitor( page_name, name, verb, filter ){
// The private page of a persona
  var persona = ( name && Persona.find( name ) ) || Session.current.visitor;
  if( !persona )return [ _, "Persona not found: " + name ];

  filter = sanitize_filter( filter );

  // Header
  var r = [
    page_style(),
    [ page_header(
      _,
      link_to_twitter_user( persona.label ),
      link_to_page( persona.label, "persona", "public" )
    ) ]
  ];
  var buf = [];

  buf.push( '<h1>' + persona.label + '</h1><br><br>' );

  // Query to filter for tags
  buf.push( filter_label( filter, "propositions" ) );
  buf.push( [
    '\n<form name="proposition" url="/">',
    '<input type="hidden" name="input" maxlength="140" value="page visitor ' + persona.label + '"/>',
    '<input type="text" placeholder="all" name="input3"/>',
    '<input type="submit" name="input2" value="Search"/>',
    '</form><br>\n'
  ].join( "" ) );

  // Votes
  var votes = persona.votes().reverse();
  buf.push( '<div><h2>Votes</h2>' );
  votes.forEach( function( vote ){
    buf.push( '<br><br>'
      + ' ' + link_to_page( "proposition", vote.proposition.label ) + ' '
      + "<dfn>" + vote.proposition.result.orientation() + '</dfn>'
      + '<br>' + vote.privacy() + " "
      + '<em>' + vote.orientation() + "</em> "
      + ( vote.is_direct()
        ? ""
        :  "<dfn>(via " + link_to_page( "persona", vote.delegation().agent.label ) + ")</dfn> " )
      + vote_menu( vote )
    )
  });
  buf.push( "</div><br>" );

  // Delegations
  var delegations = persona.delegations();
  buf.push( "<div><h2>Delegations</h2><br>" );
  //buf.push( "<ol>" );
  delegations.forEach( function( delegation ){
    buf.push( '<br>' // "<li>"
        + link_to_page( "persona", delegation.agent.label )
        //+ ' <small>' + link_to_twitter_user( delegation.agent.label ) + '</small> '
        + ( delegation.is_inactive() ? " <dfn>(inactive)</dfn> " :  " " )
        + link_to_page( "propositions", delegation.filter_string() )
        //+ ' <small>' + link_to_twitter_filter( delegation.filter_string() ) + '</small>'
        + "</li>"
    )
  });

  // Footer
  buf.push( "</div><br>" );
  buf.push( page_footer() );
  r[1] = r[1].concat( buf );
  return r;
}


function page_persona( page_name, name, verb, filter ){
// This is the "public" aspect of a persona
  var persona = Persona.find( name );
  if( !persona )return [ _, "Persona not found: " + name ];

  sanitize_filter( filter );

  // Header
  var r = [
    page_style(),
    [ page_header(
      _,
      link_to_twitter_user( persona.label ),
      Session.current.visitor
      ? link_to_page( persona.label, "visitor", "vote!" )
      : ""
    ) ]
  ];
  var buf = [];

  buf.push( '<h1>' + persona.label + '</h1><br><br>' );

  // Twitter follow button
  buf.push(
    '<a href="https://twitter.com/' + persona.label
    + '" class="twitter-follow-button" data-show-count="true">'
    + 'Follow ' + persona.label + '</a>'
  );

  // Query to filter for tags in persona's vote
  buf.push( filter_label( filter ) );
  buf.push( [
    '\n<form name="proposition" url="/">',
    '<input type="hidden" name="input" maxlength="140" value="page persona ' + persona.label + '"/>',
    '<input type="text" placeholder="all" name="input3"/>',
    '<input type="submit" name="input2" value="Search"/>',
    '</form>\n'
  ].join( "" ) );

  // Votes
  var votes = persona.votes().reverse();
  buf.push( '<br><br><div><h2>Votes</h2><br>' );
  //buf.push( "<ol>" );
  votes.forEach( function( vote ){
    if( Session.current.filter.length ){
      if( !vote.proposition.is_tagged( Session.current.filter ) )return;
    }
    buf.push( '<br>' ); // "<li>" );
    if( vote.is_private() ){
      buf.push( "private" );
    }else{
      buf.push( ''
        +  ( vote.is_secret() ? "secret" : "<em>" + vote.orientation() ) + "</em> "
        + '' + link_to_page( "proposition", vote.proposition.label ) + ' '
        + " <dfn>" + vote.proposition.result.orientation() + "</dfn> "
        + time_label( vote.proposition.result.time_touched )
      );
    }
    //buf.push( "</li>" );
  });
  // buf.push( "</ol></div><br>" );
  buf.push( '</div><br>' );
  buf.push( page_footer() );
  r[1] = r[1].concat( buf );
  return r;
}


function page_delegations( page_name, name ){
  var r = [ page_style(), null ];
  var persona = Persona.find( name );
  if( !persona ){
    r[1] = "Persona not found: " + name;
    return r;
  }
  r[1] = pretty( persona.value() );
  return r;
}

function page_groups( page_name, name ){
  var r = [ page_style(), null ];
  var persona = Persona.find( name );
  if( !persona ){
    r[1] = "Persona not found: " + name;
    return r;
  }
  r[1] = pretty( persona.value() );
  return r;
}


function sanitize_filter( filter ){
  if( filter ){
    // Sanitize
    Session.current.filter = filter.replace( /[^#A-Za-z0-9_ ]/g, "" );
    if( Session.current.filter === "all" ){
      Session.current.filter = "";
    }
  }
  return Session.current.filter;
}

function filter_label( filter, page ){
  var buf = [];
  if( filter ){
    buf.push( "<div>" );
    filter.split( " " ).forEach( function( tag ){
      buf.push( link_to_page( page || "propositions", tag ) + " " );
    });
    buf.push( '</div>' );
  }
  return buf.join( "" );
}


function page_propositions( page_name, filter ){

  var tag_page = page_name === "tags";

  sanitize_filter( filter );

  // Header
  var r = [
    page_style(),
    [ page_header(
      _,
      Session.current.filter.length
      ? link_to_twitter_tags( Session.current.filter )
      : link_to_twitter_tags(
        "#vote #kudocracy"
      ),
      link_to_page( tag_page ? "propositions" : "tags" )
    ) ]
  ];
  var buf = [];

  buf.push( tag_page ? "<br><h3>Tags</h3> " : "<br><h3>Propositions</h3> " );
  if( Session.current.filter ){
    buf.push( 'tagged <h1>' + Session.current.filter + '</h1><br><br>' );
  }

  // Twitter tweet button
  buf.push( '<a href="https://twitter.com/intent/tweet?button_hashtag=kudocracy'
      + '&hashtags=vote,'
      + Session.current.filter.replace( / /g, "," ).replace( /#/g, "" )
      + '&text=new%20democracy" '
      + 'class="twitter-hashtag-button" '
      + 'data-related="Kudocracy,vote">Tweet #kudocracy</a>'
  );

  // Query to search for tags or create a proposition
  buf.push( [
    '\n<form name="proposition" url="/">',
    '<input type="hidden" name="input" maxlength="140" value="change_proposition"/>',
    '<input type="text" placeholder="all" name="input3"/>',
    ' <input type="submit" name="input2" value="Search"/>',
    ' <input type="submit" name="input2" value="Propose"/>',
    '</form>\n'
  ].join( "" ) );

  // Display list of matching propositions or tags
  var propositions = Topic.all;
  var list = [];
  var attr;
  var prop;
  for( attr in propositions ){
    prop = propositions[ attr ];
    if( !prop )continue;
    if( prop.is_tag() ){
      if( !tag_page )continue;
    }else{
      if( tag_page )continue;
    }
    if( Session.current.filter.length ){
      if( !prop.is_tagged( Session.current.filter ) )continue;
    }
    list.push( prop );
  }
  list = list.sort( function( a, b ){
    // The last consulted proposition is hot
    if( a === Session.current.proposition )return -1;
    if( b === Session.current.proposition )return 1;
    // Other proposition's heat rule
    return b.heat() - a.heat()
  });
  list.forEach( function( proposition ){
    var text = proposition.label;
    if( tag_page ){
      text += " is a good tag";
    }
    buf.push( '<br><h3>' + link_to_page( "proposition", text ) + '</h3>' );
    if( proposition.result.orientation() ){
      buf.push( ' <em>' + proposition.result.orientation() + '</em>' );
    }
    buf.push( '<br>' );
    proposition.tags_string().split( " " ).forEach( function( tag ){
      if( !tag )return;
      buf.push( link_to_page( page_name, tag ) + " " );
    });
    //buf.push( '<small>' + link_to_twitter_tags( proposition.tags_string() + '</small><br>' ) );
    buf.push( '<br>' + proposition_summary( proposition.result ) + '<br>' );

    if( tag_page ){
      buf.push( "" + proposition.propositions().length + " "
        + link_to_page( "propositions", proposition.label, "propositions" ) + "<br>"
      )
    }

    if( Session.current.visitor ){
      buf.push( vote_menu( Session.current.visitor, proposition, proposition.result.orientation() ) );
      buf.push( '<br>' );
    }
  });

  buf.push(  "<br>" + page_footer() );
  r[1] = r[1].concat( buf );
  return r;
}


function page_login( page_name ){

  // Header
  var r = [
    page_style(),
    [ page_header(
      _,
      link_to_twitter_tags(
        "#login #kudocracy"
      ),
      _ ) ]
  ];
  var buf = [];

  // Query for name
  buf.push( [
    '\n<form name="login" url="/">',
    '<label>Your twitter @name</label> ',
    '<input type="hidden" name="input" maxlength="30" value="login"/>',
    '<input type="text" name="input2"/>',
    ' <input type="submit" value="Login"/>',
    '</form>\n'
  ].join( "" ) );
  buf.push(  "<br>" + page_footer() );
  r[1] = r[1].concat( buf );
  return r;

}


function proposition_summary( result, div ){
  var buf = [];
  var orientation = result.orientation();
  if( !orientation ){ orientation = "";  }
  if( div ){
    buf.push( '<div><h2>Summary' + ' <em>' + orientation + '</em></h2><br>' );
  }else{
    buf.push( "<em>" + orientation + "</em>. " );
  }
  buf.push( 'agree ' + result.agree() + " " );
  buf.push( 'against ' + result.against() + " " );
  buf.push( 'blank ' + result.blank() + ' ' );
  buf.push( '<br><dfn>protest ' + result.protest() + '</dfn> ' );
  buf.push( '<dfn>total ' + result.total() + ' ' );
  buf.push( '(direct ' + result.direct() + ' ' );
  buf.push( 'indirect ' + (result.total() - result.direct()) + ') ' );
  buf.push( 'change ' + result.count() + ' ' );
  buf.push( time_label( result.time_touched ) + '</dfn>' );
  return buf.join( "" );
}

function i18n( msg ){
  if( msg === "il y a " )return "";
  return msg;
}

function duration_label( duration ){
// Returns a sensible text info about a duration
  var delta = duration / 1000;
  var day_delta = Math.floor( delta / 86400);
  if( isNaN( day_delta) )return "";
  if( day_delta < 0 ) return i18n( "in the future" );
  return (day_delta == 0
      && ( delta < 5
        && i18n( "just now")
        || delta < 60
        && i18n( "il y a ") + Math.floor( delta )
        + i18n( " seconds")
        || delta < 120
        && i18n( "1 minute")
        || delta < 3600
        && i18n( "il y a ") + Math.floor( delta / 60 )
        + i18n( " minutes")
        || delta < 7200
        && i18n( "about an hour")
        || delta < 86400
        && i18n( "il y a ") + Math.floor( delta / 3600 )
        + i18n( " hours")
        )
      || day_delta == 1
      && i18n( "a day")
      || day_delta < 7
      && i18n( "il y a ") + day_delta
      + i18n( " days")
      || day_delta < 31
      && i18n( "il y a ") + Math.ceil( day_delta / 7 )
      + i18n( " weeks")
      || day_delta >= 31
      && i18n( "il y a ") + Math.ceil( day_delta / 30.5 )
      + i18n( " months")
      ).replace( /^ /, ""); // Fix double space issue with "il y a "
}


function time_label( time, with_gmt ){
// Returns a sensible text info about time elapsed.
  //with_gmt || (with_gmt = this.isMentor)
  var delta = ((vote.now() + 10 - time) / 1000); // + 10 to avoid 0/xxx
  var day_delta = Math.floor( delta / 86400);
  if( isNaN( day_delta) )return "";
  if( day_delta < 0 ) return i18n( "in the future" );
  var gmt = !with_gmt ? "" : ((new Date( time)).toGMTString() + ", ");
  return gmt
    + (day_delta == 0
      && ( delta < 5
        && i18n( "just now")
        || delta < 60
        && i18n( "il y a ") + Math.floor( delta )
        + i18n( " seconds ago")
        || delta < 120
        && i18n( "1 minute ago")
        || delta < 3600
        && i18n( "il y a ") + Math.floor( delta / 60 )
        + i18n( " minutes ago")
        || delta < 7200
        && i18n( "about an hour ago")
        || delta < 86400
        && i18n( "il y a ") + Math.floor( delta / 3600 )
        + i18n( " hours ago")
        )
      || day_delta == 1
      && i18n( "yesterday")
      || day_delta < 7
      && i18n( "il y a ") + day_delta
      + i18n( " days ago")
      || day_delta < 31
      && i18n( "il y a ") + Math.ceil( day_delta / 7 )
      + i18n( " weeks ago")
      || day_delta >= 31
      && i18n( "il y a ") + Math.ceil( day_delta / 30.5 )
      + i18n( " months ago")
      ).replace( /^ /, ""); // Fix double space issue with "il y a "
}


function page_proposition( page_name, name ){
// Focus on one proposition

  var proposition = Topic.find( name );
  if( !proposition )return [ _, "Proposition not found: " + name ];
  Session.current.proposition = proposition;
  var result = proposition.result;

  var is_tag = proposition.is_tag();
  var tag_label;
  var label;
  if( is_tag ){
    tag_label = proposition.label;
    label = tag_label.substring( 1 );
  }else{
    label = proposition.label;
    tag_label = "#" + label;
  }

  // Header
  var r = [
    page_style(),
    [ page_header(
      _,
      link_to_twitter_filter( tag_label )
      //link_to_page( "propositions" )
    ) ]
  ];
  var buf = [];

  buf.push( '<h1>' + (is_tag ? "Tag " : "" )
  + proposition.label + '</h1><br><br>' );

  // Twitter tweet button, if proposition
  !is_tag && buf.push( '<a href="https://twitter.com/intent/tweet?button_hashtag='
    + label
    + '&hashtags=kudocracy,vote,'
    + proposition.tags_string().replace( / /g, "," ).replace( /#/g, "")
    + '&text=new%20democracy" '
    + 'class="twitter-hashtag-button" '
    + 'data-related="Kudocracy,vote">Tweet ' + label + '</a>'
  );

  // Summary
  buf.push( '<br><br>' + proposition_summary( result, "div" ) + '<br>' );

  if( is_tag ){
    buf.push( "<br>" + proposition.propositions().length + " "
      + link_to_page( "propositions", label, "propositions" ) + "<br>"
    )
  }

  // List of tags, with link to propositions
  var tmp = proposition.filter_string();
  buf.push( filter_label( tmp, "propositions" ) );

  if( tmp = proposition.source() ){
    if( tmp.indexOf( "://" ) !== -1 ){
      tmp = '<a href="' + tmp + '">' + tmp + '</a>';
    }
    buf.push( "<br>source " + tmp );
  }
  buf.push( "<br>since " + time_label( proposition.timestamp ) );
  //buf.push( "<br>age " + duration_label( proposition.age() ) );
  buf.push( "<br>last change " + time_label( proposition.time_touched ) );
  buf.push( "<br>end in " + duration_label( proposition.expire() - vote.now() ) );

  // Votes
  var votes = proposition.votes_log() || [];
  buf.push( "<br><br><div><h2>Votes</h2><br>" );
  //buf.push( "<ol>" );
  votes.forEach( function( vote_value ){
    if( vote_value.delegation          === Vote.direct
    && vote_value.privacy              === Vote.public
    && vote_value.orientation          !== Vote.neutral
    && vote_value.entity.privacy()     === Vote.public
    && vote_value.entity.orientation() !== Vote.neutral
    ){
      buf.push( "<br>" );
      buf.push(
          ( vote_value.orientation ) + " "
          + link_to_page( "persona", vote_value.persona_label )
          + " <small><dfn>" + time_label( vote_value.timestamp ) + "</dfn></small>"
      );
      // buf.push( "</li>" );
    }
  });
  buf.push( "</div><br>" );

  // Vote menu
  if( Session.current.visitor ){
    buf.push( vote_menu( Session.current.visitor, proposition ) );
    buf.push( "<br><br>" );
  }

  // Footer
  buf.push( page_footer() );
  r[1] = r[1].concat( buf );
  return r;
}

/*
 *  The REPL Read Eval Print Loop commands of this Test/Debug UI
 */

var http_repl_commands = {};

function print_entities( list ){
  // Chronological order
  var sorted_list = list.sort( function( a, b ){
    var time_a = a.time_touched || a.timestamp;
    var time_b = b.time_touched || b.timestamp;
    var order = a - b;
    return order ? order : a.id - b.id;
  });
  sorted_list.forEach( function( entity ){
    printnl( "&" + entity.id + " " + entity
    + " " + pretty( entity.value() ) );
  });
}

var last_http_repl_id = null;

vote.extend( http_repl_commands, {

  cls: function(){ cls(); },
  noop: function(){},

  help: function(){
    var tmp = [
      "<h2>Help, syntax</h2>command parameter1 p2 p3...",
      "In parameters, &nnn is entity with specified id",
      "  & alone is last specified entity",
      "  +key:val adds entry in a hash object",
      "  +something adds entry in an array",
      "  [] and {} are empty tables/objects",
      "  , (comma) asks for a new table/object",
      "  true, false, _, null work as expected",
      "!xxx cmd p1 p2 p3 -- register as macro",
      "!xxx -- run previously registered macro",
      "! -- repeat previous macro",
      "<h2>Examples</h2>",
      link_to_command( "page visitor @jhr" ),
      "tagging & [] , +#tagX +#tagY  -- tagging with two lists",
      "delegation &40 +#tagX &23 +inactive:true",
      "<h2>Commands</h2>",
      link_to_command( "cls" ) + " -- clear screen",
      link_to_command( "page" ) + " -- list available pages",
      "page name p1 p2 ... -- move to said page",
      link_to_command( "noop" ) + " -- no operation, but show traces",
      link_to_command( "version" ) + " -- display version",
      link_to_command( "debug" ) + " -- switch to debug mode",
      link_to_command( "ndebug" ) + " -- switch to no debug mode",
      link_to_command( "dump" ) + " -- dump all entities",
      "dump type -- dump entities of specified type",
      link_to_command( "dump &" ) + "id -- dump specified entity",
      link_to_command( "value &" ) + "id -- display value of entity",
      link_to_command( "debugger &" ) + "id -- inspect entity in native debugger",
      link_to_command( "log &" ) + "id -- dump history about entity",
      link_to_command( "effects &" ) + "id -- dump effects of involed change",
      "login -- create user if needed and set current",
      "change_vote &id privacy orientation -- change existing vote",
      "change_proposition text #tag text #tag... -- change proposition"
    ];
    for( var v in replized_verbs ){
      tmp.push( v + " " + replized_verbs_help[ v ] );
    }
    print( tmp.join( "\n" ) );
  },

  page: page,

  debug: function(){ de = true; vote.debug_mode( true ); },
  ndebug: function(){ de = false; vote.debug_mode( false ); },

  dump: function( entity ){
    if( arguments.length ){
      if( entity.is_entity ){
        vote.dump_entity( entity, 2 );
      }else{
        var type = " " + entity.toLowerCase();
        var names = " change expiration persona source topic tagging tweet"
        + " vote result transition delegation membership visitor action ";
        var idx = names.indexOf( type );
        if( idx === -1  ){
          printnl( "Valid types:" + names );
        }else{
          var sep = names.substring( idx + 1 ).indexOf( " " );
          var found = names.substring( idx + 1, idx + sep + 1 );
          found = found[ 0 ].toUpperCase() + found.substring( 1 );
          printnl( "dump " + found );
          var entities = vote[ found ].all;
          var list = [];
          for( var item in entities ){
            list.push( entities[ item ] );
          }
          if( !list.length ){
            vote.AllEntities.forEach( function( item ){
              if( item.type === found ){
                list.push( item );
              }
            })
          }
          print_entities( list );
        }
      }
    }else{
      vote.dump_entities();
    }
  },

  log: function( entity ){
    if( entity.effect ){
      entity = entity.effect;
    }else if( entity.to ){
      entity = entity.to;
    }
    var all = vote.AllEntities;
    var list = [];
    all.forEach( function( e ){
      if( e === entity
      || e.to === entity
      || e.effect === entity
      ){
        list.push( e );
      }
    } );
    print( "Log " + entity );
    print_entities( list );
  },

  effects: function( entity ){
    var change = entity.change || entity;
    var list = [ change ];
    var cur = change.to;
    while( cur ){
      list.push( cur );
      cur = cur.next_effect;
    }
    print( "Effects " + entity );
    print_entities( list );
  },

  value: function( entity ){
    printnl( entity ? pretty( entity.value(), 3 ) : "no entity" );
  },

  change_vote: function( entity, privacy, orientation ){
    redirect_back();
    var proposition = null;
    var query = PendingResponse.query;
    var vote_id = query.vote_id;
    privacy = privacy || query.privacy;
    if( Array.isArray( privacy ) ){
      privacy = privacy[0];
    }
    orientation = orientation || query.orientation;
    if( Array.isArray( orientation ) ){
      orientation = orientation[0];
    }
    if( privacy === "idem"
    ||  privacy === "privacy"
    ){
      privacy = null;
    }
    if( privacy
    && " public secret private ".indexOf( " " + privacy + " " ) === -1
    ){
      privacy = null;
    }
    if( orientation === "idem"
    || orientation === "orientation"
    ){
      orientation = null;
    }
    if( orientation === "delete" ){ orientation = "neutral"; }
    if( orientation
    && " agree disagree protest blank neutral ".indexOf( " " + orientation + " " ) === -1
    ){
      orientation = null;
    }
    if( !privacy && !orientation ){
      printnl( "No change" );
      return;
    }
    if( !entity ){
      if( !vote_id ){
        printnl( "Vote not found" );
        return;
      }
      var idx_dot = vote_id.indexOf( "." );
      if( idx_dot === -1 ){
        entity = vote.AllEntities[ parseInt( vote_id ) ];
        if( !entity || entity.type !== "Vote" ){
          printnl( "Vote not found" );
          return;
        }
      }else{
        entity = vote.AllEntities[ parseInt( vote_id.substring( 0, idx_dot ) ) ];
        if( !entity || entity.type !== "Persona" ){
          printnl( "Persona not found" );
          return;
        }
        proposition = vote.AllEntities[ parseInt( vote_id.substring( idx_dot + 1 ) ) ];
        if( proposition && proposition.type !== "Topic" ){
          printnl( "Proposition not found" );
          return;
        }
      }
    }
    // ToDo: inject change
    if( proposition ){
      Session.current.proposition = proposition;
      Ephemeral.inject( "Vote", {
        persona:     entity,
        proposition: proposition,
        privacy:     ( privacy || _ ),
        orientation: ( orientation || _ )
      });
      //redirect( "proposition%20" + proposition.label );
    }else{
      Ephemeral.inject( "Vote", {
        id_key:      entity.id,
        privacy:     ( privacy || _ ),
        orientation: ( orientation || _ )
      });
      //redirect( "proposition%20" + entity.proposition.label );
    }
    printnl( "Changed vote " + pretty( entity ) );
    return;
  },

  login: function( name ){
    if( name.length < 3 )return redirect( "login" );
    name = name.trim().replace( /[^A-Za-z0-9_]/g, "" );
    if( name[0] !== "@" ){ name = "@" + name };
    if( !( Session.current.visitor = Persona.find( name ) ) ){
      Ephemeral.inject( "Persona", { label: name } );
      Session.current.visitor = Persona.find( name );
    }
    Session.current.filter = "";
    return redirect( "visitor" );
  },


  change_proposition: function(){
    redirect_back();
    // Sanitize, extract tags, turn whole text into valid potential tag itself
    var text = Array.prototype.slice.call( arguments ).join( " " );
    // Could be a search or a propose coming from page_propositions
    if( text.toLowerCase().indexOf( "propose " ) === 0 ){
      text = text.substring( "propose ".length );
    }else if( text.toLowerCase().indexOf( "search" ) === 0 ){
      text = text.substring( "search".length );
      // Add # prefix where missing
      text = text
      .replace( /[^A-Za-z0-9_ ]/g, "" )
      .replace( /[^ ]+/g, function( m ){
        return m[0] === '#' ? m : '#' + m;
      });
      Session.current.filter = text;
      return;
    }
    var tags = [ "#"
      + ( Session.current.visitor && Session.current.visitor.label || "@anonymous" )
      .substring( 1 )
    ];
    text = text.replace( /#[A-Za-z][_0-9A-Za-z]*/g, function( tag ){
      if( tag === "tag ")return "";
      tags.push( tag );
      return ""
    } ).replace( /  /g, " " ).trim()
    .replace( /[^A-Za-z0-9_]/g, "_" );
    // if nothing remains, use first tag to name the proposition
    if( text.length < 3 ){
      if( ( text = tags[0] ).length < 3 ){
        printnl( "Not a valid proposition name" );
        return;
      }
      // Remove first # unless coming from the tags page
      if( !Session.current.current_page[0] === "tags" ){
        text = text.substring( 1 );
      }
    }
    var changes = [];
    var tag_entities = [];
    tags.forEach( function( tag ){
      if( tag.length < 3 )return;
      var entity = Topic.find( tag );
      if( entity ){
        tag_entities.push( entity );
      }else{
        changes.push( function(){
          Ephemeral.inject( "Topic", { label: tag } );
        });
        changes.push( function(){
          tag_entities.push( Topic.find( tag ) );
        })
      }
    });
    // Creation or addition of tags
    var proposition = Topic.find( text );
    if( !proposition ){
      changes.push( function(){
        Ephemeral.inject( "Topic", { label: text, tags: tag_entities } );
      } );
    }else{
      changes.push( function(){
        Ephemeral.inject( "Tagging", { proposition: proposition, tags: tag_entities } );
      });
    }
    Ephemeral.inject( changes );
    Session.current.proposition = proposition || Topic.find( text );
  },

  debugger: function( e, e2, e3, e4 ){
    var p  = pretty( e , 2 );
    var p2 = pretty( e2, 2 );
    var p3 = pretty( e3, 2 );
    var p4 = pretty( e4, 2 );
    var v  = value( e , 100 );
    var v2 = value( e2, 100 );
    var v3 = value( e3, 100 );
    var v4 = value( e4, 100 );
    debugger;
  },

  version: function(){ printnl( "Kudocracy Version: " + vote.version ); }
} );

var http_repl_macros = {};
var last_http_repl_macro = "help";
var http_repl_history = [];

function start_http_repl(){
  var port = process.env.PORT || "8080";
  http.createServer( HttpQueue.put.bind( HttpQueue ) ).listen( port );
  l8.task( function(){ this
    .step( function(){ trace( "Web test UI is running on port " + port ); })
    .repeat( function(){ this
      .step( function(){ input( "" ); } )
      .step( function( r ){
        printnl( link_to_command( r ) );
        var input = r;
        // Handle !macros
        if( input[0] === "!" ){
          var idx_space = input.indexOf( " " );
          // !macro -- run it
          if( idx_space === -1 ){
            if( input === "!" ){
              input = last_http_repl_macro;
            }else{
              input = http_repl_macros[ input ];
            }
            if( !input ){ input = "help"; }
            last_http_repl_macro = input;
          }else{
            http_repl_macros[ input.substring( 0, idx_space - 1 ) ]
            = input.substring( idx_space + 1 );
            input = input.substring( idx_space + 1 );
          }
        }
        try{
          // Parse command line, space delimits tokens
          var tokens = input.split( " " );
          // First token is command name
          var cmd = tokens[0];
          // Other tokens describe the arguments
          var args = tokens.slice( 1 );
          var args2 = [];
          var obj = null;
          args.forEach( function( v, idx ){
            var front = v[0];
            var need_push = false;
            // +something means something is added to an array or an object
            if( front === "+" ){
              need_push = true;
              v = v.substring( 1 );
            }else{
              obj = null;
            }
            var sep = v.indexOf( ":" );
            var key = ( sep === -1 ) && v.substring( 0, sep - 1 );
            var val = ( sep === -1 ) && v.substring( sep + 1 );
            if( val === "true"  ){ val = true; }
            if( val === "false" ){ val = false; }
            if( val === "_"     ){ val = _; }
            if( val === "null"  ){ val = null; }
            // &something is the id of an entity, & alone is last id
            if( front === "&" ){
              var id;
              if( v.length === 1 ){
                id = last_http_repl_id;
              }else{
                id = parseInt( v.substring( 1 ) );
                if( id < 10000 ){
                  id += 10000;
                }
                last_http_repl_id = id;
              }
              v = vote.AllEntities[ id ];
            }
            // Handle +
            if( need_push ){
              // If neither [] nor {} so far, start it
              if( !obj ){
                // start with { n: v } when +something:something is found
                if( key ){
                  obj = {};
                  obj[ key ] = val;
                  v = obj;
                // start with [ v ] if no : was found
                }else{
                  v = obj = [ v ];
                }
              // If previous [] or {}
              }else{
                if( !key ){
                  obj.push( v )
                }else{
                  obj[ key ] = val;
                }
                v = null;
              }
            }
            // If [] or {} then add to that new object from now on
            if( v === "[]" ){
              v = obj = [];
            }else if( v === "{}" ){
              v = obj = {};
            }else if( v === "," ){
              v = obj = null;
            }
            if( v ){ args2.push( v ) }
          });
          var code = http_repl_commands[ cmd ];
          if( code ){
            code.apply( cmd, args2 );
            http_repl_history.unshift( r );
          }else{
            printnl( "Enter 'help'" );
          }
        }catch( err ){
          printnl( "Error " + err );
          trace( "Http REPL error: ", err, err.stack );
        }
      });
    })
  });
}


function main(){

  trace( "Welcome to l8/test/vote.js -- Liquid demo...cracy" );

  //Ephemeral.force_bootstrap = true;
  vote.debug_mode( de = true );
  Ephemeral.start( bootstrap, function( err ){
    if( err ){
      trace( "Cannot proceed", err, err.stack );
      //process.exit( 1 );
      return;
    }
    // Let's provide a frontend...
    trace( "READY!" );
    start_http_repl();
  } );
}

// Hack to get sync traces && http REPL outputs
if( true || de ){
  var fs = require('fs');
  var old = process.stdout.write;

  process.stdout.write = function (d) {
    de && fs.appendFileSync( "./trace.out", d);
    print( d );
    return old.apply(this, arguments);
  }
}

l8.begin.step( main ).end;
//l8.countdown( 200 );

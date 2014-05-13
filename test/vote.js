// test/vote.js
//  sample test application: reactive liquid democracy
//
// "When liquid democracy meets Twitter..."
//
// april 2014 by @jhr

"use strict";

function ephemeral( app ){

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
var debugging = de && true;
var trace     = l8.trace;
var bug       = trace;
if( debugging ){
  var puts = console.error;
  l8.logger = trace = bug = function(){ return puts.apply( console, arguments ); };
}


function mand( b, msg ){
// de&&mand() is like assert()
  if( b )return;
  var tmp = msg ? ": " + msg : msg;
  bug( "l8/test/vote.js, assert error" + tmp );
  if( debugging )debugger;
  if( !debugging )throw new Error( "vote.js assert" );
}

// de&&bugger() invokes the debugger only in debugging mode
function bugger(){ if( debugging )debugger; }

function error_traced( f ){
// error_traced( fn ) is like fn but with exceptions traced in debug mode
  return !de ? f : function(){
    try{
      return f.apply( this, arguments );
    }catch( err ){
      trace( "Error", err, err.stack );
      if( debugging ){
        de&&bugger();
      }else{
        throw err;
      }
    }
  };
}


// Misc. util

function noop(){}
function idem( x ){ return x; }

var _ = noop();      // _ === undefined

var no_opts = {};

// Never changing undefined & empty array waters
var _emptiness_ = water();
var emptiness   = water( [] );


var extend = function( to, from ){
// Fast inject of properties. Note: not just owned ones, prototype's too
  for( var ii in from ){ to[ ii ] = from[ ii ]; }
  return to;
};

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


/*
 *  Reactive entities management
 */

//var global = this;

var epoch = 0; // 1397247088461; // 2034 is too soon
function now(){ return l8.now - epoch; }
var ONE_YEAR = 365 * 24 * 60 * 60 * 1000;


/*
 *  Computation steps managements
 *
 *  Steps create or update entities.
 *  They can trigger consequences by pushing an entity into a fluid.
 *  If the same entity is pushed multiple times into the same fluid, only
 *  the first push is actually performed.
 */
 
var StepQueue = [];
var PushQueue = [];
var PushMap   = {};

function steps( list ){
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
      box( err );
      return;
    }
    // If new steps where created, perform them now
    if( StepQueue.length ){
      steps().boxon( function( err ){ box( err ); } );
    }else{
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

Entity.prototype.constructor = Entity;
Entity.type = function( named_f ){ return type( named_f, this ); };

var null_object = new Entity( { machine: MainMachine } );

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
        // Skip label, already displayed
        if( attr === "label" )continue;
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
        // Skip "updates" when only the initial create update is there
        }else if( attr === "updates" ){
          if( val.water && val() && val().length === 1 )continue;
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

function dump_entity( x, level ){
  if( !level ){ level = 1; }
  trace( pretty( x, level ) );
  //console.log( "Value", x.value() );
}

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
  ctor.super = base;
  ctor.ctors = [];
  var a_ctor = ctor;
  while( a_ctor ){
    ctor.ctors.unshift( a_ctor );
    a_ctor = a_ctor.super;
  }
  sub.super  = proto;
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
    var ii = 0;
    var list = ctor.ctors;
    var a_ctor;
    var r;
    // ToDo: unroll for speed
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
  // If effect is most probably the result of a Change entity processing
  if( change.p.id === this.id ){
    change.to = this;
    change.last_effect = this;
    this.next_effect = null;
  // Else effect is an indirect effect of the initial change, link them
  }else{
    de&&mand( change.to );
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
  this.key    = _;
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
    if( typeof this[ attr ] === "function" ){
      this[ attr ]( other[ attr ] );
      continue;
    }
    // Skip attributes that don't already exists
    if( !this.hasOwnProperty( attr ) )continue;
    this[ attr ] = other[ attr ];
  }
  return this;
};

// Called by .register(), when there is an update
Effect.prototype.touch = function(){};

Effect.prototype.register = function( key ){
// Register entity and detect updates about pre-existing entities
  //if( this.id === 10009 )debugger;
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
// Changes to entities involves watering the original with an update
  // There must be actual water only in the original, not in the updates
  return other === this
  ? water
  : function water_update( init_val ){
    if( typeof init_val !== "undefined" )return init_val;
    return arguments[2] && arguments[2][0];
  };
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

Entity.type( Event );
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

var force_bootstrap;

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
      var time_started = l8.now;
      var step_list = bootstrap();
      step_list.push( function(){
        trace( "Bootstrap duration: "
          + ( l8.update_now() - time_started)
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
      dump_entities();
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
  // Turn entities into references, that is what Change.create() expects
  // ToDo: that is not needed because .value() does it when change is stored
  if( 0 ){
    var p_refs = {};
    var attr;
    var val;
    for( attr in p ){
      val = p[ attr ];
      if( p && p.is_entity ){
        p_refs[ attr ] = ref( p );
      }else{
        p_refs[ attr ] = p;
      }
    }
  }
  return Change.create( { t: t, o: "create", p: p } );
};

Ephemeral.get_next_id = function(){ return NextId; };
Ephemeral.ref = ref;

// Debug related
app.trace  = trace;
app.assert = mand;
app.bugger = bugger;
app.pretty = pretty;
app.error_traced = error_traced;

// More exports
app._      = _;
app.value  = value;
app.idem   = idem;
app.now    = now;
app.diff   = array_diff;
app.ice    = function ice( v ){  // Uniform access water/constant
  return function(){ return v; }
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
var de = false;
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
  
  var persona = this.register( options.label );
  var water   = this.water( persona );
  
  this.label            = options.label;
  this.role             = options.role || Persona.individual;
  this.members          = water( [] );
  this.memberships      = water( [] );
  this.delegations      = water( [] );
  this.delegations_from = water( [] );
  this.votes            = water( [] );
  
  return this.is_update() ? persona.update( this ) : this;
  
}

// Persona roles
Persona.individual = "individual";
Persona.group      = "group";

Persona.prototype.is_group      = function(){ return this.role === "group"; };
Persona.prototype.is_individual = function(){ return !this.is_group();      };

Persona.prototype.get_vote_on = function( proposition ){
// If there is a vote by persona on said topic, return it.
  de&&mand( proposition.is_a( Topic ) );
  var votes = this.votes();
  var found_vote = null;
  // ToDo: add index to fast retrieve vote based on proposition's key
  votes.every( function( vote ){
    if( vote.proposition === proposition ){
      found_vote = vote;
      return false;
    }
    return true;
  });
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

Persona.prototype.find_vote_on_proposition = function( proposition, all ){
// Returns null if that personas has no vote on that proposition.
// If 'all' parameter is true, neutral vote is a possible match.
  var votes = this.votes();
  var found = null;
  votes.every( function( vote ){
    if( vote.proposition !== proposition )return true;
    found = ( all || !vote.is_neutral() ) && vote;
    return false;
  });
  return found;
};

Persona.prototype.track_vote = function( vote ){
  de&&mand( vote.persona === this );
  var votes = this.votes();
  if( votes.indexOf( vote ) !== -1 )return this;
  votes.push( vote );
  this.votes( votes );
  return this;
};

Persona.prototype.add_member = function( member ){
  var members = this.members();
  if( members.indexOf( member ) !== -1 )return this;
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
  return group.members().indexOf( this ) !== -1;
};

Persona.prototype.has_member = function( persona ){
  return persona.is_member_of( this );
};

Persona.prototype.add_membership = function( membership ){
  var memberships = this.memberships();
  if( memberships.indexOf( membership ) !== -1 )return this;
  memberships.push( membership );
  this.memberships( memberships );
  return this;
};

Persona.prototype.remove_membership = function( membership ){
  var memberships = this.memberships();
  var idx     = memberships.indexOf( membership );
  if( idx === -1 )return this;
  memberships.splice( idx, 1 );
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
 *    - votes        -- propositions track all the votes about them
 *    - result       -- the result of votes on the proposition
 */
 
Ephemeral.type( Topic );
function Topic( options ){
  
  de&&mand( options.label );
  
  var topic = this.register( options.label );
  var water = this.water( topic );
  
  this.label        = options.label;
  this.source       = water( options.source );
  this.votes        = water( options.votes );
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
  }
}

Topic.prototype.update = function( other ){
  // ToDo: handle .tags and .propositions changes
  if( other.source      ){ this.source( other.source ); }
  if( other.result      ){ this.result( other.result ); }
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

Topic.prototype.add_vote = function( v ){
  this.log_vote( v );
  this.result.add_vote( v );
  return this;
};


Topic.prototype.remove_vote    = function( v ){ this.result.remove_vote( v ); };

Topic.prototype.log_vote = function( v ){
// There is a log of all votes. It is a snapshot copy of the vote value that is
// kept because a persona's vote can change over time.
  var val = v.value();
  v.snaptime = vote.now();
  v.entity = v;
  var votes = this.votes();
  if( !votes ){ votes = []; }
  votes.push( val );
  this.votes( votes );
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
    this.update_votes();
  }
  return this;
};

Topic.prototype.remove_tag = function( tag, loop ){
  var list = this.tags() || [];
  var idx = list.indexOf( tag );
  // Done if already not there
  if( idx === -1 )return this;
  // ToDo: avoid clone?
  var new_list;
  de&&mand( idx !== - 1 );
  new_list = list.splice( idx, 1 );
  this.tags( new_list );
  if( !loop ){
    tag.remove_proposition( this, true );
    this.update_votes();
  }
  return this;
};

Topic.prototype.add_proposition = function( proposition, loop ){
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
  var new_list;
  de&&mand( idx !== - 1 );
  new_list = list.splice( idx, 1 );
  this.propositions( new_list );
  if( !loop ){
    proposition.remove_tag( this, true );
    this.update_votes();
  }
  return this;
};

Topic.prototype.is_tagged = function( tags ){
// Returns true if a topic includes all the specified tags
  var topic_tags = this.tags() || [];
  return tags_includes( tags, topic_tags );
};

function tags_includes( tags, other_tags ){
// Checks that the all the tags are also in the other_tags set
// [] does not include [ #a ]
// [ #a, #b ] does     include [ #a, #b, #c ]
// [ #a, #b ] does not include [ #a, #c ]
  if( tags.length < other_tags.length )return false;
  for( var tag in tags ){
    if( other_tags.indexOf( tags[ tag ] ) === -1 )return false;
  }
  return true;
}

function is_tagged( tags, other_tags ){
// Check if tags are included by other tags
// [ #a, #b, #c ] is     tagged by [ #a, #b ]
// [ #a, #c ]     is not tagged by [ #a, #b ]
  return tags_includes( other_tags, tags );
}

Topic.prototype.add_delegation = function( delegation, loop ){
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
  var delegation;
  for( delegation in delegations ){
    // ToDo: hum... complex!
    trace( "ToDo: handle delegation " + delegation );
    de&&bugger();
  }
};


/*
 *  Tagging event (or detagging)
 *
 *  This event is created typically when some UI changes the tags for a
 *  proposition/topic.
 *  Potential huge side effects...
 *  Only the owner of the proposition is supposed to have such a power!
 *  It is expected that the owner may change tags in order to favor the
 *  the proposition, by adding tags that brings lots of positive votes but are
 *  either too general or not well related to the topic at hand. Voters can
 *  fight abusive tagging using Vote.protest.
 */

Event.type( Tagging );
function Tagging( options ){
  de&&mand( options.proposition );
  this.proposition = options.proposition;
  this.detags      = options.detags || [];
  this.tags        = options.tags   || [];
  var tag;
  for( tag in this.detags ){
    this.proposition.remove_tag( tag );
  }
  for( tag in this.tags ){
    this.proposition.add_tag( tag );
  }
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
  
  de&&mand( options.persona );
  de&&mand( options.proposition );
  
  //if( options.id === 10034 )debugger;
  
  // Decide: is it a new entity or an update? key is persona_id.proposition_id
  var key = options.persona.id + "." + options.proposition.id;
  var vote = this.register( key );

  this.persona     = options.persona;
  this.label       = options.label || this.persona.label;
  this.proposition = options.proposition;
  if( this.is_create() ){
    this.analyst     = water( options.analyst );
    this.source      = water( options.source );
    this.delegation  = water( options.delegation  || Vote.direct  );
    // Analysts vote "in the open", no privacy ; otherwise defaults to private
    this.privacy     = water( (options.analyst && Vote.public )
      || options.privacy || Vote.private
    );
    this.previously  = water( options.previously  || Vote.neutral );
    this.orientation = water();
    var w = water( _, error_traced( update ), [ this.delegation, this.orientation ] );
    w.vote = this;
    this.orientation( options.orientation || Vote.neutral );
    this.persona.track_vote( this );
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
      water.effect( function(){
        vote.persona.vote_for_others( vote );
      });
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
    }
    return this;
  }
  // Indirect votes are processed at agent's level
  if( this.orientation() === Vote.indirect )return;
  var vote = this;
  // Votes of groups have no impacts on results
  if( vote.persona.is_group() )return this;
  de&&mand( this.proposition );
  // ToDo: is the .effect required?
  water.effect(
    function(){
      de&&bug( "Add vote " + vote 
        + " now " + vote.orientation()
        + " of " + vote.persona
        + " via " + vote.delegation()
        + " for proposition " + vote.proposition
      );
      vote.proposition.add_vote( vote );
    }
  );
  return this;
};

Vote.prototype.remove = function( was ){
  //debugger;
  de&&mand( !was.is_entity );
  this.previously( was.orientation );
  if( was.orientation === Vote.neutral )return this;
  // Indirect votes are processed at agent's level
  if( was.orientation === Vote.indirect )return;
  var vote = this;
  // Votes of groups have no impacts on results
  if( vote.persona.is_group() )return this;
  // ToDo: is the .effect required?
  water.effect(
    function(){
      de&&bug( "Remove vote " + vote 
        + " previously " + was.orientation
        + " of " + vote.persona
        + " via " + was.delegation
        + " from proposition " + vote.proposition
      );
      //de&&bugger();
      vote.proposition.remove_vote( was );
    }
  );
  return this;
};

Vote.prototype.delegate = function(){
// Direct neutral vote triggers delegations
  de&&mand( this.orientation() === Vote.neutral );
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
  var agent_vote = agent.find_vote_on_proposition( this.proposition );
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
  
  var result = this.register( options.proposition.id );
  var water  = this.water( result );
  
  this.proposition = options.proposition;
  this.label       = this.proposition.label;
  this.neutral     = water( options.neutral   || 0 ); // ToDo: remove this?
  this.blank       = water( options.blank     || 0 );
  this.protest     = water( options.protest   || 0 );
  this.agree       = water( options.agree     || 0 );
  this.disagree    = water( options.disagree  || 0 );
  this.direct      = water( options.direct    || 0 );
  
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
    return result;
  }
  
  // Computed attributes, including orientation transition detection
  
  this.total = function(){
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
  
  var delegation = this.register( this.id );
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
  this.tags     = water( options.tags );
  this.inactive = water( !!options.inactive );

   if( this.is_update() ){
    // If change to list of tags
    if( options.tags && diff( options.tags, delegation.tags() ).changes ){
      this.inactive = options.inactive || delegation.inactive();
      // Deactivate delegated votes
      delegation.inactive( true );
      delegation.tags( options.tags );
      // Activate delegated votes
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
        trace( "ToDo: activate a delegation" );
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

Delegation.prototype.update_votes = function(){
  var delegation = this;
  var tags     = delegation.tags();
  var inactive = delegation.inactive();
  var votes = delegation.votes() || [];
  votes.forEach( function( vote ){
    // Check that vote is still delegated as it was when last updated
    if( vote.delegation() !== delegation )return;
    var new_orientation = !inactive
      ? delegation.agent.get_orientation_on( vote.proposition )
      : Vote.neutral;
    if( new_orientation && new_orientation !== vote.orientation() ){
      vote.orientation( new_orientation );
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
  return tags_includes( this.tags(), tags );
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


function bootstrap(){
// This function returns a list of functions that when called can use
// Ephemeral.inject() to inject changes into the machine. The next function
// in the list is called once all effects of the previous function are fully
// done.
// The bootstrap() function is used in the main() function using Ephemeral.
// start(). That latter function will call bootstrap() only when there is
// no log file of persisted changes.

  var debugging = true;

  function c( t, p ){
  // Inject a change
    return Ephemeral.ref( Ephemeral.inject( t.name, p ).id );
  }

  function p( n ){
  // Create a person
    return p[n] = c( Persona, { label: n } );
  }

  function g( n ){
  // Create a group
    return p[n] = c( Persona, { label: n, role: "group" } );
  }

  function t( n, l ){
  // Create a proposition topic, tagged
    return t[n] = c( Topic, { label: n, source: "bootstrap", tags: l } );
  }

  function tag( n ){
  // Create a tag topic
    return t[n] = c( Topic, { label: n } );
  }

  function v( p, t, o ){
  // Create/Update a vote
    de&&mand( p ); de&&mand( t );
    return v[ v.n++ ]
    = c( Vote, { persona: p, proposition: t, orientation: o } );
  }
  v.n = 0;

  function d( p, t, a ){
  // Create a delegation
    return d[ d.n++ ] = c( Delegation, { persona: p, tags: t, agent: a } );
  }
  d.n = 0;

  function r( t, a, d, p, b, n, dir ){
  // Update a result
    return c( Result,
      { proposition: t, agree: a, disagree: d, protest: p, blank: b, neutral: n, direct: dir
    } );
  }

  function m( p, g, i ){
  // Create/Update a membership
    return c( Membership, { member: p, group: g, inactive: i } );
  }

  var entity;
  function e( type, key ){
  // Retrieve an entity by key. Usage: e( type, entity or type, key, ... )
  //   ex: e( Persona, "@jhr" )
  //   ex: e( Vote, Persona, "@jhr", Topic, "Hulot president" );
  //   ex: e( Vote, e( Persona, "@jhr"), Topic, "Hulot president" );
  //   ex: e( Vote, Persona, @jhr, e( Topic, "Hulot president" ) );
    if( arguments.length === 1 && type && type.is_entity )return entity = type;
    if( arguments.length === 2 )return entity = type.all[ key ];
    var id = "";
    for( var ii = 1 ; ii < arguments.length ; ii += 2 ){
      if( arguments[ ii ].is_entity ){
        id += "." + arguments[ ii ].id;
        ii--;
      }else{
        id += "." + (arguments[ ii ].all)[ arguments[ ii + 1 ] ].id;
      }
    }
    return entity = type.all[ id.substring( 1 ) ];
  }

  // This bootstrap is also the test suite...., a() is assert()
  function a( prop, msg ){
    if( prop )return;
    trace( "Test, error on entity " + pretty( entity, 2 ) );
    console.trace();
    !debugging && assert( false, msg );
  }

  // Test entities
  var /* individuals */ jhr, hulot, peter;
  var /* groups */ g_hulot;
  var /* tags */ t_president;
  var /* propositions */ p_hulot;
  var /* votes */ v_jhr, v_peter, v_hulot;
  var /* Results */ r_hulot;

  trace( "Bootstrap - vote.js test suite" );
  return [

    //                          *** Personas ***

    function(){ p( "@jhr"                                                   )},
    function(){ a( jhr = e( Persona, "@jhr" ), "persona @jhr exists"        )},
    function(){ a( jhr.is_individual() && !jhr.is_group()                   )},
    function(){ p( "@john"                                                  )},
    function(){ p( "@luke"                                                  )},
    function(){ p( "@marc"                                                  )},
    function(){ p( "@peter"                                                 )},
    function(){ peter = e( Persona, "@peter"                                )},
    function(){ p( "@N_Hulot"                                               )},
    function(){ hulot = e( Persona, "@N_Hulot"                              )},

    //                          *** Groups ***

    function(){ g( "Hulot friends"                                          )},
    function(){ g_hulot = e( Persona, "Hulot friends"                       )},
    function(){ a( g_hulot.is_group() && !g_hulot.is_individual()           )},

    //                        *** Membership ***

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

    function(){ tag( "#President"                                           )},
    function(){ t_president = e( Topic, "#President"                        )},
    function(){ a(  t_president, "Topic #President exists"                  )},
    function(){ a(  t_president.is_tag()                                    )},
    function(){ a( !t_president.is_proposition()                            )},

    //                     *** Propositions ***

    function(){ t( "Hollande president",  [ t_president ]                   )},
    function(){ a( e( Topic, "Hollande president").is_proposition()         )},
    function(){ t( "Hulot president",     [ t_president ]                   )},
    function(){ p_hulot = e( Topic, "Hulot president"                       )},
    function(){ a( p_hulot.is_proposition()                                 )},
    function(){ a( r_hulot = p_hulot.result                                 )},

    //                     *** Delegations ***

    function(){ d( jhr, [ t_president ], hulot                              )},

    //                        *** Votes ***

    // Peter first disagrees, about the "Hulot president" proposition
    function(){ v( peter, p_hulot, "disagree"                               )},
    function(){ v_peter = e( Vote, peter, p_hulot                           )},
    function(){ a( r_hulot.orientation() === "disagree"                     )},
    function(){ a( !r_hulot.win()                                           )},
    function(){ a( r_hulot.disagree() === 1                                 )},
    function(){ a( r_hulot.against()  === 1                                 )},
    function(){ a( r_hulot.total()    === 1                                 )},
    function(){ a( r_hulot.direct()   === 1                                 )},

    // Then he agrees
    function(){ v( peter, p_hulot, "agree"                                  )},
    function(){ a( r_hulot.orientation() === "agree"                        )},
    function(){ a( r_hulot.win()                                            )},
    function(){ a( r_hulot.agree()    === 1                                 )},
    function(){ a( r_hulot.against()  === 0                                 )},
    function(){ a( r_hulot.total()    === 1                                 )},
    function(){ a( r_hulot.direct()   === 1                                 )},

    // Then he votes "blank"
    function(){ v( peter, p_hulot, "blank"                                  )},
    function(){ a( r_hulot.orientation() === "blank"                        )},
    function(){ a( !r_hulot.win()                                           )},
    function(){ a( r_hulot.agree()    === 0                                 )},
    function(){ a( r_hulot.against()  === 0                                 )},
    function(){ a( r_hulot.blank()    === 1                                 )},
    function(){ a( r_hulot.total()    === 1                                 )},
    function(){ a( r_hulot.direct()   === 1                                 )},

    // Then he protests
    function(){ v( peter, p_hulot, "protest"                                )},
    function(){ a( r_hulot.orientation() === "protest"                      )},
    function(){ a( !r_hulot.win()                                           )},
    function(){ a( r_hulot.agree()    === 0                                 )},
    function(){ a( r_hulot.against()  === 1                                 )},
    function(){ a( r_hulot.blank()    === 0                                 )},
    function(){ a( r_hulot.protest()  === 1                                 )},
    function(){ a( r_hulot.total()    === 1                                 )},
    function(){ a( r_hulot.direct()   === 1                                 )},

    // Then he gets to neutral, equivalent to "not voting"
    function(){ v( peter, p_hulot, "neutral"                                )},
    function(){ a( r_hulot.orientation() === "neutral"                      )},
    function(){ a( !r_hulot.win()                                           )},
    function(){ a( r_hulot.agree()    === 0                                 )},
    function(){ a( r_hulot.against()  === 0                                 )},
    function(){ a( r_hulot.blank()    === 0                                 )},
    function(){ a( r_hulot.protest()  === 0                                 )},
    function(){ a( r_hulot.total()    === 0                                 )},
    function(){ a( r_hulot.direct()   === 0                                 )},

    // Hulot votes, jhr too because of a delegation
    function(){ v( hulot, p_hulot, "agree"                                  )},
    function(){ a( r_hulot.orientation() === "agree"                        )},
    function(){ a( r_hulot.win()                                            )},
    function(){ a( r_hulot.agree()    === 2                                 )},
    function(){ a( r_hulot.against()  === 0                                 )},
    function(){ a( r_hulot.total()    === 2                                 )},
    function(){ a( r_hulot.direct()   === 1                                 )},

    // Then he gets to neutral
    function(){ v( hulot, p_hulot, "neutral"                                )},
    function(){ a( r_hulot.orientation() === "neutral"                      )},
    function(){ a( !r_hulot.win()                                           )},
    function(){ a( r_hulot.agree()    === 0                                 )},
    function(){ a( r_hulot.against()  === 0                                 )},
    function(){ a( r_hulot.blank()    === 0                                 )},
    function(){ a( r_hulot.protest()  === 0                                 )},
    function(){ a( r_hulot.total()    === 0                                 )},
    function(){ a( r_hulot.direct()   === 0                                 )},

    // Hulot votes and then jhr decides to vote directly against his delegation
    function(){ v( hulot, p_hulot, "agree"                                  )},
    function(){ a(  r_hulot.win()                                           )},
    function(){ a( r_hulot.total()    === 2                                 )},
    function(){ a( r_hulot.direct()   === 1                                 )},
    function(){ v( jhr, p_hulot, "disagree"                                 )},
    function(){ a( !r_hulot.win()                                           )},
    function(){ a( r_hulot.total()    === 2                                 )},
    function(){ a( r_hulot.direct()   === 2                                 )},

    // Hulot votes but jhr decided to vote directly
    function(){ v( hulot, p_hulot, "blank"                                  )},
    function(){ a( r_hulot.total()    === 2                                 )},
    function(){ a( r_hulot.blank()    === 1                                 )},
    function(){ a( r_hulot.direct()   === 2                                 )},

    // jhr erases his vote and consequently relies on his delegation
    function(){ v( jhr, p_hulot, "neutral"                                  )},
    function(){ a( r_hulot.total()    === 2                                 )},
    function(){ a( r_hulot.blank()    === 2                                 )},
    function(){ a( r_hulot.direct()   === 1                                 )},

    function(){ trace( "**************************************************" )},
    function(){ v( hulot, p_hulot, "agree"                                  )},
    function(){ v( peter, p_hulot, "neutral"                                )},
    function(){ v( hulot, p_hulot, "disagree"                               )},
    function(){ v( peter, p_hulot, "agree"                                  )},
    function(){ r( p_hulot, 102, 101, 1, 12, 1000, 99                       )},

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


function main(){

  trace( "Welcome to l8/test/vote.js -- Liquid demo...cracy" );

  Ephemeral.force_bootstrap = true;
  Ephemeral.start( bootstrap, function( err ){
    if( err ){
      trace( "Cannot proceed", err, err.stack );
      //process.exit( 1 );
      return;
    }
    // Let's provide a frontend...
    trace( "READY!" );
  } );
}

l8.begin.step( main ).end;
l8.countdown( 2 );

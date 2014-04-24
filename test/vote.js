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
var de        = true;
var debugging = de && true;
var trace     = l8.trace;
var bug       = trace;

// de&&mand() is like assert()
function mand( b ){
  if( b )return;
  bug( "l8/test/vote.js, assert error" );
  if( debugging )debugger;
  if( !debugging )throw new Error( "vote.js assert" );
}

// de&&bugger() invokes the debugger only in debugging mode
function bugger(){ if( debugging )debugger; }

// safe( fn ) is like fn but with exceptions traced in debug mode
// ToDo: rename
var safe = function safe( f ){
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
};


// Misc. util

function noop(){}
function idem( x ){ return x; }

var _ = noop();      // _ === undefined

var no_opts = {};

// Never changing undefined & empty array waters
var _emptiness_ = water();
var emptiness   = water( [] );


// Fast inject of properties. Note: not just owned ones, prototype's too
var extend = function( to, from ){
  for( var ii in from ){ to[ ii ] = from[ ii ]; } 
  return to;
};

// Cool to load all vocabulary at once in some scope.
// Usage: require( "ephemeral.js" ).into( global )
app.into  = function( obj ){ extend( obj, app ); };


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

// Add a push operation for an entity, done at end of current 'step'
function push( f, e ){
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
 *  then incremented. NextId is adjusted to always be more than any previouly
 *  used id (stored ones typically).
 */

// Global pool of all entities, id indexed
var NextId      = 0;
var MaxSharedId = 9999;
var AllEntities = [];

// Look for an existing entity based on id, xor undefined.
// Also detect forward reference ids and adjust NextId accordingly.
var lookup = function( id ){
  // Sometimes the UID is actually an entity type name
  if( typeof id === "string" )return AllEntities[ id ];
  if( id >= NextId ){
    de&&bug( "Forward UID lookup", id );
    NextId = id + 1;
  }
  return AllEntities[ id ];
};

// Entities have an unique id. This function checks if a provided id is
// a forward reference id and adjusts NextId accordingly. If no id is
// provided, one is returned and NextId is incremented.
var alloc_id = function( x ){
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
 *  Base class for all entities
 *
 *  From latin "ens" + "itas", is beeing (real, physical).
 *   aka: a thing.
 *
 *  Entities have an ID, usually.
 *  There is a global table of all entities: AllEntities.
 *  Ephemeral entities will "expire", sometimes prematurely.
 *  Entities without an ID are "updates": they describe changes about
 *  properties of an existing entity; they are "values", not "objects".
 */

function Entity( options ){
  // Make sure the entity has an id. .register() may remove it...
  this.id = alloc_id( options.id );
  // Track all entities, some of them will expire or lose their id (quickly)
  AllEntities[ this.id ] = this;
}

app.Entity = Entity;

extend( Entity.prototype, {
  
  // To enable "duck" typing
  is_entity: true,
  
  // Redefined by sub types
  type: "Entity",
  
  // Create a new entity or update an existing one (ie one with same "key")
  create: function( options ){ return new Entity( options ); },
  
  // Most entities "expires", usually after some delay. Some may "resurrect"
  expired: function(){ return false; },
  
  // Queue a push, done at end of current step
  push: function( a_fluid ){ return push( a_fluid, this ); },
  
  // Debug related
  log: function( f ){ console.log( f ? f.call( this, this ) : this.toString() ); },
  toString: function(){
    return ""
    + (this === this.constructor.prototype ? "Proto" : "")
    + this.type
    + "." + this.id
    + (this.label ? "[" + this.label + "]" : "" );
  }
  
} );

Entity.prototype.constructor = Entity;
Entity.type = function( ctor ){ return type( ctor, this ); }

var null_object = new Entity( { machine: MainMachine } );

var abbreviations = {
  orientation: "orient",
  win:       "win",
  disagree:  "disa",
  against:   "again",
  total:     "tot",
  direct:    "dir",
  duration:  "dura",
  topic:     "&",
  tag:       "#",
  timestamp: "ts",
  proposition: "prop",
  vote: "vot",
  votes: "vot",
  persona: "@",
  "result": "+"
};
function abbreviate( str ){
  if( str[ str.length - 1 ] === "s" ){
    str = str.substring( 0, str.length - 1 );
  }
  return abbreviations[ str ]
  || str[0] + str.substring( 1 ).replace( /[aeiou]/g, "" );
}

function inspect( v, level ){
  
  if( arguments.length < 2 ){ level = 1; }
  
  if( level < 0 )return ".";
  
  var buf = "";
  
  if( typeof v === "undefined" )return "_";
  
  if( typeof v === "function" || typeof v === "object" ){
    
    if( typeof v === "function" ){
      // Water, get their current value
      if( v._water ){
        buf += "|" + inspect( v._water.current, level && level - 1 );
        return buf;
      }else if( v.rid ){
        if( v.entity ){
          buf += "&" + inspect( v.entity, level && level - 1 );
        }else{
          buf += "&" + v.rid;
        }
      }else{
        if( v.name ){
          buf += "." + v.name + "()";
        }else{
          buf += "()";
        }
      }
      
    }else if( v.watered ){
      // Water errors!
      buf += "!" + inspect( v.error, level && level - 1) + "!";
      
    }else if( Array.isArray( v ) ){
      if( level === 0 || !v.length ){
        return "[]" + (v.length ? "." + v.length : "");
      }else{
        var abuf = [];
        v.forEach( function( v ){
          abuf.push( inspect( v, level - 1 ) );
        });
        return "[" + abuf.join( " " ) + "]";
      }
      
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
    var lbuf = [];
    var val;
    for( var attr in v ){
      if( attr !== "id" && v.hasOwnProperty( attr ) ){
        val = v[ attr ];
        if( attr === "label" )continue;
        if( attr === "buried" ){
          if( val ){ lbuf.push( "buried" ) }
          continue;
        }else if( attr === "timestamp" ){
          val = val - now();
        }else if( attr === "expire" ){
          if( ( val.water && val() || val ) - now() > 2 * 24 * 60 * 60 * 1000 ){
            val = false;
          }
        }
        if( val === true || val === false ){
          lbuf.push( (val ? "" : "!") + abbreviate( attr ) );
          continue;
        }
        if( typeof val !== "function" ){ attr = abbreviate( attr ); }
        lbuf.push( "" + attr + "" + inspect( val, level && level - 1 ) );
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
  console.log( inspect( x, level ) );
  //console.log( "Value", x.value() );
}

function dump_entities( from, level ){
  console.log( "--- ENTITY DUMP ---" );
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
  console.log( "--- END DUMP ---" );
}

// Prototypal style inheritance with typed entities
// "ctor" is a function. It's name is the subtype name.
// It is called in two cases:
// - To initialize a newly created entity
// - To update an existing entity
// It must call this.register( key ) to distinguish these cases.
//  'key' can be anything, including a combination of ids, "." separated.
// After that call, this.is_update() is false for creations.
//   this.water() returns l8 water() for entities xor idem() for updates
var type = function( ctor, base ){
  if( !base ){ base = Ephemeral; }
  var proto = base.prototype;
  var name = ctor.name;
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
  // Build the instance creation function
  var efluid = ctor.fluid = fluid();
  sub.push = function( f ){
    if( f ){
      push( f, this );
      return this;
    }
    push( efluid, this );
    var sup = this.super.push;
    // ToDo: fix stack overflow
    if( 0 && sup ){
      sup.call( this );
    }
    return this;
  };
  ctor.create = sub.create = function( options ){
    var obj = Entity.created = Object.create( sub );
    //if( !options ){ obj.machine = Machine.current; }
     // Call all constructors, including super, super's super, etc
    var ii = 0;
    var list = ctor.ctors;
    var a_ctor;
    // ToDo: unroll for speed
    while( a_ctor = list[ ii++ ] ){
      a_ctor.call( obj, options );
    }
    //de&&bug( "New entity", "" + inspect( obj, 2 ) );
    // Push new entity on the fluid bound to the entity's type, unless proto
    if( proto_entity ){
      obj.push();
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
  trace( "Create entity " + inspect( proto_entity ) );
  // Create global table of all entities of this new type
  ctor.all = {};
  // Ease sub typing
  ctor.type = function( sub_type ){ return type( sub_type, ctor ); };
  de&&mand( proto_entity === proto_entity.constructor.prototype );
  de&&mand( proto_entity.is_entity );
  de&&mand( proto_entity.id );
  de&&mand( proto_entity.super === proto );
  de&&mand( proto_entity.constructor === ctor );
  de&&mand( proto_entity.constructor.prototype === proto_entity );
  return proto_entity;
};

// Ember style computed property.
// Usage, during entities's .create() only:
//  this.attr = function(){ this.other_attr() * 10 }.water( this.other_attr );
Function.prototype.water = Function.prototype.when = function(){
  var transform = this;
  // When .create() is called, Entity.created points to the beeing created obj
  var that = Entity.created;
  // Bind the transform function with the target entity
  var f = function(){
    try{
      return transform.apply( that, arguments );
    }catch( err ){
      trace( "Water transform error", err, err.stack );
      de&&bugger();
    }
  };
  return water( water, f, arguments );
};


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

// Resolve id references into pointers
function deref( o, seen ){
  if( !o )return o;
  if( typeof o === "function" ){
    if( o.rid )return o();
    return o;
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

// Change pointers into id references for json storage
function json_encode( o ){
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


// Entity's value is a snapshot of the entity's current state
function value( x, force ){
  // console.log( x );
  var o;
  var a;
  var r;
  if( x ){
    if( x.is_entity && x.buried ){
      return;
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
          && [ "machine", "type", "v", "super", "is_entity", "buried" ]
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
  //de&&mand( Machine.current = this.machine );
  return value( this, true );
};


/*
 *  The only constant is change - Heraclitus
 *
 *  Changes are TOPs: Target.Operation( Parameter ). They describe an event/
 *  action about something. Usually it's about creating some entity.
 *
 *  The processing of change produces one or more effects. The first effect
 *  is linked with the change.
 */

Entity.type( Change );
function Change( options ){
  this.ts   = options.timestamp || now();
  this.t    = options.t;             // Target
  this.o    = options.o || "create"; // Operation
  this.p    = options.p || {};       // Parameters
  this.from = options.from;          // Another change
  this.to   = options.to;
}

/*
 *  Effect entity, abstract type
 *  aka Mutable
 *
 *  Changes produce effects. Let's track the updates.
 */

Entity.type( Effect );
function Effect( options ){
  var change = Change.current;
  // If the effect is due to a change (hopefully), link change to effect
  if( change && change.p.id === this.id ){
    change.to = this;
  }else{
    trace( "Effect without a change, spontaneous?" );
  }
  // Also remember this change as the "first" update, ie the "create" update
  this.updates = water( [change] );
  // Some effects are about a pre existing entity, ie they are updates.
  // .register( key ) will detect such cases 
  this.effect = _;
}

// Called by .register(), when there is an update
Effect.prototype.touch = function(){};

// Register entity and detect updates about pre-existing entities
Effect.prototype.register = function( key ){
  if( this.id === 10009 )debugger;
  // Look for an existing entity with same type and same key
  var entity = this.constructor.all[ key ];
  // If found then this entity is actually an update for that existing entity
  if( entity ){
    trace( "Update on " + entity + ", key:", key, "update: " + this );
    de&&mand( entity !== this );
    de&&mand( !entity.is_update() );
    // Such an update does not need an UID because some Change entity made it*
    if( 0 ){
      if( AllEntities[ NextId - 2 ].type !== "Change" ){
        trace( value( AllEntities[ NextId - 2 ], true ) );
        trace( value( AllEntities[ NextId - 1 ], true ) );
        trace( value( entity, true ) );
        trace( value( this, true ) );
        de&&bugger();
      }
      de&&mand( AllEntities[ NextId - 2 ].type === "Change" );
      NextId--;
    }
    // Remember the target entity that this update procuces an effect on
    if( this.id === 10016 )debugger;
    this.effect = entity;
    //this.to = entity;
    de&&mand( this.is_update() );
    de&&mand( !entity.is_update() );
    // Add the update to the entity's log of updates
    var updates = entity.updates();
    updates.push( this );
    entity.updates( updates );
    // Invoke possibly redefined .touch()
    entity.touch();
    return entity;
  }
  // Genuine new entity, key first seen, track it
  trace( "Key for " + this + " is: ", key );
  this.constructor.all[ key ] = this;
  return this;
};
  
Effect.prototype.is_update = function(){ return this.effect; },
  
// Changes to entities involves watering the original with an update
Effect.prototype.water = function( other ){
  // There must be actual water only in the original, not in the updates
  return other === this ? water : idem;
};


/*
 *  Version entity
 *
 *  Persisted entity are stored in "log" files. Whenever a new version of this
 *  software is created, with changes in the data schema, a new version entity
 *  is created.
 *  During restore (from log) global Change.versioning progresses until it
 *  reaches the value of Change.version, the current version of the schema.
 */

Change.version    = "1"
Change.versioning = "";

Entity.type( Version );
function Version( options ){
  this.label = Change.version = options.label;
}


/*
 *  The rest is ephemeral. It will expire and be buried, unless resurrected.
 *
 *  Lifecycle: create(), [renew()], expiration(), [resurrect() + renew()]... 
 */

Effect.type( Ephemeral );
function Ephemeral( options ){
  this.timestamp  = options.timestamp || now();
  this.duration   = water( options.duration || ONE_YEAR );
  this.buried     = false;
  this.expire     = function(){
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
  // Clear object if not resurrected, this enables some garbadge collection
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

Ephemeral.prototype.renew = function( duration ){
  if( this.buried )return;
  if( !duration ){ duration = ONE_YEAR; }
  var new_limit = now() + duration;
  var total_duration = new_limit - this.timestamp;
  this.duration( total_duration );
  // Renewal.create( { entity: this } );
};

Ephemeral.prototype.touch = function(){
  var delay = this.expire() - now();
  // If touched after mid life, extend duration to twice the current age
  if( delay < this.age() / 2 ){
    this.renew( this.age() * 2 );
  }
  // Touch.create( { entity: this } );
};


/*
 *  Base type of event entities
 */

Entity.type( Event );
function Event(){}


/*
 *  Expiration entity
 *  This is the event that occurs when an entity expires
 */
 
 Entity.type( Expiration );
 function Expiration( options ){
   this.entity = options.entity;
 }


/*
 *  Trace entity
 *
 *  This is for deployed systems
 */
 
Event.type( Trace );
function Trace( options ){
  this.subject     = options.subject;
  this.event       = options.verb;
  this.parameters  = options.parameters;
}

// Trace event types
Trace.debug    = "debug";
Trace.info     = "info";
Trace.error    = "error";
Trace.critical = "critical";

function TRACE( e, p ){ Trace.create({ event: e, parameters: p }); }
function DEBUG(){    TRACE( Trace.debug,    arguments ); }
function INFO(){     TRACE( Trace.info,     arguments ); }
function ERROR(){    TRACE( Trace.error,    arguments ); }
function CRITICAL(){ TRACE( Trace.critical, arguments ); }

app.TRACE    = TRACE;
app.DEBUG    = DEBUG;
app.INFO     = INFO;
app.ERROR    = ERROR;
app.CRITICAL = CRITICAL;

/*
 *  Persistent changes processor
 */

function persist( fn, a_fluid, filter ){
  //var tmp = boxon(); tmp( "forced bootstrap" ); return tmp;
  // At some point changes will have to be stored
  var restored = false;
  a_fluid.tap( function( item ){
    // Don't store while restoring from store...
    if( !restored )return;
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
  // Determine what should be the next UID, greater than anything stored
  // ToDo: avoid reading whole file!
  try{
    var content = fs.readFileSync( fn, "utf8" );
    var idx = content.lastIndexOf( '"id":' );
    if( idx !== -1 ){
      content = content.substring( idx + '"id":'.length );
      content = parseInt( content, 10 );
      trace( "Restore, max id:", content );
      alloc_id( content );
    }
  }catch( err ){
    // File does not exist, nothing to restore
    restored = true;
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
    trace( "End of restore" );
    // restore done. what is now pushed to "changes" gets logged
    restored = true;
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
    trace( "EOF reached", fn );
    change_flow.close();
  });
  return next;
}

Change.prototype.process = function(){
  var target = lookup( this.t );
  de&&mand( target );
  var operation = this.o || "create";
  de&&bug( "Change.process, invoke", operation, "on " + target, "p:", value( this.p ) );
  try{
    if( this.p && !this.p.id && this.id ){
      this.p.id = this.id;
    }
    Change.current = this;
    return target[ operation ].call( target, this.p );
  }catch( err ){
    trace( "Could not process change", value( this, true ), err, err.stack );
    return water.fail( err );
  }
};


/*
 *  Dataflow processing. TBD
 */
 
fluid.method( "inspect", function(){
  return fluid.it.map( function( it ){ return inspect( it ); } );
} );

de&&Expiration.fluid.inspect().log( "Log Expiration" );

// Start the "change processor".
// It replays logged changes and then plays new ones.
// When there is no log, it bootstraps first.
function start( bootstrap, cb ){
  if( !cb ){ cb = boxon(); }
  de&&dump_entities();
  // Here is the "change processor"
  Change.fluid
  .map( function( change ){
    return Change.prototype.process.call( deref( change ) ); }
  ).failure( function( err ){ trace( "Change process error", err ); } )
  ;//.inspect().log();
  // It replays old changes and log new ones
  persist(
    app.store || "ephemeral.json.log",
    Change.fluid,
    function( item ){ return item.t !== "Trace"; } // filter trace entities
  ).boxon( function( err ){
    var ready = boxon();
    if( !err ){
      trace( "Restored from ephemeral.json" );
      ready();
    }else{
      trace( "Restore error", err );
      // ToDo: handle error, only ENOENT is ok, ie file does not exist
      trace( "Bootstrapping" );
      try{
        steps( bootstrap() ).boxon( function( err ){
          trace( "Bootstrap READY" );
          ready( err );
        });
      }catch( err ){
        trace( "Bootstrap error", err, err.stack );
        ready( err );
      }
    }
    ready( function( err ){
      de&&dump_entities();
      if( err ){
        CRITICAL( "Cannot proceed, corrupted " + app.store );
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
  return Change.create( { t: t, o: "create", p: p } );
};
Ephemeral.get_next_id = function(){ return NextId; };
Ephemeral.ref = ref;

// Debug related
app.trace    = trace;
app.assert   = mand;
app.bugger   = bugger;
app.inspect  = inspect;
app.safe     = safe;

// More exports
app.value    = value;
app.idem     = idem;
app.now      = now;

return app;

} // end of function ephemeral()

// exports = ephemeral;



/* ========================================================================= */
/* ========================= Application specific code ===================== */
/* ========================================================================= */


var vote = { store: "vote.json.log" }; // ToDo: "file://vote.json.log"
// require( "ephemeral.js" )( vote )
ephemeral( vote );

var l8        = vote.l8;
var Event     = vote.Event;
var Effect    = vote.Effect;
var Ephemeral = vote.Ephemeral;

// My de&&bug() and de&&mand() darlings
var de = true;
var bug    = vote.trace;
var bugger = vote.bugger;
var safe   = vote.safe;
var mand   = vote.assert;
var trace  = vote.trace;
var value  = vote.value;
var water  = vote.water;
//debugger;


/*
 *  Persona entity
 *
 *  Individuals and groups.
 */

Ephemeral.type( Persona );
function Persona( options ){
  
  var persona = this.register( options.label );
  var water   = this.water( persona );
  
  this.label       = options.label;
  this.role        = options.role || "individual";
  this.friends     = water( [] ); // Individual's friends or group's members
  this.memberships = water( [] ); // To groups
  this.delegations = water( [] ); // To personas, about topics
  this.votes       = water( [] ); // Direct votes
  
  return this.is_update() ? persona.update( this ) : this;
  
}

// Persona roles
Persona.individual = "individual";
Persona.group      = "group";

Persona.prototype.is_group      = function(){ return this.role === "group"; };
Persona.prototype.is_individual = function(){ return !this.is_group();      };

Persona.prototype.update = function( other ){ return this; };


/*
 *  Source entity
 *
 *  - Describes the "reference material" that explain why a topic was created
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
 *  Topic entity
 *
 *  Atomic topics are the ultimate target of votes.
 *  aka Propositions
 *    their source is typically a tweet.
 *    they can be tagged.
 *  Tag topics help to classify propositions. 
 *    they don't have a source.
 *    they can be voted on too, like propositions.
 *
 *  ToDo: split in two types, tags and propositions?
 */
 
Ephemeral.type( Topic );
function Topic( options ){
  
  de&&mand( options.label );
  
  var topic = this.register( options.label );
  var water = this.water( topic );
  
  de&&mand( water !== Ephemeral.idem );
  
  // Name of proposition or #xxxx tag
  this.label = options.label;
  
  // Source could be a url, typically
  this.source = water( options.source );
  
  // Propositions track all the votes about them
  this.votes = water( options.votes );
  
  // The result of votes on the proposition
  this.result = !this.is_update() ? Result.create({ topic: this }) : options.result;
  
  // Tags track the propositions they tag
  this.propositions = water( options.propositions );
  
  // Propositions track the tags assigned to them
  this.tags = water( options.tags );
  
  // Tags track the delegations they impact, can be huge!
  this.delegations = water( options.delegations );
  
  // ToDo: implement .update()?
  if( this.is_update() )return this.update( topic );
  
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
  if( other.source ){ this.source( other.source ); }
  if( other.result      ){ this.update_result(      other.result );      }
  if( other.delegations ){ this.update_delegations( other.delegations ); }
  return this;
};

Topic.prototype.update_delegations = function( list ){
  trace( "ToDo: update delegations" );
  return this;
};

Topic.prototype.is_proposition = function(){ return this.label[0] !== "#"; };
Topic.prototype.is_tag         = function(){ return !this.is_proposition(); };
Topic.prototype.add_vote       = function( o, v ){ this.result.add_vote(    o, v ); };
Topic.prototype.remove_vote    = function( o, v ){ this.result.remove_vote( o, v ); };

// There is a log of all votes. It is a snapshot copy of the vote value that is
// kept because a persona's vote can change over time.
Topic.prototype.track_vote = function( v ){
  var val = v.value();
  v.snaptime = Ephemeral.now();
  var votes = this.votes();
  if( !votes ){ votes = []; }
  votes.push( val );
  this.votes( votes );
  return this;
};

/*

  Hierarchical tagging does not work so well in the data world.
  See: http://www.shirky.com/writings/ontology_overrated.html
  delegations should work better when based on "filters".
  A filter is a list of required tags, simple.
  
// A topic includes another one if it is an ancestor of it
Topic.prototype.includes = function( other_topic ){
  if( this.is_proposition() )return false;
  var parent = other_topic;
  while( parent = parent.parent() ){
    if( parent === this )return true;
  }
  return false;
};

// The ancestors of a topic are the super topics that includes it
Topic.prototype.ancestors = function(){
  var list = [];
  var parent = this;
  while( parent = parent.parent() ){
    // ToDo: remove RootTopic?
    list.push( parent );
  }
  return list;
};

Topic.prototype.update_parent = function( topic ){
  if( this.is_update() ){
    this.parent = topic;
    return;
  }
  var parent = this.parent();
  if( parent ){
    parent._remove_child( this );
  }
  // Only RootTopic has no parent
  if( !topic )return;
  topic._add_child( this );
  this.parent( topic );
  // ToDo: change votes based on delegations involved
  trace( "ToDo: topic's parent change handling " + this + "/" + topic );
};

// Private. Called by .change_parent()
Topic.prototype._add_child = function( topic ){
  // Check if already there
  var list = this.children();
  if( list.indexOf( topic ) !== -1 )return;
  // ToDo: ordered list?
  // Avoid clone?
  list = list.slice()
  list.push( topic );
  this.children( list );
  trace( "ToDo: topic's child addition handling " + this + "/" + topic );
};

// Private. Called by .change_parent()
Topic.prototype._remove_child = function( topic ){
  // Check if already there
  var list = this.children();
  var index = list.indexOf( topic );
  if( index === -1 )return;
  list = list.splice( index, 1 );
  this.children( list );
  trace( "ToDo: topic's child removal handling " + this + "/" + topic  );
};

*/

Topic.prototype.add_tag = function( tag, loop ){
  var list = this.tags()|| [];
  var idx = list.indexOf( tag );
  // Done if already there
  if( idx !== -1 )return this;
  // ToDo: avoid clone?
  var new_list = list.slice();
  new_list.push( tag );
  this.tags( new_list );
  if( !loop ){
    tag.add_topic( this, true );
    this.update_votes();
  }
  return this;
};

Topic.prototype.remove_tag = function( tag, loop ){
  var list = this.tags()|| [];
  var idx = list.indexOf( tag );
  // Done if already not there
  if( idx === -1 )return this;
  // ToDo: avoid clone?
  var new_list;
  de&&mand( idx !== - 1 );
  new_list = list.splice( idx, 1 );
  this.tags( new_list );
  if( !loop ){
    tag.remove_topic( this, true );
    this.update_votes();
  }
  return this;
};

Topic.prototype.add_proposition = safe( function( proposition, loop ){
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
} );

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
  var list = this.tags();
  for( var tag in tags ){
    if( list.indexOf( tag ) === -1 )return false;
  }
  return true;
};

Topic.prototype.update_votes = function(){
  // Something changed, this may have an impact on delegated votes
  var delegations = this.delegations();
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
 *  Potential huge side effect!
 */

Event.type( Tagging );
function Tagging( options ){
  de&&mand( options.proposition );
  var proposition = options.proposition;
  var remove_tags = options.detags;
  var add_tags    = options.tags;
  this.proposition = proposition;
  this.detags = remove_tags;
  this.tags = add_tags;
  var tag;
  for( tag in remove_tags ){
    proposition.remove_tag( tag );
  }
  for( tag in add_tags ){
    proposition.add_tag( tag );
  }
}


/*
 *  Vote entity
 *
 *  Personas can vote on topics. They can change their mind.
 *  A group votes when the consolidated orientation of the group changes.
 *  Vote is either "direct" or "indirect" with a delegation.
 *  Analysts can vote on behalf of personas, based on some public source.
 */
 
Ephemeral.type( Vote );
function Vote( options ){
  
  de&&mand( options.persona );
  de&&mand( options.topic );
  
  this.persona     = options.persona;
  this.topic       = options.topic;
  
  // Decide: is it a new entity or an update?
  var vote  = this.register( this.persona.id + "." + this.topic.id );
  var water = this.water( vote ); 
  
  this.analyst     = options.analyst;
  this.source      = options.source;
  this.delegation  = water( options.delegation  || Vote.direct  );
  this.privacy     = water( options.privacy     || Vote.private );
  this.previously  = water( options.previously  || Vote.neutral );
  
  if( this.is_update() ){
    this.orientation = options.orientation;
    return vote.update( this );
  }
  
  this.orientation = water( water, po, [] );
  if( options.orientation ){
    this.orientation( options.orientation );
  }
  function po( o ){
    try{
      var prev = water.current.current || Vote.neutral;
      if( o === prev )return;
      // Orientation changed
      vote.remove( prev );
      vote.add( o );
      // Push updated entity
      vote.push();
      return o;
    }catch( err ){
      trace( "Could not process vote " + vote, err, err.stack );
      console.trace( err );
      de&&bugger();
    }
  }
  
  //this.topic.track_vote( this );
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

// At expiration vote becomes private direct neutral for a while
Vote.prototype.expiration = function(){
  if( this.orientation !== Vote.neutral ){
    this.resurrect();
    this.renew();
    this.orientation( Vote.neutral );
    this.delegation(  Vote.direct  );
    this.privacy(     Vote.private );
  }
};

Vote.prototype.add = function( o ){
  if( o === Vote.neutral )return;
  // Indirect votes are processed at delegatee's level
  if( o === Vote.indirect )return;
  var that = this;
  de&&mand( this.topic );
  water.effect(
    function(){
      trace( "Add vote to topic " + that.topic, ":", o );
      that.topic.add_vote( o, that );
    }
  );
};

Vote.prototype.remove = function( o ){
  this.previously( o );
  if( o === Vote.neutral )return;
  // Indirect votes are processed at delegatee's level
  if( o === Vote.indirect )return;
  var that = this;
  water.effect(
    function(){
      trace( "Remove vote from topic" ); de&&bugger();
      that.topic.remove_vote( o, that );
    }
  );
};

Vote.prototype.update = function( other ){
  if( other.orientation ){
    this.orientation( other.orientation );
  }
};


Effect.type( Result );
function Result( options ){
  
  de&&mand( options.topic );
  
  var result = this.register( options.topic.id );
  var water  = this.water( result );
  
  this.topic     = options.topic;
  this.label = this.topic.label;
  this.neutral   = water( options.neutral   || 0 );
  this.blank     = water( options.blank     || 0 );
  this.protest   = water( options.protest   || 0 );
  this.agree     = water( options.agree     || 0 );
  this.disagree  = water( options.disagree  || 0 );
  this.direct    = water( options.direct    || 0 );
  
  // If this is an update, it simply supercedes the so far known result.
  // This is handy to import bulk results from an external system or to
  // compact the persistent log of changes.
  if( this.is_update() ){
    this.topic.result.neutral(  this.neutral  );
    this.topic.result.blank(    this.blank    );
    this.topic.result.protest(  this.protest  );
    this.topic.result.agree(    this.agree    );
    this.topic.result.disagree( this.disagree );
    this.topic.result.direct(   this.direct   );
    return;
  }
  
  // Computed attributes, including transition detection
  
  this.total = function(){
    var old = this.total();
    var r = this.neutral()
    + this.blank()
    + this.protest()
    + this.agree()
    + this.disagree();
    trace( "Total for " + this, "is:", r, "was:", old );
    return r;
  }.when( this.neutral, this.blank, this.protest, this.agree, this.disagree );
  this.total( 0 );
  
  this.against = function(){
    var old = this.against();
    var r = this.disagree() + this.protest();
    trace( "Against about " + this, "is:", r, "was:", old );
    return r;
  }.when( this.disagree, this.protest );
  this.against( 0 );
  
  this.win = function(){
    var old = this.win();
    var r = this.agree() > this.against();
    trace( "Win about " + this, "is:", r, "was:", old );
    return r;
  }.when( this.agree, this.against );
  this.win( false );
  
  this.orientation = function(){
    var old = this.orientation() || Vote.neutral;
    var now;
    if( this.topic.id === 10017 )de&&bugger();
    trace( "Computing orientation for " + this,
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
    trace( "Computed orientation " + this, "was:", old, "is:", now ); //, value( this, true ) );
    if( now !== old ){
      Transition.create({ result: this, orientation: now, previously: old });
      return now;
    }
  }.when( this.agree, this.against, this.blank );
  this.orientation( Vote.neutral );
}

Result.prototype.add_vote = function( o, v ){
  de&&mand( v.topic === this.topic );
  this[ o ]( this[ o ]() + 1 );
  if( v.delegation === Vote.direct ){
    this.direct( this.direct() + 1 );
  }
};

Result.prototype.remove_vote = function( o, v ){
  de&&mand( v.topic === this.topic );
  this[ o ]( this[ o ]() - 1 );
  if( v.delegation === Vote.direct ){
    this.direct( this.direct() - 1 );
  }
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
  this.result      = options.result      || Result.prototype;
  this.orientation = options.orientation || Vote.neutral;
  this.previously  = options.previously  || Vote.neutral;
}


/*
 *  Delegation entity.
 *
 *  It describes how a persona's vote is delegated to another persona.
 */

Ephemeral.type( Delegation );
function Delegation( options ){
  
  de&&mand( options.persona );
  de&&mand( options.tags    );
  
  var delegation = this.register( this.id );
  var water      = this.water( delegation );
  
  this.persona = options.persona;
  this.tags    = water( options.tags );
  this.active  = water( options.active || true );
  
  if( this.is_update() ){
    delegation.tags( this.tags );
    return;
  }
  
  // ToDo: handle change in list of tags
  // ie: removal and additions
  
  // ToDo: handle activation/deactivation of delegation
  
  //debugger;
  this.votes   = water( [] );
}

// ToDo: handle expiration, should deactivate delegation


/*
 *  Membership entity.
 *
 *  They make personas members of group personas.
 */

Ephemeral.type( Membership );
function Membership( options ){
  
  de&&mand( options.member ); // a persona
  de&&mand( options.leader ); // a group typically
  
  var key = "" + options.leader.id + "." + options.member.id;
  var membership = this.register( key );
  var water      = this.water( membership );
  
  this.member = options.member;
  this.group  = options.leader;
  this.active = water( options.active || true, pa, [] );
  
  if( this.is_update() ){
    membership.active( this.active );
    return;
  }
  
  // ToDo: handle change in membership activation
  function pa( is_active ){
    var old = water.current.current;
    if( old === is_active )return;
    // Change
    if( is_active ){
      // Activate
      trace( "ToDo: activate membership" );
    }else{
      // Deactivate
      trace( "ToDo: deactivate membership" );
    }
  }
  
}

// ToDo: handle expiration, should deactivate membership


/*
 *  For WEB UI
 */
 
Ephemeral.type( Visitor );
function Visitor( options ){
  this.persona     = options.persona;
  this.twitter     = options.twitter; // Twitter credentials
  this.actions     = Ephemeral.fluid();
}


Ephemeral.type( Action );
function Action( options ){
  this.visitor     = options.visitor;
  this.verb        = options.verb;
  this.parameters  = options.parameters;
}

function bootstrap(){
  
  function c( t, p ){ return Ephemeral.ref( Ephemeral.inject( t, p ).id ); }
  function p( n ){ p[n] = c( "Persona", { label: n } ); }
  function g( n ){ p[n] = c( "Persona", { label: n, role: "group" } ); }
  function t( n, l ){ t[n] = c( "Topic", { label: n, source: "bootstrap", tags: l } ); }
  //function tag( n, l ){ t[n] = c( "Topic", { label: n, children: l } ); }
  function tag( n ){ t[n] = c( "Topic", { label: n } ); }
  function v( p, t, o ){
    v[ v.n++ ] = c( "Vote", { persona: p, topic: t, orientation: o } );
  }
  v.n = 0;
  function d( p, t, a ){ 
    d[ d.n++ ] = c( "Delegation", { persona: p, tags: t, agent: a } );
  }
  d.n = 0;
  function r( t, a, d, p, b, n, dir ){
    c( "Result",
      { topic: t, agree: a, disagree: d, protest: p, blank: b, neutral: n, direct: dir
    } );
  }
  function mark(){ mark.id = Ephemeral.get_next_id(); }
  function collect( n ){
    collect.list = [];
    for( var ii = mark.id ; ii < Ephemeral.get_next_id() ; ii++ ){
      collect.list.push( Ephemeral.ref( ii ) );
    }
  }
  
  trace( "Bootstrap" );
  return [
    // *** Personas ***
    function(){ p( "@jhr" ); },
    function(){ p( "@N_Hulot" ); },
    function(){ g( "Hulot's fans"); },
    function(){ p( "@john"); },
    function(){ p( "@luke"); },
    function(){ p( "@marc"); },
    function(){ p( "@peter"); },
    // *** Tags ***
    function(){ tag( "#President" ); },
    // *** Propositions ***
    //function(){ mark(); },
    function(){ t( "Hollande president",  [ t["#President"] ] ); },
    function(){ t( "Marine presidente",   [ t["#President"] ] ); },
    function(){ t( "Sarkozy president",   [ t["#President"] ] ); },
    function(){ t( "Valls president",     [ t["#President"] ] ); },
    function(){ t( "Melenchon president", [ t["#President"] ] ); },
    function(){ t( "Hulot president",     [ t["#President"] ] ); },
    //function(){ collect(); },
    // Delegations
    function(){ d( p["@jhr"], [t.President], p["@N_Hulot"] ); },
    // Votes
    function(){ v( p["@peter"],   t["Hulot president"], "agree"    ); },
    function(){ v( p["@N_Hulot"], t["Hulot president"], "agree"    ); },
    function(){ v( p["@peter"],   t["Hulot president"], "neutral"  ); },
    function(){ v( p["@N_Hulot"], t["Hulot president"], "disagree" ); },
    function(){ r( t["Hulot president"], 102, 101, 1, 12, 1000, 99 ); }
  ];
}


/* ---------------------------------------------------------------------------
 *  Dataflow processing. TBD
 *  Each fluid is fed whenever an entity is created or updated.
 *  The only valid action is to inject a change in the machine:
 *    ephemeral.push( "type", {...named paramers...} ); or
 *    type.push( {...named parameters...} );
 *  That change gets logged in a persistent store and will be replayed whenever
 *  the machine is restarted.
 */
 
Persona    .fluid.inspect().log( "Log Persona"    );
Source     .fluid.inspect().log( "Log Source"     );
Topic      .fluid.inspect().log( "Log Topic"      );
Delegation .fluid.inspect().log( "Log Delegation" );
Vote       .fluid.inspect().log( "Log Vote"       );
Result     .fluid.inspect().log( "Log Result"     );
Transition .fluid.inspect().log( "Log Transition" );
Visitor    .fluid.inspect().log( "Log Visitor"    );
Action     .fluid.inspect().log( "Log Action"     );

//Ephemeral.persist( "test/vote.trace.log", Trace.fluid );


function main(){
  console.log( "Welcome to l8/test/vote.js -- Liquid demo...cracy" );
  de&&bugger();
  Ephemeral.start( bootstrap, function( err ){
    if( err ){
      console.log( "Cannot proceed", err, err.stack );
      process.exit( 1 );
      return;
    }
    // Let's provide a frontend...
    console.log( "READY!" );
    de&&bugger();
  } );
}

l8.begin.step( main ).end;
l8.countdown( 10 );

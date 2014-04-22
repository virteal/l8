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
var de = true;
var trace = l8.trace;
var bug = trace;

// de&&mand() is like assert()
function mand( b ){
  if( b )return;
  bug( "l8/test/vote.js, assert error" );
  debugger;
  throw new Error( "vote.js assert" );
}

// safe( fn ) is like fn but with exceptions traced in debug mode
var safe = function safe( f ){
  return !de ? f : function(){
    try{
      return f.apply( this, arguments );
    }catch( err ){
      trace( "Error", err, err.stack );
      throw err;
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
  
  // Debug related
  log: function( f ){ console.log( f ? f.call( this, this ) : this.toString() ); },
  toString: function(){
    return ""
    + (this === this.constructor.prototype ? "Proto" : "")
    + this.type
    + "." + this.id
    + (this.label ? "[" + this.label + "]" : "" );
  },
  
  // Register entity and detect updates about pre-existing entities
  register: function( key ){
    // Look for an existing entity with same type and same key
    var entity = this.constructor.all[ key ];
    // If found then this entity is actually an update for that existing entity
    if( entity ){
      de&&mand( !entity.is_update() );
      // Such an update does not need an UID because some Change entity made it
      de&&mand( this.id === NextId - 1 );
      de&&mand( AllEntities[ NextId - 2 ].type === "Change" );
      // "unallocate" the recently allocated id
      AllEntities[ this.id ] = _;
      this.id = 0;
      de&&mand( this.is_update() );
      NextId--;
      // Add the update to the entity's log of updates
      var updates = entity.updates();
      updates.push( this );
      entity.updates( updates );
      // Remember the target entity that this update procuces an effect on
      this.target = entity;
      return entity;
    }
    // Genuine new entity, key first seen
    this.constructor.all[ key ] = this;
    return this;
  },
  
  is_update: function(){ return !this.id; },
  
  // Changes to entities involves watering the original with an update
  water: function( other ){ return other === this ? water : idem; }
  
} );

Entity.prototype.constructor = Entity;
Entity.type = function( ctor ){ return type( ctor, this ); }

var null_object = new Entity( { machine: MainMachine } );

function inspect( v, level ){
  if( arguments.length < 2 ){ level = 1; }
  if( level < 0 )return "...";
  var buf = "";
  if( typeof v === "undefined" )return "_";
  if( !v )return buf + v;
  if( typeof v === "function" || typeof v === "object" ){
    if( typeof v === "function" ){
      // Water, get their current value
      if( v._water ){
        buf += "|" + inspect( v._water.current, level && level - 1 ) + "|";
        return buf;
      }else if( v.rid ){
        if( v.entity ){
          buf += "&" + inspect( v.entity, level && level - 1 );
        }else{
          buf += "&" + v.rid;
        }
      }else{
        if( v.name ){
          buf += v.name + "()";
        }else{
          buf += "F()";
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
        return "[" + abuf.joind( ", " ) + "]";
      }
    }else{
      if( level <= 1 ){
        if( v.is_entity ){
          buf += v.toString(); 
        }else{
          if( level === 0 )return "{...}";
        }
      }
    }
    if( level <= 0 )return buf;
    var lbuf = [];
    for( var attr in v ){
      if( attr !== "id" && v.hasOwnProperty( attr ) ){
        lbuf.push( "" + attr + ": " + inspect( v[ attr ], level && level - 1 ) );
      }
    }
    if( !lbuf.length )return buf;
    return buf + "{" + lbuf.join( ", " ) + "}";
  }else if( typeof v === "string" ){
    return buf + '"' + v + '"';
  }else if( v === ONE_YEAR ){
    return "a year";
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
  console.log( "RootTopic:", value( RootTopic, true ) );
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
      efluid.push( obj );
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
      debugger;
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
  de&&mand( Machine.current = this.machine );
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
  this.to   = _;
}

/*
 *  Effect entity
 *
 *  Changes produce effects.
 */

Entity.type( Effect );
function Effect( options ){
  var change = AllEntities[ this.id - 1 ];
  // If the effect is due to a change (hopefully), link change to effect
  if( change.type === "Change" ){
    change.to = this;
    // Also remember this change as the "first" update, ie the "create" update
    this.updates = water( [change] );
  }else{
    trace( "Effect without a change" );
    this.updates = emptiness;
  }
  // Some effects are about a pre existing entity, ie they are updates
  this.target = _;
}


/*
 *  Version entity
 *
 *  Persisted entity are stored in "log" files. Whenever a new version of this
 *  software is created, with changes in the data schema, a new version entity
 *  is created.
 *  During restore (from log) global Change.versioning progress until it
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

Entity.type( Ephemeral );
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
 
Ephemeral.type( Trace );
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
      Change.create({ t: "Version", o: "create", p: { label: Change.version } }); 
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
      Change.create({ t: "Version", o: "create", p: { label: Change.version } } ); 
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
  // trace( "Change.process, invoke", this.o, "on " + target );
  if( this.p && !this.p.id && this.id ){
    this.p.id = this.id;
  }
  return target[ this.o ].call( target, this.p );
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
        bootstrap().boxon( function( err ){
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
Ephemeral.get_next_id = function(){ return NextId; }
Ephemeral.ref = ref;

// Debug related
Ephemeral.trace   = trace;
Ephemeral.assert  = mand;
Ephemeral.inspect = inspect;

return app;

} // end of function ephemeral()

// exports = ephemeral;



/* ========================================================================= */
/* ========================= Application specific code ===================== */
/* ========================================================================= */


var vote = { store: "vote.json.log" }; // ToDo: "file://vote.json.log"
// require( "ephemeral.js" )( vote ).into( global );
ephemeral( vote ).into( global ); // global is module local actually

// My de&&bug() and de&&mand() darlings
var de = true;
var bug   = vote.Ephemeral.trace;
var mand  = vote.Ephemeral.assert;
var trace = vote.Ephemeral.trace;


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
 *    their source is typically a tweet.
 *  Tag topics classify topic/sub-topic relatiohships. 
 *    they don't have a source.
 */
 
Ephemeral.type( Topic );
function Topic( options ){
  
  de&&mand( options.label );
  
  var topic = this.register( options.label );
  var water = this.water( topic );
  
  this.label       = options.label;
  this.parent      = water();
  if( !options.source ){
    // Tag topic
    this.children = water( options.children );
  }else{
    // Atomic topic
    this.source = water( options.source );
    this.result = this.id ? Result.create({ topic: this }) : options.result;
  }
  this.delegations = water( [] );
  
  if( this.is_update() )return this.update( topic );
  
  this.update_parent( options.parent || RootTopic );

}

Topic.prototype.update = function( other ){
  if( other.parent      ){ this.update_parent(   other.parent ); }
  if( other.children    ){ this.update_children( other.children ); }
  this.source( other.source );
  this.result( other.result );
  if( other.result      ){ this.update_result(      other.result );      }
  if( other.delegations ){ this.update_delegations( other.delegations ); }
};

Topic.prototype.is_atomic   = function(){ return this.source; };
Topic.prototype.is_tag      = function(){ return !this.is_atomic(); };
Topic.prototype.add_vote    = function( o, v ){ this.result.add_vote(    o, v ); };
Topic.prototype.remove_vote = function( o, v ){ this.result.remove_vote( o, v ); };

// A topic includes another one if it is an ancestor of it
Topic.prototype.includes = function( other_topic ){
  if( this.is_atomic() )return false;
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
  de&&mand( this.topic.is_atomic() );
  
  // Decide: is it a new entity or an update?
  var vote  = Vote.register( this.persona.id + "." + this.topic.id );
  var water = this.water( vote ); 
  
  this.analyst     = options.analyst;
  this.source      = options.source;
  this.delegation  = water( options.delegation  || Vote.direct  );
  this.privacy     = water( options.privacy     || Vote.private );
  this.previously  = water( options.previously  || Vote.neutral );
  
  if( this.is_update() )return vote.update( this );
  
  var that = this;
  this.orientation = water( water, po, [] );
  if( options.orientation ){
    this.orientation( options.orientation );
  }
  function po( o ){
    try{
      var prev = water.current.current || Vote.neutral;
      if( o === prev )return;
      // Orientation changed
      that.remove( prev );
      that.add( o );
      return o;
    }catch( err ){
      trace( "Could not process vote", err, err.stack );
      console.trace( err );
      debugger;
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
  de&&mand( this.topic.is_atomic() );
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
      trace( "Remove vote from topic" ); debugger;
      that.topic.remove_vote();
    }
  );
};


Ephemeral.type( Result );
function Result( options ){
  
  de&&mand( options.topic );
  this.topic     = options.topic || Topic.prototype;
  this.label = this.topic.label;
  this.neutral   = water( options.neutral   || 0 );
  this.blank     = water( options.blank     || 0 );
  this.protest   = water( options.protest   || 0 );
  this.agree     = water( options.agree     || 0 );
  this.disagree  = water( options.disagree  || 0 );
  this.direct    = water( options.direct    || 0 );
  
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
    if( this.topic.id === 10017 )debugger;
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
  this.persona = options.persona;
  this.topic   = options.topic;
  this.votes   = water( [] );
}


/*
 *  Membership entity.
 *
 *  They make personas members of group personas.
 */

Ephemeral.type( Membership );
function Membership( options ){
  this.member = options.member;
  this.group  = options.leader;
}


// Default parent topic for new topics
var RootTopic = Topic.create({ label: "Root" });


/*
 *  For WEB UI
 */
 
Ephemeral.type( Visitor );
function Visitor( options ){
  this.persona     = options.persona;
  this.twitter     = options.twitter; // Twitter credentials
  this.actions     = fluid();
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
  function t( n, l ){ t[n] = c( "Topic", { label: n, source: "bootstrap" } ); }
  function tag( n, l ){ t[n] = c( "Topic", { label: n, children: l } ); }
  function v( p, t, o ){
    v[ v.n++ ] = c( "Vote", { persona: p, topic: t, orientation: o } );
  }
  v.n = 0;
  function d( p, t, a ){ 
    d[ d.n++ ] = c( "Delegation", { persona: p, topic: t, agent: a } );
  }
  d.n = 0;
  function mark(){ mark.id = Ephemeral.get_next_id(); }
  function collect( n ){
    collect.list = [];
    for( var ii = mark.id ; ii < Ephemeral.get_next_id() ; ii++ ){
      collect.list.push( Ephemeral.ref( ii ) );
    }
  }
  
  trace( "Bootstrap" );
  var steps = [
    // *** Personas ***
    function(){ p( "@jhr" ); },
    function(){ p( "@N_Hulot" ); },
    function(){ g( "Hulot's fans"); },
    function(){ p( "@john"); },
    function(){ p( "@luke"); },
    function(){ p( "@marc"); },
    function(){ p( "@peter"); },
    // *** Topics ***
    function(){ mark(); },
      function(){ t( "Hollande president" ); },
      function(){ t( "Marine presidente" ); },
      function(){ t( "Sarkozy president" ); },
      function(){ t( "Valls president" ); },
      function(){ t( "Melenchon president" ); },
      function(){ t( "Hulot president" ); },
    function(){ collect(); },
    function(){ tag( "President", collect.list ); },
    // Delegations
    function(){ d( p["@jhr"], t["President"], p["@N_Hulot"] ); },
    // Votes
    function(){ v( p["@peter"],   t["Hulot president"], "agree"   ); },
    function(){ v( p["@N_Hulot"], t["Hulot president"], "agree"   ); },
    function(){ v( p["@peter"],   t["Hulot president"], "neutral" ); },
  ];
  // Execute steps (sequentially) and return boxon fired when all done
  return water.steps( steps );
}


/*
 *  Dataflow processing. TBD
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
  debugger;
  Ephemeral.start( bootstrap, function( err ){
    if( err ){
      console.log( "Cannot proceed", err, err.stack );
      process.exit( 1 );
      return;
    }
    // Let's provide a frontend...
    console.log( "READY!" );
    debugger;
  } );
}

l8.begin.step( main ).end;
l8.countdown( 10 );

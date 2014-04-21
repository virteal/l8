// test/vote.js
//  sample test application: reactive liquid democracy
//
// "When liquid democracy meets Twitter..."
//
// april 2014 by @jhr

"use strict";

/*
 *  First, let's create an "ephemeral" reactive flow app framework.
 *  Application specific code comes next.
 */
 
var app = {};
 
var l8    = app.l8    = require( "l8/lib/l8.js"    );
var boxon = app.boxon = require( "l8/lib/boxon.js" );
var water = app.water = require( "l8/lib/water.js" );
var fluid = app.fluid = water.fluid;

var trace = app.trace = l8.trace;
var de = true;
var bug = trace;
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

var noop = function(){};

var no_opts = { version: 1, machine: MainMachine };

var extend = function( to, from ){
  for( var ii in from ){ to[ ii ] = from[ ii ]; } 
  return to;
};

app.extend = extend;
app.scope  = function( obj ){ extend( obj, app ); };


/*
 *  Reactive entities management
 */

//var global = this;

var epoch = 0; // 1397247088461;
function now(){ return l8.now - epoch; }
var ONE_YEAR = 365 * 24 * 60 * 60 * 1000;

var NextUid      = 0;
var MaxSharedUid = 9999;
var AllEntities  = [];

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
 */
 
function Machine( options ){
  this.options = options;
  this.owner   = options.owner || "@jhr";
}

app.machine = Machine;

var lookup = function( uid ){
  // Sometimes the UID is actually an entity type name
  if( typeof uid === "string" )return AllEntities[ uid ];
  if( uid >= NextUid ){
    de&&bug( "Forward UID lookup", uid );
    NextUid = uid + 1;
  }
  return AllEntities[ uid ];
};

// Entities have an unique id
var alloc_uid = function( x ){
  if( x ){
    if( x >= NextUid ){
      de&&bug( "Forward UID", x );
      NextUid = x + 1;
    }
    return x;
  }
  // de&&bug( "New UID", NextUid );
  return NextUid++;
};

var MainMachine = Machine.current = Machine.main = new Machine({});

/*
 *  Base class for all entities
 *
 *  Entities have a version attribute and a UID.
 *  There is a global table of all entities: AllEntities.
 *  Ephemeral entities will "expire", sometimes prematurely.
 */

function Entity( options ){
  // this.machine = options.machine || Machine.current;
  this.v = options.version || no_opts.version;
  if( options.uid ){
    this.uid = alloc_uid( options.uid );
  }else{
    this.uid = alloc_uid();
  }
  // Track all instances, some of them will expire
  AllEntities[ this.uid ] = this;
}

app.Entity = Entity;

extend( Entity.prototype, {
  is_entity: true,
  type: "Entity",
  create: function( options ){ return new Entity( options ); },
  is_proto: function(){
    return this === this.constructor.prototype;
  },
  expired: function(){ return false; },
  log: function( f ){ console.log( f ? f.call( this, this ) : this.toString() ); },
  toString: function(){
    return ""
    + (this.is_proto() ? "Proto" : "")
    + this.type
    + "." + this.uid
    + (this.label ? "[" + this.label + "]" : "" );
  }
} );
Entity.prototype.constructor = Entity;

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
      }else if( v.ruid ){
        if( v.entity ){
          buf += "&" + inspect( v.entity, level && level - 1 );
        }else{
          buf += "&" + v.ruid;
        }
      }else{
        if( v.name ){
          buf += v.name + "()";
        }else{
          buf += "F()";
        }
      }
    }else if( v.water ){
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
      if( attr !== "uid" && v.hasOwnProperty( attr ) ){
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

app.inspect = inspect;

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
  if( ii <= MaxSharedUid ){
    while( item = list[ ii++ ] ){
      dump_entity( item, level );
    }
    ii = MaxSharedUid + 1;
  }
  while( item = list[ ii++ ] || ii < NextUid ){
    item && dump_entity( item, level );
  }
  console.log( "RootTopic:", value( RootTopic, true ) );
  console.log( "--- END DUMP ---" );
}

// Prototypal style inheritance with typed entities
var Subtype = function( ctor, base ){
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
  ctor.uid = proto_entity.uid;
  app[ name ] = ctor;
  trace( "Create entity " + inspect( proto_entity ) );
  de&&mand( proto_entity.is_proto() );
  de&&mand( proto_entity.is_entity );
  de&&mand( proto_entity.uid );
  de&&mand( proto_entity.v );
  de&&mand( proto_entity.super === proto );
  de&&mand( proto_entity.constructor === ctor );
  de&&mand( proto_entity.constructor.prototype === proto_entity );
  return proto_entity;
};

// Ember style computed property.
// Usage, in constructors only:
//  this.attr = function(){ this.other_attr() * 10 }.when( this.other_attr );
Function.prototype.when = function(){
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
 *  Entities sometimes reference each others using uids, when stored typically
 */

function ref(){
  var f = function(){
    // Set
    if( arguments.length ){
      var entity = arguments[0];
      // r( some_entity )
      if( typeof entity === "object" ){
        f.entity = entity;
        f.ruid   = entity.uid;
      // r( some_id )
      }else{
        f.entity = null;
        f.ruid   = entity || 0;
      }
      return f;
    }
    // Get
    if( f.entity )return f.entity;
    return f.entity = AllEntities[ f.ruid ];
  };
  if( arguments.length ){
    f.apply( null, arguments );
  }else{
    f.entity = null;
    f.ruid   = 0;
  }
  return f;
}

// Resolve uid references into pointers
function deref( o, seen ){
  if( !o )return o;
  if( typeof o === "function" ){
    if( o.ruid )return o();
    return o;
  }
  if( typeof o !== "object" )return o;
  if( !seen ){
    seen = {};
  }else{
    if( o.is_entity ){
      if( seen[ o.uid ] )return o;
      seen[ o.uid ] = true;
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
 *  if o.attr points to an entity, it is replaced by an o.$attr with an uid.
 *  In arrays, pointers are replaced by { $: uid } values.
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

// Change pointers into uid references for json storage
function json_encode( o ){
  if( typeof o !== "object" )return o;
  var json;
  if( Array.isArray( o ) ){
    json = [];
    o.forEach( function( v, ii ){
      if( v ){
        if( v.uid ){
          json[ ii ] = { $: v.uid };
        }else if( v.ruid ){
          json[ ii ] = { $: v.ruid };
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
          json[ rattr_encode( attr ) ] = o[ attr ].uid;
        }else if( o[ attr ].ruid ){
          json[ rattr_encode( attr ) ] = o[ attr ].ruid;
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

function json_decode_resolve( uid ){
  alloc_uid( uid );
  var entity = lookup( uid );
  return entity || ref( uid );
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
      return x.uid;
    }else if( typeof x === "function" ){
      if( x._water ){
        return value( x._water.current );
      }
    }else if( typeof x === "object" ){
      if( x.water ){
        return { water: "water", error: value( x.water.error ) };
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
 */

Subtype( Change, Entity );
function Change( options ){
  this.ts  = options.timestamp || now();
  this.t   = options.t;
  this.o   = options.o || "change";
  this.p   = options.p || {};
  this.src = options.src;
}


/*
 *  The rest is ephemeral. It will expire and be buried.
 *
 *  Lifecycle: create(), [renew()], expiration(), [resurect() + renew()]... 
 */

Subtype( Ephemeral, Entity );
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

app.Subtype = Subtype;

Ephemeral.prototype.expired = function(){
  if( this.buried )return true;
  return now() > this.expire();
};

Ephemeral.prototype.bury = function(){
  if( this.buried )return;
  if( this.is_proto() ){
    trace( "Don't bury prototypes!" );
    debugger;
    throw( "BROKEN" );
  }
  this.buried = true;
  this.expiration();
  // Clear object if not resurected, this enables some garbadge collection
  if( this.buried ){
    for( var attr in this ){
      if( attr !== "is_entity" && "attr" !== "buried" ){
        var v = this[ attr ];
        if( v ){
          if( v._water ){ water.dispose( v ); }
        }
        this[ attr ] = undefined;
      }
    }
    // Also remove from list of all entities to prevent new references to it
    AllEntities[ this.uid ] = null;
  }
};

Ephemeral.prototype.expiration = function(){
  // Default is to create an expiration entity but subtype can do differently
  Expiration.create( { entity: this } );
};

Ephemeral.prototype.resurect = function(){
// To be called from a redefined .expiration(), needs a renew().
  if( !this.buried )throw new Error( "Resurect Entity" );
  this.buried = false;
  // Resurection.create( { entity: this ); } );
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

Subtype( Event, Entity );
function Event(){}


/*
 *  Expiration entity
 *  This is the event that occurs when an entity expires
 */
 
 Subtype( Expiration, Event );
 function Expiration( options ){
   this.entity = options.entity;
 }


/*
 *  Trace entity
 *
 *  This is for deployed systems
 */
 
Subtype( Trace );
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
      de&&bug( "Write", fn, "uid:", item.uid );
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
      // Track max uid so far, needed at restore time
      // value.luid = NextUid - 1;
      json = JSON.stringify( value );
      fs.appendFileSync( fn, json + "\r\n" );
    }catch( err ){
      trace( "Could not write to", fn, "uid:", item.uid, "err:", err );
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
    var idx = content.lastIndexOf( '"uid":' );
    if( idx !== -1 ){
      content = content.substring( idx + '"uid":'.length );
      content = parseInt( content, 10 );
      trace( "Restore, max uid:", content );
      alloc_uid( content );
    }
  }catch( err ){
    // File does not exist, nothing to restore
    restored = true;
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

app.persist = persist;

Change.prototype.process = function(){
  var target = lookup( this.t );
  // trace( "Change.process, invoke", this.o, "on " + target );
  if( this.p && !this.p.uid && this.uid ){
    this.p.uid = this.uid;
  }
  return target[ this.o ].call( target, this.p );
};


// Exports

app.start = function( bootstrap, cb ){
  // uid 0...9999 are reserved for meta objects
  NextUid = MaxSharedUid + 1;
  start( bootstrap, cb );
};


/*
 *  Dataflow processing. TBD
 */
 
fluid.method( "inspect", function(){
  return fluid.it.map( function( it ){ return inspect( it ); } );
} );

app.Expiration = Expiration;
de&&Expiration.fluid.inspect().log( "Log Expiration" );
app.Trace      = Trace;

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
    "ephemeral.json",
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
      var b = water.boxon();
      bootstrap().boxon( function( err ){
        trace( "Bootstrap READY" );
        ready();
      });
    }
    ready( function( err ){
      de&&dump_entities();
      if( err ){
        CRITICAL( "Cannot proceed, corrupted" );
        cb( new Error( "Corrupted store" ) );
      }else{
        INFO( "READY" );
        cb();
      }
    });
  });
}


/* ========================= Application specific code ===================== */

// require( "ephemeral.js" ).scope( global );

/*
 *  Persona entity
 *
 *  Individuals and groups.
 */

Subtype( Persona, Ephemeral );
function Persona( options ){
  this.label       = options.label;
  this.role        = options.role || "individual";
  this.friends     = water( [] ); // Individual's friends or group's members
  this.memberships = water( [] ); // To groups
  this.delegations = water( [] ); // To personas, about topics
  this.votes       = water( [] ); // Direct votes
}

// Persona roles
Persona.individual = "individual";
Persona.group      = "group";

Persona.prototype.is_group      = function(){ return this.role === "group"; };
Persona.prototype.is_individual = function(){ return !this.is_group();      };


/*
 *  Source entity
 *
 *  - Describes the "reference material" that explain why a topic was created
 *  - or why a vote was assigned to some persona when that vote does not come
 *    from the persona herself. Note: a twitter persona can override such
 *    votes, as she is the most legitimate source.
 */

Subtype( Source, Ephemeral );
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
 
Subtype( Topic, Ephemeral );
function Topic( options ){
  this.label       = options.label;
  this.parent      = water();
  if( !options.source ){
    // Tag topic
    this.children = water( options.children || [] );
  }else{
    // Atomic topic
    this.source = water( options.source );
    this.result = Result.create({ topic: this });
  }
  this.delegations = water( [] );
  this.change_parent( options.parent || RootTopic );
}

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

Topic.prototype.change_parent = function( topic ){
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
 
Subtype( Vote, Ephemeral );
function Vote( options ){
  
  de&&mand( options.persona );
  de&&mand( options.topic );
  this.persona     = options.persona;
  this.topic       = options.topic;
  de&&mand( this.topic.is_atomic() );
  this.analyst     = options.analyst;
  this.source      = options.source;
  this.delegation  = water( options.delegation  || Vote.direct  );
  this.privacy     = water( options.privacy     || Vote.private );
  this.previously  = water( options.previously  || Vote.neutral );
  
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
    this.resurect();
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


Subtype( Result, Ephemeral );
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
    if( this.topic.uid === 10017 )debugger;
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
 
Subtype( Transition, Event );
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

Subtype( Delegation, Ephemeral );
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

Subtype( Membership, Ephemeral );
function Membership( options ){
  this.member = options.member;
  this.group  = options.leader;
}


// Default parent topic for new topics
var RootTopic = Topic.create({ label: "Root" });


/*
 *  For WEB UI
 */
 
Subtype( Visitor, Ephemeral );
function Visitor( options ){
  this.persona     = options.persona;
  this.twitter     = options.twitter; // Twitter credentials
  this.actions     = fluid();
}


Subtype( Action, Ephemeral );
function Action( options ){
  this.visitor     = options.visitor;
  this.verb        = options.verb;
  this.parameters  = options.parameters;
}


function bootstrap(){
  
  function c( t, p ){
    return ref( Change.create({ t: t, o: "create", p: p }).uid );
  }
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
  function mark(){ mark.uid = NextUid; }
  function collect( n ){
    collect.list = [];
    for( var ii = mark.uid ; ii < NextUid ; ii++ ){
      collect.list.push( ref( ii ) );
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
    function(){ v( p["@peter"],   t["Hulot president"], "agree" ); },
    function(){ v( p["@N_Hulot"], t["Hulot president"], "agree" ); },
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

app.persist( "test/vote.log.json", Trace.fluid );


function main(){
  console.log( "Welcome to l8/test/vote.js -- Liquid demo...cracy" );
  debugger;
  app.start( bootstrap, function( err ){
    if( err ){
      console.log( "Cannot proceed", err );
      process.exit( 1 );
      return;
    }
    // Let's provide a frontend...
    console.log( "READY!" );
    debugger;
  } );
}

l8.begin.step( main ).end;
l8.countdown( 200 );

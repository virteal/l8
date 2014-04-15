// test/vote.js
//  sample test application: reactive liquid democracy
//
// april 2014 by @jhr

"use strict";

var l8    = require( "l8/lib/l8.js"    );
var boxon = require( "l8/lib/boxon.js" );
var water = require( "l8/lib/water.js" );
var fluid = water.fluid;

var trace = l8.trace;
var de = true;
var bug = trace;
function mand( b ){
  if( b )return;
  bug( "l8/test/vote.js, assert error" );
  debugger;
  throw new Error( "vote.js assert" );
}

function safe( f ){
  return function(){
    try{
      return f.apply( this, arguments );
    }catch( err ){
      trace( "Error", err, err.stack );
    }
  };
}


/*
 *  Reactive entities management
 */

//var global = this;

var epoch = 0; // 1397247088461;
function now(){ return l8.now - epoch; }
var ONE_YEAR = 365 * 24 * 60 * 60 * 1000;

// Entities have an unique id
var NextUid = 1;
function uid( x ){
  if( x ){
    if( x >= NextUid ){
      de&&bug( "Forward UID", x );
      NextUid = x + 1;
    }
    return x;
  }
  // de&&bug( "New UID", NextUid );
  return NextUid++;
}

// All entities are stored in a big array
var AllEntities = [];

function lookup( uid ){
  if( uid >= NextUid ){
    de&&bug( "Forward UID lookup", uid );
    NextUid = uid + 1;
  }
  return AllEntities[ uid ] || null_object;
}

// Misc. util

var noop = function(){};

var no_opts = { version: 1 };

var extend = function( to, from ){
  for( var ii in from ){ to[ ii ] = from[ ii ]; } 
  return to;
};

/*
 *  Base class for all entities
 *
 *  Entities have a version attribute and a UID.
 *  There is a global list of all entities: AllEntities.
 *  Ephemeral entities will "expire", sometimes prematurely.
 */

function Entity( options ){
  this.v = options.version || no_opts.version;
}

extend( Entity.prototype, {
  is_entity: true,
  type: "Entity",
  create: function( options ){ return new Entity( options ); },
  is_proto: function(){
    if( !this.constructor )debugger;
    return this === this.constructor.prototype;
  },
  expired: function(){ return false; },
  log: function(){ console.log( this.toString() ); },
  toString: function(){
    return ""
    + (this.is_proto() ? "Proto" : "")
    + this.type
    + "." + this.uid
    + (this.label ? "[" + this.label + "]" : "" );
  }
} );
Entity.prototype.constructor = Entity;

var null_object = new Entity( no_opts );
null_object.uid = 0;
AllEntities[ 0 ] = null_object;

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
          if( level === 0 )return "{}";
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
  if( ii < 1000 ){
    while( item = list[ ii++ ] ){
      dump_entity( item, level );
    }
    ii = 1000;
  }
  while( item = list[ ii++ ] ){
    dump_entity( item, level );
  }
  console.log( "--- END DUMP ---" );
}

// Prototypal style inheritance with typed entities
var Subtype = function( ctor, base ){
  if( !base ){ base = Entity; }
  var proto = base.prototype;
  var name = ctor.name;
  var sub = ctor.prototype = extend( {}, proto );
  sub.type = name;
  sub.constructor = ctor;
  ctor.super = base;
  sub.super  = proto;
  // Build the instance creation function
  var efluid = ctor.fluid = fluid();
  ctor.create = sub.create = function( options ){
    if( !options ){ options = {}; }
    var obj = Entity.created = Object.create( sub );
    if( options.uid ){
      obj.uid = uid( options.uid );
    }else{
      obj.uid = uid();
    }
    // Track all instances, some of them will expire
    AllEntities[ obj.uid ] = obj;
    base.call( obj, options );
    ctor.call( obj, options );
    //de&&bug( "New entity", "" + inspect( obj, 2 ) );
    if( proto_entity ){
      efluid.push( obj );
    }
    return obj;
  };
  // Create the prototypal instance. It will will create new instances
  Entity.proto_stage = true;
  var proto_entity = ctor.create();
  Entity.proto_stage = false;
  ctor.prototype = sub = AllEntities[ name ] = proto_entity;
  ctor.uid = proto_entity.uid;
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
 *  Entities sometimes reference each other using uids, when stored typically
 */

function ref(){
  var f = function(){
    if( arguments.length ){
      var entity = arguments[0];
      if( typeof entity === "object" ){
        f.entity = entity;
        f.ruid   = uid( entity.uid );
      }else{
        f.entity = null;
        f.ruid   = entity || 0;
      }
      return f;
    }
    if( f.entity )return f.entity;
    return f.entity = AllEntities[ f.ruid ];
  };
  if( arguments.length ){
    f.apply( null, arguments );
  }else{
    f.entity = null;
    f.ruid    = 0;
  }
  return f;
}

// Resolve uid references into pointers
function deref( o ){
  if( typeof o === "function" ){
    if( o.ruid )return o();
    return o;
  }
  if( typeof o !== "object" )return o;
  for( var attr in o ){
    if( o.hasOwnProperty( attr ) ){
      o[ attr ] = deref( o[ attr ] );
    }
  }
  return o;
}

/*
 *  json encoding of entity requires changing pointers into references.
 *  if o.attr points to an entity it is replaced by an o.$attr with an uid.
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

function json_decode( o ){
  if( typeof o !== "object" )return o;
  var decoded;
  if( Array.isArray( o ) ){
    decoded = [];
    o.forEach( function( v, ii ){
      if( v && v.$ ){
        if( AllEntities[ uid( v.$ ) ] ){
          decoded[ ii ] = AllEntities[ v.$ ];
        }else{
          decoded[ ii ] = ref( v.$ );
        }
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
        var ruid = uid( o[ attr ] );
        var entity = AllEntities[ ruid ];
        // If entity already exists, point to it
        if( entity ){
          decoded[ rattr_decode( attr ) ] = AllEntities[ ruid ];
        // If entity does not exists in memory yet, use a ref(), see deref()
        }else{
          decoded[ rattr_decode( attr ) ] = ref( ruid );
        }
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
        for( var attr in x ){
          r = value( x[ attr ] );
          if( typeof r !== "undefined"
          && [ "type", "v", "super", "is_entity", "buried" ].indexOf( attr ) === -1
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

Entity.prototype.value = function(){ return value( this, true ); };


/*
 *  The only constant is change - Heraclitus
 */

Subtype( Change );
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

Subtype( Ephemeral );
function Ephemeral( options ){
  this.timestamp  = options.timestamp || now();
  this.duration   = water( options.duration || ONE_YEAR );
  this.buried     = false;
  this.expire     = Entity.proto_stage ? null : function(){
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
  if( this.is_proto() ){
    trace( "Don't bury prototypes!" );
    debugger;
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
};

Ephemeral.prototype.touch = function(){
  var delay = this.expire() - now();
  // If touched after mid life, extend duration to twice the current age
  if( delay < this.age() / 2 ){
    this.renew( this.age() * 2 );
  }
};


/*
 *  Base type of event entities
 */

Subtype( Event );
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
  this.votes       = water( [] );
}

// Persona roles
Persona.individual = "individual";
Persona.group      = "group";


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
 *  Tag topics classify topic/sub-topic relatiohships. 
 */
 
Subtype( Topic, Ephemeral );
function Topic( options ){
  this.label       = options.label;
  this.parent      = water( options.parent );
  this.source      = water( options.source );
  this.children    = water( options.children || [] );
  this.delegations = water( [] );
  this.result      = Entity.proto_stage ? null : Result.create({ topic: this });
}

Topic.prototype.add_vote    = function( o, v ){ this.result.add_vote(    o, v ); };
Topic.prototype.remove_vote = function( o, v ){ this.result.remove_vote( o, v ); };


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
  
  de&&mand( options.person );
  de&&mand( options.topic  );
  this.persona     = options.persona;
  this.topic       = options.topic;
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
      var p = water.current.current || Vote.neutral;
      if( o === p )return;
      // Orientation changed
      that.remove( p );
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
  var that = this;
  water.effect(
    function(){
      trace( "Add vote to topic" ); debugger;
      that.topic.add_vote( o, that );
    }
  );
};

Vote.prototype.remove = function( o ){
  this.previously( o );
  if( o === Vote.neutral )return;
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
  
  de&&mand( options.topic || Entity.proto_stage );
  this.topic     = options.topic || Topic.prototype;
  this.neutral   = water( options.neutral   || 0 );
  this.blank     = water( options.blank     || 0 );
  this.protest   = water( options.protest   || 0 );
  this.agree     = water( options.agree     || 0 );
  this.disagree  = water( options.disagree  || 0 );
  this.direct    = water( options.direct    || 0 );
  
  this.total = function(){
    return this.neutral()
    + this.blank()
    + this.protest()
    + this.agree()
    + this.disagree();
  }.when( this.neutral, this.blank, this.protest, this.agree, this.disagree );
  
  this.against = function(){
    return this.disagree() + this.protest();
  }.when( this.disagree, this.protest );
  
  this.win = function(){
    return this.agree() > this.against();
  }.when( this.agree, this.against );
  
  this.orientation = Entity.proto_stage ? null : function(){
    var old = water.current.current || Vote.neutral;
    trace( "Compute orientation", value( this, true ) );
    if( value( this, true).agree === 1 )debugger;
    var now;
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
    //trace( "Orientation", now, old );
    if( now !== old ){
      Transition.create({ result: this, orientation: now, previously: old });
      return now;
    }
  }.when( this.agree, this.disagree, this.blank, this.protest );
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
  de&&mand( options.result      || Entity.proto_stage );
  de&&mand( options.orientation || Entity.proto_stage );
  de&&mand( options.previously  || Entity.proto_stage );
  this.result      = options.result      || Result.prototype;;
  this.orientation = options.orientation || Vote.neutral;
  this.previously  = options.previously  || Vote.neutral;
}


/*
 *  Delegation entity.
 *
 *  It describes how a persona's vote on topic is delegated to another persona.
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


/*
 *  Trace entity
 *
 *  This is for deployed systems
 */
 
Subtype( Trace, Ephemeral );
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


/*
 *  Persistent changes processor
 */

function persist( fn, a_fluid, filter ){
  var tmp = boxon(); tmp( "forced bootstrap" ); return tmp;
  var restored;
  // At some point changes will have to be stored
  a_fluid.tap( function( item ){
    if( !restored )return;
    if( filter && !filter( item ) )return;
    de&&bug( "Write", fn, "uid:", item.uid );
    // ToDo: let entity decide about is own storage format
    var json;
    if( 0 ){
      if( item.toJson ){
        json = item.toJson();
      }else{
        Entity.toJson.call( item );
      }
    }else{
      json = JSON.stringify( json_encode( deref( item ) ) );
    }
    fs.appendFileSync( fn, json + "\r\n" );
  });
  // Return a boxon, fulfilled when restore is done
  var next = boxon();
  // Convert Nodejs stream into l8 fluid
  var flow = fluid();
  var error;
  flow // .log( "Restore" )
  .map( json_decode )
  .failure( function( err ){
    // ToDo: only ENOENT is valid, other errors should terminate program
    error = err;
    flow.close();
  })
  .final( function(){
    trace( "End of restore" );
    // restore done. what is now pushed to "changes" gets logged
    restored = true;
    next( error );
  })
  .to( a_fluid );
  // Use a Nodejs stream to read from previous changes from json text file
  var fs = require( "fs" );
  var split = require( "split" );
  var input = fs.createReadStream( fn );
  input
  .on( "error", function( err    ){
    trace( "Error about test/vote.json", err );
    flow.fail( err );
    flow.close();
  })
  .pipe( split( JSON.parse ) )
  // ToDo: use "readable" + read() to avoid filling all data in memory
  .on( "data",  function( change ){ flow.push( change ); } )
  .on( "error", function( err ){
    trace( "Restore, stream split error", err );
    // ToDo: only "unexpected end of input" is a valid error
    // flow.fail( err );
  })
  .on( "end", function(){
    trace( "EOF reached", fn );
    flow.close();
  });
  return next;
}

Change.prototype.process = function(){
  var target = lookup( this.t );
  // trace( "Change.process, invoke", this.o, "on " + target );
  if( this.p && !this.p.uid && this.uid ){
    this.p.uid = this.uid;
  }
  return target[ this.o ].call( target, this.p );
};


// Bootstrap

function bootstrap(){
  
  function c( t, p ){
    return ref( Change.create({ t: t, o: "create", p: p }).uid );
  }
  function p( n ){ p[n] = c( "Persona", { label: n } ); }
  function g( n ){ p[n] = c( "Persona", { label: n, role: "group" } ); }
  function t( n, l ){ t[n] = c( "Topic", { label: n, children: l } ); }
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
  // uid 0...9 are reserved for meta objects
  uid( 999 );
  // *** Personas ***
  p( "@jhr" );
  p( "@N_Hulot" );
  g( "Hulot's fans");
  p( "@john");
  p( "@luke");
  p( "@marc");
  p( "@peter");
  // *** Topics ***
  mark();
    t( "Hollande president" );
    t( "Marine presidente" );
    t( "Sarkozy president" );
    t( "Valls president" );
    t( "Melenchon president" );
    t( "Hulot president" );
  collect();
  t( "President", collect.list );
  // Delegations
  d( p["@jhr"], t["President"], p["@N_Hulot"] );
  // Votes
  v( p["@peter"],   t["Hulot president"], "agree" );
  v( p["@N_Hulot"], t["Hulot president"], "agree" );
}


function main(){
  trace( "Welcome to l8/test/vote.js -- Liquid demo...cracy" );
  de&&dump_entities();
  // There is a "change processor"
  Change.fluid
  .map( function( change ){
    return Change.prototype.process.call( deref( change ) ); }
  ).failure( function( err ){ trace( "Change process error", err ); } )
  .inspect().log();
  // It replays old changes and log new ones
  persist(
    "test/vote.json",
    Change.fluid,
    function( item ){ return item.type !== "Trace"; }
  ).boxon( function( err ){
    var ready = boxon();
    if( !err ){
      trace( "Restored from vote.json" );
      ready();
    }else{
      trace( "Restore error", err );
      // ToDo: handle error, only ENOENT is ok, ie file does not exist
      trace( "Bootstrapping" );
      water.submit( bootstrap ).boxon( function( err ){
        trace( "Bootstrap READY" );
        ready();
      });
    }
    ready( function( err ){
      if( err ){
        CRITICAL( "Cannot proceed, corrupted" );
      }else{
        INFO( "READY" );
      }
      de&&dump_entities();
    });
  });
}


/*
 *  Dataflow processing. TBD
 */
 
fluid.method( "inspect", function(){
  return fluid.it.map( function( it ){ return inspect( it ); } );
} );

Expiration .fluid.inspect().log( "Log Expiration" );
Persona    .fluid.inspect().log( "Log Persona"    );
Source     .fluid.inspect().log( "Log Source"     );
Topic      .fluid.inspect().log( "Log Topic"      );
Delegation .fluid.inspect().log( "Log Delegation" );
Vote       .fluid.inspect().log( "Log Vote"       );
Result     .fluid.inspect().log( "Log Result"     );
Transition .fluid.inspect().log( "Log Transition" );
Visitor    .fluid.inspect().log( "Log Visitor"    );
Action     .fluid.inspect().log( "Log Action"     );
Trace      .fluid.inspect().log( "Log Trace"      );
persist( "test/vote.log.json", Trace.fluid );


main();
//l8.begin.step( main ).end;
l8.countdown( 2 );

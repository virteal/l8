// test/vote.js
//  sample test application: reactive liquid democracy
//
// april 2014 by @jhr


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

/*
 *  Reactive entities management
 */

//var global = this;

var epoch = 1397247088461;
function now(){ return l8.now - epoch; }

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

var noop = function(){};

var AllEntities = [];
function lookup( uid ){
  if( uid > NextUid ){
    de&&bug( "Forward UID lookup" );
    NextUid = uid + 1;
  }
  return AllEntities[ uid ] || null_object;
}

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
    if( !this.ctor )debugger;
    return this === this.ctor.prototype;
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
Entity.prototype.ctor = Entity;

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
  }else if( v === 365 * 24 * 60 * 60 * 1000 ){
    return "a year";
  }else{
    return buf + "" + v;
  }
}

function dump_entities( from, level ){
  console.log( "--- ENTITY DUMP ---" );
  if( !level ){ level = 1; }
  var list = AllEntities;
  var ii = from || 0;
  var item;
  if( ii < 1000 ){
    while( item = list[ ii++ ] ){
      console.log( inspect( item, level ) );
    }
    ii = 1000;
  }
  while( item = list[ ii++ ] ){
    console.log( inspect( item, level ) );
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
  sub.constructor = sub.ctor = ctor;
  ctor.super = base;
  sub.super  = proto;
  // Build the instance creation function
  var efluid = ctor.fluid = fluid();
  ctor.create = sub.create = function( options ){
    if( !options ){ options = {}; }
    var obj = Object.create( sub );
    if( options.uid ){
      obj.uid = uid( options.uid );
    }else{
      obj.uid = uid();
    }
    base.call( obj, options );
    ctor.call( obj, options );
    // Track all instances
    AllEntities[ obj.uid ] = obj;
    //de&&bug( "New entity", "" + inspect( obj, 2 ) );
    if( proto_entity ){ efluid.push( obj ); }
    return obj;
  };
  // Create the prototypal instance. It will will create new instances
  var proto_entity = ctor.create();
  ctor.prototype = sub = AllEntities[ name ] = proto_entity;
  ctor.uid = proto_entity.uid;
  trace( "Create entity " + inspect( proto_entity ) );
  de&&mand( proto_entity.is_proto() );
  return proto_entity;
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
 */

Subtype( Ephemeral );
function Ephemeral( options ){
  this.timestamp  = options.timestamp || now();
  this.duration   = water( options.duration || (365 * 24 * 60 * 60 * 1000) );
  this.buried     = false;
  var that = this;
  this.expire     = water( this.duration,
    function(){
      var limit = that.timestamp + that.duration();
      if( limit > now() ){ that.bury(); }
      return limit;
    }
  );  
}

Ephemeral.prototype.expired = function(){
  var flag = this.buried || ( this.expire() > now() );
  if( flag ){ this.bury(); }
  return flag;
};

Ephemeral.prototype.bury = function(){
  if( this.buried )return;
  this.buried = true;
  Expiration.create( { entity: this } );
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
  this.url     = options.url;
  this.label   = options.label;
  this.persona = options.persona;
  this.topic   = options.topic;
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
  this.result      = water();
}


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
  this.persona     = options.persona;
  this.topic       = options.topic;
  this.orientation = water( options.orientation || Vote.neutral );
  this.previously  = water( options.previously );
  this.delegation  = water( options.delegation || "direct" );
  this.analyst     = options.analyst;
  this.source      = options.source;
  this.privacy     = water( options.privacy || "private" );
}

// Vote orientations
Vote.neutral  = "neutral";
Vote.agree    = "agree";
Vote.disagree = "disagree";
Vote.protest  = "protest";
Vote.blank    = "blank";

// Vote privacy
Vote.public  = "public";
Vote.secret  = "secret";
Vote.private = "private";


Subtype( Result, Ephemeral );
function Result( options ){
  this.topic     = options.topic;
  this.neutral   = water( options.neutral   || 0 );
  this.blank     = water( options.blank     || 0 );
  this.protest   = water( options.protest   || 0 );
  this.agree     = water( options.agree     || 0 );
  this.disagree  = water( options.disagree  || 0 );
  this.direct    = water( options.direct    || 0 );
  var that = this;
  this.total = water( water, function(){
    return that.neutral()
    + that.blank()
    + that.protest()
    + that.agree()
    + that.disagree();
  }, [ this.neutral, this.blank, this.protest, this.agree, this.disagree ] );
  this.against = water( water, function(){
    return that.disagree() + that.protest();
  }, [ this.disagree, this.protest ] );
  this.win = water( water, function(){
    return that.agree() > that.against();
  }, [ this.agree, this.against ] );
  this.orientation = water( water, function(){
    var old = that.orientation();
    var now;
    if( that.expired() ){
      now = Vote.neutral;
    }else if( that.agree() > that.against() ){
      // Won
      if( that.agree() > that.blank() ){
        // agree > blank, > neutral, > against
        now = Vote.agree;
      }else{
        // blank > agree, > neutral, > against
        now = Vote.blank;
      }
    }else{
      // Lost
      if( that.disagree() > that.neutral() ){
        if( that.disagree() > that.blank() ){
          if( that.disagree() > that.protest() ){
            now = Vote.disagree;
          }else{
            now = Vote.protest;
          }
        }else{
          if( that.blank() > that.protest() ){
            now = Vote.blank;
          }else{
            now = Vote.protest;
          }
        }
      }else{
        if( that.disagree() > that.blank() ){
          if( that.disagree() > that.protest() ){
            now = Vote.disagree;
          }else{
            now = Vote.protest;
          }
        }else{
          if( that.blank() > that.protest() ){
            now = Vote.blank;
          }else{
            now = Vote.protest;
          }
        }
      }
      if( now !== old ){
        Transition.create({ result: this, orientation: now, previously: old });
        return now;
      }
    }
  }, [ this.agree, this.disagree, this.blank, this.protest ] );
}


/*
 *  Transition event entity.
 *
 *  A transition is the event that occurs when the consolidated orientation
 *  changes on a topic.
 */
 
Subtype( Transition, Event );
function Transition( options ){
  this.result      = options.result;
  this.orientation = options.orientation;
  this.previoulsys = options.previously;
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

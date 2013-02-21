/*  doc/gen.js
 *    l8 API doc generator
 *
 *  This program extracts comments from the source files in lib/ and builds
 *  an doc/api.txt file. That file, mediawiki markup, is manually copied into
 *  https://github.com/JeanHuguesRobert/l8/wiki/ApiReference
 *
 *  2013/02/16 by JHR
 */


var fs   = require( "fs" )
var util = require( "util" )
var puts = util.puts


function load(){
  var buf = []
  var len = arguments.length
  var fn
  var content
  for( var ii = 0 ; ii < len ; ii++ ){
    fn = arguments[ ii ]
    content = fs.readFileSync( "lib/" + fn + ".js", "utf8" )
    //puts( "" + fn + ".js, lines: " + content.split( "\n" ).length );
    buf.push( content )
  }
  return buf.join( "" )
}

function do_it(){
  
  var src = load( "l8", "actor" ) // , "node", "node_server", "node_client" );
  
  var lines = src.split( "\n" )
  //puts( "Total lines: " + lines.length )
  
  var previous_is_empty = false
  var doc_lines = lines.filter( function( line ){
    var ok = true
    // Keep first empty line
    if( line.length === 0 ){
      if( previous_is_empty )return false
      previous_is_empty = true
      return true
    }
    ok = ok && line.length > 1 && line[0] !== " "
    ok = ok && line.substr( 0, 3 ) !== "/* "
    ok = ok && line.indexOf( "JHR, " ) === -1
    ok = ok && line.indexOf( "use strict") === -1 
    //ok = ok && line.substr( 0, 3 ) === "// " )return ok
    if( previous_is_empty && ok ){
      previous_is_empty = false
    }
    return ok
  })
  //puts( "Total doc lines: " + doc_lines.length )
  
  //puts( "--------------------\n" )
  var fragments = []
  var fragment  = []
  doc_lines.forEach( function( line ){
    if( !line ){
      fragments.push( fragment.join( "\n") + "\n" )
      fragment = []
      //puts( "-------\n" )
    }else{
      fragment.push( line )
      //puts( line )
    }
  } )
  
  // I now get a list of fragments
  
  fragments = fragments.filter( function( lines ){
    var ok = true
    // Skip if only comments
    var has_comment = lines.indexOf( "// " ) !== -1
    // Skip is //_ specify something to skip
    ok = ok && lines.indexOf( "//_" ) === -1
    ok = ok && (!has_comment || ( lines.split( "//" ).length -1 !== lines.split( "\n" ).length ) )
    //if( ok && has_comment )return true
    ok = ok && !/var Proto.*prototype/.test( lines )
    // Skip private members
    ok = ok && (!/l8\._/.test( lines ) || /__defineGetter__/.test( lines ))
    if( ok && /Proto.*\./.test( lines ) )return true
    if( ok && /l8\./m.test( lines ) )return true
    // puts( "!!!!!!!!!!\n" + lines + "  !!!!!!!!!!!!!!")
    return false
  })
  
  function Item( src ){
    
    src = src.replace( /\/\/ Usage:([\s\S]*?)\/\/\n/g, function( m, p ){
      return "// Usage:\n// ```javascript\n" + p + "// ```\n//\n"
    })
    this.src = src
    src = src.replace( /\n/g, " " )
    this.klass = null
    this.name  = null
    var that = this
    if( !that.name ){
      src.replace( /\/\/ ([A-Z][a-zA-Z]+?)#([a-z()]+?) /, function( m, p1, p2 ){
        that.klass = p1
        that.name  = p2
      })
    }
    if( !that.name ){
      src.replace( /l8\.([a-zA-Z_]+?)\(/, function( m, p1 ){
        that.klass = "l8"
        that.name  = p1 + "()"
      })
    }
    if( !that.name ){
      src.replace( /l8\.([a-zA-Z_.]+) = /, function( m, p1 ){
        that.klass = "l8"
        that.name  = p1
      })
    }
    if( !that.name ){
      src.replace( /this\.([a-z0-9_]+) /, function( m, p1 ){
        that.klass = "Task"
        that.name  = p1
      })
    }
    if( !that.name ){
      src.replace( /Proto(.+?)\.__define[GS]etter__.*?\"(.*?)\"/, function( m, p1, p2 ){
        that.klass = p1
        that.name  = p2
      })
    }
    if( !that.name ){
      src.replace( /l8.__define[GS]etter__.*?\"(.*?)\"/, function( m, p1 ){
        that.klass = "l8"
        that.name  = p1
      })
    }
    if( !that.name ){
      src.replace( /Proto(.+?)\.(.+?) = function/, function( m, p1, p2 ){
        that.klass = p1
        that.name  = p2 + "()"
      })
    }
    if( !that.name ){
      src.replace( /Proto(.+?)\.(.+?) +?= /, function( m, p1, p2 ){
        that.klass = p1
        that.name  = p2
      })
    }
    if( !that.name ){
      src.replace( /Proto(.+?)\.(.+?)\( /, function( m, p1, p2 ){
        that.klass = p1
        that.name  = p2 + "()"
      })
    }
    // Remove source code from src, keep comments only
    this.src = this.src.replace(
      "// " + this.klass + "#" + this.name + "\n",
      ""
    )
    var lines = this.src.split( "\n" )
    var comments = []
    lines.forEach( function( line ){
      if( !line ){
        comments.push( "" )
      }else if( line.substr( 0, 3 ) === "// " ){
        comments.push( line.substr( 3 ) )
      }else if( line === "//" ){
        comments.push( "" )
      }
    })
    this.src = comments.join( "\n" ).replace( /\n\n\n/g, "\n\n" )
    // Turn "See also" into links
    this.src = this.src.replace( /(see also )(.*)/gi, function( m, p1, p2 ){
      p1 = p1 + p2.replace( /([a-zA-Z0-9]+)[.#]([a-zA-Z0-9]+)/g, function( m, p1, p2 ){
        return '[[ApiReference#wiki-' + p1 + '' + p2 + '|' + m + ']]'
      })
      return p1
    })
    return this
  }
  Item.prototype.toString = function(){
    return this.klass + "#" + this.name
  }
  
  var classes = []
  fragments.forEach( function( lines ){
    var item = new Item( lines )
    if( !item.klass )return
    if( !classes[ item.klass ] ){
      classes[ item.klass ] = []
    }
    if( !classes[ item.klass ][ item.name ] ){
      classes[ item.klass ][ item.name ] = item
      //classes[ item.klass ][ item.name ].toString = function(){ return item.name }
    }else{
      classes[ item.klass ][ item.name ].src += "\n" + item.src
    }
  })
  
  var sorted_classes = []
  for( klass in classes ){
    (function( klass ){
      sorted_classes.push( {
        name: klass,
        items: classes[ klass ],
        toString: function(){ return klass }
      })
    })( klass )
  }
  classes = sorted_classes.sort()
  var item
  for( var klass in classes ){
    var items = classes[ klass ].items
    var aa = []
    for( var name in items ){
      item = items[ name ]
      aa.push( item )
    }
    classes[ klass ].items = aa.sort()
  }
  
  // TOC
  classes.forEach( function( klass ){
    var item = klass.items[ 0 ]
    puts( "* [[ApiReference#wiki-" + item.klass + "|" + item.klass + "]]\n" )
  })
  
  //puts( "\n----\n" )
  classes.forEach( function( klass ){
    var item = klass.items[ 0 ]
    //puts( '<div id="' + item.klass + '"></div>' )
    puts( "\n== " + item.klass + " ==" )
    puts()
    klass.items.forEach( function( item ){
      var lines = item.src.split( "\n" )
      item.line = lines[ 0 ]
      item.src = lines.slice( 1 ).join( "\n").replace( /\n\n\n/g, "\n\n" )
      puts( "* [[ApiReference#wiki-" 
        + item.klass.toLowerCase() + "" 
        + item.name.replace( "()", "" ) 
        + "|" + item.name 
        + "]] - " 
        + item.line
      )
      //puts( "* " + item.name + " - " + item.line )
    })
  })
  
  // Content
  puts( "\n----\n" )
  classes.forEach( function( klass ){
    var item = klass.items[ 0 ]
    puts( "\n== " + item.klass + " ==" )
    puts( "\n" )
    klass.items.forEach( function( item ){
      //puts( '<a id="' + item.klass +"." + item.name.replace( "()", "" ) + '"></a>' )
      puts( "=== " + item.klass.toLowerCase() + "." + item.name + " ==="
        + "\n '''" + item.line + "'''\n" )
      puts( item.src )
    })
  })
}

function main(){
  var buf = []
  process.stdout.write = function( msg ){
    buf.push( msg )
  }
  do_it()
  fs.writeFileSync( "doc/api.txt", buf.join( "" ), "utf8" )
  process.exit( 0 )
}

main()

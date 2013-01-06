/*
 *  l8 test suite
 */

var l8 = require( "../src/l8.js")
var L8 = l8

/* ----------------------------------------------------------------------------
 *  Tests
 */

var trace = l8.trace
var bug   = trace
var de    = true
l8.debug( true)

var test // current test id

  var traces = []
  function t(){
    if( traces.length > 200 ){
      trace( "!!! too many traces, infinite loop? exiting...")
      process.exit( 1)
    }
    var buf = ["test" + (test ? " " + test : ""), "" + l8.current.currentStep]
    for( var ii = 0 ; ii < arguments.length ; ii++ ) buf.push( arguments[ii])
    buf = trace.apply( this, buf)
    traces.push( buf)
    return buf
  }

  function check(){
    var ii = 0
    var msg
    var tt = 0
    var tmsg
    while( ii < arguments.length ){
      msg = arguments[ii++]
      while( true ){
        tmsg = traces[tt]
        if( tmsg && tmsg.indexOf( msg) >= 0 )break
        if( ++tt >= traces.length ){
          var msg = "FAILED test " + test + ", missing trace: " + msg
          trace( msg)
          for( var jj = 0 ; jj < ii ; jj++ ){
            trace( arguments[jj])
          }
          traces = []
          throw new Error( msg)
        }
      }
    }
    trace( "Test " + test, "PASSED")
    traces = []
  }

  var test_1 = function test1(){
    test = 1
    t( "go")
    l8.begin
      .step(  function(){ t( "start")      })
      .step(  function(){ t( "step")       })
      .step(  function(){ t( "sleep")
                          this.sleep( 100)
                          t( "sleeping")   })
      .step(  function(){ t( "sleep done") })
      .failure( function( e ){ t( "!!! unexpected failure", e) })
      .final( function(){ t( "final")
        check( "start",
               "step",
               "sleep",
               "sleeping",
               "sleep done",
               "final"
        )
        test_2()
      })
    .end
  }

  var test_2 = L8.Task( function test2(){
    test = 2; this
    .step(  function(){ t( "start")               })
    .step(  function(){ setTimeout( this.walk, 0) })
    .step(  function(){ t( "sleep/timeout done")  })
    .failure( function( e ){ t( "unexpected failure", e) })
    .final( function(){ t( "final")
      check( "start",
             "sleep/timeout done",
             "final"
      )
      test_3()
    })
  })

  var test_3 = L8.Task( function test3(){
    test = 3; this
    .step(    function(){ t( "start")             })
    .step(    function(){ t( "add step 1"); this
      .step(  function(){   t( "first step")  })
                          t( "add step 2"); this
      .step(  function(){   t( "second step") })  })
    .step(    function(){ t("third & final step") })
    .success( function(){ t("success")            })
    .failure( function( e ){ t( "unexpected failure", e) })
    .final(   function(){ t( "final")
      check( "start",
             "success",
             "final"
      )
      test_4()
    })
  })

  var test_4 = L8.Task( function test4(){
    test = 4; this
    .step(    function(){ t( "start")                    })
    .step(    function(){ t( "raise error")
                          throw new Error( "step error") })
    .step(    function(){ t("!!! skipped step")          })
    .failure( function(){ t("error raised", this.error)  })
    .final(   function(){ t( "final")
      check( "start",
             "error raised",
             "final"
      )
      test_5()
    })
  })

  var test_5 = L8.Task( function test5(){
    test = 5; t( "start"); this
    .fork(    function(){ this.label = t( "fork 1"); this
      .step(  function(){ this.sleep( 10)       })
      .step(  function(){ t( "end fork 1")      })        })
    .fork(    function(){ this.label = t( "fork 2"); this
      .step(  function(){ this.sleep( 5)        })
      .step(  function(){ t( "end fork 2")      })        })
    .step(    function(){ t( "joined")          })
    .fork(    function(){ this.label = t( "fork 3"); this
      .step(  function(){ this.sleep( 1)        })
      .final( function(){ t( "final of fork 3") })        })
    .fork(    function(){ this.label = t( "fork 4"); this
      .final( function(){ t( "final of fork 4") })        })
    .step(    function(){ t( "joined again") })
    .failure( function( e ){ t( "unexpected failure", e)  })
    .final(   function(){ t( "final")
      check( "start",
             "fork 1",
             "fork 2",
             "end fork 2",
             "end fork 1",
             "joined",
             "fork 3",
             "fork 4",
             "final of fork 4",
             "final of fork 3",
             "joined again",
             "final"
      )
      test_6()
    })
  })

  var test_6 = L8.Task( function test6(){
    function other1(){ l8.step( function(){ t( "in other1")} )}
    function other2(){ l8.fork( function(){ t( "in other2")} )}
    test = 6; this
    .step(  function(){ other1(); t( "other1() called")        })
    .step(  function(){ t( "other1 result", this.result); this
                        other2(); t( "other2() called")        })
    .step(  function(){ t( "other2 result", this.result)       })
    .failure( function( e ){ t( "unexpected failure", e) })
    .final( function(){ t( "final result", this.result)
      check( "other1() called",
             "in other1",
             "other1 result",
             "other2() called",
             "in other2",
             "other2 result",
             "final result"
      )
      test_7()
    })
  })

  var test_7 = L8.Task( function test7(){
    test = 7
    var ii; this
    .step(   function(){ t( "simple, times", ii = 3)     })
    .repeat( function(){ t( "repeat simple step", ii)
                         if( --ii === 0 ){
                           t( "break simple repeat")
                           this.break
                         }                               })
    .step(   function(){ t( "simple repeat done")        })
    .step(   function(){ t( "sleep, times", ii = 2)      })
    .repeat( function(){ this
      .step( function(){   t( "repeat sleep", ii)
                           this.sleep( 1)                })
      .step( function(){   t( "done sleep", ii)          })
      .step( function(){   if( --ii === 0 ){
                             t( "break sleep repeat")
                             this.break
                           }                          }) })
    .step(   function(){ t( "done ")                     })
    .failure( function( e ){ t( "unexpected failure", e) })
    .final(  function(){ t( "final result", this.result)
      check( "simple, times",
             "repeat simple",
             "break simple repeat",
             "simple repeat done",
             "sleep, times",
             "done sleep",
             "break sleep repeat",
             "done",
             "final result"
      )
      test_8()
    })
  })

  // L8.compile() needs to be provided a well scoped "eval()" or else it's result
  // function would lack access to the global variables referenced by the code to
  // (re)compile.
  l8.eval = function( expr ){ return eval( expr) }
  
  var test_8 = L8.compile( function xx(){
    test = 8
    var f1 = L8.Task( function( p1, p2 ){
      t( "p1", p1, "p2", p2)
      return [p1,p2]
    })
    step;
      t( "pass parameter, get result");
      f1( "aa", "bb")
    step( r );
      t( "both", r.join( "+"))
      f1( "11", "22")
    step( a, b ); t( "a", a, "b", b)
    fork; return "f1"
    fork; return "f2"
    step( f1, f2 ); t( "f1", f1, "f2", f2)
    fork; f1( "hello", "world")
    fork; f1( "keep calm", "carry on")
    step( h, k ); t( h.join( "! "), k.join( "? "))
    failure( e ); t( "unexpected error", e)
    final; check(
      "p1, aa, p2, bb",
      "both, aa+bb",
      "a, 11, b, 22",
      "f1, f1, f2, f2",
      "hello! world, keep calm? carry on"
    )
    test_9()
  })

  var test_9 = L8.Task( function(){
    test = 9
    var fibonacci = function(){
      var i = 0, j = 1;
      repeat; begin
        t( "yield", i)
        this.yield( i);
        var tmp = i;
        i  = j;
        j += tmp;
      end
      step; t( "producer done")
      failure( e ); t( "fib, unexpected error", e)
    }
    fibonacci = L8.compileGenerator( fibonacci)
    var gen = fibonacci()
    var count_down = 10
    this.repeat( function(){
      this.step( function(   ){
        if( !count_down-- ) this.break
        gen.next()
      }).step( function( r ){
        t( count_down, "fibo", r)
      })
    }).step( function(){
      t( "consumer done")
    }).failure( function( e ){ t( "unexpected error", e)
    }).final( function(){
      check(
        "fibo, 1",
        "fibo, 1",
        "fibo, 2",
        "fibo, 3",
        "fibo, 5",
        "fibo, 8",
        "fibo, 13",
        "fibo, 21",
        "fibo, 34",
        "yield, 55",
        "consumer done"
      )
      test_10()
    })
  })

  var test_10 = L8.Task( function(){
    test = 10
    var inner = L8.Task( function(){
      innerer( this)
      this.step(    function(      ){ t( "!!! Unexpected step in inner()")})
      this.success( function( r    ){ t( "inner success", r) })
      this.final(   function( e, r ){ t( "inner final", e, r) })
    })
    var innerer = L8.Task( function( ret ){
      innerest( ret)
      this.step(    function(      ){ t( "!!! Unexpected step in innerer()")})
      this.success( function( r    ){ t( "innerer success", r) })
      this.final(   function( e, r ){ t( "innerer final", e, r) })
    })
    var innerest = L8.Task( function( ret ){
      this.final(   function( e, r ){ t( "innerest final", e, r) })
      ret.return( "From innerest")
      this.step(    function(      ){ t( "!!! Unexpected step in innerer()")})
      this.success( function( r    ){ t( "!!! Unexpected success", r) })
    })
    this
    .step(    function(   ){ t( "inner()")             })
    .step(    function(   ){ inner()                   })
    .step(    function( r ){ t( "return", r)           })
    .failure( function( e ){ t( "Unexpected error", e) })
    .final(   function(   ){
      check(
        "inner()",
        "innerest final, From innerest",
        "innerer success, From innerest",
        "innerer final, From innerest",
        "inner success, From innerest",
        "inner final, From innerest",
        "return, From innerest"
      )
      test_11()
    })
  })

  var test_11 = L8.Task( function(){
    test = 11
    function recur( n, next ){
      if( --n > 0 ){
        L8.nextTick( function(){ recur( n, next) })
      }else{
        next()
      }
    }
    var l8recur = L8.Task( function l8recur_task( n ){
      if( --n > 0 ){ l8recur( n) }
    })
    var now
    var n = 3
    var p = 100000
    var factor = 50 // 50 by december 2012
    var ii          // 15 is average in nodejs. Best ever is 3, in Chrome
    var duration
    var l8duration
    var tid
    var last_tid
    var was_debug = L8.debug()
    this
    .step( function(){ this.sleep( 1) })
    .step( function(){ now = L8.timeNow; L8.debug( false) })
    .step( function(){
      var done = 0
      var task = this
      for( var ii = 0 ; ii < p ; ii++ ){
        L8.nextTick( function(){
          recur( n, function(){ if( ++done === p ) task.resume() })
        })
      }
      task.pause()
    })
    .step( function(){ this.sleep( 1) })
    .step( function(){
      duration = -1 + L8.timeNow - now
      t( n * p, "times async recur()", duration, "millisecs")
    })
    .step( function(){ this.sleep( 1) })
    .step( function(){
      now = L8.timeNow
      ii  = 0
      tid = L8.current.id
    })
    .repeat( function(){
      if( ii >= p / factor ) this.break
      l8recur( n)
      ii++
    })
    .step( function(){ this.sleep( 1) })
    .fork( function(){ last_tid = this.current.id } )
    .step( function(){
      L8.debug( was_debug)
      l8duration = (-1 + (L8.timeNow - now)) * factor
      t( n * p, "times l8recur()", l8duration, "estimated millisecs")
      t( l8duration / duration, "times slower than if native")
      t( (n * p) / duration   * 1000, "native call/sec")
      t( (n * p) / l8duration * 1000, "l8 call/sec")
      t( (last_tid - tid) / l8duration * 1000 * factor, "l8 task/sec")
    })
    .failure( function( e ){ t( "!!! Unexpected error", e) })
    .final( function(){
      check(
        "l8 call/sec"
      )
      test_last()
    })
  })

  var test_last = function(){
    trace( "SUCCESS!!! All tests ok")
  }

trace( "starting L8")
var count_down = 10
setInterval(
  function(){
    de&&bug( "tick " + --count_down)
    if( !count_down ){
      trace( "exiting...")
      process.exit( 0)
    }
  },
  1000
)
test_1()

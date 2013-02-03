/*
 *  l8 test suite
 */

"use strict";

var l8 = require( "l8/lib/l8.js")

/* ----------------------------------------------------------------------------
 *  Tests
 */

var trace = l8.trace
var bug   = trace
var de    = true
l8.debug( true)
l8.logger( function(){ return function(){} } )
l8.trace( "SILENT TRACE" )
l8.logger( null )
l8.trace( "L8 TEST SUITE" )

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
        if( tmsg && tmsg.indexOf( msg) >= 0 )break;
        if( ++tt >= traces.length ){
          msg = "FAILED test " + test + ", missing trace: " + msg
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

  var test_2 = l8.Task( function test2(){
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

  var test_3 = l8.Task( function test3(){
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

  var test_4 = l8.Task( function test4(){
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

  var test_5 = l8.Task( function test5(){
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

  var test_6 = l8.Task( function test6(){
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

  var test_7 = l8.Task( function test7(){
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
             "repeat simple step",
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

  // l8.compile() needs to be provided a well scoped "eval()" or else it's result
  // function would lack access to the global variables referenced by the code to
  // (re)compile.
  l8.eval = function( expr ){ return eval( expr) }
  
  var test_8 = l8.compile( function xx(){
    test = 8
    var f1 = l8.Task( function( p1, p2 ){
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

  var test_9 = l8.Task( function(){
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
    fibonacci = l8.compileGenerator( fibonacci)
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

  var test_10 = l8.Task( function(){
    test = 10
    var inner = l8.Task( function(){
      innerer( this)
      this.step(    function(      ){ t( "!!! Unexpected step in inner()")})
      this.success( function( r    ){ t( "inner success", r) })
      this.final(   function( e, r ){ t( "inner final", e, r) })
    })
    var innerer = l8.Task( function( ret ){
      innerest( ret)
      this.step(    function(      ){ t( "!!! Unexpected step in innerer()")})
      this.success( function( r    ){ t( "innerer success", r) })
      this.final(   function( e, r ){ t( "innerer final", e, r) })
    })
    var innerest = l8.Task( function( ret ){
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

  var test_11 = l8.Task( function(){
    test = 11
    // Let's compare the speed, first "classical" style, using callbacks
    function recur( n, next ){
      if( --n > 0 ){
        // Note: nextTick is about 20 times slower in chrome than in nodejs...
        l8.nextTick( function(){ recur( n, next) })
      }else{
        next()
      }
    }
    // And then l8 style, using steps
    var l8recur = l8.Task( function l8recur_task( n ){
      // No nextTick involved, l8 scheduler instead
      if( --n > 0 ){ l8recur( n) }
    })
    var now
    var n = 3
    var p = 100000;
    var factor = 2  // 50 by december 2012, 2 by feb 2013
    var ii          // 15 was average in nodejs initially.
    var duration    // 2013/02/03, 0,23 in Chrome, with browserify, 5 in cloud9
    var l8duration
    var tid
    var last_tid
    var was_debug = l8.debug()
    this
    .step( function(){ this.sleep( 1) })
    .step( function(){ now = l8.timeNow; l8.debug( false) })
    .step( function(){
      var done = 0
      var task = this
      for( var ii = 0 ; ii < p ; ii++ ){
        l8.nextTick( function(){
          recur( n, function(){ if( ++done === p ) task.resume() })
        })
      }
      task.pause()
    })
    .step( function(){ this.sleep( 1) })
    .step( function(){
      duration = -1 + l8.timeNow - now
      t( n * p, "times async recur()", duration, "millisecs")
    })
    .step( function(){ this.sleep( 1) })
    .step( function(){
      now = l8.timeNow
      ii  = 0
      tid = l8.current.id
    })
    .repeat( function(){
      if( ii >= p / factor ) this.break
      l8recur( n)
      ii++
    })
    .step( function(){ this.sleep( 1) })
    .fork( function(){ last_tid = this.current.id } )
    .step( function(){
      l8.debug( was_debug )
      l8duration = (-1 + (l8.timeNow - now)) * factor
      t( n * p, "times l8recur()", l8duration, "estimated millisecs")
      t( l8duration / duration, "times slower than if native")
      t( (n * p) / duration   * 1000, "native calls/sec")
      t( (n * p) / l8duration * 1000, "l8 calls/sec")
      t( (last_tid - tid) / l8duration * 1000 * factor, "l8 tasks/sec")
    })
    .failure( function( e ){ t( "!!! unexpected error", e) })
    .final( function(){
      check(
        "l8 calls/sec"
      )
      test_12()
    })
  })
  
  var test_12 = l8.Task( function(){
  try{
    test = 12
    var trace = function(){
      t( "Current task " + l8.current 
      + " gets message '" + l8.get( "message")
      + "' from " + l8.binding( "message").task)
    }
    var subtask = function(){
      l8.label = "sub"
      l8.step( function(){ trace()                       })
      l8.step( function(){ l8.var( "message", "deeper")  })
      l8.step( function(){ l8.sleep( 100)                })
      l8.step( function(){ trace()                       })
    }
    l8.task( function(){
      l8.label = "main"
      l8.var( "message", "top")
      l8.spawn( subtask )
      l8.step( function(){ trace()                       }) 
      l8.step( function(){ l8.join()                     })
    })
    l8.failure( function( e ){ t( "!!! unexpected error", e) })
    l8.final( function(){
      check(
        "top",
        "top",
        "deeper"
      )
      test_last()
    })
  }catch( e ){ t( "!!! error " + e) }
  })

  var test_last = function(){
    trace( "SUCCESS!!! All tests ok")
    process.exit( 0)
  }

trace( "starting l8")
l8.countdown( 10)
test_1()

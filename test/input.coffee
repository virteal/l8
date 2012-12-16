# input.coffee
#   blocking input, BASIC style, via http
#
# 2012/12/16 by JHR

l8      = require( "../src/l8.js")
l8.debug false
http = require( "http")
url  = require( "url")

screen    = []
cls       =       -> screen = []
print     = (msg) -> screen.push msg
printnl   = (msg) -> print msg + "\n"
HttpQueue = l8.queue( 1000)
Res       = null

respond = (question) ->
  return unless Res
  Res.writeHead 200, {'Content-Type': 'text/html'}
  Res.end [
    '<html>'
    screen.join "<br\>"
    '<form url="/">'
    question
    '<input type="text" name="input">'
    '<input type="submit">'
    '</form>'
    '</html>'
  ].join '\n'
  Res = null

input = l8.Task (question) ->
  @step ->
    respond question
    HttpQueue.get()
  @step (req,res) ->
    @trace "Handling new http request, #{req.method}, #{req.url}"
    if req.method isnt "GET" or not (req.url is "/" or req.url[1] is "?")
      res.writeHead 404, {"Content-Type": "text/plain"}
      res.end "404 Not Found\n"
      return input question
    Res  = res
    data = url.parse( req.url, true).query.input
    return data if data
    input question

game = l8.Task ->
  @repeat ->
    round = random = 0
    @step -> input "Enter a decent number to start a new game"
    @step (r) ->
      @continue if (r = parseInt( r)) < 10
      random = Math.floor Math.random() * r
      round  = 0
    @repeat ->
      @step -> input "Guess a number"
      @step (r) ->
        round++
        r = parseInt( r)
        if r > random then printnl "#{r} is too big"
        if r < random then printnl "#{r} is too small"
        if r is random
          cls()
          printnl "Win in #{round} rounds! Try again"
          @break

game()

http.createServer( HttpQueue.put.bind HttpQueue).listen process.env.PORT
l8.trace "Game is running on http port #{process.env.PORT}"

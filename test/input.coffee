# input.coffee
#   blocking input, BASIC style, via http
#
# 2012/12/16 by JHR

l8   = require( "../src/l8.js")
l8.debug false
http = require( "http")
url  = require( "url")

# IO tools. BASIC style

screen    = []
cls       =       -> screen = []
print     = (msg) -> screen.push msg
printnl   = (msg) -> print msg + "\n"

PendingResponse = null
respond = (question) ->
  return unless PendingResponse
  PendingResponse.writeHead 200, {'Content-Type': 'text/html'}
  PendingResponse.end [
    '<html>'
    screen.join "<br\>"
    '<form url="/">'
    question
    '<input type="text" name="input">'
    '<input type="submit">'
    '</form>'
    '</html>'
  ].join '\n'
  PendingResponse = null

HttpQueue = l8.queue( 1000)
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
    PendingResponse = res
    data = url.parse( req.url, true).query.input
    return data if data
    input question
http.createServer( HttpQueue.put.bind HttpQueue).listen process.env.PORT

# Main

l8.task ->
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
l8.trace "Game is running"

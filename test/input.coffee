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
Question  = ""

respond = ->
  return unless Res
  Res.writeHead 200, {'Content-Type': 'text/html'}
  Res.end [
    '<html>'
    screen.join "<br\>"
    '<form url="/">'
    Question
    '<input type="text" name="input">'
    '<input type="submit">'
    '</form>'
    '</html>'
  ].join '\n'
  Res = null

input = l8.Task (question) ->
  @step ->
    respond()
    HttpQueue.get()
  @step (req,res) ->
    @trace "Handling new http request, #{req.method}, #{req.url}"
    if req.method isnt "GET" or not (req.url is "/" or req.url[1] is "?")
      res.writeHead 404, {"Content-Type": "text/plain"}
      res.end "404 Not Found\n"
      return input question
    Res      = res
    Question = question
    data = url.parse( req.url, true).query.input
    return data if data
    input question

game = l8.Task ->
  @repeat ->
    random = Math.floor Math.random() * 1000
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

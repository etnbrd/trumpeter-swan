import * as http from 'http'
import * as Url from 'url'
import * as fs from 'fs'

const ADDRESS = '127.0.0.1' as const
const PORT = 3000 as const

export async function self (req: http.IncomingHttpHeaders, res: http.ServerResponse) {
  try {
    const source = await fs.promises.readFile(__filename)
    res.end(source)
  } catch (error) {
    res.statusCode = 502
    res.end(error)
  }
}

export const index: http.RequestListener = (req, res) => {
  res.end('index stuffs')
}

const routes = {
  self,
  index,
} as const

export function serve() {
  const server = http.createServer()
  server.on('request', (request, response) => {
    const url = Url.parse(request.url)
    const route = url.path.slice(1) // remove the leading slash

    if (route in routes) {
      return routes[route](request, response)
    } else {
      response.statusCode = 404
      response.end('not found')
    }
  })

  server.listen(PORT, ADDRESS, () => {
    const address = server.address()

    if (typeof address === 'string') {
      console.log(`server listening on ${address}`)
    } else {
      console.log(`server listening on port ${address.port}`)
    }
  })   
}

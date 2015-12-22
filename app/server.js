'use strict';

const http = require('http');

const start = (config) => {
  const port = config.server_port;

  http.createServer((req, res) => {
    const proxy = http.request({
      hostname: req.headers['host'],
      path: req.url,
      method: req.method,
      headers: req.headers
    });

    proxy.on('response', (pRes) => {
      pRes.on('data', (chunk) =>  res.write(chunk, 'binary'));
      pRes.on('end', () => res.end());
      res.writeHead(pRes.statusCode, pRes.headers);
    });

    proxy.on('error', (err) => console.log(err));

    req.on('data', (chunk) => proxy.write(chunk, 'binary'));
    req.on('end', () => proxy.end());
  }).listen(port);
};

exports.start = start;

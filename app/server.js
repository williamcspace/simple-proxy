'use strict';

const net = require('net');
const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const inet = require('./inet');
const util = require('util');
const http = require('http');
const httpProxy = require('http-proxy');

const main = (config) => {

  const server = net.createServer().listen(8000, '127.0.0.1');
  server.on('connection', (connection) => {
    connection.on('data', function (data) {
      const remote = net.connect(connection.remotePort, connection.remoteAddress, () =>{
        remote.write(data);
      });
      remote.on('data', (data) => {
        connection.write(data);
      })
    })
  })
};

exports.main = main;

'use strict';

const net = require('net');
const fs = require('fs');
const path = require('path');
const udpRelay = require('./udprelay');
const cli = require('./utils/cli');
const logger = require('./utils/logger');
const inet = require('./utils/inet');
const Encryptor = require('./crypto/encryptor');
const _ = require('lodash');

const getAddressPort = (ip, port) => {
  let aServer = ip;
  let aPort = port;

  if (ip instanceof Array) {
    aServer = ip[Math.floor(Math.random() * aServer.length)];
  }

  if (port instanceof Array) {
    aPort = port[Math.floor(Math.random() * aPort.length)];
  }

  const regex = /^([^:]*)\:(\d+)$/.exec(ip);
  if (regex) {
    aServer = regex[1];
    aPort = Number(+regex[2]);
  }

  return [aServer, aPort];
};

const main = (config) => {
  logger.info('Starting client...');

  const serverAddress = config.server_address || '127.0.0.1';
  const serverPort = config.server_port || '8388';
  const localAddress = config.local_address || '127.0.0.1';
  const localPort = config.local_port || '1080';
  const password = config.password;
  const method = config.method;
  const timeout = Math.floor(config.timeout * 1000) || 300000;
  const addressPort = getAddressPort(serverAddress, serverPort);

  // TODO: !UDPForward
  //const udpClient = udpRelay.createServer(localAddress, localPort, serverAddress, serverPort, password, method, timeout, true);

  let connections = 0;
  const client = net.createServer().listen(localPort, localAddress);
  client.on('listening', () => {
    logger.info('local listening at ' + client.address().address + ':' + client.address().port);
  });
  client.on('connection', (connection) => {
    let connected = true;
    let encryptor = new Encryptor(password, method);
    let stage = 0;
    let headerLength = 0;
    let remote = null;
    let addrLen = 0;
    let remoteAddr = null;
    let remotePort = null;
    let addrToSend = '';

    connections += 1;
    logger.debug('connections: ' + connections);
    connection.on('data', (buffer) => {
      logger.debug('connection on data');
      let data = buffer;
      if (stage === 5) {
        data = encryptor.encrypt(data);
        if (!remote.write(data)) {
          connection.pause();
        }
        return;
      }

      if (stage === 0) {
        const tempBuf = new Buffer(2);
        tempBuf.write('\u0005\u0000', 0);
        connection.write(tempBuf);
        stage = 1;
        logger.debug('stage = 1');
        return;
      }

      if (stage === 1) {
        try {
          const cmd = data[1];
          const addrtype = data[3];
          if (cmd === 1) {
            logger.debug('cmd = 1');
          } else if (cmd === 3) {
            logger.info('UDP assc request from ' + connection.localAddress + ':' + connection.localPort);
            const reply = new Buffer(10);
            reply.write('\u0005\u0000\u0000\u0001', 0, 4, 'binary');
            logger.debug(connection.localAddress);
            inet.aton(connection.localAddress).copy(reply, 4);
            reply.writeUInt16BE(connection.localPort, 8);
            connection.write(reply);
            stage = 10;
          } else {
            logger.error('unsupported cmd: ' + cmd);
            connection.end(new Buffer('\u0005\u0007\u0000\u0001', 'binary'));
            return;
          }

          if (addrtype === 3) {
            addrLen = data[4];
          } else if (addrtype !== 1 && addrtype !== 4) {
            logger.error('unsupported addrtype: ' + addrtype);
            connection.destroy();
            return;
          }

          addrToSend = data.slice(3, 4).toString('binary');
          if (addrtype === 1) {
            remoteAddr = inet.ntoa(data.slice(4, 8));
            addrToSend += data.slice(4, 10).toString('binary');
            remotePort = data.readUInt16BE(8);
            headerLength = 10;
          } else if (addrtype === 4) {
            remoteAddr = inet.ntop(data.slice(4, 20));
            addrToSend += data.slice(4, 22).toString('binary');
            remotePort = data.readUInt16BE(20);
            headerLength = 22;
          } else {
            remoteAddr = data.slice(5, 5 + addrLen).toString('binary');
            addrToSend += data.slice(4, 5 + addrLen + 2).toString('binary');
            remotePort = data.readUInt16BE(5 + addrLen);
            headerLength = 5 + addrLen + 2;
          }
          if (cmd === 3) {
            logger.info('UDP assc: ' + remoteAddr + ':' + remotePort);
            return;
          }
          const buf = new Buffer(10);
          buf.write('\u0005\u0000\u0000\u0001', 0, 4, 'binary');
          buf.write('\u0000\u0000\u0000\u0000', 4, 4, 'binary');
          buf.writeInt16BE(2222, 8);
          connection.write(buf);

          logger.info('connecting ' + addressPort[0] + ':' + addressPort[1]);
          remote = net.connect(addressPort[1], addressPort[0], () => {
            if (remote) {
              remote.setNoDelay(true);
            }
            stage = 5;
            logger.debug('stage = 5');
          });
          remote.on('data', (buffer) => {
            if (!connected) {
              return;
            }
            logger.debug('remote on data');

            try {
              let decryptRData = buffer;
              if (encryptor) {
                decryptRData = encryptor.decrypt(buffer);
                if (!connection.write(decryptRData)) {
                  remote.pause();
                }
              } else {
                remote.destroy();
              }
            } catch (error) {
              logger.error(error);
              if (remote) {
                remote.destroy();
              }
              if (connection) {
                connection.destroy();
              }
            }
          });
          remote.on('end', () => {
            logger.debug('remote on end');
            if (connection) {
              connection.end();
            }
          });
          remote.on('error', (err) => {
            logger.debug('remote on error');
            logger.error('remote ' + remoteAddr + ':' + remotePort + ' error: ' + err);
          });
          remote.on('close', (hadErr) => {
            logger.debug('remote on close:' + hadErr);
            if (hadErr) {
              if (connection) {
                connection.destroy();
              }
            } else {
              if (connection) {
                connection.end();
              }
            }
          });
          remote.on('drain', () => {
            logger.debug('remote on drain');
            if (connection) {
              connection.resume();
            }
          });
          remote.setTimeout(timeout, () => {
            logger.debug('remote on timeout');
            if (remote) {
              remote.destroy();
            }
            if (connection) {
              connection.destroy();
            }
          });

          let addrToSendBuf = new Buffer(addrToSend, 'binary');
          addrToSendBuf = encryptor.encrypt(addrToSendBuf);
          remote.setNoDelay(false);
          remote.write(addrToSendBuf);

          if (data.length > headerLength) {
            data.copy(new Buffer(data.length - headerLength), 0, headerLength);
            remote.write(encryptor.encrypt(buf));
          }

          stage = 4;
          logger.debug('stage = 4');
        } catch (error) {
          logger.error(error);
          if (connection) {
            connection.destroy();
          }
          if (remote) {
            remote.destroy();
          }
          logger.debug('clean');
          connections -= 1;
          encryptor = null;
          logger.debug('connections: ' + connections);
        }
      } else if (stage === 4) {
        if (!remote) {
          if (connection) {
            connection.destroy();
          }
          return;
        }
        data = encryptor.encrypt(data);
        remote.setNoDelay(true);
        if (!remote.write(data)) {
          connection.pause();
        }
      }
    });
    connection.on('end', () => {
      connected = false;
      logger.debug('connection on end');
      if (remote) {
        remote.end();
      }
    });
    connection.on('error', (err) => {
      logger.debug('connection on error');
      logger.error('local error: ' + err);
    });
    connection.on('close', (hadErr) => {
      connected = false;
      logger.debug('connection on close:' + hadErr);
      if (hadErr) {
        if (remote) {
          remote.destroy();
        }
      } else {
        if (remote) {
          remote.end();
        }
      }

      logger.debug('clean');
      connections -= 1;
      if (remote) {
        remote.destroy();
      }
      if (connection) {
        connection.destroy();
      }
      encryptor = null;
      logger.debug('connections: ' + connections);
    });
    connection.on('drain', () => {
      logger.debug('connection on drain');
      if (remote && stage === 5) {
        remote.resume();
      }
    });
    connection.setTimeout(timeout, () => {
      logger.debug('connection on timeout');
      if (remote) {
        remote.destroy();
      }
      if (connection) {
        connection.destroy();
      }
    });
  });
  client.on('error', (err) => {
    logger.error(err);
    process.stdout.on('drain', () => {
      process.exit(1);
    });
  });
  client.on('close', () => {
    logger.info('client closed');
    //udpClient.close();
  });
};

exports.main = main;

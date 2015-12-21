'use strict';
const aton = (ipStr) => {
  const parts = ipStr.split('.');
  if (parts.length !== 4) {
    return null;
  }

  const buf = new Buffer(4);
  for (let i = 0; i < 4; i++) {
    buf[i] = Number(parts[i]);
  }

  return buf;
};

const ntoa = (buf) => {
  return buf[0] + '.' + buf[1] + '.' + buf[2] + '.' + buf[3];
};

// Converts a packed internet address to a human readable representation
// string ntop ( string $in_addr )
const ntop = (inAddr) => {
  //  discuss at: http://phpjs.org/functions/inet_ntop/
  // original by: Theriault
  //   example 1: ntop('\x7F\x00\x00\x01');
  //   returns 1: '127.0.0.1'
  //   example 2: ntop('\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\1');
  //   returns 2: '::1'

  let i = 0;
  let m = '';
  const c = [];
  const packAddress = String(inAddr);
  if (packAddress.length === 4) {
    // IPv4
    return [
      packAddress.charCodeAt(0),
      packAddress.charCodeAt(1),
      packAddress.charCodeAt(2),
      packAddress.charCodeAt(3),
    ].join('.');
  } else if (packAddress.length === 16) {
    // IPv6
    for (i = 0; i < 16; i++) {
      c.push(((packAddress.charCodeAt(i++) << 8) + packAddress.charCodeAt(i))
        .toString(16));
    }
    return c.join(':')
      .replace(/((^|:)0(?=:|$))+:?/g, (t) => {
        m = (t.length > m.length) ? t : m;
        return t;
      })
      .replace(m || ' ', '::');
  }

  // Invalid length
  return false;
};

// Converts a human readable IP address to its packed in_addr representation
// string pton ( string $address )
const pton = (a) => {
  //  discuss at: http://phpjs.org/functions/inet_pton/
  // original by: Theriault
  //   example 1: pton('::');
  //   returns 1: '\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0'
  //   example 2: pton('127.0.0.1');
  //   returns 2: '\x7F\x00\x00\x01'

  const f = String.fromCharCode;
  // IPv4
  let m = a.match(/^(?:\d{1,3}(?:\.|$)){4}/);
  if (m) {
    m = m[0].split('.');
    m = f(m[0]) + f(m[1]) + f(m[2]) + f(m[3]);
    // Return if 4 bytes, otherwise false.
    return m.length === 4 ? m : false;
  }

  // IPv6
  const r = /^((?:[\da-f]{1,4}(?::|)){0,8})(::)?((?:[\da-f]{1,4}(?::|)){0,8})$/;
  m = a.match(r);
  if (m) {
    // Translate each hexadecimal value.
    for (let j = 1; j < 4; j++) {
      // Indice 2 is :: and if no length, continue.
      if (j === 2 || m[j].length === 0) {
        continue;
      }
      m[j] = m[j].split(':');

      for (let i = 0; i < m[j].length; i++) {
        m[j][i] = parseInt(m[j][i], 16);
        // Would be NaN if it was blank, return false.
        if (isNaN(m[j][i])) {
          // Invalid IP.
          return false;
        }
        m[j][i] = f(m[j][i] >> 8) + f(m[j][i] & 0xFF);
      }

      m[j] = m[j].join('');
    }

    const x = m[1].length + m[3].length;
    if (x === 16) {
      return m[1] + m[3];
    } else if (x < 16 && m[2].length > 0) {
      return m[1] + (new Array(16 - x + 1)).join('\x00') + m[3];
    }
  }
  // Invalid IP.
  return false;
};

exports.aton = aton;
exports.ntoa = ntoa;
exports.ntop = ntop;
exports.pton = pton;

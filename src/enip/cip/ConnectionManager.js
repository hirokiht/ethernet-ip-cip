const { LOGICAL } = require('./epath').segments
const { MessageRouter } = require('./message-router')

const services = {
  FORWARD_CLOSE: 0x4E,
  UNCONNECTED_SEND: 0x52,
  FORWARD_OPEN: 0x54,
  GET_CONNECTION_DATA: 0x56,
  SEARCH_CONNECTION_DATA: 0x57,
  GET_CONNECTION_OWNER: 0x5A,
  LARGE_FORWARD_OPEN: 0x5B
}

const connection = {
  REDUNDANT: 1<<15,
  type: {NULL: 0, MULTICAST: 1<<13, P2P: 2<<13, RSVD: 3<<13},
  priority: {LOW: 0, HIGH: 1<<10, SCHEDULED: 2<<10, URGENT: 3<<10},
  size: {FIXED: 0, VARIABLE: 1<<9},
}

const transport = {
  direction: {SERVER: 1<<7, CLIENT: 0<<7},
  trigger: {CYCLIC: 0, CHG_OF_STATE: 1<<4, APP_OBJ: 2<<4}, //for client only
  class: [0, 1, 2, 3]
}

const paths = {
  CONNECTION_MANAGER: Buffer.concat([LOGICAL.build(LOGICAL.types.ClassID, 0x06), LOGICAL.build(LOGICAL.types.InstanceID, 1)]),
  MESSAGE_ROUTER: Buffer.concat([LOGICAL.build(LOGICAL.types.ClassID, 0x02), LOGICAL.build(LOGICAL.types.InstanceID, 1)])
}

const VENDOR_ID = 0x1337
const SERIAL_NO = 0xDEADBEEF
const TIMEOUT_MPY = 0 //RPIx4

/**
 * @typedef UCMMSendTimeout
 * @type {Object}
 * @property {number} time_ticks
 * @property {number} ticks
 */

/**
 * Gets the Best Available Timeout Values
 *
 * @param {number} timeout - Desired Timeout in ms
 * @returns {UCMMSendTimeout}
 */
const generateEncodedTimeout = (timeout, buf) => {
  if (timeout <= 0 || typeof timeout !== 'number')
    throw new Error('Timeouts Must be Positive Integers')
  if (!Buffer.isBuffer(buf) || buf.length < 2) throw new Error('Invalid Buffer')

  let diff = Infinity // let difference be very large
  let time_tick = 0, ticks = 0

  // Search for Best Timeout Encoding Values
  for (let i = 0 ; i < 16 ; i++) {
    for (let j = 1 ; j < 256 ; j++) {
      const newDiff = Math.abs(timeout - (1 << i) * j)
      if (newDiff < diff) {
        diff = newDiff
        time_tick = i
        ticks = j
      }
    }
  }

  buf.writeUInt8(time_tick, 0)
  buf.writeUInt8(ticks, 1)
}

/**
 * Builds a Forward Open / Large Forward Open Packet Buffer
 *
 * @param {number} rpi - Request Packet Interval
 * @param {number} [otConn=(VARIABLE|LOW|P2P)] O->T Connection Parameter
 * @param {number} [otSize=0x1FF] O->T Maximum Connection Size
 * @param {number} [toConn=(VARIABLE|LOW|P2P)] T->O Connection Parameter
 * @param {number} [toSize=0x1FF] T->O Maximum Connection Size
 * @param {number} [serial=0x1337] - Connection Serial Number
 * @param {number} [ttt=(SERVER|class[3])] - Transport Type/Trigger
 * @param {buffer} [path=MESSAGE_ROUTER] - Padded EPATH Buffer
 * @param {number} [timeout=2000] - timeout
 * @returns {buffer}
 */
const ForwardOpen = {
  build: (rpi, otConn = (connection.size.VARIABLE | connection.priority.LOW | connection.type.P2P), otSize = 0x1FF, toConn = (connection.size.VARIABLE | connection.priority.LOW | connection.type.P2P), toSize = 0x1FF, serial = 0x1337, ttt = (transport.direction.SERVER | transport.class[3]), path = paths.MESSAGE_ROUTER, timeout = 2000) => {
    if (typeof rpi !== 'number' || rpi > 0xFFFFFFFF || rpi < 10000 ) throw new Error('RPI must be >= 10ms')
    if (typeof toConn !== 'number' || typeof otConn !== 'number' || otConn > 0xFFFF || toConn > 0xFFFF || otConn < 0 || toConn < 0) throw new Error('Invalid Connection Parameter')
    if (typeof toSize !== 'number' || typeof otSize !== 'number' || otSize > 0xFFFF || toSize > 0xFFFF || otSize < 0 || toSize < 0) throw new Error('Invalid Connection Size')
    if (typeof serial !== 'number' || serial > 0xFFFF || serial < 0 ) throw new Error('Invalid Connection Serial Number')
    if (typeof ttt !== 'number' || ttt > 255 || ttt < 0 ) throw new Error('Invalid Transport Type/Trigger')
    if (!Buffer.isBuffer(path)) throw new Error('Path must be a Buffer')
    if (typeof timeout !== 'number' || timeout < 100) timeout = 1000

    const buf = Buffer.alloc((otSize > 0x1FF || toSize > 0x1FF)? 40 : 36)
    generateEncodedTimeout(timeout, buf)
    //buf.writeUInt32LE(0xBEEFDEAD, 2)//O->T Connection ID chosen by target for Ethernet/IP
    buf.writeUInt32LE(0xDEADBEEF, 6)	//T->O Connection ID
    buf.writeUInt16LE(serial, 10)     //Connection Serial No.
    buf.writeUInt16LE(VENDOR_ID, 12)
    buf.writeUInt32LE(SERIAL_NO, 14)
    buf.writeUInt8(TIMEOUT_MPY, 18) //only applied if timeout is > 10s, else 10s is used
    buf.writeUInt32LE(1000000, 22) //O->T RPI 1s, set >rpi so that timeout will not occur when waiting
    if(buf.length === 36)
      buf.writeUInt16LE(otConn | otSize, 26)
    else buf.writeUInt32LE(otConn << 16 | otSize, 26)
    buf.writeUInt32LE(rpi, buf.length === 36 ? 28 : 30)	//T->O RPI
    if(buf.length === 36)
      buf.writeUInt16LE(toConn, 32)
    else buf.writeUInt32LE(toConn << 16 | toSize, 34)
    buf.writeUInt8(ttt, buf.length === 36? 34 : 38)
    buf.writeUInt8(Math.ceil(path.length / 2), buf.length === 36? 35 : 39)

    return MessageRouter.build((otSize > 0x1FF || toSize > 0x1FF)? services.LARGE_FORWARD_OPEN : services.FORWARD_OPEN, paths.CONNECTION_MANAGER, Buffer.concat([buf, path]))
  },
  parse: (buf) => {
    if(buf.length === 10)
      return {
        connectionSerialNo: buf.readUInt16LE(0),
        oVendorID: buf.readUInt16LE(2),
        oSerialNo: buf.readUInt32LE(4),
        remainingPathSize: buf.readUInt8(8),
        reserved: buf.readUInt8(9)
      }
    let resp = {
      otConnectionID: buf.readUInt32LE(0),
      toConnectionID: buf.readUInt32LE(4),
      connectionSerialNo: buf.readUInt16LE(8),
      oVendorID: buf.readUInt16LE(10),
      oSerialNo: buf.readUInt32LE(12),
      otAPI: buf.readUInt32LE(16),
      toAPI: buf.readUInt32LE(20),
      appReplySize: buf.readUInt8(24),
      appReply: []
    }
    for(let i = 0 ; i < resp.appResplySize ; i++)
      resp.appReply.push(buf.readUInt16LE( i * 2 + 26 ))
    return resp
  }
}

/**
 * Builds a Forward Close Packet Buffer
 *
 * @param {number} [serial=0x1337] - Connection Serial Number
 * @param {number} [timeout=1000] - timeout
 * @returns {buffer}
 */
const ForwardClose = {
  build: (path = Buffer.alloc(0), serial = 0x1337, timeout = 1000) => {
    if (!Buffer.isBuffer(path)) throw new Error('Path must be a Buffer')
    if (typeof serial !== 'number' || serial > 0xFFFF || serial < 0 ) throw new Error('Invalid Connection Serial Number')
    if (typeof timeout !== 'number' || timeout < 100) timeout = 1000

    const buf = Buffer.alloc(12)
    generateEncodedTimeout(timeout, buf)
    buf.writeUInt16LE(serial, 2)
    buf.writeUInt16LE(VENDOR_ID, 4)
    buf.writeUInt32LE(SERIAL_NO, 6)
    buf.writeUInt8(Math.ceil(path.length / 2), 10)

    return MessageRouter.build(services.FORWARD_CLOSE, paths.CONNECTION_MANAGER, Buffer.concat([buf, path]))
  },
  parse: (buf) => {
    if(!Buffer.isBuffer(buf) || buf.length < 10)
      return null
    return {
      connectionSerialNo: buf.readUInt16LE(0),
      oVendorID: buf.readUInt16LE(2),
      oSerialNo: buf.readUInt32LE(4),
      remainingPathSize: buf.readUInt8(8),
      appReplySize: buf.readUInt8(8),
      reserved: buf.readUInt8(9),
      appReply: buf.slice(10)
    }
  }
}

/**
 * Builds an Unconnected Send Packet Buffer
 *
 * @param {buffer} msgReq - Message Request Encoded Buffer
 * @param {buffer} path - Padded EPATH Buffer
 * @param {number} [timeout=2000] - timeout
 * @returns {buffer}
 */
const UnconnectedSend = {
  build: (msgReq, path, timeout = 2000) => {
    if (!Buffer.isBuffer(msgReq))
      throw new Error('Message Request must be a Buffer')
    if (!Buffer.isBuffer(path)) throw new Error('Path must be a Buffer')
    if (typeof timeout !== 'number' || timeout < 100) timeout = 1000

    const buf = Buffer.allocUnsafe(4)
    generateEncodedTimeout(timeout, buf)
    buf.writeUInt16LE(msgReq.length, 2)

    const pathLenBuf = Buffer.allocUnsafe(2)
    pathLenBuf.writeUInt8(Math.ceil(path.length / 2), 0)
    pathLenBuf.writeUInt8(0, 1) //Reserved

    const padBuf = Buffer.alloc(msgReq.length % 2)
    return MessageRouter.build(services.UNCONNECTED_SEND, paths.CONNECTION_MANAGER, Buffer.concat([buf, msgReq, padBuf, pathLenBuf, path]))
  }, 
  parse: buf => {
    if(!Buffer.isBuffer(buf))
      return null
    return buf.length <= 2 ? { remainingPathSize: buf.readUInt8(0) } : { data: buf }
  }
}

module.exports = { services, ForwardOpen, connection, transport, LargeForwardOpen: ForwardOpen, ForwardClose, UnconnectedSend, paths }

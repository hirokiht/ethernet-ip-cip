const { services, ForwardOpen, connection, transport, LargeForwardOpen, ForwardClose, UnconnectedSend, paths } = require('./ConnectionManager')

describe('Connection Manager', () => {
  describe('Constant Values', () => {
    it('services definition', () => {
      expect(services.FORWARD_CLOSE).toEqual(0X4E)
      expect(services.UNCONNECTED_SEND).toEqual(0X52)
      expect(services.FORWARD_OPEN).toEqual(0X54)
      expect(services.GET_CONNECTION_DATA).toEqual(0X56)
      expect(services.SEARCH_CONNECTION_DATA).toEqual(0X57)
      expect(services.GET_CONNECTION_OWNER).toEqual(0X5A)
      expect(services.LARGE_FORWARD_OPEN).toEqual(0X5B)
    })

    it('connection parameter', () => {
      expect(connection.REDUNDANT|connection.type.NULL|connection.priority.LOW|connection.size.FIXED).toEqual(1<<15)
      expect(connection.type.MULTICAST|connection.priority.HIGH|connection.size.VARIABLE).toEqual(1<<13|1<<10|1<<9)
      expect(connection.type.P2P|connection.priority.SCHEDULED|connection.size.FIXED).toEqual(2<<13|2<<10)
      expect(connection.type.RSVD|connection.priority.URGENT|connection.size.VARIABLE).toEqual(3<<13|3<<10|1<<9)
    })

    it('transport definition', () => {
      expect(transport.direction.CLIENT|transport.trigger.cyclic|transport.class[0]).toEqual(0)
      expect(transport.direction.CLIENT|transport.trigger.CHG_OF_STATE|transport.class[1]).toEqual(1<<4|1)
      expect(transport.direction.CLIENT|transport.trigger.APP_OBJ|transport.class[2]).toEqual(2<<4|2)
      expect(transport.direction.SERVER|transport.class[3]).toEqual(1<<7|3)
    })

    it('paths definition', () => {
      expect(paths.CONNECTION_MANAGER.toString('hex')).toEqual('20062401')
      expect(paths.MESSAGE_ROUTER.toString('hex')).toEqual('20022401')
    })
  })
})

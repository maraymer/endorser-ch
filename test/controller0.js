
import db from '../server/api/services/endorser.db.service'
import testUtil from './util'

const credentials = testUtil.credentials

describe('0 - Setup', () => {

  it('should register initial user', () =>
    db.registrationInsert({ did: testUtil.creds[0].did })
  )

})

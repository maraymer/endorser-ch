import util from 'util'
import R from 'ramda'

import l from '../../common/logger'
import db from './endorser.db.service'
import { buildConfirmationList } from './util'

class ActionService {

  byId(id) {
    l.info(`${this.constructor.name}.byId(${id})`);
    return db.actionClaimById(id)
  }

  async byQuery(params) {
    l.info(`${this.constructor.name}.byQuery(${util.inspect(params)})`);
    if (params.id) {
      params.rowid = params.id
      delete params.id
    }
    let resultData = await db.actionClaimsByParams(params)
    return resultData
  }

  async getActionClaimsAndConfirmationsForEventsSince(dateTime) {
    // Note that the following is very similar to TenureService.getClaimsAndConfirmationsAtPoint

    let acacs = await db.retrieveActionClaimsAndConfirmationsForEventsSince(dateTime)
    // group all actions by DID
    let acacListsByDid = R.groupBy(acac => acac.action.agentDid)(acacs)
    // now make an action group for each DID
    let acacListsByDidThenAction = R.map(acacList => R.groupBy(acac => acac.action.id)(acacList))(acacListsByDid)
    // now aggregate all confirmations for each DID-action
    let acacObjectByDid = R.map(R.map(R.curry(buildConfirmationList)('action')))(acacListsByDidThenAction)
    let acacListByDid = R.map(R.values)(acacObjectByDid)
    // now create an array so that the DIDs aren't used as keys
    var result = []
    for (let key of R.keys(acacListByDid)) {
      result.push({did:key, actions:acacListByDid[key]})
    }
    return result
  }

}

export default new ActionService();

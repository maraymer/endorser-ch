import base64url from 'base64url'
import canonicalize from 'canonicalize'
import didJwt from 'did-jwt'
import { Resolver } from 'did-resolver'
import { DateTime } from 'luxon'
import R from 'ramda'
import util from 'util'
import { getResolver as ethrDidResolver } from 'ethr-did-resolver'

import l from '../../common/logger'
import db from './endorser.db.service'
import { allDidsInside, calcBbox, ERROR_CODES, hashChain, hashedClaimWithHashedDids, HIDDEN_TEXT } from './util';
import { addCanSee } from './network-cache.service'

// for did-jwt 6.8.0 & ethr-did-resolver 6.2.2
const resolver = new Resolver({...ethrDidResolver({infuraProjectId: process.env.INFURA_PROJECT_ID})})

const SERVICE_ID = process.env.SERVICE_ID

const DEFAULT_MAX_REGISTRATIONS_PER_MONTH = process.env.DEFAULT_MAX_REGISTRATIONS_PER_MONTH || 10
const DEFAULT_MAX_CLAIMS_PER_WEEK = process.env.DEFAULT_MAX_CLAIMS_PER_WEEK || 100

// Determine if a claim has the right context, eg schema.org
//
// Different versions are because of "legacy context" issues.
//
// We still use this "http" since some have an old version of the app, but we expect to turn it off in late 2022.
// (It is also useful when we need to run scripts against that data.)
// Check with: select max(issuedAt) from jwt where claimContext = 'http://schema.org'
const isContextSchemaOrg = (context) => context === 'https://schema.org' || context === 'http://schema.org'
// ... and we only use the following for scripts.
// Check with: select max(issuedAt) from jwt where claimContext = 'http://endorser.ch'
//const isContextSchemaForConfirmation = (context) => isContextSchemaOrg(context) || context === 'http://endorser.ch' // latest was in 2020
//
// Here is what to use for new deployments, and for endorser.ch after all users have updated their apps.
//const isContextSchemaOrg = (context) => context === 'https://schema.org'
// Claims inside AgreeAction may not have a context if they're also in schema.org
const isContextSchemaForConfirmation = (context) => isContextSchemaOrg(context)

const isEndorserRegistrationClaim = (claim) =>
      isContextSchemaOrg(claim['@context'])
      && claim['@type'] === 'RegisterAction'
      && claim['object'] === SERVICE_ID

class JwtService {

  async byId(id, requesterDid) {
    l.trace(`${this.constructor.name}.byId(${id}, ${requesterDid})`);
    let jwtRec = await db.jwtById(id)
    if (jwtRec) {
      let result = {id:jwtRec.id, issuedAt:jwtRec.issuedAt, issuer:jwtRec.issuer, subject:jwtRec.subject, claimContext:jwtRec.claimContext, claimType:jwtRec.claimType, claim:JSON.parse(jwtRec.claim)}
      return result
    } else {
      return null
    }
  }

  async byQuery(params) {
    l.trace(`${this.constructor.name}.byQuery(${util.inspect(params)})`);
    var resultData
    resultData = await db.jwtsByParams(params)
    let result = resultData.map(j => {
      let thisOne = {id:j.id, issuer:j.issuer, issuedAt:j.issuedAt, subject:j.subject, claimContext:j.claimContext, claimType:j.claimType, claim:JSON.parse(j.claim)}
      return thisOne
    })
    return result
  }

  /**
   * Dangerous: this includes encoded data that might include private DIDs.
   */
  async fullJwtById(id, requesterDid) {
    l.trace(`${this.constructor.name}.fullJwtById(${id}, ${requesterDid})`);
    let jwtRec = await db.jwtById(id)
    if (jwtRec) {
      return jwtRec
    } else {
      return null
    }
  }

  async thisClaimAndConfirmationsIssuersMatchingClaimId(claimId) {
    let jwtClaim = await db.jwtById(claimId)
    if (!jwtClaim) {
      return []
    } else {
      let confirmations = await db.confirmationsByClaim(jwtClaim.claim)
      let allDids = R.append(
        jwtClaim.issuer,
        R.map((c)=>c.issuer, confirmations)
      )
      return R.uniq(allDids)
    }
  }

  async getRateLimits(requestorDid) {
    const registered = await db.registrationByDid(requestorDid)
    if (registered) {
      const startOfMonthDate = DateTime.utc().startOf('month')
      const startOfMonthEpoch = Math.floor(startOfMonthDate.valueOf() / 1000)
      const startOfWeekDate = DateTime.utc().startOf('week') // luxon weeks start on Mondays
      const startOfWeekString = startOfWeekDate.toISO()
      const result = {
        nextMonthBeginDateTime: startOfMonthDate.plus({months: 1}).toISO(),
        nextWeekBeginDateTime: startOfWeekDate.plus({weeks: 1}).toISO(),
      }

      const claimedCount = await db.jwtCountByAfter(requestorDid, startOfWeekString)
      result.doneClaimsThisWeek = claimedCount

      const regCount = await db.registrationCountByAfter(requestorDid, startOfMonthEpoch)
      result.doneRegistrationsThisMonth = regCount
      result.maxClaimsPerWeek = registered.maxClaims || DEFAULT_MAX_CLAIMS_PER_WEEK
      result.maxRegistrationsPerMonth = registered.maxRegs || DEFAULT_MAX_REGISTRATIONS_PER_MONTH
      return result
    } else {
      return Promise.reject({
        clientError: { message: 'Rate limits are only available to existing users.',
                       code: ERROR_CODES.UNREGISTERED_USER }
      })
    }
  }

  extractClaim(payload) {
    let claim = payload.claim
      || (payload.vc && payload.vc.credentialSubject)
    if (claim) {
      return claim
    } else {
      return null
    }
  }

  async merkleUnmerkled() {
    return db.jwtClaimsAndIdsUnmerkled()
      .then(idAndClaimArray => {
        return db.jwtLastMerkleHash()
          .then(hashHexArray => {
            var seedHex = ""
            if (hashHexArray.length > 0) {
              seedHex = hashHexArray[0].hashChainHex
            }
            var updates = []
            var latestHashChainHex = seedHex
            for (let idAndClaim of idAndClaimArray) {
              latestHashChainHex = hashChain(latestHashChainHex, [idAndClaim])
              if (idAndClaim.hashHex === null) {
                l.error("Found entries without a hashed claim, indicating some problem when inserting jwt records. Will create.")
                idAndClaim.hashHex = hashedClaimWithHashedDids(idAndClaim)
              }
              updates.push(db.jwtSetMerkleHash(idAndClaim.id, idAndClaim.hashHex, latestHashChainHex))
            }
            return Promise.all(updates)
          })
          .catch(e => {
            l.error(e, "Got error while saving hashes, with this toString(): " + e)
            return Promise.reject(e)
          })
      })
      .catch(e => {
        l.error(e, "Got error while retrieving unchained claims, with this toString(): " + e)
        return Promise.reject(e)
      })
  }

  /**
     @return object with: {confirmId: NUMBER, actionClaimId: NUMBER, orgRoleClaimId: NUMBER, tenureClaimId: NUMBER}
       ... where confirmId is -1 if something went wrong, and all others are optional
   **/
  async createOneConfirmation(jwtId, issuerDid, origClaim) {

    l.trace(`${this.constructor.name}.createOneConfirmation(${jwtId}, ${issuerDid}, ${util.inspect(origClaim)})`);

    // since AgreeAction is from schema.org, the embedded claim is the same by default
    if (origClaim['@context'] == null) {
      origClaim['@context'] = 'https://schema.org'
    }

    if (isContextSchemaOrg(origClaim['@context'])
        && origClaim['@type'] === 'JoinAction') {

      var events = await db.eventsByParams({orgName:origClaim.event.organizer.name, name:origClaim.event.name, startTime:origClaim.event.startTime})
      if (events.length === 0) return Promise.reject(new Error("Attempted to confirm action at an unrecorded event."))

      let actionClaimId = await db.actionClaimIdByDidEventId(origClaim.agent.did, events[0].id)
      if (actionClaimId === null) return Promise.reject(new Error("Attempted to confirm an unrecorded action."))

      // check for duplicate
      // this can be replaced by confirmationByIssuerAndOrigClaim
      let confirmation = await db.confirmationByIssuerAndAction(issuerDid, actionClaimId)
      if (confirmation !== null) return Promise.reject(new Error(`Attempted to confirm an action already confirmed in # ${confirmation.id}`))

      let origClaimStr = canonicalize(origClaim)

      let result = await db.confirmationInsert(issuerDid, jwtId, origClaimStr, actionClaimId, null, null)
      l.trace(`${this.constructor.name}.createOneConfirmation # ${result} added for actionClaimId ${actionClaimId}`);
      return {confirmId:result, actionClaimId}


    } else if (origClaim['@context'] === 'https://endorser.ch'
               && origClaim['@type'] === 'Tenure') {

      let tenureClaimId = await db.tenureClaimIdByPartyAndGeoShape(origClaim.party.did, origClaim.spatialUnit.geo.polygon)
      if (tenureClaimId === null) return Promise.reject(new Error("Attempted to confirm an unrecorded tenure."))

      // check for duplicate
      // this can be replaced by confirmationByIssuerAndOrigClaim
      let confirmation = await db.confirmationByIssuerAndTenure(issuerDid, tenureClaimId)
      if (confirmation !== null) return Promise.reject(new Error(`Attempted to confirm a tenure already confirmed in # ${confirmation.id}`))

      let origClaimStr = canonicalize(origClaim)

      let result = await db.confirmationInsert(issuerDid, jwtId, origClaimStr, null, tenureClaimId, null)
      l.trace(`${this.constructor.name}.createOneConfirmation # ${result} added for tenureClaimId ${tenureClaimId}`);
      return {confirmId:result, tenureClaimId}


    } else if (isContextSchemaOrg(origClaim['@context'])
               && origClaim['@type'] === 'Organization'
               && origClaim.member
               && origClaim.member['@type'] === 'OrganizationRole'
               && origClaim.member.member
               && origClaim.member.member.identifier) {

      let orgRoleClaimId = await db.orgRoleClaimIdByOrgAndDates(origClaim.name, origClaim.member.roleName, origClaim.member.startDate, origClaim.member.endDate, origClaim.member.member.identifier)
      if (orgRoleClaimId === null) return Promise.reject(new Error("Attempted to confirm an unrecorded orgRole."))

      // check for duplicate
      // this can be replaced by confirmationByIssuerAndOrigClaim
      let confirmation = await db.confirmationByIssuerAndOrgRole(issuerDid, orgRoleClaimId)
      if (confirmation !== null) return Promise.reject(new Error(`Attempted to confirm a orgRole already confirmed in # ${confirmation.id}`))

      let origClaimStr = canonicalize(origClaim)

      let result = await db.confirmationInsert(issuerDid, jwtId, origClaimStr, null, null, orgRoleClaimId)
      l.trace(`${this.constructor.name}.createOneConfirmation # ${result} added for orgRoleClaimId ${orgRoleClaimId}`);
      return {confirmId:result, orgRoleClaimId}


    } else {

      // check for duplicate
      let confirmation = await db.confirmationByIssuerAndOrigClaim(issuerDid, origClaim)
      if (confirmation !== null) return Promise.reject(new Error(`Attempted to confirm a claim already confirmed in # ${confirmation.id}`))

      let origClaimStr = canonicalize(origClaim)

      // If we choose to add the subject, it's found in these places (as of today):
      //   claim.agent.did
      //   claim.member.member.identifier
      //   claim.party.did
      //   claim.identifier

      let result = await db.confirmationInsert(issuerDid, jwtId, origClaimStr, null, null, null)
      l.trace(`${this.constructor.name}.createOneConfirmation # ${result} added for a generic confirmation`);
      return {confirmId:result}

    }
  }

  async createEmbeddedClaimRecord(jwtId, issuerDid, claim) {

    if (isContextSchemaOrg(claim['@context'])
        && claim['@type'] === 'AgreeAction') {

      l.trace('Adding AgreeAction confirmation', claim)
      // note that 'Confirmation' does similar logic (but is deprecated)

      let recordings = []
      {
        let origClaim = claim['object']
        if (Array.isArray(origClaim)) {
          // if we run these in parallel then there can be duplicates (when we haven't inserted previous ones in time for the duplicate check)
          for (var claim of origClaim) {
            recordings.push(await this.createOneConfirmation(jwtId, issuerDid, claim).catch(console.log))
          }
        } else if (origClaim) {
          recordings.push(await this.createOneConfirmation(jwtId, issuerDid, origClaim).catch(console.log))
        }
      }
      l.trace('Added confirmations', recordings)

    } else if (isContextSchemaOrg(claim['@context'])
               && claim['@type'] === 'JoinAction') {

      let agentDid = claim.agent.did
      if (!agentDid) {
        l.error(`Error in ${this.constructor.name}: JoinAction for ${jwtId} has no agent DID.`)
        return Promise.reject(new Error("Attempted to record a JoinAction claim with no agent DID."))
      }

      if (!claim.event) {
        l.error(`Error in ${this.constructor.name}: JoinAction for ${jwtId} has no event info.`)
        return Promise.reject(new Error("Attempted to record a JoinAction claim with no event info."))
      }

      var event
      var orgName = claim.event.organizer && claim.event.organizer.name
      var events = await db.eventsByParams({orgName:orgName, name:claim.event.name, startTime:claim.event.startTime})

      if (events.length === 0) {
        let eventId = await db.eventInsert(orgName, claim.event.name, claim.event.startTime)
        event = {id:eventId, orgName:orgName, name:claim.event.name, startTime:claim.event.startTime}
        l.trace(`${this.constructor.name} New event # ${util.inspect(event)}`)

      } else {
        event = events[0]
        if (events.length > 1) {
          l.warn(`${this.constructor.name} Multiple events exist with orgName ${orgName} name ${claim.event.name} startTime ${claim.event.startTime}`)
        }

        let actionClaimId = await db.actionClaimIdByDidEventId(agentDid, events[0].id)
        if (actionClaimId) return Promise.reject(new Error("Same user attempted to record an action claim that already exists with ID " + actionClaimId))

      }

      let actionId = await db.actionClaimInsert(issuerDid, agentDid, jwtId, event)
      l.trace(`${this.constructor.name} New action # ${actionId}`)


    } else if (isContextSchemaOrg(claim['@context'])
               && claim['@type'] === 'Organization'
               && claim.member
               && claim.member['@type'] === 'OrganizationRole'
               && claim.member.member.identifier) {

      let entity = {
        jwtId: jwtId,
        issuerDid: issuerDid,
        orgName: claim.name,
        roleName: claim.member.roleName,
        startDate: claim.member.startDate,
        endDate: claim.member.endDate,
        memberDid: claim.member.member.identifier
      }
      let orgRoleId = await db.orgRoleInsert(entity)


    } else if (isEndorserRegistrationClaim(claim)) {

      let registration = {
        did: claim.participant.did,
        agent: claim.agent.did,
        epoch: Math.floor(new Date().valueOf() / 1000),
        jwtId: jwtId,
      }

      let registrationId = await db.registrationInsert(registration)

    } else if (claim['@context'] === 'https://endorser.ch'
               && claim['@type'] === 'Tenure') {

      let bbox = calcBbox(claim.spatialUnit.geo.polygon)
      let entity =
          {
            jwtId: jwtId,
            issuerDid: issuerDid,
            partyDid: claim.party && claim.party.did,
            polygon: claim.spatialUnit.geo.polygon,
            westLon: bbox.westLon,
            minLat: bbox.minLat,
            eastLon: bbox.eastLon,
            maxLat: bbox.maxLat
          }

      let tenureId = await db.tenureInsert(entity)


    } else if (isContextSchemaOrg(claim['@context'])
               && claim['@type'] === 'VoteAction') {

      let vote = {
        jwtId: jwtId,
        issuerDid: issuerDid,
        actionOption: claim.actionOption,
        candidate: claim.candidate,
        eventName: claim.object.event.name,
        eventStartTime: claim.object.event.startDate,
      }

      let eventId = await db.voteInsert(vote)


    } else if (isContextSchemaForConfirmation(claim['@context'])
               && claim['@type'] === 'Confirmation') {

      // this is for "legacy Confirmation" and can be deprecated; see AgreeAction

      var recordings = []

      { // handle a single claim
        let origClaim = claim['originalClaim']
        if (origClaim) {
          recordings.push(await this.createOneConfirmation(jwtId, issuerDid, origClaim).catch(console.log))
        }
      }

      { // handle multiple claims
        let origClaims = claim['originalClaims']
        if (origClaims) {
          // if we run these in parallel then there can be duplicates (when we haven't inserted previous ones in time for the duplicate check)
          for (var origClaim of origClaims) {
            recordings.push(await this.createOneConfirmation(jwtId, issuerDid, origClaim).catch(console.log))
          }
        }
      }
      l.trace(`${this.constructor.name} Created ${recordings.length} confirmations & network records.`, recordings)

      await Promise.all(recordings)
        .catch(err => {
          return Promise.reject(err)
        })


    } else {
      l.info("Submitted unknown claim type with @context " + claim['@context'] + " and @type " + claim['@type'] + "  This isn't a problem, it just means there is no dedicated storage or reporting for that type.")
    }

  }

  async createEmbeddedClaimRecords(jwtId, issuerDid, claim) {

    l.trace(`${this.constructor.name}.createEmbeddedClaimRecords(${jwtId}, ${issuerDid}, ...)`);
    l.trace(`${this.constructor.name}.createEmbeddedClaimRecords(..., ${util.inspect(claim)})`);

    if (Array.isArray(claim)) {

      var recordings = []
      { // handle multiple claims
        for (var subClaim of claim) {
          recordings.push(this.createEmbeddedClaimRecord(jwtId, issuerDid, subClaim))
        }
      }
      l.trace(`${this.constructor.name} creating ${recordings.length} claim records.`)

      await Promise.all(recordings)
        .catch(err => {
          return Promise.reject(err)
        })
    } else {
      await this.createEmbeddedClaimRecord(jwtId, issuerDid, claim)
      l.trace(`${this.constructor.name} created a claim record.`)
    }

    // now record all the "sees" relationships to the issuer
    var netRecords = []
    for (var did of allDidsInside(claim)) {
      netRecords.push(addCanSee(did, issuerDid))
    }
    await Promise.all(netRecords)
      .catch(err => {
        return Promise.reject(err)
      })

  }

  // return Promise of at least { payload, header, issuer }
  // ... and also if successfully verified: data, doc, signature, signer
  async decodeAndVerifyJwt(jwt) {
    if (process.env.NODE_ENV === 'test-local') {
      // Error of "Cannot read property 'toString' of undefined" usually means the JWT is malformed, eg. no "." separators.
      let payload = JSON.parse(base64url.decode(R.split('.', jwt)[1]))
      let nowEpoch =  Math.floor(new Date().getTime() / 1000)
      if (payload.exp < nowEpoch) {
        l.warn("JWT with exp " + payload.exp + " has expired but we're in test mode so using a new time." )
        payload.exp = nowEpoch + 100
      }
      return {payload, issuer: payload.iss, header: {typ: "test"}} // all the other elements will be undefined, obviously
    } else {

      try {
        let verified = await didJwt.verifyJWT(jwt, { resolver })
        return verified

      } catch (e) {
        return Promise.reject({
          clientError: { message: `JWT failed verification: ` + e.toString(),
                         code: ERROR_CODES.JWT_VERIFY_FAILED }
        })
      }
    }
  }

  async createWithClaimRecord(jwtEncoded, authIssuerId) {
    l.trace(`${this.constructor.name}.createWithClaimRecord(ENCODED)`);
    l.trace(jwtEncoded, `${this.constructor.name} ENCODED`)

    // available: { didResolutionResult w/ didDocument, issuer, payload, policies, signer, verified }
    const { payload } =
        await this.decodeAndVerifyJwt(jwtEncoded)
        .catch((err) => {
          return Promise.reject(err)
        })

    if (authIssuerId && payload.iss !== authIssuerId) {
      return Promise.reject(`JWT issuer ${authIssuerId} does not match claim issuer ${payload.iss}`)
    }

    const registered = await db.registrationByDid(payload.iss)
    if (!registered) {
      return Promise.reject({ clientError: { message: `You are not registered to make claims. Contact an existing user for help.`, code: ERROR_CODES.UNREGISTERED_USER }})
    }

    const startOfWeekDate = DateTime.utc().startOf('week') // luxon weeks start on Mondays
    const startOfWeekString = startOfWeekDate.toISO()
    const claimedCount = await db.jwtCountByAfter(payload.iss, startOfWeekString)
    // 0 shouldn't mean DEFAULT
    const maxAllowedClaims = registered.maxClaims != null ? registered.maxClaims : DEFAULT_MAX_CLAIMS_PER_WEEK
    if (claimedCount >= maxAllowedClaims) {
      return Promise.reject({ clientError: { message: `You have already made ${maxAllowedClaims} claims this week. Contact an administrator for a higher limit.`, code: ERROR_CODES.OVER_CLAIM_LIMIT } })
    }

    const payloadClaim = this.extractClaim(payload)
    if (payloadClaim) {
      if (isEndorserRegistrationClaim(payloadClaim)) {
        const startOfMonthDate = DateTime.utc().startOf('month')
        const startOfMonthEpoch = Math.floor(startOfMonthDate.valueOf() / 1000)
        const regCount = await db.registrationCountByAfter(payload.iss, startOfMonthEpoch)
        // 0 shouldn't mean DEFAULT
        const maxAllowedRegs = registered.maxRegs != null ? registered.maxRegs : DEFAULT_MAX_REGISTRATIONS_PER_MONTH
        if (regCount >= maxAllowedRegs) {
          return Promise.reject({ clientError: { message: `You have already registered ${maxAllowedRegs} this month. Contact an administrator for a higher limit.`, code: ERROR_CODES.OVER_REGISTRATION_LIMIT } })
        }

        // disallow registering others in the same week they got registered
        const startOfWeekEpoch = Math.floor(startOfWeekDate.valueOf() / 1000)
        if (registered.epoch > startOfWeekEpoch) {
          return Promise.reject({ clientError: { message: `You cannot register others the same week you got registered.`, code: ERROR_CODES.CANNOT_REGISTER_TOO_SOON } })
        }
      }

      const claimStr = canonicalize(payloadClaim)
      const claimEncoded = base64url.encode(claimStr)
      const jwtEntity = db.buildJwtEntity(payload, payloadClaim, claimStr, claimEncoded, jwtEncoded)
      const jwtRowId =
          await db.jwtInsert(jwtEntity)
          .catch((err) => {
            return Promise.reject(err)
          })

      //l.trace(doc, `${this.constructor.name} resolved doc`)
      //l.trace(authenticators, `${this.constructor.name} resolved authenticators`)
      //l.trace(issuer, `${this.constructor.name} resolved issuer`)

      const issuerDid = payload.iss

      // this is the same as the doc.publicKey in my example
      //const signer = VerifierAlgorithm(header.alg)(data, signature, authenticators)

      await this.createEmbeddedClaimRecords(jwtEntity.id, issuerDid, payloadClaim)
        .catch(err => {
          l.warn(err, `Failed to create embedded claim records.`)
        })

      // when adjusting this to an object with "success", include any failures from createEmbeddedClaimRecords
      return jwtEntity.id

    } else {
      l.warn(`${this.constructor.name} JWT received without a claim.`)
      return Promise.reject("JWT had no 'claim' property.")
    }
  }

}

export default new JwtService();

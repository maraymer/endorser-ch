# endorser-ch

A server for recording assertions and then querying about them in privacy-preserving ways



This repo is an API for creating and querying claims.  For a full system, use the mobile app linked at [the public endorser-ch server](https://endorser.ch); there's [a test server](https://test.endorser.ch:8000). (The old approach is with the uPort app and [this web app repo](https://github.com/trentlarson/uport-demo).)





## Get Started

Get started developing.

Works with node v14

```shell
# install dependencies
npm ci

# set up the environment
cp .env.local .env

# setup/migrate DB
NODE_ENV=dev DBUSER=sa DBPASS=sasa npm run flyway migrate
# note that it fails if you don't run `npm ci`; `npm install` isn't enough (Ug!)

# run in development mode
NODE_ENV=dev npm run dev

# to add claims: add initial DID, used to register other DIDs via VCs -- replace YOUR_DID
echo "INSERT INTO registration (did) VALUES ('YOUR_DID');" | sqlite3 ../endorser-ch-dev.sqlite3

```



## Sample Data

See 'Test It' below, then after running it: `cp ../endorser-ch-test-local.sqlite3 ../endorser-ch-dev.sqlite3`
... and you'll have a set of data in the DB which you can query.



## Run It
#### Run in *development* mode:
Runs the application is development mode. Should not be used in production

```shell
npm run dev
```

or debug it

```shell
npm run dev:debug
```

#### Run on Docker:

Create a `dotenv` file (or just link to `.env.local`).

`ENDORSER_VERSION=release-1.1.35`
`docker build -t endorser-ch:$ENDORSER_VERSION --build-arg ENDORSER_VERSION .`
`docker run -d -p 3001:3000 -v /Users/trent/dev/home/endorser-ch-db:/mnt/database --name endorser-ch --env-file dotenv -e APP_DB_FILE=/mnt/database/endorser-ch-dev.sqlite3 -e NODE_ENV=dev endorser-ch:$ENDORSER_VERSION`


#### Run in *production* mode:

The following compiles the application and starts it in production mode.

If you move/remove the previous install, you'll need to copy the .env file to new endorser-ch dir.

Tag the release version (after updating the package.json version).

```shell
# SSH to the box and kill the "node dist/index.js".
# ... and may have to kill nodemon & pino-pretty processes separately
# On local:
# - update package.json
# - tag in GitHub
git pull
scripts/deploy.sh ubuntutest release-X ~/.ssh/id_rsa
# On remote:
cd endorser-ch
NODE_ENV=prod nohup npm start >> ../endorser-ch.out 2>&1 &
```

When installing on a different server, you may want to edit the .env SERVICE_ID with the value people should supply in the object field of RegisterAction.





## Test It

You can use the test server at: [https://test.endorser.ch:8000/api-explorer](https://test.endorser.ch:8000/api-explorer)

Run the Mocha unit tests

```shell
./test/test.sh
```

or debug them

```shell
./test/test.sh :debug
```

You can also run the server in offline test mode by setting environment variable
`NODE_ENV=test-local` and then it will accept all JWTs and it won't do any real
JWT validity checking, including expiration. (This may be changed when I figure
out how to validate JWTs without being online.) This is accomplished by the
`process.env.NODE_ENV === 'test-local'` code currently only found in
server/api/services/jwt.service.js


## Try It

For the full experience, use [the mobile app](https://github.com/trentlarson/endorser-mobile) or [this customized uPort demo](https://github.com/trentlarson/uport-demo) to connect to it.

Settings:

- `APP_DB_FILE` is used to select the DB file (see conf/flyway.js)
- `NODE_ENV` is used to determine the DB file if `APP_DB_FILE` is not set (see conf/flyway.js)

Steps:

* Open your browser to [http://localhost:3000](http://localhost:3000)
* That includes a link to API docs at [http://localhost:3000/api-explorer](http://localhost:3000/api-explorer)

Let's create some claims.  First, a claim of attendance.  Here's the object structure:

```
{
  "@context": "http://schema.org",
  "@type": "JoinAction",
  "agent": { "did": "did:ethr:0xdf0d8e5fd234086f6649f77bb0059de1aebd143e" },
  "event": {
    "organizer": { "name": "Bountiful Voluntaryist Community" },
    "name": "Saturday Morning Meeting",
    "startTime": "2018-12-29T08:00:00.000-07:00"
  }
}
```
... and base 64 encoded: `eyJAY29udGV4dCI6Imh0dHA6Ly9zY2hlbWEub3JnIiwiQHR5cGUiOiJKb2luQWN0aW9uIiwiYWdlbnQiOnsiZGlkIjoiZGlkOmV0aHI6MHhkZjBkOGU1ZmQyMzQwODZmNjY0OWY3N2JiMDA1OWRlMWFlYmQxNDNlIn0sImV2ZW50Ijp7Im9yZ2FuaXplciI6eyJuYW1lIjoiQm91bnRpZnVsIFZvbHVudGFyeWlzdCBDb21tdW5pdHkifSwibmFtZSI6IlNhdHVyZGF5IE1vcm5pbmcgTWVldGluZyIsInN0YXJ0VGltZSI6IjIwMTgtMTItMjlUMDg6MDA6MDAuMDAwLTA3OjAwIn19`

Now for a confirmation of that activity:

```
{
  "@context": "http://endorser.ch",
  "@type": "Confirmation",
  "claimEncoded": "eyJAY29udGV4dCI6Imh0dHA6Ly9zY2hlbWEub3JnIiwiQHR5cGUiOiJKb2luQWN0aW9uIiwiYWdlbnQiOnsiZGlkIjoiZGlkOmV0aHI6MHhkZjBkOGU1ZmQyMzQwODZmNjY0OWY3N2JiMDA1OWRlMWFlYmQxNDNlIn0sImV2ZW50Ijp7Im9yZ2FuaXplciI6eyJuYW1lIjoiQm91bnRpZnVsIFZvbHVudGFyeWlzdCBDb21tdW5pdHkifSwibmFtZSI6IlNhdHVyZGF5IE1vcm5pbmcgTWVldGluZyIsInN0YXJ0VGltZSI6IjIwMTgtMTItMjlUMDg6MDA6MDAuMDAwLTA3OjAwIn19"
}
```


```shell


#### Generate JWTs

# Setup:
# - Run `npm install` in this project.
# - Get the endorser-mobile project, run `yarn` there, and run the following in a shell inside there.
# Note that this command may fail with a `hunk` message, but it's worth continuing because the rest may work.
npx yarn-add-no-save esm typescript ts-node tslib @types/node
# Note that, if the following fails, you can try setting `isolatedModules` to false in tsconfig.json
npx ts-node
# Then run the following in that node REPL:
import * as utility from './src/utility/utility' // require does not work
const testUtil = require('../endorser-ch/test/util') // import does not work

# One approach:
await testUtil.credentials[0].signJWT({a:1})

# Another approach:
import didJwt from 'did-jwt'
const cred = testUtil.creds[0]
const signer = didJwt.SimpleSigner(cred.privateKey)
const uportTokenPayload = { exp: 1, iat: 0, iss: cred.did }
await didJwt.createJWT({a:1}, { issuer: cred.did, signer })

# Another approach (untried): create identifier and use utility.accessToken method

# Now you can put that jwt value into a JWT env var make a call as user #0.
curl -H "Uport-Push-Token: $JWT" -H "Content-Type: application/json" https://test.endorser.ch:8000/api/claims



#### Extensive, old tests

# These JWTs are old so they'll require running in "test-local" mode.
export UPORT_PUSH_TOKEN=eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NkstUiJ9.eyJpYXQiOjE1NjAyMTI0MTMsImV4cCI6MTU2MDI5ODgxMywiaXNzIjoiZGlkOmV0aHI6MHgwMGM5YzIzMjZjNzNmNzMzODBlODQwMmIwMWRlOWRlZmNmZjJiMDY0In0.mUydq67R-gzz7c6iQBd06uKu2OEO32vqFbMWTxK3k5VUcDwFQR9XEj28KflBMmohm72nlITd_0kK0zIYSGaDwgA
curl http://localhost:3000/api/claim -H "Uport-Push-Token: $UPORT_PUSH_TOKEN"
# action claim
curl http://localhost:3000/api/claim -H "Content-Type: application/json" -d '{"jwtEncoded": "eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NksifQ.eyJpYXQiOjE1NzQxMzcwMDAsInN1YiI6ImRpZDpldGhyOjB4MDBjOWMyMzI2YzczZjczMzgwZTg0MDJiMDFkZTlkZWZjZmYyYjA2NCIsImNsYWltIjp7IkBjb250ZXh0IjoiaHR0cDovL3NjaGVtYS5vcmciLCJAdHlwZSI6IkpvaW5BY3Rpb24iLCJhZ2VudCI6eyJkaWQiOiJkaWQ6ZXRocjoweDAwYzljMjMyNmM3M2Y3MzM4MGU4NDAyYjAxZGU5ZGVmY2ZmMmIwNjQifSwiZXZlbnQiOnsib3JnYW5pemVyIjp7Im5hbWUiOiJCb3VudGlmdWwgVm9sdW50YXJ5aXN0IENvbW11bml0eSJ9LCJuYW1lIjoiU2F0dXJkYXkgTW9ybmluZyBNZWV0aW5nIiwic3RhcnRUaW1lIjoiMjAxOC0xMi0yOVQwODowMDowMC4wMDAtMDc6MDAifX0sImlzcyI6ImRpZDpldGhyOjB4MDBjOWMyMzI2YzczZjczMzgwZTg0MDJiMDFkZTlkZWZjZmYyYjA2NCJ9.juVv789ByzMRt7ny29TaG2jxSQ74hRjEbtbCw3XziRLCBOnHYr55puFSn24rEjPTe8QjfGy6OXptvkVdrqQfHg"}' -H "Uport-Push-Token: $UPORT_PUSH_TOKEN"
curl http://localhost:3000/api/claim/1 -H "Uport-Push-Token: $UPORT_PUSH_TOKEN"
curl http://localhost:3000/api/action/1 -H 'Uport-Push-Token: eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NkstUiJ9.eyJpYXQiOjE1NTU4MDc0MTYsImV4cCI6MTU1NzEwMzQxNiwiYXVkIjoiZGlkOmV0aHI6MHg2MWU3YmFlNzM5NDZjZGY4ZWUyZWE3ZWE4ZmQzYWZjZGVlOTcxMjBhIiwidHlwZSI6Im5vdGlmaWNhdGlvbnMiLCJ2YWx1ZSI6ImFybjphd3M6c25zOnVzLXdlc3QtMjoxMTMxOTYyMTY1NTg6ZW5kcG9pbnQvR0NNL3VQb3J0L2I3ODJkNGEzLWYwYzMtM2I1OS1hMjk3LTY4ZTlmYmViYWQyOSIsImlzcyI6ImRpZDpldGhyOjB4ZGYwZDhlNWZkMjM0MDg2ZjY2NDlmNzdiYjAwNTlkZTFhZWJkMTQzZSJ9.7GnYLHHO8gT3ApW-c3pa0FH1Yj15xDB_UJmzpiHNvqpmxMZo_CnHYxyg9R-I71CZqfiO_7X7IXhj-oCI9jzmWwE' -H "Uport-Push-Token: $UPORT_PUSH_TOKEN"
curl 'http://localhost:3000/api/claim?claimContents=Bountiful' -H "Uport-Push-Token: $UPORT_PUSH_TOKEN"
# confirmation
curl http://localhost:3000/api/claim -H "Content-Type: application/json" -d '{"jwtEncoded": "eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NksifQ.eyJpYXQiOjE1NzQxMzcwMDAsInN1YiI6ImRpZDpldGhyOjB4MDBjOWMyMzI2YzczZjczMzgwZTg0MDJiMDFkZTlkZWZjZmYyYjA2NCIsImNsYWltIjp7IkBjb250ZXh0IjoiaHR0cDovL2VuZG9yc2VyLmNoIiwiQHR5cGUiOiJDb25maXJtYXRpb24iLCJvcmlnaW5hbENsYWltIjp7IkBjb250ZXh0IjoiaHR0cDovL3NjaGVtYS5vcmciLCJAdHlwZSI6IkpvaW5BY3Rpb24iLCJhZ2VudCI6eyJkaWQiOiJkaWQ6ZXRocjoweGRmMGQ4ZTVmZDIzNDA4NmY2NjQ5Zjc3YmIwMDU5ZGUxYWViZDE0M2UifSwiZXZlbnQiOnsib3JnYW5pemVyIjp7Im5hbWUiOiJCb3VudGlmdWwgVm9sdW50YXJ5aXN0IENvbW11bml0eSJ9LCJuYW1lIjoiU2F0dXJkYXkgTW9ybmluZyBNZWV0aW5nIiwic3RhcnRUaW1lIjoiMjAxOC0xMi0yOVQwODowMDowMC4wMDAtMDc6MDAifX19LCJpc3MiOiJkaWQ6ZXRocjoweDAwYzljMjMyNmM3M2Y3MzM4MGU4NDAyYjAxZGU5ZGVmY2ZmMmIwNjQifQ.l5EXnyKXkoghFxloNA_2Nu2scIq75qw11BVtCyMSbhIkz4lm1IL02i_demSUoCUJgCMRUdkKmy3RIsHBMUn-IQ"}' -H "Uport-Push-Token: $UPORT_PUSH_TOKEN"
curl 'http://localhost:3000/api/claim?claimType=JoinAction' -H "Uport-Push-Token: $UPORT_PUSH_TOKEN"
curl http://localhost:3000/api/action/1 -H "Uport-Push-Token: $UPORT_PUSH_TOKEN"
curl http://localhost:3000/api/event/1 -H "Uport-Push-Token: $UPORT_PUSH_TOKEN"
curl http://localhost:3000/api/event/1/actionClaimsAndConfirmations -H "Uport-Push-Token: $UPORT_PUSH_TOKEN"
curl 'http://localhost:3000/api/report/actionClaimsAndConfirmationsSince?dateTime=2018-12-29T08:00:00.000-07:00' -H "Uport-Push-Token: $UPORT_PUSH_TOKEN"
curl 'http://localhost:3000/util/objectWithKeysSorted?object=\{"b":\[5,1,2,3,\{"bc":3,"bb":2,"ba":1\}\],"a":4\}'
curl 'http://localhost:3000/api/action?eventStartTime=2018-12-29T08:00:00.000-07:00' -H "Uport-Push-Token: $UPORT_PUSH_TOKEN"
# tenure
curl http://localhost:3000/api/claim -H "Content-Type: application/json" -d '{"jwtEncoded": "eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NksifQ.eyJpYXQiOjE1NzQxMzcwMDAsInN1YiI6ImRpZDpldGhyOjB4MDBjOWMyMzI2YzczZjczMzgwZTg0MDJiMDFkZTlkZWZjZmYyYjA2NCIsImNsYWltIjp7IkBjb250ZXh0IjoiaHR0cDovL2VuZG9yc2VyLmNoIiwiQHR5cGUiOiJUZW51cmUiLCJzcGF0aWFsVW5pdCI6eyJnZW8iOnsiQHR5cGUiOiJHZW9TaGFwZSIsInBvbHlnb24iOiI0MC44ODM5NDQsLTExMS44ODQ3ODcgNDAuODg0MDg4LC0xMTEuODg0Nzg3IDQwLjg4NDA4OCwtMTExLjg4NDUxNSA0MC44ODM5NDQsLTExMS44ODQ1MTUgNDAuODgzOTQ0LC0xMTEuODg0Nzg3In19LCJwYXJ0eSI6eyJkaWQiOiJkaWQ6ZXRocjoweGRmMGQ4ZTVmZDIzNDA4NmY2NjQ5Zjc3YmIwMDU5ZGUxYWViZDE0M2UifX0sImlzcyI6ImRpZDpldGhyOjB4MDBjOWMyMzI2YzczZjczMzgwZTg0MDJiMDFkZTlkZWZjZmYyYjA2NCJ9.BfhZevLwMi48ATRvfZeJeDicbjIiruMIjBVXP__wQP-Ir8TtAf8fFC0iTDW4b6zTyZgk-YH1X781uIO4TsfBag"}' -H "Uport-Push-Token: $UPORT_PUSH_TOKEN"
curl http://localhost:3000/api/tenure/1 -H "Uport-Push-Token: $UPORT_PUSH_TOKEN"
curl 'http://localhost:3000/api/report/tenureClaimsAtPoint?lat=40.883944&lon=-111.884787' -H "Uport-Push-Token: $UPORT_PUSH_TOKEN"
curl 'http://localhost:3000/api/report/tenureClaimsAndConfirmationsAtPoint?lat=40.883944&lon=-111.884787' -H "Uport-Push-Token: $UPORT_PUSH_TOKEN" | json_pp
curl -X POST http://localhost:3000/api/claim/makeMeGloballyVisible -H "Content-Type: application/json" -H "Uport-Push-Token: $UPORT_PUSH_TOKEN" -d '{"url":"http://IgniteCommunity.org"}'

# clean out and recreate DB
rm ../endorser-ch-dev.sqlite3
NODE_ENV=dev DBUSER=sa DBPASS=sasa npm run flyway migrate
```





## Kudos

Project initialized with https://github.com/cdimascio/generator-express-no-stress

## Related Work

- [Sovrin AKA Hyperledger Indy](https://sovrin.org)
  - [Verifiable Organizations Network](https://vonx.io) who showed [a mobile demo at IIW 28](https://iiw.vonx.io).
- [Accredible](https://www.accredible.com/) and their [verification system](https://verify.accredible.com) which [uses Tierion](https://help.accredible.com/hc/en-us/articles/115005058985-Manually-Verifying-Blockchain-Records)
- [Blockcerts for blockchain credentials](https://www.blockcerts.org)
- [Open Badges spec] (https://www.imsglobal.org/sites/default/files/Badges/OBv2p0Final/index.html)

## Troubleshooting

- When the API disallows and says a user "has already claimed" or "has already registered" their maximum for the week, you can up their limit in the database registration table (or increase the DEFAULT_MAX settings at the top of jwt.service.js if they haven't been set explicitly).

- Runs on node v12 & v14, at least as of Feb 2022. (We recommend using nvm to manage node versions.)

- Repeated sign-in (because it doesn't remember you): After sign-in, see what browser it uses after you log in from uPort, and use that from now on to start the flow.  (On some Android phones, we've noticed that it's hard to tell which browser that is because the app shows endorser.ch inside a uPort window; we eventually found it was Duck-Duck-Go... so try all the possible browsers, and watch closely as it jumps to the browser to see if there's any indication.)

- "CORS problems": is endorser-ch running?

- "Please make sure to have at least one network": check that your .env has set a value for INFURA_PROJECT_ID (see .env setup above)

- "Unsupported DID method 'ethr'": dependencies? see https://github.com/trentlarson/endorser-ch/commit/a836946c1b1897000dbe7e6d610df32aa32742ba

- "Converting circular structure to JSON": network connected?

- This:
```
../fsevents.cc:85:58: error: expected ';' after top level declarator
void FSEvents::Initialize(v8::Handle<v8::Object> exports) {
                                                         ^
                                                         ;
23 warnings and 9 errors generated.
make: *** [Release/obj.target/fse/fsevents.o] Error 1
gyp ERR! build error
gyp ERR! stack Error: `make` failed with exit code: 2
...
node-pre-gyp ERR! build error
node-pre-gyp ERR! stack Error: Failed to execute '/Users/tlarson/.nvm/versions/node/v12.13.1/bin/node /Users/tlarson/.nvm/versions/node/v12.13.1/lib/node_modules/npm/node_modules/node-gyp/bin/node-gyp.js ...
...
npm ERR! sqlite3@4.0.4 install: `node-pre-gyp install --fallback-to-build`
npm ERR! Exit status 1
...
```
... probably means you're running a different version of node.  Prod is on node v10.15.0 and npm 6.4.1

- This:
```
> endorser-ch@1.1.23 flyway /Users/tlarson/dev/home/endorser-ch
> flyway -c conf/flyway.js "migrate"

flyway-8.5.10/jre/lib/server/libjvm.dylib: truncated gzip input
tar: Error exit delayed from previous errors.
(node:12554) UnhandledPromiseRejectionWarning: Error: Error: Untaring file failed 1
    at /Users/tlarson/dev/home/endorser-ch/node_modules/node-flywaydb/bin/flyway.js:76:19
    at processTicksAndRejections (internal/process/task_queues.js:93:5)
(node:12554) UnhandledPromiseRejectionWarning: Unhandled promise rejection. This error originated either by throwing inside of an async function without a catch block, or by rejecting a promise which was not handled with .catch(). (rejection id: 1)
(node:12554) [DEP0018] DeprecationWarning: Unhandled promise rejections are deprecated. In the future, promise rejections that are not handled will terminate the Node.js process with a non-zero exit code.
```
... may require removal of node_modules and reinstall.



## Tests

- Make sure API works: http://localhost:3000/api-explorer
- test/test.sh
- test these :3001 URLs by running [the web app](https://github.com/trentlarson/uport-demo)
http://localhost:3001/reportClaim?claimId=1
... and see confirmations eventually (even if they're HIDDEN which causes console errors)
http://localhost:3001/reportClaims
... to see a list of claims
http://localhost:3001/reportConfirms
... plus push a button and see results
http://localhost:3001/signClaim?claim=%7B%22%40context%22%3A%22http%3A%2F%2Fendorser.ch%22%2C%22%40type%22%3A%22Confirmation%22%2C%22originalClaims%22%3A%5B%7B%22%40context%22%3A%22http%3A%2F%2Fschema.org%22%2C%22%40type%22%3A%22JoinAction%22%2C%22agent%22%3A%7B%22did%22%3A%22did%3Aethr%3Asomeone%22%7D%2C%22event%22%3A%7B%22organizer%22%3A%7B%22name%22%3A%22Bountiful%20Voluntaryist%20Community%22%7D%2C%22name%22%3A%22Saturday%20Morning%20Meeting%22%2C%22startTime%22%3A%222020-01-25T08%3A00%3A00.000-07%3A00%22%7D%7D%2C%7B%22%40context%22%3A%22http%3A%2F%2Fschema.org%22%2C%22%40type%22%3A%22JoinAction%22%2C%22agent%22%3A%7B%22did%22%3A%22did%3Aethr%3Asomeone-else%22%7D%2C%22event%22%3A%7B%22organizer%22%3A%7B%22name%22%3A%22Bountiful%20Voluntaryist%20Community%22%7D%2C%22name%22%3A%22Saturday%20Morning%20Meeting%22%2C%22startTime%22%3A%222020-01-25T08%3A00%3A00.000-07%3A00%22%7D%7D%2C%7B%22%40context%22%3A%22http%3A%2F%2Fschema.org%22%2C%22%40type%22%3A%22JoinAction%22%2C%22agent%22%3A%7B%22did%22%3A%22did%3Aethr%3Asomeone-else-else%22%7D%2C%22event%22%3A%7B%22organizer%22%3A%7B%22name%22%3A%22Bountiful%20Voluntaryist%20Community%22%7D%2C%22name%22%3A%22Saturday%20Morning%20Meeting%22%2C%22startTime%22%3A%222020-01-25T08%3A00%3A00.000-07%3A00%22%7D%7D%2C%7B%22%40context%22%3A%22http%3A%2F%2Fschema.org%22%2C%22%40type%22%3A%22JoinAction%22%2C%22agent%22%3A%7B%22did%22%3A%22did%3Aethr%3Asomeone-elsest%22%7D%2C%22event%22%3A%7B%22organizer%22%3A%7B%22name%22%3A%22Bountiful%20Voluntaryist%20Community%22%7D%2C%22name%22%3A%22Saturday%20Morning%20Meeting%22%2C%22startTime%22%3A%222020-01-25T08%3A00%3A00.000-07%3A00%22%7D%7D%2C%7B%22%40context%22%3A%22http%3A%2F%2Fschema.org%22%2C%22%40type%22%3A%22JoinAction%22%2C%22agent%22%3A%7B%22did%22%3A%22did%3Aethr%3AElsa's-sister%22%7D%2C%22event%22%3A%7B%22organizer%22%3A%7B%22name%22%3A%22Bountiful%20Voluntaryist%20Community%22%7D%2C%22name%22%3A%22Saturday%20Morning%20Meeting%22%2C%22startTime%22%3A%222020-01-25T08%3A00%3A00.000-07%3A00%22%7D%7D%5D%7D
... gives 5 confirmations
... and then go to a place not logged in
http://localhost:3001/reportBestAttendance
... and see all hidden
... then test the following user story if you have time

User stories:

- in endorser-ch
  - run test/test.sh (can quit after first set of tests for a quick, non-network validation)
  - run: NODE_ENV=test-local npm run dev

- in uport-demo
  - change to TEST_USER_NUM = 11 (Annabelle's Friend) in src/utilities/claimsTest.js

  - run: `npm run start`

  - show attendance results
    - on Best Attendance screen
      http://localhost:3001/reportBestAttendance
      and see all DIDs are hidden except public 22c

  - show search results for skills
    http://localhost:3001/reportSearch
    - search for "carpentry" and see all DIDs are hidden
    - run in endorser-ch: npm run set-3-visible
    - search for "carpentry" and see 332 DIDs are shown and some are transitive, eg. in identifierVisibleToDids

  - show eligibility results
    - on search screen Call Endpoint with:
      /api/report/actionClaimsAndConfirmationsSince?dateTime=2018-01-01T00:00:00Z
    - processed to see confirmations
      searchResults.map((obj) => {return {did: obj.did, numActions: obj.actions.length, numConfirms: R.sum(obj.actions.map((a)=>a.confirmations.length))}})
      ... and see 3 confirmations, two hidden and one 22c public

  - show voting results
    - see votes on search screen Call Endpoint with:
      /api/report/orgRoleClaimsAndConfirmationsOnDate?orgName=Cottonwood Cryptography Club&roleName=President&onDate=2019-06-18
    - processed to see votes
      R.map(o=>{return {did:o.did, roles:R.map(role=>{return {votes:role.confirmations.length, roleName:role.orgRole.roleName}})(o.orgRoles)}})(searchResults)
      ... and 2 results, three for hidden and two for 332

  - show tenure results and links to find people
    - go to Residence Report
      http://localhost:3001/reportResidences
    - see duplicate tenure claims, one hidden
    - change to TEST_USER_NUM = -1 (Trent) in src/utilities/claimsTest.js
    - in tenure claim, see a different user hidden
    - confirm something about Annabelle did:ethr:0xaaa29f09c29fb0666b8302b64871d7029032b479
      ... and see claim with ID 32 saved http://localhost:3001/claim?claimId=32
    - change to TEST_USER_NUM = 11 (Annabelle's Friend) in src/utilities/claimsTest.js
    - in tenure claim, go to see how there's now a reachable path to find out the other owner

- to do: show strong network; show networks with personal connection vs public DID; show fake network




## Metrics

```
mkdir metrics
cd metrics
yarn add @veramo/did-jwt bent ramda
node

const OWNER_DID = 'OWNER_DID'
const OWNER_PRIVATE_KEY_HEX = 'OWNER_PRIVATE_KEY_HEX'
const SERVER = 'http://localhost:3000'
const bent = require('bent')
const didJwt = require('did-jwt')
// return { data: [...], maybeMoreAfter: 'ID' }
const count = async (moreAfter) => {
  const nowEpoch = Math.floor(Date.now() / 1000)
  const endEpoch = nowEpoch + 60
  const tokenPayload = { exp: endEpoch, iat: nowEpoch, iss: OWNER_DID }
  const signer = didJwt.SimpleSigner(OWNER_PRIVATE_KEY_HEX)
  const accessJwt = await didJwt.createJWT(tokenPayload, { issuer: OWNER_DID, signer })
  const options = {
    "Content-Type": "application/json",
    "Uport-Push-Token": accessJwt
  }
  const getJson = bent('json', options)
  return getJson(SERVER + '/api/reportAll/claims?afterId=' + moreAfter)
}
const R = require('ramda')
const all = async () => {
  let total = []
  let moreAfter = '0'
  do {
    const result = await count(moreAfter)
    total = R.concat(total, result.data)
    moreAfter = result.maybeMoreAfter
    console.log(total.length, '...')
  } while (moreAfter)
  console.log('Grand total:', total.length)
  const totalSum = R.map(i => R.set(R.lensProp('month'), i.issuedAt.substring(0, 7), i), total)
  const grouped = R.groupBy(i => i.month, totalSum)
  const table = R.map(i => i.length, grouped)
  console.log('Grouped:', JSON.stringify(table, null, 2))
  return total
}
all()
```




## Tasks

See [tasks.yml](tasks.yml).




## Misc




This is licensed as public domain software, but I sure would enjoy a note if you get people using it.




Note that new deployments can remove the code for: "legacy Confirmation", "legacy context"




Here's a way to verify a JWT signature.
- Go to an empty directory (where you'll install and run code)
```
yarn add did-jwt@4.0.0 ethr-did-resolver@3.0.0
node

const infuraProjectId = '...' // get one at infura.io
const didJWT = require('did-jwt')
const Resolver = require('did-resolver').Resolver
const ethrDid = require('ethr-did-resolver').getResolver({rpcUrl: 'https://mainnet.infura.io/v3/' + infuraProjectId})
let resolver = new Resolver(ethrDid)
let result;
async function verify(jwt) {
  result = await didJWT.verifyJWT(jwt, {resolver: resolver})
  console.log("Result of 'verify':\n", result, '\n... and doc\n', result.doc);
}
```
- Finally, enter this with your JWT string: `verify("PASTE JWT HERE")`
- If you see `Signature invalid for JWT`, you're being tricked.  Otherwise, it checks out.
  - If you see some other error (eg. "expired"), that's OK... it still passed the signature check, as long as it gets past this line: https://github.com/decentralized-identity/did-jwt/blob/v4.0.0/src/JWT.ts#L231



Open questions:
- Should we require top-level @context and @type (where multiple become ItemList)?
- How do I find the app address or ID? 0xa55...40b, from phone to IP: 0x669...e8a then 0x1b2...2e6
- What is the strange "notifications" JWT from 2020-01-26 21:59:50.106 ?
- Why does the did-jwt verifyJWT throw: Error: Signature invalid for JWT
  ... on this content:

```
{
  '@context': '123456789012345678',
  '@type': '123456789012',
  originalClaims: [
    {
      '@context': '12345678901234567',
      '@type': '1234567890',
      agent: {
        did: '123456789012345678901234567890123456789012345678901'
      },
      event: {
        organizer: {
          name: '12345678901234567890123456789012'
        },
        name: '123456789012345678901234',
        startTime: '12345678901234567890123456789'
      }
    }
  ]
}
```

  ... but if you add or remove a character anywhere then it validates just fine?
  (Note that I tried another 340-character string and its signature verified OK.)
  If we fix this, we can fix some hacks in SignClaim (look for "milliseconds").


References

- uport-connect classes https://github.com/uport-project/uport-connect/blob/develop/docs/reference/index.md#Connect+requestDisclosure

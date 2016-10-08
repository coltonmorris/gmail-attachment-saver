var fs = require('fs');
var readline = require('readline');
var google = require('googleapis');
var googleAuth = require('google-auth-library');
let Promise = require('bluebird')
let mime = require('mime')
let urlsafe_base64 = require('urlsafe-base64')

// If modifying these scopes, delete your previously saved credentials
// at ~/.credentials/gmail-nodejs-quickstart.json
var SCOPES = ['https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/drive.metadata.readonly'];
var TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH ||
    process.env.USERPROFILE) + '/.credentials/';
var TOKEN_PATH = TOKEN_DIR + 'gmail-nodejs-quickstart.json';

// Load client secrets from a local file.
fs.readFile('client_secret.json', function processClientSecrets(err, content) {
  if (err) {
    console.log('Error loading client secret file: ' + err);
    return;
  }
  // Authorize a client with the loaded credentials, then call the
  // Gmail API.
  authorize(JSON.parse(content), listLabels);
});

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 *
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
  var clientSecret = credentials.installed.client_secret;
  var clientId = credentials.installed.client_id;
  var redirectUrl = credentials.installed.redirect_uris[0];
  var auth = new googleAuth();
  var oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, function(err, token) {
    if (err) {
      getNewToken(oauth2Client, callback);
    } else {
      oauth2Client.credentials = JSON.parse(token);
      callback(oauth2Client);
    }
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 *
 * @param {google.auth.OAuth2} oauth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback to call with the authorized
 *     client.
 */
function getNewToken(oauth2Client, callback) {
  var authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES
  });
  console.log('Authorize this app by visiting this url: ', authUrl);
  var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  rl.question('Enter the code from that page here: ', function(code) {
    rl.close();
    oauth2Client.getToken(code, function(err, token) {
      if (err) {
        console.log('Error while trying to retrieve access token', err);
        return;
      }
      oauth2Client.credentials = token;
      storeToken(token);
      callback(oauth2Client);
    });
  });
}

/**
 * Store token to disk be used in later program executions.
 *
 * @param {Object} token The token to store to disk.
 */
function storeToken(token) {
  try {
    fs.mkdirSync(TOKEN_DIR);
  } catch (err) {
    if (err.code != 'EEXIST') {
      throw err;
    }
  }
  fs.writeFile(TOKEN_PATH, JSON.stringify(token));
  console.log('Token stored to ' + TOKEN_PATH);
}

/**
 * Lists the labels in the user's account.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function listLabels(auth) {
  let gmail = google.gmail('v1')
	let service = google.drive('v3')

	//for every message, get all of it's attachments and then create a file
	// mime types are just base64 encoded
	/*
	{ 
		attachmentId:
		id:
		data:
		mimeType:
	}
	*/

	//there are 3000 messages?
	getMessages( auth, 'Label_3', 'has:attachment', 5000 ).then( (result) => {
		//for each message call messages.get
		// save the mime type
		//if it has data already, you're good
		//otherwise, save the data
		Promise.map( result, (mail_obj) => {
			return getMessage( auth, mail_obj.id ).then( (result) => {
				//console.log('payload body:',result.payload.parts[0].body)	
				return Promise.map( result.payload.parts, (part) => {
					part['id'] = mail_obj.id
					return part
				}).then( parts => {
					return parts
				})
			})
		})
		.then( (result) => {
			Promise.map( result, (parts) => {
				Promise.map( parts, (mail_obj) => {
					if (mail_obj.filename && mail_obj.filename.length > 0) {
						console.log(mail_obj.filename)
						return getAttachments(auth, mail_obj.body.attachmentId, mail_obj.id).then( (result) => {
							let data = urlsafe_base64.decode(result.data)
							return saveAttachment(data, result.size, mail_obj.filename, mail_obj.mimeType)
						})
					}
					if ( mail_obj.body.hasOwnProperty('data') ) {
						return saveFile( mail_obj )
					}
					else {
						console.log('ELSE-------------------------------------------ELSE')
						// mail_obj has an attachment or many attachments?
					}
				})
			})
		})
	})
	.catch( (err) => {
		console.log('errrrrror',err)
	})
}

function saveAttachment( data, size, filename, mimeType ) {
	let new_filename = './attachments/' + filename
	return new Promise( (resolve,reject) => {
		fs.writeFile( new_filename, data, 'utf-8', function(err,data) {
			if (err) reject(err)
			resolve(data)
		})
	}).then( results => {
	}).catch( err => {
		console.log('error while writing to attachments directory', err)
	})
}

function saveFile( mail_obj ) {
	//console.log(mail_obj)
	let filename = './files/' + mail_obj.id + '_' + mail_obj.partId + '.' + mime.extension(mail_obj.mimeType)
	return new Promise( (resolve,reject) => {
		fs.writeFile( filename, new Buffer(mail_obj.body.data, 'base64').toString(), 'utf-8', function(err,data) {
			if (err) reject(err)
			resolve(data)
		})
	}).then( results => {
	}).catch( err => {
		console.log('error while writing to file', err)
	})
}

// add to the metadata parents: ['0B8CbySyBhasWVHJMZWVzZzhsTjA']
function uploadFile( auth, data, mimeType, description ) {
	let service = google.drive('v3')
	let metadata = {
		description: description,
		'mimeType': mimeType
	}
	return new Promise( (resolve,reject) => {
		service.files.create({
			auth: auth,
		},function (err,response) {
			if (err) reject(err)
			resolve(response)
		})
	})
}

function getAttachments( auth, id, messageId ){
	let gmail = google.gmail('v1')
	return new Promise( (resolve,reject) => {
		gmail.users.messages.attachments.get({
			auth: auth,
			userId: 'me',
			messageId: messageId,
			id: id
		}, function( err, response ){
			if (err) reject(err)
			resolve(response)
		})
	})
}

function getMessage( auth, id ){
	let gmail = google.gmail('v1')
	return new Promise( (resolve,reject) => {
		gmail.users.messages.get({
			auth:auth, userId:'me', id: id
		}, function (err, response) {
			if (err) reject(err)
			resolve(response)
		})
	})
}
function getMessages( auth, labelIds, q, maxResults ){
	let gmail = google.gmail('v1')
	return new Promise( (resolve,reject) => {
		gmail.users.messages.list({
			auth:auth, userId:'me', labelIds: labelIds, q: q, maxResults: maxResults
		}, function (err, response) {
			if (err) reject(err)
			resolve(response.messages)
		})
	})
}

//				gmail.users.messages.get({
//					auth: auth,
//					userId: 'me',
//					id: obj.id
//				}, function (err, response){
//					if (err) {
//						console.log('couldnt get message: ' + err)
//						return
//					}
//					response.payload.parts.map( obj => {
//						//there will either be a data or attachmentId
//						if ( obj.body.data ){
//							mail_obj['data'].push(obj.body.data)
//							var buf = new Buffer(obj.body.data, 'base64'); // Ta-da
//							console.log('decoding: ',buf.toString())
//							
//						}
//						else {
//							gmail.users.messages.attachments.get({
//								auth: auth,
//								userId: 'me',
//								messageId: mail_obj['id'],
//								id: obj.body.attachmentId
//							}, function (err, response) {
//								mail_obj['data'].push(response.data)
//							})
//						}

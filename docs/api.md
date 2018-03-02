# Decent API Specification 0.1.0

**Terminology**
- [Names](#names)
- [Errors](#errors)
- [Mentions](#mentions)
- [Colors](#colors)

**Communicating with the API**
* [Session IDs](#session-ids)
* [HTTP Endpoints](#http-endpoints)
  - [Settings](#settings)
  - [Properties](#properties)
  - [Emotes](#emotes)
  - [Sessions](#sessions)
  - [Messages](#messages)
  - [Channels](#channels)
  - [Users](#users)
* [WebSocket Events](#websocket-events)

---

# Session IDs
When a request is made to the API, the server searches for a session ID given in the request using:
* `sessionID` in POST body
* `?sessionID` in query string
* `X-Session-ID` header

Endpoints **not** labeled _does not require session_ will [error](#errors) if no session or an invalid session is provided.

Other endpoints may require the session user to posess a particular [permission](#permissions) or set of permissions.

---

# Terminology

## Names
Several parts of the API expect names (`Name`) to be given. These names will eventually be displayed to users, and so must follow a basic guideline for being formatted.

Names are strings, consisting only of alphanumeric characters, underscores (`_`), dots (`.`), and dashes (`-`). Names cannot be `""`. In regex form:

```
Name :: /[a-zA-Z0-9._-]+/
```

**When a name which does not follow these guidelines is given to an endpoint, an INVALID_NAME [error](#errors) will be returned and the request will have no action.**
```

```

## Errors
Nearly all [HTTP endpoints](#http-endpoints) return errors situationally. Generally, when the processing of a request errors, its response will have the `error` property, which will follow the form `{ code, message }`.

The `message` property is a string of a human-readable English message briefly explaining what went wrong, and the `code` is a permanent identifier string for the type of error that happened. Checking `code` is useful for displaying custom messages or behavior when particular errors occur.

The following list describes each possible error code:

- `NOT_FOUND` - For when you try to request a something, but it isn't found (e.g. requesting the user by the name `foobar` when there is no such user).
- `NOT_YOURS` - For when you attempt to do something impactful (e.g. editing/deleting) to a something you aren't the owner/author of.
- `MUST_BE_ADMIN` - For when you try to do something limited to admins, but you are not an admin.
- `ALREADY_PERFORMED` - For when you try to do something, but you have already done that something (e.g. pinning a message you've already pinned).
- `INCOMPLETE_PARAMETERS` - For when a property is missing from a request's parameters. The missing property's name is passed in `error.missing`.
- `INVALID_PARAMETER_TYPE` - For when a property is given in a request's parameters, but is not the right type (e.g. passing a string instead of an array). The invalid property's name is passed in `error.invalidParameter`.
  - Note that this is only for type-checking. Client programs should *never* get this error, regardless of user input. More specific errors, such as `SHORT_PASSWORD`, are responded for issues that might be related to user input.
- `INVALID_SESSION_ID` - For when a session ID is passed, but there is no session with that ID. (This is for general usage where being logged in is required. For `/sessions/:sessionID`, `NOT_FOUND` is returned if there is no session with the given ID.)
- `UPLOAD_FAILED` - For when an upload fails.
- `NAME_ALREADY_TAKEN` - For when you try to create a something, but your passed name is already taken by another something (e.g. registering a username which is already used by someone else).
- `SHORT_PASSWORD` - For when you attempt to register but your password is too short.
- `INCORRECT_PASSWORD` - For when you attempt to log in but you didn't enter the right password. (Note that `NOT_FOUND` is returned if you try to log in with an unused username.)
- `INVALID_NAME` - For when you try to make something (a user or channel, etc) with an invalid name.

## Mentions

Mentions target a single user only and are formatted as `<@userID>`, where `userID` is the ID of the user who is being mentioned. Mentions are stored per-user on the server.

---

# HTTP Endpoints

All endpoints respond in JSON, and those which take POST bodies expect it to be formatted using JSON.

## Retrieve server version [GET /api]
+ does not require session

Returns `{ decentVersion }`. Should be used to check to see if a particular server is compatible with this spec. Note that Decent follows [SemVer](https://semver.org/), so unless the MAJOR (first) portion of the version number is different to what you expect communication should work fine.

```js
GET /api/

<- {
<-   "decentVersion": "0.1.0"
<- }
```

---

## Settings

Model:
```
{
  "name": string
}
```

### Retrieve all settings [GET /api/settings]
+ does not require session

Returns `{ settings }`, where `settings` is an object representing server-specific settings.

```js
GET /api/settings

<- {
<-   "settings": {
<-     "name": "Unnamed Decent chat server"
<-   }
<- }
```

### Modify settings [POST /api/settings]
+ requires [permission](#permissions): MANAGE_SERVER
+ `name` (string; optional)

Returns `{ results }` if successful, where `results` is an object describing the result of each changed setting. Updates settings with new values provided.

```js
POST /api/settings

-> {
->   "name": "My Server"
-> }

<- {
<-   "result": {
<-     "name": "updated"
<-   }
<- }
```

---

## Properties

Properties can only be modified on the command line.

Model:
```js
{
  // If true, always use HTTPS to access the server.
  "useSecure": boolean
}
```

### Retrieve all properties [GET /api/properties]
+ does not require session

Returns `{ properties }`, where `properties` is an object representing server-specific properties.

```js
GET /api/properties

<- {
<-   "properties": {
<-     "useSecure": false
<-   }
<- }
```

---

## Misc

### Upload an image [POST /api/upload-image]
+ requires [permission](#permissions): UPLOAD_IMAGES
+ expects form data (`multipart/form-data`)
  * `image` (gif/jpeg/png) - The image to upload. Max size: 10MB

Returns `{ path }`, where `path` is a relative URL to the uploaded image file.

```js
POST /api/upload-image

-> (form data)

<- {
<-   "path": "/uploads/1234/image.png"
<- }
```

This endpoint may return [an error](#errors), namely UPLOAD_FAILED or UPLOADS_DISABLED.

---

## Emotes

Model:
```js
{
  "shortcode": Name, // Without colons
  "imageURL": string
}
```

Related events:
* [emote/new](#emote-new)
* [emote/delete](#emote-delete)

<a name='list-emotes'></a>
### List emotes [GET /api/emotes]

Returns `{ emotes }`, where `emotes` is an array of emote objects.

```js
GET /api/emotes

<- {
<-   "emotes": []
<- }
```

<a name='new-emote'></a>
### Add a new emote [POST /api/emotes]
+ requires [permission](#permissions): MANAGE_EMOTES
+ `imageURL` (string)
+ `shortcode` (Name) - Should not include colons (`:`).

Returns `{}` if successful. Emits [emote/new](#emote-new).

```js
POST /api/emotes

-> {
->   "imageURL": "https://example.com/path/to/emote.png",
->   "shortcode": "package"
-> }

<- {}
```

<a name='view-emote'></a>
### View an emote [GET /api/emotes/:shortcode]
+ **in-url** shortcode (string)

302 redirects to the `imageURL` of the emote specified. 404s if not found or invalid.

```html
<!-- To view the :package: emoji in HTML: -->
<img src='/api/emotes/package' width='16' height='16'/>
```

<a name='delete-emote'></a>
### Delete an existing emote [DELETE /api/emotes/:shortcode]
+ requires [permission](#permissions): MANAGE_EMOTES
+ **in-url** shortcode (string)

Returns `{}` if successful. Emits [emote/delete](#emote-delete).

```js
DELETE /api/emotes/package

<- {}
```

---

## Sessions

Model:
```js
{
  "id": string,
  "dateCreated": number // Unix time at creation
}
```

<a name='get-sessions'></a>
### Fetch the current user's sessions [GET /api/sessions]
+ requires session

Responds with `{ sessions }`, where `sessions` is an array of [sessions](#sessions) that also represent the user that the provided session represents (the callee; you).

```js
GET /api/sessions

<- {
<-   "sessions": [
<-     {
<-       "id": "12345678-ABCDEFGH",
<-       "dateCreated": 123456789000
<-     }
<-   ]
<- }
```

<a name='login'></a>
### Login [POST /api/sessions]
+ does not require session
+ `username` (string)
+ `password` (string)

Responds with `{ sessionID }` if successful, where `sessionID` is the ID of the newly-created session. Related endpoint: [register](#register).

```js
POST /api/sessions

-> {
->   "username": "admin",
->   "password": "abcdef"
-> }

<- {
<-   "sessionID": "12345678-ABCDEFGH"
<- }
```

### Fetch session details [GET /api/sessions/:id]
+ does not require session (provided in the URL)
+ **in-url** id (string)

Responds with `{ session, user }` upon success, where `session` is a [session](#sessions) and `user` is the [user](#users) this session represents.

```js
GET /api/sessions/12345678-ABCDEFGH

<- {
<-   "session": {
<-     "id": "12345678-ABCDEFGH",
<-     "dateCreated": 123456789000
<-   },
<-   "user": {
<-     "id": "1234",
<-     "username": "admin",
<-     // ...
<-   }
<- }
```

<a name='logout'></a>
### Logout [DELETE /api/sessions/:id]
+ does not require session (if you know the ID, it's yours)
+ **in-url** id (string)

Responds with `{}` upon success. Any further requests using the provided session ID will fail.

```js
DELETE /api/sessions/12345678-ABCDEFGH

<- {}
```

---

## Messages

Model:
```js
{
  "id": ID,
  "channelID": ID,

  // The content of the message
  "text": string,

  // The author's details, at the time of creation
  "authorID": ID,
  "authorUsername": Name,
  "authorAvatarURL": string,

  // Dates are returned as the number of seconds since UTC 2017-1-1, commonly
  // known as Unix time.
  "dateCreated": number,
  "dateEdited": number | null,

  "reactions": [ Reaction ],
  "mentionedUserIDs": [ ID ]
}
```

Note that [message mentions](#mentions) live in the message content (`text`). `mentionedUserIDs` is derived from the content of the message.

Related events:
* [message/new](#message-new)
* [message/edit](#message-edit)
* [message/delete](#message-delete)

<a name='send-message'></a>
### Send a message [POST /api/messages]
+ requires [channel permission](#channel-permissions) for `channelID`: SEND_MESSAGES
+ `channelID` (ID) - The parent channel of the new message
+ `text` (string) - The content of the message

On success, emits [message/new](#message-new) and returns `{ messageID }`. Also marks `channelID` as read for the author. Emits [user/mentions/add](#user-mentions-add) to [mentioned](#mentions) users, if any.

```js
POST /api/messages

-> {
->   "channelID": "5678",
->   "text": "Hello, world!"
-> }

<- {
<-   "messageID": "1234"
<- }
```

<a name='get-message'></a>
### Retrieve a message [GET /api/messages/:id]
+ requires [channel permission](#channel-permissions): SEND_MESSAGES
+ **in-url** id (ID) - The ID of the message to retrieve

Returns `{ message }` where `message` is a [message object](#messages-api-messages).

```js
GET /api/messages/1234

<- {
<-   "message": {
<-     "id": "1234",
<-     // ...
<-   }
<- }
```

<a name='edit-message'></a>
### Edit a message [PATCH /api/messages/:id]
+ requires ownership of message `id`
+ **in-url** id (ID) - The ID of the message to edit
+ `text` (string) - The new content of the message

Emits [message/edit](#message-edit) and returns `{}`.

```js
PATCH /api/messages/1234

-> {
->   "text": "Updated message text"
-> }

<- {}
```

This endpoint will return a NOT_YOURS [error](#errors) if you do not own the message in question. Emits [user/mentions/add](#user-mentions-add) to newly [mentioned](#mentions) users and [user/mentions/remove](#user-mentions-remove) to users who are no longer mentioned, if any.

<a name='delete-message'></a>
### Delete a message [DELETE /api/messages/:id]
+ requires one of:
  * ownership of message `id`
  * [channel permission](#channel-permissions) for `channelID` of message `id`: DELETE_MESSAGES
+ **in-url** id (ID) - The ID of the message to delete

Emits [message/delete](#message-delete) and returns `{}`.

```js
DELETE /api/messages/1234

<- {}
```

This endpoint may return a NOT_YOURS [error](#errors) if you do not own the message in question. Note that admins may delete any message. Emits [user/mentions/remove](#user-mentions-remove) to all previously-[mentioned](#mentions) users.

---

## Channels

Model:
```js
{
  "id": ID,
  "name": string // Does not include a hash
}
```

<a id='channel-extra-data'></a>
#### Extra data
This data is only present if a valid, logged-in session ID is provided to channel-returning endpoints.
```js
{
  // Number of 'unread' messages, capped at 200. Unread messages are
  // simply messages that were sent more recently than the last time
  // the channel was marked read by this user.
  "unreadMessageCount": number,

  "oldestUnreadMessageID": ID | null,
}
```

Related events:
* [channel/new](#channel-new)
* [channel/update](#channel-update)
* [channel/pins/add](#channel-pins-add)
* [channel/pins/remove](#channel-pins-remove)
* [channel/delete](#channel-delete)

<a name='channel-list'></a>
### Get list of channels [GET /api/channels]
+ does not require session, however:
  * channels where you do not have the SEE [permission](#channel-permissions) will not be returned
  * returns [extra data](#channel-extra-data) with session

Returns `{ channels }`, where channels is an array of channels. Note `unreadMessageCount` will only be returned if this endpoint receives a session.

```js
GET /api/channels

<- {
<-   "channels": [
<-     {
<-       "id": "5678",
<-       "name": "general"
<-     }
<-   ]
<- }
```

<a name='create-channel'></a>
### Create a channel [POST /api/channels]
+ requires [permission](#permissions): MANAGE_CHANNELS
+ `name` (name) - The name of the channel.

On success, emits [channel/new](#channel-new) and returns `{ channelID }`.

```js
POST /api/channels

-> {
->   "name": "general"
-> }

<- {
<-   "channelID": "5678"
<- }
```

May return [an error](#errors): MUST_BE_ADMIN, NAME_ALREADY_TAKEN, INVALID_NAME.

<a name='get-channel'></a>
### Retrieve a channel [GET /api/channels/:id]
+ does not require session, however:
  * returns [extra data](#channel-extra-data) with session
+ **in-url** id (ID) - The ID of the channel.

Returns `{ channel }`. Note [extra data](#channel-extra-data) will only be returned if this endpoint receives a logged-in session ID.

```js
GET /api/channels/5678

<- {
<-   "id": "5678",
<-   "name": "general"
<- }
```

May return [an error](#errors), including MUST_BE_ADMIN, NAME_ALREADY_TAKEN, and INVALID_NAME.

<a name='rename-channel'></a>
### Rename a channel [PATCH /api/channels/:id]
+ requires [permission](#permissions): MANAGE_CHANNELS
+ **in-url** id (ID) - The ID of the channel.
+ name (name) - The new name of the channel

Returns `{}` if successful, emitting [channel/update](#channel-update).

```js
PATCH /api/channels/5678

-> {
->   "name": "best-channel"
-> }

<- {}
```

<a name='delete-channel'></a>
### Delete a channel [DELETE /api/channels/:id]
+ requires [permission](#permissions): MANAGE_CHANNELS
+ **in-url** id (ID) - The ID of the channel to delete.

Returns `{}` if successful. Emits [channel/delete](#channel-delete).

```js
DELETE /api/channels/5678

<- {}
```

<a name='mark-channel-as-read'></a>
### Mark a channel as read [POST /api/channels/:id/mark-read]
+ requires [channel permission](#channel-permissions) for channel `id`: READ_MESSAGES
+ **in-url** id (ID) - The ID of the channel.

Marks the channel as read (ie. sets `unreadMessageCount` to 0), returning `{}`. Emits [channel/update](#channel-update) including [extra data](#channel-extra-data) if this socket is authenticated.

```js
POST /api/channels/5678/mark-read

<- {}
```

<a name='get-messages-in-channel'></a>
### Get messages in channel [GET /api/channels/:id/messages]
+ requires [channel permission](#permissions) for channel `id`: READ_MESSAGES
+ **in-url** id (ID) - The ID of the channel to fetch messages of.
+ `before` (ID; optional) - The ID of the message right **after** the range of messages you want.
+ `after` (ID; optional) - The ID of the message right **before** the range of messages you want.
+ `limit` (integer; optional, default `50`) - The maximum number of messages to fetch. Must be `1 <= limit <= 50`.

Returns `{ messages }`, where messages is an array of the most recent [messages](#messages) sent to this channel. If `limit` is given, it'll only fetch that many messages.

If `before` is specified, it'll only return messages sent before that one; and it'll only return messages sent after `after`.

```js
GET /api/channels/5678/messages

<- {
<-   "messages": [
<-     {
<-       "id": "1234",
<-       "channelID": "5678",
<-       // ...
<-     },
<-     {
<-       "id": "1235",
<-       "channelID": "5678",
<-       // ...
<-     }
<-   ]
<- }
```

```js
GET /api/channels/5678/messages?after=1234

<- {
<-   "messages": [
<-     {
<-       "id": "1235",
<-       "channelID": "5678",
<-       // ...
<-     }
<-   ]
<- }
```

<a name='get-pins'></a>
### Retrieve all pinned messages [GET /api/channels/:id/pins]
+ requires [channel permission](#permissions) for channel `id`: READ_MESSAGES
+ **in-url** id (ID)

Returns `{ pins }`, where pins is an array of [messages](#messages) that have been pinned to this channel.

```js
GET /api/channels/5678/pins

<- {
<-   "pins": [
<-     {
<-       "id": "1235",
<-       "channelID": "5678",
<-       // ...
<-     }
<-   ]
<- }
```

<a name='pin'></a>
### Pin a message [POST /api/channels/:id/pins]
+ requires [channel permission](#permissions) for channel `id`: MANAGE_PINS
+ **in-url** id (ID)
+ `messageID` (ID) - The message to pin to this channel.

Returns `{}` if successful. Emits [channel/pins/add](#channel-pins-add).

```js
POST /api/channels/5678/pins

-> {
->   "messageID": "1234"
-> }

<- {}
```

<a name='unpin'></a>
### Unpin a message [DELETE /api/channels/:channelID/pins/:messageID]
+ requires [channel permission](#permissions) for channel `id`: MANAGE_PINS
+ **in-url** channelID (ID)
+ **in-url** messageID (ID) - The ID of the message to unpin. Errors if not pinned.

Returns `{}` if successful. Emits [channel/pins/remove](#channel-pins-remove).

```js
DELETE /api/channels/5678/pins/1234

<- {}
```

---

## Users

Model:
```js
{
  "id": ID,
  "username": Name,

  "avatarURL": string,
  "flair": string | null,

  "online": boolean,
  "permissions": int, // Bitfield generated by ORing the user's role permissions

  "email": string | null // Only provided if the requested user is the same as the sessionID provides
}
```

Related events:
* [user/new](#user-new)
* [user/online](#user-online)
* [user/offline](#user-offline)
* [user/gone](#user-gone)
* [user/update](#user-update)
* [user/mentions/add](#user-mentions-add)
* [user/mentions/remove](#user-mentions-remove)

<a name='user-list'></a>
### Fetch users [GET /api/users]
Returns `{ users }`, where `users` is an array of [users](#users).

```js
GET /api/users

<- {
<-   "users": [
<-     {
<-       "id": "1234",
<-       "username": "test-user",
<-       // ...
<-     }
<-   ]
<- }
```

```js
GET /api/users?sessionID=adminsid123

<- {
<-   "users": [
<-     {
<-       "id": "1234",
<-       "username": "test-user",
<-       // ...
<-     }
<-   ]
<- }
```

<a name='register'></a>
### Register (create new user) [POST /api/users]
+ does not require session
+ `username` ([name](#names)) - Must be unique
+ `password` (string) - Errors if shorter than 6 characters

Responds with `{ user }` if successful, where `user` is the new user object. If the server does not [require authorization](#authorization), [user/new](#user-new) is emitted. Note the given password is passed as a plain string and is stored in the database as a bcrypt-hashed and salted string (and not in any plaintext form). Log in with [POST /api/sessions](#login).

```js
POST /api/users

-> {
->   "username": "joe",
->   "password": "secret"
-> }

<- {
<-   "user": {
<-     "id": "8769",
<-     "username": "joe",
<-     // ...
<-   }
<- }
```

<a name='get-user'></a>
### Retrieve a user by ID [GET /api/users/:id]
+ does not require session, howerver:
  * returns extra data (`email`) with session representing user `id`
+ **in-url** id (ID) - The user ID to fetch

Returns `{ user }`.

```js
GET /api/users/1

<- {
<-   "user": {
<-     "id": "1",
<-     "username": "admin",
<-     // ...
<-   }
<- }
```

<a name='get-mentions'></a>
### List [mentions](#mentions) of a user [GET /api/users/:id/mentions]
+ does not require session, however:
  * only returns messages where you have the SEE and READ_MESSAGES [permissions](#channel-permissions) for the message's channel
+ **in-url** id (ID) - The user ID to fetch the mentions of
+ `limit` (int <= 50; default `50`) - The maximum number of mentions to fetch.
+ `skip` (int; default `0`) - Skips the first n mentions before returning

Returns `{ mentions }`, where `mentions` is an array of [messages](#messages). Note that mentions are sorted by date: `mentions[0]` is the most recent mention.

Combining `limit` and `skip` can net you simple pagination.

```js
GET /api/users/1/mentions?limit=1

<- {
<-   "mentions": [
<-     {
<-       "text": "Hey <@1>! How are you?"
<-       // ...
<-     },
<-
<-     // ...
<-   ]
<- }
```

<a name='update-user'></a>
### Update user details [PATCH /api/users/:id]
+ requires session (see below)
+ **in-url** id (ID) - The user ID to patch

**The following parameters are available to sessions that represent the user being updated, or have the UPDATE_OTHERS [permission](#permissions):**

+ `password` (object; optional):
  * `new` (string) - Errors if shorter than 6 characters
  * `old` (string) - Errors if it doesn't match user's existing password
+ `email` (string | null; optional) - Not public, used to generate avatar URL
+ `flair` (string | null; optional) - Displayed beside username in chat, errors if longer than 50 characters

**The following parameters are available to sessions with the MANAGE_ROLES [permission](#permissions):**

+ `roles`: (array of [role IDs](#roles); optional) - Used to generate `user.permissions`)
  * requires MANAGE_ROLES [permission](#permission)

Returns `{}` and applies changes, assuming a valid session for this user (or an admin) is provided and no errors occur. Also emits [user/update](#user-update).

```js
PATCH /api/users/1

(with session representing user id 1)

-> {
->   "password": {
->     "old": "abcdef",
->     "new": "secure"
->   }
-> }

<- {}
```

```js
PATCH /api/users/12

(with session representing an admin)

-> {
->   "roles": [ "id-of-role", "id-of-role-2" ],
->   "flair": null
-> }

<- {}

('flair: null' removes the user's flair.)
```

<a name='get-user'></a>
### Retrieve a user by ID [GET /api/users/:id]
+ does not require session, however:
  * if the provided session represents the user `id`, returns extra data (`email`)
+ **in-url** id (ID) - The user ID to fetch

Returns `{ user }`.

```js
GET /api/users/1

<- {
<-   "user": {
<-     "id": "1",
<-     "username": "admin",
<-     // ...
<-   }
<- }
```

<a name='check-username-available'></a>
### Check if a username is available [GET /api/username-available/:username]
+ does not require session
+ **in-url** username (name)

On success, returns `{ available }`, where available is a boolean for if the username is available or not. May return the [error](#errors) INVALID_NAME.

```js
GET /api/username-available/patrick

<- {
<-   "available": false
<- }
```

---

# Websocket Events
These are the events which are used to send (and receive) data specific to individual connections to the server, and for "live" updates (e.g. rather than having the client poll the server for new messages every 5 seconds, the server emits a message to the client's web socket whenever a new message appears).

This project uses a WebSocket system which is similar to [socket.io](https://socket.io/) (though more simple). Messages sent to and from clients are JSON strings following the format `{ evt, data }`, where `evt` is a name representing the meaning of the event, and `data` is an optional property specifying any additional data related to the event.

## pingdata

Sent periodically (typically every 10 seconds) by the server, as well as immediately upon the client socket connecting. Clients should respond with a `pongdata` event, as described below.

## pongdata

Should be **sent from clients** in response to `pingdata`. Notifies the server of any information related to the particular socket. Passed data should include:

* `sessionID`, if the client is "logged in" or keeping track of a session ID. This is used for keeping track of which users are online.

<a name='message-new'></a>
## message/new

Sent to all clients whenever a message is [sent](#send-message) to any channel in the server. Passed data is in the format `{ message }`, where `message` is a [message](#messages) representing the new message.

<a name='message-edit'></a>
## message/edit

Sent to all clients when any message is [edited](#edit-message). Passed data is in the format `{ message }`, where `message` is a [message](#messages) representing the new message.

<a name='channel-new'></a>
## channel/new

Sent to all clients when a channel is [created](#create-channel). Passed data is in the format `{ channel }`, where `channel` is a [channel](#channels) representing the new channel.

<a name='channel-update'></a>
## channel/update

Sent to all clients when a channel is updated ([renamed](#rename-channel), [marked as read](#mark-channel-as-read), etc). Passed data is in the format `{ channel }`, including `channel.unreadMessageCount` if the socket is actively [ponging sessionIDs](#pongdata).

<a name='channel-pins-add'></a>
## channel/pins/add

Sent to all clients when a message is [pinned](#pin) to a channel. Passed data is in the format `{ message }`, where `message` is the message that was pinned.

<a name='channel-pins-remove'></a>
## channel/pins/remove

Sent to all clients when a message is [unpinned](#unpin) from a channel. Passed data is in the format `{ messageID }`, where `messageID` is the ID of the message that was unpinned.

<a name='channel-delete'></a>
## channel/delete

Sent to all clients when a channel is [deleted](#delete-channel). Passed data is in the format `{ channelID }`.

<a name='user-new'></a>
## user/new

Sent to all clients when a user is created. Passed data is in the format `{ user }`.

<a name='user-gone'></a>
## user/gone

Sent to all clients when a user is deleted. Passed data is in the format `{ userID }`.

<a name='user-online'></a>
## user/online

Sent to all clients when a user becomes online. This is whenever a socket [tells the server](#pongdata) that its session ID is that of a user who was not already online before. Passed data is in the format `{ userID }`.

<a name='user-offline'></a>
## user/offline

Sent to all clients when a user becomes offline. This is whenever the last socket of a user who is online terminates. Passed data is in the format `{ userID }`.

<a name='user-update'></a>
## user/update

Sent to all clients when a user is mutated using [PATCH /api/users/:userID](#update-user). Passed data is in the format `{ user }`.

<a name='user-mentions-add'></a>
## user/mentions/add

When a user is [mentioned](#mentions), this is sent to all sockets authenticated as them. Passed data is in the format `{ message }`, where `message` is the new / just edited mesage that mentioned the user.

<a name='user-mentions-remove'></a>
## user/mentions/remove

When a message is deleted or edited to remove [the mention of a user](#mentions), all sockets authenticated as the unmentioned user are sent this event. Passed data is in the format `{ messageID }`, where `messageID` is the ID of the message that just stopped mentioning the user.

<a name='emote-new'></a>
## emote/new

Sent to all clients when an emote is [added](#add-emote). Passed data is in the format `{ emote }`, where `emote` is the new [emote](#emotes).

<a name='emote-delete'></a>
## emote/delete

Sent to all clients when an emote is [added](#add-emote). Passed data is in the format `{ shortcode }`, where `shortcode` is the deleted [emote](#emotes)'s shortcode.

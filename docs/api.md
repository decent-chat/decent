# Decent API

**Communicating with the API**
* [HTTP Endpoints](#http-endpoints)
  - [Settings](#settings)
  - [Properties](#properties)
  - [Messages](#messages)
  - [Channels](#channels)
* [WebSocket Events](#websocket-events)

**Misc**
* Authentication
  - [Sessions](#sessions)
  - [Authorization](#authorization)
* Terminology
  - [Dates](#dates)
  - [Names](#names)
  - [Errors](#errors)

---

# Authenticating with the API

## Sessions
When a request is made to the API, the server searches for a session ID given in the request using:
* `sessionID` in POST/PUT/PATCH data
* `?sessionID` in query string
* `X-Session-ID` header

Endpoints labeled _requires session_ will [error](#errors) if no session or an invalid session is provided. _requires admin session_ means that the session's user must be an admin.

## Authorization
Authorization is a simple form of privacy which prevents clients from interacting with the server API without being authorized to do so (usually manually, by a human). This limits interaction to specific users, which may be wanted so that the server is "private".

It should be noted that **enabling authorization does not encrypt messages or user data**; it simply limits who can access that data via the API.

Authorization is a server property and can only be enabled via the command line:

```
> set requireAuthorization on|off
```

**This will cause all endpoints except those marked _never requires session_ to require [authentication](#sessions).**

---

# Terminology

Models are written as `{ "key": type, ... }`, where type is one of:
* `string`
* `number`
* `boolean`
* `{ "key", type, ... }` (a nested model)
* `[ type ]` (an array of `type`)
* another model's name

## Dates
In this document, "dates" are integers specified according to JavaScript's [`Date.now`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/now) function. This is equal to the number of *milliseconds* elapsed since the UNIX epoch.

Programming languages which expect a UNIX timestamp may stumble as they expect a number of seconds since the UNIX epoch, not a number of milliseconds.

## Names
Several parts of the API expect names (`Name`) to be given. These names will eventually be displayed to users, and so must follow a basic guideline for being formatted.

**Names may consist only of alphanumeric characters, underscores (`_`), and dashes (`-`).** When a name which does not follow these guidelines is given to an endpoint, an INVALID_NAME [error](#errors) will be returned and the request will have no action.

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
- `INVALID_SESSION_ID` - For when a session ID is passed, but there is no session with that ID. (This is for general usage where being logged in is required. For `/session/:sessionID`, `NOT_FOUND` is returned if there is no session with the given ID.)
- `UPLOAD_FAILED` - For when an upload fails.
- `NAME_ALREADY_TAKEN` - For when you try to create a something, but your passed name is already taken by another something (e.g. registering a username which is already used by someone else).
- `SHORT_PASSWORD` - For when you attempt to register but your password is too short.
- `INCORRECT_PASSWORD` - For when you attempt to log in but you didn't enter the right password. (Note that `NOT_FOUND` is returned if you try to log in with an unused username.)
- `INVALID_NAME` - For when you try to make something (a user or channel, etc) with an invalid name.

---

# HTTP Endpoints

## Retrieve server details [GET /api]
+ never requires session

Returns `{ decent, version }`. `decent` is always `true`, and should be used to check to see if a particular server is compatible with this spec.

```js
GET /api/

<- {
<-   "decent": true,
<-   "version": "0.1.0"
<- }
```

---

## Settings

Model:
```
{
  "name": string,
  "authorizationMessage": string,
  "emotes": [
    {
      "imageURL": string,
      "shortcode": name
    }
  ]
}
```

### Retrieve all settings [GET /api/settings]
Returns `{ settings }`, where `settings` is an object representing server-specific settings.

```js
GET /api/settings

<- {
<-   "settings": {
<-     "name": "Unnamed Decent chat server",
<-     "authorizationMessage": "Unauthorized - contact this server's webmaster to authorize your account for interacting with the server.",
<-     "emotes": [
<-       {
<-         "imageURL": "https://example.com/uploads/24",
<-         "shortcode": "shipit"
<-       }
<-     ]
<-   }
<- }
```

### Modify settings [PATCH /api/settings]
+ requires admin session
+ `patch` (settings) - The new settings to apply

Returns `{ results }` which mirrors the request `patch` but with each value being either `"updated"` or an error message string. Always returns `200 OK` regardless.

```js
PATCH /api/settings

-> {
->   "patch": {
->     "name": "My Server",
->     "emotes": 0
->   }
-> }

<- {
<-   "results": {
<-     "name": "updated",
<-     "emotes": "invalid value - not an array of emote objects"
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
  "useSecure": boolean,

  // If true, authorization is enabled. This means almost all endpoints
  // expect a session ID to be provided!
  "useAuthorization": boolean
}
```

### Retrieve all properties [GET /api/properties]
Returns `{ properties }`, where `properties` is an object representing server-specific properties.

```js
GET /api/properties

<- {
<-   "properties": {
<-     "useSecure": false,
<-     "useAuthorization": false
<-   }
<- }
```

---

## Upload an image [POST /api/upload-image]
+ requires session
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

  "date": number,     // Created on
  "editDate": number, // Last edited on

  "reactions": [ Reaction ]
}
```

Related endpoints:
* [reactions](#reactions)

Related events:
* [message/new](#message-new)
* [message/edit](#message-edit)
* [message/delete](#message-delete)

<a name='send-message'></a>
### Send a message [POST /api/messages]
+ requires session
+ `channelID` (ID) - The parent channel of the new message
+ `text` (string) - The content of the message

On success, emits [message/new](#message-new) and returns `{ messageID }`. Also marks `channelID` as read for the author.

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
+ requires session
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
### Edit a message [PUT /api/messages/:id]
+ requires session
+ **in-url** id (ID) - The ID of the message to edit
+ `text` (string) - The new content of the message

Emits [message/edit](#message-edit) and returns `{}`.

```js
PUT /api/messages/1234

-> {
->   "text": "Updated message text"
-> }

<- {}
```

This endpoint will return a NOT_YOURS [error](#errors) if you do not own the message in question.

<a name='delete-message'></a>
### Delete a message [DELETE /api/messages/:id]
+ **in-url** id (ID) - The ID of the message to delete

Emits [message/delete](#message-delete) and returns `{}`.

```js
DELETE /api/messages/1234

<- {}
```

This endpoint may return a NOT_YOURS [error](#errors) if you do not own the message in question. Note that admins may delete any message.

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

Sent to all clients whenever a message is [sent](#send-message) to any channel in the server. Passed data is in the format `{ message }`, where `message` is a [Message](#messages) representing the new message.

<a name='message-edit'></a>
## message/edit

Sent to all clients when any message is [edited](#edit-message). Passed data is in the format `{ message }`, where `message` is a [Message](#messages) representing the new message.

<a name='channel-new'></a>
## channel/new

Sent to all clients when a channel is [created](#create-channel). Passed data is in the format `{channel}`, where `channel` is a [detailed Channel](#channels) representing the new channel.

<a name='channel-rename'></a>
## channel/rename

Sent to all clients when a channel is [renamed](#rename-channel). Passed data is in the format `{ channelID, newName }`.

<a name='channel-delete'></a>
## channel/delete

Sent to all clients when a channel is [deleted](#delete-channel). Passed data is in the format `{ channelID }`.

<a name='user-online'></a>
## user/online

Sent to all clients when a user becomes online. This is whenever a socket [tells the server](#pongdata) that its session ID is that of a user who was not already online before. Passed data is in the format `{ userID }`.

<a name='user-offline'></a>
## user/offline

Sent to all clients when a user becomes offline. This is whenever the last socket of a user who is online terminates. Passed data is in the format `{ userID }`.

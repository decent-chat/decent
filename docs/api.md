### Decent API Specification
> Version: **1.0.0-preview**

Implementors of this specification must support the following two forms of transport:

#### HTTP(S) endpoints - For client->server requests

The HTTP API is accessed via `/api/`. All endpoints respond in JSON, and those which take request bodies expect it to also be formatted using JSON. Implementors may choose an appropriate HTTP status code for responses.

#### WebSocket events - For server->client event notifications

Messages sent to and from sockets must be JSON strings, following the format `{ evt, data }`, where `evt` is a name representing the meaning of the event, and `data` is an optional property specifying any additional data related to the event.

---

# API

## Authentication

Clients should authenticate using both of the following methods at the same time.

<details><summary><b>With HTTP(S)</b> - per-request</summary>

When a request is made to the API, the server searches for a [session ID](#sessions) given in the request using:
* `sessionID` in request body
* `?sessionID` in query string
* `X-Session-ID` header

Endpoints **not** labeled _does not require session_ will [error](#errors) if no session or an invalid session is provided.
Other endpoints may require the session user to posess a particular [permission](#permissions) or set of permissions.

</details>

<details><summary><b>With WebSockets</b> - ping/pong periodically</summary>

## pingdata

Sent periodically (typically every 10 seconds) by the server, as well as immediately upon the client socket connecting. Clients should respond with a `pongdata` event, as described below.

## pongdata

Should be **sent from clients** in response to `pingdata`. Notifies the server of any information related to the particular socket. Passed data should include:

* `sessionID`, if the client is "logged in" or keeping track of a session ID. This is used for keeping track of which users are online.

</details>

## Errors

Nearly all HTTP endpoints return errors situationally. Generally, when the processing of a request errors, its response will have the `error` property, which will follow the form `{ code, message }`.

The `message` property is a string of a human-readable English message briefly explaining what went wrong, and the `code` is a permanent identifier string for the type of error that happened. Checking `code` is useful for displaying custom messages or behavior when particular errors occur.

<details><summary><b>Error codes</b></summary>

| Error code             | Meaning                                             |
| ----------------------:|:----------------------------------------------------|
| NOT_FOUND              | The requested thing was not found                   |
| NOT_YOURS              | Your attempt to do something impactful was rejected because you are not the owner/author of the thing |
| NOT_ALLOWED            | The requesting user has insufficient permissions to perform this action |
| NO                     | The server does not support or does not want to fulfill your request |
| ALREADY_PERFORMED      | That action has already been performed              |
| FAILED                 | Something went wrong internally                     |
| INCOMPLETE_PARAMETERS  | A property is missing from the request's parameters |
| INVALID_PARAMETER_TYPE | A parameter is the wrong type                       |
| INVALID_SESSION_ID     | There is no session with the provided session ID    |
| INVALID_NAME           | Provided [name](#name) is invalid                   |
| NAME_ALREADY_TAKEN     | The passed name is already used by something else   |
| SHORT_PASSWORD         | Password is too short                               |
| INCORRECT_PASSWORD     | Incorrect password                                  |

</details>

## Permissions

Permissions in Decent are a way to limit and grant certain abilities to users.

<details><summary><b>How permissions work</b></summary>

Permissions are stored within a map of keys (representing individual permissions) to boolean values (or undefined). For example, the following permissions object describes being able to read but not send messages:

```js
{
  "readMessages": true,
  "sendMessages": false
}
```

Individual permissions are passed according to a cascade of roles. If two or more permission objects are applied (typically based on the roles a user has), then individual permissions are determined by the most prioritized roles. For example, consider these three permission objects:

```js
{
  "sendMessages": false
}

{
  "readMessages": true,
  "sendMessages": true
}

{
  "readMessages": false,
  "sendMessages": false
}
```

Suppose we consider the first, top-most object to have the greatest priority, and that the second and third each in turn have less priority.

If all three permission objects are applied to a user, then to calculate the user's permissions, we start by looking at the most prioritized object. This object contains one property, `sendMessages: false`. From this, we know that the user is not permitted to send messages; this is absolutely true, regardless of any other permission objects, since this object is the most prioritized one.

Then we move to the next permission object: `{readMessages: true, sendMessages: true}`. The `readMessages: true` permission tells us that the user is allowed to read messages. There is also a `sendMessages` property, but we ignore this, since we have already determined that the user is not permitted to send messages.

We look at the final permission object: `{readMessages: false, sendMessages: false}`. There are two properties here, but these have both already been determined earlier, so we ignore them. Since we have gone through all permission objects applied to the user, we come to the conclusion that **the user may read but not send messages.**

The actual priority of permission objects is determined according to the roles applied to the user and channel-specific permissions (which are dependent on the roles), and the order is determined as follows:

* Channel-specific permissions for roles of the user (Most priority.)
* Channel-specific permissions for the user role, if the user is a logged-in member of the server, or the guest role, if the user is not logged in (IDs "_user" and "_guest" respectively)
* Channel-specific permissions for the everyone role (ID "_everyone")
* Server-wide permissions for roles of the user
* Server-wide permissions for the user or guest role, as above
* Server-wide permissions for the everyone role (Least priority.)

</details>

<details><summary><b>Table of permissions</b></summary>

A set of permissions can be configured for different [roles](#roles). When these roles are attached to users, they grant or revoke specific privileges within the entire server.

Below is a table of all permissions.

| Code              | Description                                              |
| ----------------- | -------------------------------------------------------- |
| `manageServer`    | Allows changes to [server settings](#settings).          |
| `manageUsers`     | Allows for updating of users other than yourself, and allows deletion of users. |
| `manageRoles`     | Allows creation/deletion/modification of [roles](#roles). |
| `manageChannels`  | Allows management and editing of [channels](#channels) and their permissions. |
| `managePins`      | Allows for [pinning](#pin) and [unpinning](#unpin) of messages. |
| `manageEmotes`    | Allows for creation and removal of [emotes](#emotes).    |
| `readMessages`    | Allows for viewing of channel [messages](#messages); if false, the channel does not show up in the channel list. |
| `sendMessages`    | Allows for [sending messages](#send-message).            |
| `sendSystemMessages` | Allows for [sending system messages](#send-message).  |
| `uploadImages`    | Allows [image uploads](#upload-image).                   |
| `allowNonUnique`  | Allows the creation of things with non-unique [names](#names). |

</details>

## Miscellaneous

<details><summary>Endpoints</summary>

### Retrieve server version [GET /api]
+ does not require session

Returns `{ decentVersion }`. Should be used to check to see if a particular server is compatible with this spec. Note that Decent follows [SemVer](https://semver.org/), so unless the MAJOR (first) portion of the version number is different to what you expect communication should work fine.

```js
GET /api/

<- {
<-   "decentVersion": "0.1.0"
<- }
```

<a id='upload-image'></a>
### Upload an image [POST /api/upload-image]
+ requires [permission](#permissions) `uploadImages`
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

This endpoint may return [an error](#errors), namely FAILED, NO, or NOT_ALLOWED.

</details>

## Settings

```js
{
  "name": string,
  "iconURL": string,
}
```

<details><summary>Events</summary>

<a name='server-settings-update'></a>
## server-settings/update

Emitted with data `{ settings }` when the server settings are modified.

</details>

<details><summary>Endpoints</summary>

### Retrieve all settings [GET /api/settings]
+ does not require session

Returns `{ settings }`, where `settings` is an object representing server-specific settings.

```js
GET /api/settings

<- {
<-   "settings": {
<-     "name": "Unnamed Decent chat server",
<-     "iconURL": "https://meta.decent.chat/uploads/..."
<-   }
<- }
```

### Modify settings [PATCH /api/settings]
+ requires [permission](#permissions) `manageServer`
+ `name` (string; optional)
+ `iconURL` (string; optional)

Returns `{}` if successful. Updates settings with new values provided, and emits [server-settings/update](#server-settings-update).

```js
PATCH /api/settings

-> {
->   "name": "My Server"
-> }

<- {}
```

</details>

## Properties

Properties can only be modified on the command line.

```js
{
  // If true, always use HTTPS to access the server.
  "useSecure": boolean
}
```

<details><summary>Endpoints</summary>

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

</details>

## Emotes

```js
{
  "shortcode": string, // Unique string without colons or spaces
  "imageURL": string
}
```

<details><summary>Events</summary>

<a name='emote-new'></a>
### emote/new

Sent to all clients when an emote is created. Passed data is in the format `{ emote }`.

<a name='emote-delete'></a>
### emote/delete

Sent to all clients when an emote is deleted. Passed data is in the format `{ shortcode }`.

</details>

<details><summary>Endpoints</summary>

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
+ requires [permission](#permissions) `manageEmotes`
+ `imageURL` (string)
+ `shortcode` (string) - Should not include colons (`:`) or spaces. Must be unique, even if the user has the `allowNonUnique` [permission](#permissions).

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
+ requires [permission](#permissions) `manageEmotes`
+ **in-url** shortcode (string)

Returns `{}` if successful. Emits [emote/delete](#emote-delete).

```js
DELETE /api/emotes/package

<- {}
```

</details>

## Sessions

```js
{
  "id": string,
  "dateCreated": number // Unix time at creation
}
```

<details><summary>Endpoints</summary>

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

</details>

## Messages

```js
{
  "id": ID,
  "channelID": ID,

  // The message type. See below
  "type": string,

  // The content of the message
  "text": string,

  // The author's details, at the time of creation;
  // if message.type = "system" these will all be null.
  "authorID": ID,
  "authorUsername": Name,
  "authorAvatarURL": string,

  // Dates are returned as the number of seconds since UTC 1970-1-1, commonly
  // known as Unix time.
  "dateCreated": number,
  "dateEdited": number | null,

  "pinned": boolean,
  "mentionedUserIDs": [ ID ]
}
```

#### Message types

There are currently two message types, `"user"` and `"system"`. Messages sent by users are always marked `"user"`, however both the server and users with the `sendSystemMessage` [permission](#permissions). can choose to send system-level messages for things, such as user joins or when pins are added. Ideally, these would be styled differently in clients.

System messages lack `author` fields.

#### Mentions

Mentions target a single user only and are formatted as `<@userID>`, where `userID` is the ID of the user who is being mentioned. Mentions are stored per-user on the server. `mentionedUserIDs` is derived from the content of the message.

<details><summary>Events</summary>

<a name='message-new'></a>
### message/new

Sent to all clients whenever a message is [sent](#send-message) to any channel in the server. Passed data is in the format `{ message }`, where `message` is a [message](#messages) representing the new message.

<a name='message-edit'></a>
### message/edit

Sent to all clients when any message is [edited](#edit-message). Passed data is in the format `{ message }`, where `message` is a [message](#messages) representing the new message.

<a name='message-delete'></a>
### message/delete

Sent to all clients when any message is [deleted](#delete-message). Passed data is in the format `{ messageID }`.

</details>

<details><summary>Endpoints</summary>

<a name='send-message'></a>
### Send a message [POST /api/messages]
+ requires [permission](#permissions) `sendMessages`
  * Requires `sendSystemMessages` [permission](#permissions) if `type == "system"`
+ `channelID` (ID) - The parent channel of the new message
+ `text` (string) - The content of the message
+ `type` (string; defaults to `"user"`)

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
+ requires [permission](#permissions) `readMessages`
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
  * [permission](#permissions) (for channel of specified message) `deleteMessages`
+ **in-url** id (ID) - The ID of the message to delete

Emits [message/delete](#message-delete) and returns `{}`.

```js
DELETE /api/messages/1234

<- {}
```

This endpoint may return a NOT_YOURS [error](#errors) if you do not own the message in question. Note that admins may delete any message. Emits [user/mentions/remove](#user-mentions-remove) to all previously-[mentioned](#mentions) users.

</details>

## Channels

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

<details><summary>Events</summary>

<a name='channel-new'></a>
### channel/new

Sent to all clients when a channel is [created](#create-channel). Passed data is in the format `{ channel }`, where `channel` is a [channel](#channels) representing the new channel.

<a name='channel-update'></a>
### channel/update

Sent to all clients when a channel is updated ([renamed](#rename-channel), [marked as read](#mark-channel-as-read), etc). Passed data is in the format `{ channel }`, including `channel.unreadMessageCount` if the socket is actively [ponging sessionIDs](#pongdata).

<a name='channel-pins-add'></a>
### channel/pins/add

Sent to all clients when a message is [pinned](#pin) to a channel. Passed data is in the format `{ message }`, where `message` is the message that was pinned.

<a name='channel-pins-remove'></a>
### channel/pins/remove

Sent to all clients when a message is [unpinned](#unpin) from a channel. Passed data is in the format `{ messageID }`, where `messageID` is the ID of the message that was unpinned.

<a name='channel-delete'></a>
### channel/delete

Sent to all clients when a channel is [deleted](#delete-channel). Passed data is in the format `{ channelID }`.

</details>

<details><summary>Endpoints</summary>

<a name='channel-list'></a>
### Get list of channels [GET /api/channels]
+ does not require session, however:
  * channels where you do not have the `readMessages` [permission](#permissions) will not be returned
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
+ requires [permission](#permissions) `manageChannels`
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
+ requires [permission](#permissions) `manageChannels`
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
+ requires [permission](#permissions) `manageChannels`
+ **in-url** id (ID) - The ID of the channel to delete.

Returns `{}` if successful. Emits [channel/delete](#channel-delete).

```js
DELETE /api/channels/5678

<- {}
```

<a name='mark-channel-as-read'></a>
### Mark a channel as read [POST /api/channels/:id/mark-read]
+ requires [permission](#permissions) (for specified channel) `readMessages`
+ **in-url** id (ID) - The ID of the channel.

Marks the channel as read (ie. sets `unreadMessageCount` to 0), returning `{}`. Emits [channel/update](#channel-update) including [extra data](#channel-extra-data) if this socket is authenticated.

```js
POST /api/channels/5678/mark-read

<- {}
```

<a name='get-messages-in-channel'></a>
### Get messages in channel [GET /api/channels/:id/messages]
+ requires [permission](#permissions) (for specified channel) `readMessages`
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

<a name='update-channel-permissions'></a>
### Update channel-specific role permissions [PATCH /api/channels/:id/role-permissions]
+ requires [permission](#permissions) (for specified channel) `manageRoles`
+ **in-url** id (ID)
+ **rolePermissions** - an object map of role IDs to their permissions

Returns `{}` if successful. Note that if the **roles** parameter, unspecified role permissions on the channel will not be changed. To delete an entry, pass `{}` as the role's permissions; since this would reset the role's permissions all to unset, the role would have no effect, and is removed from the channel's `rolePermissions` map.

```js
PATCH /api/channels/1234/role-permissions

-> {
->   "rolePermissions": {
->     "_everyone": {
->       "readMessages": false,
->       "sendMessages": false
->     },
->     "123": {
->       "readMessages": true,
->       "sendMessages": true
->     }
->   }
-> }

<- {}
```

<a name='get-channel-permissions'></a>
### Get channel-specific role permissions [GET /api/channels/:id/role-permissions]
+ **in-url** id (ID)

Returns `{ rolePermissions }` if successful, where `rolePermissions` is a map of role IDs to their individual [permissions](#permissions).

```js
GET /api/channels/1234/role-permissions

<- {
<-   "rolePermissions": {
<-     "_everyone": {
<-       "readMessages": false,
<-       "sendMessages": false
<-     },
<-     ...
<-   }
<- }
```

<a name='get-pins'></a>
### Retrieve all pinned messages [GET /api/channels/:id/pins]
+ requires [permission](#permissions) (for specified channel) `readMessages`
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
+ requires [permission](#permissions) (for specified channel) `managePins`
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
+ requires [permission](#permissions) (for specified channel) `managePins`
+ **in-url** channelID (ID)
+ **in-url** messageID (ID) - The ID of the message to unpin. Errors if not pinned.

Returns `{}` if successful. Emits [channel/pins/remove](#channel-pins-remove).

```js
DELETE /api/channels/5678/pins/1234

<- {}
```

</details>

## Users

```js
{
  "id": ID,
  "username": Name,

  "avatarURL": string,
  "flair": string | null,

  "online": boolean,
  "roles": array, // Array of string IDs for each role the user has, not including "_user" or "_everyone",

  "email": string | null // Only provided if the requested user is the same as the sessionID provides
}
```

<details><summary>Events</summary>

<a name='user-new'></a>
### user/new

Sent to all clients when a user is created. Passed data is in the format `{ user }`.

<a name='user-delete'></a>
### user/delete

Sent to all clients when a user is deleted. Passed data is in the format `{ userID }`.

<a name='user-online'></a>
### user/online

Sent to all clients when a user becomes online. This is whenever a socket [tells the server](#pongdata) that its session ID is that of a user who was not already online before. Passed data is in the format `{ userID }`.

<a name='user-offline'></a>
### user/offline

Sent to all clients when a user becomes offline. This is whenever the last socket of a user who is online terminates. Passed data is in the format `{ userID }`.

<a name='user-update'></a>
### user/update

Sent to all clients when a user is mutated using [PATCH /api/users/:userID](#update-user). Passed data is in the format `{ user }`.

<a name='user-mentions-add'></a>
### user/mentions/add

When a user is [mentioned](#mentions), this is sent to all sockets authenticated as them. Passed data is in the format `{ message }`, where `message` is the new / just edited mesage that mentioned the user.

<a name='user-mentions-remove'></a>
### user/mentions/remove

When a message is deleted or edited to remove [the mention of a user](#mentions), all sockets authenticated as the unmentioned user are sent this event. Passed data is in the format `{ messageID }`, where `messageID` is the ID of the message that just stopped mentioning the user.

</details>

<details><summary>Endpoints</summary>

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
  * only returns messages where you have the `viewMessages` [permission](#permissions) for the message's channel
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

**The following parameters are available to sessions that represent the user being updated:**

+ `password` (object; optional):
  * `new` (string) - Errors if shorter than 6 characters
  * `old` (string) - Errors if it doesn't match user's existing password

**The following parameters are available to sessions that represent the user being updated, or have the `manageUsers` [permission](#permissions):**

+ `email` (string | null; optional) - Not public, used to generate avatar URL
+ `flair` (string | null; optional) - Displayed beside username in chat, errors if longer than 50 characters

**The following parameters are available to sessions with the `manageRoles` [permission](#permissions):**

+ `roles`: (array of [role IDs](#roles); optional) - Used to generate `user.permissions`)

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

<a name='get-user-permissions'></a>
### Get a user's permissions [GET /api/users/:id/permissions]
+ does not require session
+ **in-url** id (ID) - The user ID to fetch

Returns `{ permissions }`, where `permissions` is a [permissions](#permissions) object.

```js
GET /api/users/1/permissions

<- {
<-   "permissions": {
<-     "manageServer": false,
<-     "manageUsers": false,
<-     "readMessages": true,
<-     // ...
<-   }
<- }
```

<a name='delete-user'></a>
### Delete a user [DELETE /api/users/:id]
+ requires [permission](#permission): MANAGE_USERS
+ **in-url** id (ID) - The user to delete

Returns `{}` and emits [user/delete](#user-delete).

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

</details>

## Roles

```js
{
  "name": string,
  "permissions": object, // A permissions object

  // If true, new users will automatically get this role by default.
  "default": boolean
}
```

#### See also

* [Permissions](#permissions)

<details><summary>Events</summary>

<a name='role-new'></a>
### role/new

Sent to all clients when a role is [added](#new-role). Passed data is in the format `{ role }`.

<a name='role-update'></a>
### role/update

Sent to all clients when a role is [updated](#update-role). Passed data is in the format `{ role }`.

<a name='role-delete'></a>
### role/delete

Sent to all clients when a role is [deleted](#delete-role). Passed data is in the format `{ roleID }`.

</details>

<details><summary>Endpoints</summary>

<a name='list-roles'></a>
### List roles [GET /api/roles]

Returns `{ roles }`, where `roles` is an array of emote objects.

```js
GET /api/roles

<- {
<-   "roles": [
<-     {
<-       "id": ID,
<-       "name": "Everyone",
<-       "permissions": ...
<-     }
<-   ]
<- }
```

<a name='new-role'></a>
### Add a new role [POST /api/roles]
+ requires [permission](#permissions) `manageRoles`
+ `name` (string) - Max length 32.
+ `permissions` ([Permissions object](#permissions)) - this role's intended permissions
  * **Cannot contain permissions that the requesting session's user does not have**

Returns `{ roleID }` if successful, where `roleID` is the ID of the new role. Emits [role/new](#role-new).

<a name='update-role'></a>
### Update a role [PATCH /api/roles/:id]
+ requires [permission](#permissions) `manageRoles`
+ **in-url** id (ID)
+ `name` (string; optional) - Max length 32.
+ `permissions` ([Permissions object](#permissions)) - the new intended permissions for this role
  * **Cannot contain permissions that the requesting session's user does not have**

Returns `{}` and emits [role/update](#role-update) if successful. May emit [user/update](#user-update) as required if users' computed permissions change.

<a name='delete-role'></a>
### Delete a role [DELETE /api/emotes/:id]
+ requires [permission](#permissions) `manageRoles`
+ **in-url** id (ID string)

Returns `{}` if successful. Emits [role/delete](#role-delete).

</details>

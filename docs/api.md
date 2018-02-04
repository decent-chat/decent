# API Specification/Documentation

Communicating with the API
* [HTTP endpoints](#http-endpoints) provide virtually all methods of interaction from the client towards the server
* [WebSocket events](#websocket-events) let the server send messages to the client.

Common data received from the server (such as users or messages) always follows [particular formats](#objects).

It would be wise to understand and expect [authorization](#authorization) to be required. **All endpoints, unless specified, follow the server-wide authentication rule.**

General information which doesn't particularly fit anywhere else can be found in the appendix-esque section [Etc](#etc), and any questions one might have can be posted to the [issue tracker](https://github.com/decent-chat/decent/issues).

## HTTP endpoints

These are all the paths (think: URLs, `/api/user/:userID`) which can be fetched with plain old HTTP requests. All POST endpoints expect bodies encoded in **JSON**, and every endpoint will respond with a stringified JSON object.

If [authorization](#authorization) is required by the server, **all endpoints will require [authentication](#authentication) unless otherwise stated**. TL;DR: pass your session ID as the `X-Session-ID` header, as `sessionID` in POST data, or as `sessionID` in the URL query string.

### GET `/api`

- [Authentication](#authentication): never required.

Returns `{decent: true, message, repository}`, where `message` and `repository` are hard-coded strings for Humans to read. Also returns the HTTP status code [`418`](https://en.wikipedia.org/wiki/Hyper_Text_Coffee_Pot_Control_Protocol). Use this endpoint to verify that a given hostname is actually a Decent server.

### GET `/api/server-settings`

Returns `{settings}`, where `settings` is an object representing server-specific settings.

### POST `/api/server-settings`

- Parameters:
  * `patch`: (via data; object) an object acting as the dictionary to apply.
- [Authentication](#authentication): always required. **The requesting user must be an admin.**

Takes the parameter `patch` and overwrites each of the specified properties according to the corresponding values. Only previously existing settings will be overwritten (no new properties will be made). Returns the result status of each item; for example, if two properties are given, and the first has a valid key while the second's key doesn't exist, the change specified by the first will still be applied, even though the second failed.

#### List of server settings

* `name`: The name of the server.

### POST `/api/account-settings`

- Parameters:
  * `email`: (via data; string/null) the new email address of the user.
- [Authentication](#authentication): always required.

Returns `{avatarURL}`, where `avatarURL` is a string URL (usually pointing to [Libravatar](https://www.libravatar.org/)) to be used as the user's profile picture.

### GET `/api/should-use-secure`

- [Authentication](#authentication): never required.

Returns a simple object `{useSecure}`, where `useSecure` is a boolean specifying whether or not to use WebSocket Secure and HTTPS (instead of normal WebSockets and HTTP). Of course, this assumes that HTTPS is properly set up on the host. Whether this returns true or false can be changed via the server command line (see `help` and view information on "set").

### GET `/api/should-use-authorization`

- [Authentication](#authentication): never required.

Returns an object `{useAuthorization, authorizationMessage}`, where `useAuthorization` is a boolean specifying whether or not to use [authorization](#authorization). If the server does require authorization, `authorizationMessage` (a message [specific to the server](#list-of-server-settings)) is passed.

### POST `/api/send-message`

- Parameters:
  * `text`: (via data; string) the text to send in the message. Typically, clients will interpret message text as markdown.
  * `channelID`: (via data; string) the ID of the channel to which the message will be sent. The channel has to exist.
- [Authentication](#authentication): always required.

Sends a message. Returns an object `{messageID}` if successful, where `messageID` is the unique ID of the new message, and emits a [`message/new`](#from-server-messagenew) WebSocket event.

### GET `/api/message/:messageID`

- Parameters:
  * `messageID`: (via URL path) the unique ID of the message. The message has to exist.

Returns a [message object](#message-object) corresponding to the given message ID.

### POST `/api/edit-message`

- Parameters:
  * `text`: (via data; string) the new text content.
  * `messageID`: (via data; string) the message ID. The message has to exist.
- [Authentication](#authentication): always required. **The user must own the message.**

Overwrites the text content of an existing message and attaches an "edited" date to it. Returns `{true}` if successful, and emits a [`message/edit`](#from-server-messageedit) WebSocket event.

### POST `/api/pin-message`

- Parameters:
  * `messageID`: (via data; string) the ID of the message to be pinned. The message has to exist.
- [Authentication](#authentication): always required. **The user must be an admin.**

Adds a message to its channel's pinned messages list. Returns an empty object if successful.

### POST `/api/add-message-reaction`

This endpoint is unstable. See discussion in [GitHub issue #21](https://github.com/decent-chat/decent/issues/21).

### POST `/api/create-channel`

- Parameters:
  * `name`: (via data; string) the name of the channel. This must be a [valid name](#valid-names), and there must not already be a channel with the same name.
- [Authentication](#authentication): always required. **The user must be an admin.**

Creates a channel (which will immediately be able to receive messages). Returns `{channelID}` if successful, where `channelID` is the unique ID of the channel, and emits a [`channel/new`](#from-server-channelnew) WebSocket event.

### GET `/api/channel/:channelID`

- Parameters:
  * `channelID`: (via URL path) the unique ID of the channel. The channel has to exist.
- [Authentication](#authentication): optional, unless the server requires [authorization](#authorization).
  * [Extra data](#channel-object) will be returned if given.

Returns `{channel}` if successful, where `channel` is a [(detailed) channel object](#channel-object) corresponding to the channel with the given ID.

### POST `/api/rename-channel`

- Parameters:
  * `name`: (via data; string) the new name to be given to the channel. Must be a [valid name](#valid-names).
  * `channelID`: (via data; string) the unique ID of the channel to be renamed. The channel has to exist.
- [Authentication](#authentication): always required. **The requesting user must be an admin.**

Changes the name of a channel. Returns `{true}` if successful, and emits a [`channel/rename`](#from-server-channelrename) WebSocket event.

### POST `/api/delete-channel`

- Parameters:
  * `channelID`: (via data; string) the unique ID of the channel to be deleted. The channel has to exist.
- [Authentication](#authentication): always required. **The requesting user must be an admin.**

Deletes a channel and any messages in it. Returns `{true}` if successful, and emits a [`channel/delete`](#from-server-channeldelete) WebSocket event.

### GET `/api/channel-list`

Returns `{channels}`, where channels is an array of [(brief) channel objects](#channel-object) for each channel on the server. Note that channel objects have more data when [authentication](#authentication) is provided.

### GET `/api/channel/:channelID/latest-messages`

- Parameters:
  * `channelID`: (via URL path) the channel ID to fetch messages from.
  * `before`: (via query; optional) the ID of the message right after the range of messages you want.
  * `after`: (via query; optional) the ID of the message right before the range of messages you want.
  * `limit`: (via query; optional) the maximum number of messages to fetch (defaults to 50). The actual used limit will be at least 1 and not greater than 50.

Returns `{messages}`, where messages is an array of the most recent messages sent to the given channel. If `before` is specified, it'll only fetch messages that were sent before that one; and it'll only fetch messages sent after `after`. If `limit` is specified, it'll only fetch up to that many messages (or up to 50, if not specified).

### POST `/api/register`

- Parameters:
  * `username`: (via body; string) the username to use. The username must not already be taken, and must be a [valid name](#valid-names).
  * `password`: (via body; string) the password to use. The password must be at least 6 characters long.
- [Authentication](#authentication): never required.

Registers a new user. The given password is passed to `/api/register` as a plain string, and is stored in the database as a bcrypt-hashed and salted string (and not in any plain text form). Returns `{user}` if successful, where `user` is the new user as a [user object](#user-object).

### POST `/api/authorize-user`

- Parameters:
  * `userID`: (via data; string) the unique ID of the user to be authorized.
- [Authentication](#authentication): always required. **The requesting user must be an admin.**

[Authorizes](#authorization) the given user. Returns an empty object if successful. Doesn't do anything (returns an error) if authorization is disabled.

### POST `/api/deauthorize-user`

- Parameters:
  * `userID`: (via data; string) the unique ID of the user to be deauthorized. This must not be the requesting user (you can't deauthorize yourself).
- [Authentication](#authentication): always required. **The requesting user must be an admin.**

[Deauthorizes](#authorization) the given user. Returns an empty object if successful. Doesn't do anything (returns an error) if authorization is disabled.

### GET `/api/user/:userID`

- Parameters:
  * `userID`: (via URL path) the ID of the user to fetch. The user has to exist.

Returns `{user}` if successful, where `user` is a [user object](#user-objects) corresponding to the user with the given ID.

### GET `/api/user-list`

Returns `{users}`, where `users` is an array of every registered user on the server as [user objects](#user-objects).

### GET `/api/username-available/:username`

- Parameters:
  * `username`: (via URL path) the username to check.

Returns `{available}`, where `available` is a boolean set to whether or not the given username is available. This endpoint is handy when making a registration form (which might automatically check if a username is available before sending the [register](#post-apiregister) request).

### POST `/api/login`

- Parameters:
  * `username`: (via body; string) the username to log in as. There must be a user with this name.
  * `password`: (via body; string) the password to use. This must (when hashed) match the user's password.
- [Authentication](#authentication): never required.

Attempts to log in as a user, creating a new session. Returns `{sessionID}` if successful, where `sessionID` is the ID of the newly-created session.

### GET `/api/session/:sessionID`

- Parameters:
  * `sessionID`: (via URL path) the session ID to fetch. The session must exist.
- [Authentication](#authentication): never required. Should, however, be provided in the URL.

Returns `{session: {id, dateCreated, user}}` if successful, where `user` is a [user object](#user-object) of the user which the session represents. This endpoint is useful when grabbing information about the logged in user (e.g. at the startup of a client program, which may display the logged in user's username in a status bar). Does not require [authorization](#authorization).

### POST `/api/delete-sessions`

- Parameters:
  * `sessionIDs`: (via body; array of strings) the IDs of the sessions to be deleted.

Deletes the given sessions (using their IDs will no longer work). Passing just one session ID is fine. Returns an empty object if successful.

### GET `/api/user-session-list`

- [Authentication](#authentication): always required.

Returns `{sessions}` if successful, where `sessions` is an array of [(brief) session objects](#session-object). All sessions which are logged into the same user as the given session (via `sessionID`) are returned.


## Endpoint errors

Nearly all of the [HTTP endpoints](#http-endpoints) return errors situationally. Generally, when the processing of a request errors, its response will have the `error` property, which will follow the form `{code, message}`. The `message` property is a string of a human-readable English message briefly explaining what went wrong, and the `code` is a permanent identifier string for the type of error that happened. (Checking `code` is useful for displaying custom messages or behavior when particular errors occur.) The following list describes each possible error code:

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


## WebSocket events

These are the events which are used to send (and receive) data specific to individual connections to the server, and for "live" updates (e.g. rather than having the client poll the server for new messages every 5 seconds, the server emits a message to the client's web socket whenever a new message appears). These should certainly be considered when designing a custom client as they are the primary way in which the server talks to the client.

This project uses a WebSocket system which is similar to [socket.io](https://socket.io/) (though more simple). Messages sent to and from clients are JSON strings following the format `{evt, data}`, where `evt` is a name representing the meaning of the event, and `data` is an optional property specifying any additional data related to the event.

### To client: `pingdata`

Sent periodically (typically ever 10 seconds) by the server, as well as immediately upon the client socket connecting. Clients should respond with a `pongdata` event, as described below.

### From client: `pongdata`

Should be sent from clients in response to `pingdata`. Notifies the server of any information related to the particular socket. Passed data should include:

* `sessionID`, if the client is "logged in" or keeping track of a session ID. This is used for keeping track of which users are online.

### From server: `message/new`

Sent to all clients whenever a message is [sent](#post-apisend-message) to any channel in the server. Passed data is in the format `{message}`, where `message` is a [message object](#message-object) representing the new message.

### From server: `message/edit`

Sent to all clients when any message is [edited](#post-apiedit-message). Passed data is in the format `{message}`, where `message` is a [message object](#message-object) representing the edited message.

### From server: `channel/new`

Sent to all clients when a channel is [created](#post-apicreate-channel). Passed data is in the format `{channel}`, where `channel` is a [(detailed) channel object](#channel-object) representing the new channel.

### From server: `channel/rename`

Sent to all clients when a channel is [renamed](#post-apirename-channel). Passed data is in the format `{channelID, newName}`.

### From server: `channel/delete`

Sent to all clients when a channel is [deleted](#post-apidelete-channel). Passed data is in the format `{channelID}`.

### From server: `user/online`

Sent to all clients when a user becomes online. This is whenever a socket [tells the server](#from-client-pongdata) that its session ID is that of a user who was not already online before. Passed data is in the format `{userID}`.

### From server: `user/offline`

Sent to all clients when a user becomes offline. This is whenever the last socket of a user who is online terminates. Passed data is in the format `{userID}`.


## Objects

These are the specifications for the "objects" returned by the API. For example, whenever an "array of users" is returned, what's meant is that an array of objects which follows the description for [user](#user-object) objects.

### Message Object

A message sent by an author, to a particular channel.

* `id`: (string) the ID of the message. This is a unique random string; no two messages in the database will ever share an ID.
* `authorUsername`: (string) the username of the author.
* `authorID`: (string) the ID of the message's author.
* `authorAvatarURL`: (string) URL pointing to an image that should be used as the author's profile picture.
* `channelID`: (string) the ID of the channel which the message was sent in.
* `text`: (string) the text content of the message. This is not processed; it's whatever the author entered, verbatim. This should typically be interpreted as markdown.
* `date`: (number) the date when the message was sent (actually when it was saved into the database).
* `editDate`: (number or null) the date when the message was most recently edited, or null, if the message has never been edited.
* `reactions`: future storage for reactions. The reaction API is not stable yet (see [GitHub issue #21](https://github.com/decent-chat/decent/issues/21)).

### User Object

A member of the server. (Every server has its own unique database of members; a member from one server does not exist on another server.)

* `id`: (string) the ID of the user. This is a unique random string, and will never change; while a user's username may (technically) be changed, their ID will always be the same and refer only to them.
* `username`: (string) the username of the user. This should be used for display, but not as a unique identifier for a user (use `id` for that).
* `permissionLevel`: (string) the permission level of the user; either `member` or `admin`.
* `online`: (boolean) whether or not the user is currently online (if there are any live sockets which are logged in to the user). (The [`user/online`](#from-server-useronline) and [`user/offline`](#from-server-useroffline) WebSocket events can be used to detect when users come online or offline; [`user-list`](#get-apiuserlist) can be used to quickly get the online status of every user.)
* `avatarURL`: (string) image URL to be displayed as the user's profile picture.

If the endpoint took a session ID (e.g. /api/session/:sessionID), the user object of **the current user** will also contain:

* `email`: (string/null) the email address of the user.
* `authorized`: (boolean) whether or not the user is [authorized](#authorization) (if authorization is enabled).

### Channel Object

A channel on the server. Channels are essentially containers of messages; every message belongs to a particular channel. In chat clients, the user usually views and participates in a single channel at a time (though it should be easy to switch between channels).

All returned channel objects have these properties:

* `id`: (string) the ID of the channel. This is a unique random string, and, like user IDs, will never change.
* `name`: (string) the name of the channel. This does not include a hash (`name: "general"`, not `name: "#general"`). This should be displayed to the user, but not used as a unique identifier for the channel; channels can be renamed (which would be reflected in this property).

Some endpoints return a more detailed channel object. (Particularly, `/api/channel/:channelID` always returns one, and can be used when you found the ID of a channel via an endpoint which returns "brief" channels and would like more details on that channel.) Detailed channel objects contain all of the properties described above as well as the following:

* `pinnedMessages`: (array of [messages](#message-object)) the channel's pinned messages. Pinned messages can be used for various purposes depending on the community, but common uses include highlighting old, particularly funny messages, or pinning "rules" messages in a convenient-to-access place.

Some endpoints return further information when a session ID is given (e.g. `/api/channel-list?sessionID=..`). This information is specific to the particular logged in user, and includes the following:

* `unreadMessageCount`: (number) the number of "unread" messages, capped at 200. Unread messages are simply messages which were sent more recently than the last time the channel was marked as read. (Channels are marked as read whenever the user sends a message, and can also be set manually/by the client using the `/api/mark-channel-as-read` endpoint.)

### Session Object

A login session. As with [channel objects](#channel-object), there are two variants of sessions; brief and detailed ones.

All returned session objects have these properties:

* `id`: (string) the ID of the session. This is a unique string in [version 4 UUID](https://en.wikipedia.org/wiki/Universally_unique_identifier#Version_4_%28random%29), and is used to access and act as the account that the session was created for.
* `dateCreated`: (number) the date the session was [created](#post-apilogin).

Detailed sessions also have these properties:

* `user`: ([user](#user-object)) the user that the session was created for.


## Etc.

### Authorization

Authorization is a simple form of privacy which prevents clients from interacting with the server API without being authorized to do so (usually manually, by a human). This limits interaction to specific users, which may be wanted so that the server is "private". It should be noted that **enabling authorization does not encrypt messages or user data**; it simply limits who can access that data via the API.

Authorization is a server property and can only be enabled via the actual command line:

```
> set requireAuthorization on|off
```

When authorization is enabled for the first time, only admins will be verified. When a user is made to be an admin through the command line (`make-admin`), they will also be authorized. Users can then be authorized via the [`authorize-user`](#post-apiauthorize-user) endpoint (in the official client, there's a dedicated settings page for this). Users can be deauthorized using [`deauthorize-user`](#post-apideauthorize-user).

See [authentication](#authentication) for details on how to authenticate. What this *basically* means is that you should always send `sessionID` (either in the POST body, the URL query string, or as a header), or else servers with authorization enabled won't let you do much of anything.

Note that some endpoints do not require authorization:

* [`GET /api`](#get-api)
* [`POST /api/login`](#post-apilogin)
* [`POST /api/register`](#post-apiregister)
* [`GET /api/session/:sessionID`](#get-apisessionsessionid)

### Authentication:

When a request is made to the API, the server searches for a session ID given in the request using:
* `sessionID` in POST data
* `?sessionID` in query string
* `X-Session-ID` header

If the server requires [authorization](#authorization) and the session ID could not be found or pointed to an unauthenticated user, the request is immediately terminated with a 403 status code. It's likely simpler to just send the `X-Session-ID` header with _all_ requests, even on non-authorization-requiring servers.

### Dates

In this document and throughout the API, "dates" are numbers specified according to JavaScript's [`Date.now`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/now) function. This is equal to the number of *milliseconds* elapsed since the UNIX epoch. Programming languages which expect a UNIX timestamp may stumble as they expect a number of seconds since the UNIX epoch, not a number of milliseconds.

### Valid names

Several parts of the API expect names to be given (e.g. [creating a channel](#post-apicreate-channel)). These names will eventually be displayed to users, and so must follow a basic guideline for being formatted: **Names may consist only of alphanumeric characters, underscores (`_`), and dashes (`-`).** When a name which does not follow these guidelines is given to an endpoint, an `INVALID_NAME` [error](#endpoint-errors) will be responded and the request will have no action.

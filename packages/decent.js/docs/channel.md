# const channel = client.channels.nth(0)
Represents a single channel. Updated automatically.

---

Properties:

* channel.id (string)
* channel.name (string)

The following properties are only provided if logged in:

* channel.unreadMessageCount (?int)
* channel.oldestUnreadMessageID (?string)

---

Extends [eventemitter3](https://npm.im/eventemitter3).

## await channel.sendMessage(text: string) -> string messageID
Sends a message to the channel, implicitly marking it as read.

## await channel.markRead()
Only works if logged in. Marks the channel as read for the logged-in user.

## await channel.getMessages({ before: ?[Message](message.md), after: ?[Message](message.md), limit: ?int }) -> Array<[Message](message.md)>
Resolves with an array (not set!) of [message](message.md)s of max length `limit` (default 50). Note `limit` must be `<= 50`.

+ If `before` is provided, the first message returned will be the message that comes right before the message `before`.
+ Similarly, if `after` is provided the first message returned will be the message directly after the message `after`.
+ If neither are provided, the latest messages are returned.

## await channel.getPins() -> [PinnedMessages](pinned-messages.md)
Resolves with a PinnedMessages set containing the messages pinned to this channel.

## channel.toString()
Returns `#channelname`.

---

Use `channel.on('event', callback)` method to listen for events.

## event 'update' (channel: [Channel](channel.md))
Emitted when this channel's details (`name` or `unreadMessageCount`) are updated.

## event 'delete' (channel: [Channel](channel.md))
Emitted when this channel is deleted.

## event 'change'
Emitted when channel state changes (ie. alongside the 'update' and 'delete' events).

## event 'message' (message: [Message](message.md))
Emitted when a new message is sent to the channel, by decent.js or not.

# const message = await client.channels.nth(0).getMessages()
Represents a single message. Updated automatically.

---

Properties:

* message.id (string)
* message.text (string)

* message.dateCreated (Date)
* message.dateEdited (?Date)

* message.authorUsername (string) - At time of creation
* message.avatarURL (string) - "
* message.authorFlair (string) - "

* message.channel ([Channel](channel.md))
* message.author ([User](user.md))
* message.mentionedUserIDs (Array<String>)

---

Extends [eventemitter3](https://npm.im/eventemitter3).

## await message.sendMessage(text: string) -> string messageID
Sends a message to the message, implicitly marking it as read.

## await message.pin()
If permissions are sufficient, pins the message.

## await message.unpin()
If permissions are sufficient, unpins the message.

## await message.edit(text: string)
If permissions are sufficient, edits the message. If `text.length` is 0 the message is deleted instead.

## await message.delete()
If permissions are sufficient, deletes the message.

---

Use `message.on('event', callback)` method to listen for events.

## event 'edit' (message: [Message](message.md))
Emitted when this message is edited.

## event 'delete' (message: [Message](message.md))
Emitted when this message is deleted.

## event 'pin' (message: [Message](message.md))
Emitted when this message is pinned to `message.channel`.

## event 'unpin' (message: [Message](message.md))
Emitted when this message is unpinned.
